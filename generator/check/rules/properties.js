/**
 * 属性类规则：组件类型白名单、property key 白名单、字段绑定完整性、
 * 以及「运行时会求值的字段」的形态校验。
 *
 * 白名单来自 ir/schema.generated.json（由 401 个真实布局挖掘）。
 * 因此「未知 key」这条规则的误报率在语料上是 0——语料里出现过的键全部登记在案，
 * 只有语料从未出现过的键才会被点出来，这正是我们要抓的漂移。
 */

const { isRequired, rulesOf } = require('../../ir/validateSpec');

// 必须绑定 filed 的真实输入控件——缺失即为缺陷
const FIELD_COMPONENTS = new Set([
  'TextHook', 'TextAreaHook', 'InputNumberHook', 'SelectHook', 'DatePickerHook',
  'RangePickerComponent', 'RadioHook', 'CheckboxHook', 'SwitchHook', 'UploadHook',
  'FindbackHook', 'ReUpload', 'TimePickerHook',
]);

// 展示型/容器型组件，filed 可为空，缺失只作提示
// 语料中 SpanHook 常用于纯文本、ImageHook 的 <id>-icon 常用于图标，都不需要字段绑定
const SOFT_FIELD_COMPONENTS = new Set([
  'SpanHook', 'ImageHook', 'NeuTag', 'NeuCascader', 'TreeHook', 'NeuTransfer',
  'EditTableHook', 'GridFieldTable',
]);

// 不需要标题的纯展示组件（PROP008 不适用）
const NO_LABEL_NEEDED = new Set(['SpanHook', 'ImageHook', 'NeuTag']);

// 需要 field 绑定的列组件
const COLUMN_COMPONENTS = new Set(['ColumnHook', 'EditTableColumnHook']);

// 运行时会当成 JS 值来用的字符串字段（语料标定）。
// 设计器给这类字段的默认值就是代码片段，例如 headStyle 的
// "// Type you code ...\r\nreturn {style:{color:'red'}}" —— 说明它会被 eval 成对象/函数。
const CODE_VALUE_KEYS = ['tagStyle', 'style', 'bodyStyle', 'headStyle'];

/**
 * 按顶层逗号切分对象字面量的内容 —— 必须跳过引号内的逗号，
 * 否则 { color: 'rgba(0, 0, 0, 0.65)' } 会被切碎，误判成裸标识符（语料上真实踩过）。
 */
function splitTopLevel(inner) {
  const out = [];
  let buf = '';
  let quote = null;
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      buf += ch;
      if (ch === '\\') { buf += inner[++i] || ''; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; buf += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; buf += ch; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth -= 1; buf += ch; continue; }
    if (ch === ',' && depth === 0) { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

/**
 * 判定「代码型字符串」的形态。
 *   空行/整行注释会被剥掉（语料里 tagStyle 常有 "// 提示\r\n{...}" 的写法）。
 *   ok        形如 { k: 'v', n: 1 }，每个值都是字面量
 *   bare      出现裸标识符（如 float:left 的 left）→ 求值必然 ReferenceError
 *   malformed 其它语法问题（如 marginRight: 8;} 里的分号）
 *   code      不是对象字面量，而是函数体/表达式（如 return {...}）
 *   empty     注释或空白
 */
function classifyCodeExpr(raw) {
  const src = String(raw)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('//'))
    .join('\n');
  if (!src) return { kind: 'empty' };
  if (!src.startsWith('{') || !src.endsWith('}')) return { kind: 'code' };
  const inner = src.slice(1, -1).trim();
  if (!inner) return { kind: 'ok' };
  for (const pair of splitTopLevel(inner)) {
    const m = pair.match(/^\s*([A-Za-z_$][\w$-]*|'[^']*'|"[^"]*")\s*:\s*([\s\S]*)$/);
    if (!m) return { kind: 'malformed', at: pair.trim() };
    const v = m[2].trim();
    if (/^'[^']*'$/.test(v) || /^"[^"]*"$/.test(v)) continue;
    if (/^-?\d+(\.\d+)?(px|em|rem|%|vh|vw|pt)?$/.test(v)) continue;
    if (/^(true|false|null)$/.test(v)) continue;
    if (v.includes(';')) return { kind: 'malformed', at: pair.trim() };
    return { kind: 'bare', at: pair.trim() };
  }
  return { kind: 'ok' };
}

function check(ctx, report) {
  const { ir, schema } = ctx;
  const components = ir.components || {};

  for (const [id, comp] of Object.entries(components)) {
    if (!comp || !comp.type) continue;
    const basePath = `$.value.desktop.components.${id}`;
    const p = comp.property || {};

    // PROP001 未知组件类型
    if (schema.available && !schema.isKnownType(comp.type)) {
      report({
        code: 'PROP001', severity: 'warning', path: `${basePath}.type`,
        message: `组件类型 ${comp.type} 未在语料中出现过`,
        hint: `可能是拼写错误、新版本组件，或私有扩展。已知类型共 ${schema.knownTypes.size} 个`,
        extra: { componentId: id, type: comp.type },
      });
    }

    // PROP002 未知 property key
    if (schema.available) {
      for (const key of Object.keys(p)) {
        if (schema.universalSet.has(key)) continue;
        if (schema.isKnownKey(comp.type, key)) continue;
        const others = schema.typesUsingKey(key, comp.type);
        // 三种来源要分开说：新设计器增量（overlay）/ 语料里别的组件在用 / 语料全无。
        // overlay 优先：它带出处（since/types），比「别的组件在用」这种同义反复有用得多。
        const overlay = schema.overlayOf ? schema.overlayOf(key) : null;
        let hint;
        if (overlay) {
          hint = `该键属于新设计器增量（since ${overlay.since || '未知'}），`
            + `目前只登记在 ${overlay.types.slice(0, 3).join(', ')} 上，`
            + `${comp.type} 是否也用这个键需要确认；确认后补登记 types，否则应从组件属性里去掉`;
        } else if (others.length) {
          hint = `该键在其他组件上出现过（${others.slice(0, 3).join(', ')}），确认是否用错组件或敲错名字`;
        } else {
          hint = '语料中从未出现过该键，引擎很可能忽略它';
        }
        report({
          code: 'PROP002', severity: 'warning', path: `${basePath}.property.${key}`,
          message: `${comp.type} 上的未知属性 ${key}`,
          hint,
          extra: {
            componentId: id, type: comp.type, key, usedBy: others.slice(0, 5),
            ...(overlay ? { overlaySince: overlay.since, overlayTypes: overlay.types.slice(0, 5) } : {}),
          },
        });
      }
    }

    // PROP003 字段绑定缺失：真实控件判错误，展示型组件判建议
    const needsBinding = FIELD_COMPONENTS.has(comp.type) || SOFT_FIELD_COMPONENTS.has(comp.type);
    if (needsBinding) {
      const filed = p.filed !== undefined ? p.filed : p.field;
      if (filed === undefined || filed === null || filed === '') {
        const strict = FIELD_COMPONENTS.has(comp.type);
        report({
          code: 'PROP003',
          severity: strict ? 'error' : 'info',
          path: `${basePath}.property.filed`,
          message: `${comp.type}(${id}) 没有绑定字段名`,
          hint: strict
            ? '设计器使用 filed 作为字段绑定键；为空时控件能渲染但不参与表单提交'
            : '展示型组件通常不需要字段绑定；若本应取数则需补上 filed',
          extra: { componentId: id, type: comp.type },
        });
      }
    }

    // PROP004 表格列缺少 field 绑定
    if (COLUMN_COMPONENTS.has(comp.type)) {
      if (p.field === undefined || p.field === null || p.field === '') {
        report({
          code: 'PROP004', severity: 'error', path: `${basePath}.property.field`,
          message: `${comp.type}(${id}) 没有绑定列字段名`,
          hint: '列组件使用 field 绑定数据列；为空时该列始终显示空',
          extra: { componentId: id, type: comp.type },
        });
      }
      if (p.headerName === undefined || p.headerName === '') {
        report({
          code: 'PROP004', severity: 'warning', path: `${basePath}.property.headerName`,
          message: `${comp.type}(${id}) 没有列标题`,
          hint: '表头会显示为空，通常应配置 headerName 或国际化 key',
          extra: { componentId: id, type: comp.type },
        });
      }
    }

    // PROP006 只读与必填冲突
    const readonly = p.displayMode === true || p.enabled === false;
    const requiredFlag = isRequired(p.singleValidate) || p.showRequiredStar === true;
    if (readonly && requiredFlag) {
      report({
        code: 'PROP006', severity: 'warning', path: `${basePath}.property`,
        message: `${comp.type}(${id}) 同时是只读和必填`,
        hint: '只读字段的必填校验永远无法通过，用户会卡在保存上',
        extra: { componentId: id, displayMode: p.displayMode, singleValidate: p.singleValidate },
      });
    }

    // PROP007 显示必填星号但没有校验规则
    if (p.showRequiredStar === true && rulesOf(p.singleValidate).length === 0) {
      report({
        code: 'PROP007', severity: 'warning', path: `${basePath}.property.singleValidate`,
        message: `${comp.type}(${id}) 显示了必填标记但没有配置校验规则`,
        hint: '需要把 singleValidate 设为 ["required"]（语料里该字段非空时恒为字符串数组），否则只是视觉上的必填',
        extra: { componentId: id, type: comp.type },
      });
    }

    // PROP008 字段/列组件缺少可读标题
    if ((FIELD_COMPONENTS.has(comp.type) || COLUMN_COMPONENTS.has(comp.type))
      && !NO_LABEL_NEEDED.has(comp.type)
      && !p.label && !p.title && !p.headerName) {
      report({
        code: 'PROP008', severity: 'info', path: `${basePath}.property`,
        message: `${comp.type}(${id}) 没有标题（label / title / headerName 均为空）`,
        hint: '界面上该控件的标题区会是空白',
        extra: { componentId: id, type: comp.type },
      });
    }

    // ── PROP009 运行时会求值的样式字段，不能是裸标识符 ────────────────────
    //
    // 设计器把 style/bodyStyle/headStyle/tagStyle 当成「可写代码」的字段：
    // 语料里 headStyle 的默认值就是 "// Type you code ...\r\nreturn {style:{color:'red'}}"。
    // 运行时求值失败时会把原字符串当样式下发，React 遍历字符串下标 →
    //   TypeError: Failed to set an indexed property [0] on 'CSSStyleDeclaration'
    //
    // 标定：语料 1 处 bare / 2 处 malformed / 1 处 code（均为 info 级展示），
    // 因此 error 级在语料上是 0 误报；本规则正是为了拦住生成器手写常量时的这类笔误。
    for (const key of CODE_VALUE_KEYS) {
      if (!(key in p) || typeof p[key] !== 'string') continue;
      const shape = classifyCodeExpr(p[key]);
      if (shape.kind === 'bare') {
        report({
          code: 'PROP009', severity: 'error', path: `${basePath}.property.${key}`,
          message: `${comp.type}(${id}) 的 ${key} 含裸标识符：{ ${shape.at} }`,
          hint: `该字段会被运行时当 JS 求值，${key} 里的值必须带引号（如 float:'left'）或为数字/布尔。`
            + ' 求值失败时字符串会被原样当作 style，触发 React 的 CSSStyleDeclaration 下标报错。',
          extra: { componentId: id, type: comp.type, key, value: p[key], pair: shape.at },
        });
      } else if (shape.kind === 'malformed') {
        report({
          code: 'PROP009', severity: 'warning', path: `${basePath}.property.${key}`,
          message: `${comp.type}(${id}) 的 ${key} 语法可疑：{ ${shape.at} }`,
          hint: '同一字段在语料里都是合法对象字面量；分号、缺逗号等会让运行时求值失败。',
          extra: { componentId: id, type: comp.type, key, value: p[key], pair: shape.at },
        });
      } else if (shape.kind === 'code') {
        report({
          code: 'PROP009', severity: 'info', path: `${basePath}.property.${key}`,
          message: `${comp.type}(${id}) 的 ${key} 不是对象字面量（函数体/表达式形态）`,
          hint: '语料中存在这种写法（如 headStyle 的 return {style:{...}}），确认是有意为之即可。',
          extra: { componentId: id, type: comp.type, key, value: p[key] },
        });
      }
    }

    // ── PROP010 singleValidate 必须是数组形态 ────────────────────────────
    // 语料 2293 处：空串 1516 / 数组 777 / 裸字符串 0。写成 'required' 会求值失败，
    // 必填校验静默失效。旧版生成器即输出了裸字符串。
    if ('singleValidate' in p && p.singleValidate !== '' && !Array.isArray(p.singleValidate)) {
      report({
        code: 'PROP010', severity: 'error', path: `${basePath}.property.singleValidate`,
        message: `${comp.type}(${id}) 的 singleValidate 是${typeof p.singleValidate}（${JSON.stringify(p.singleValidate)}），不是数组`,
        hint: '语料里该字段非空时 100% 是字符串数组，如 ["required"]、["required","email"]；空则不配校验时用空串 ""。',
        extra: { componentId: id, type: comp.type, value: p.singleValidate },
      });
    }
    if (Array.isArray(p.singleValidate)) {
      for (const rule of p.singleValidate) {
        if (typeof rule !== 'string') {
          report({
            code: 'PROP010', severity: 'error', path: `${basePath}.property.singleValidate`,
            message: `${comp.type}(${id}) 的 singleValidate 含非字符串项 ${JSON.stringify(rule)}`,
            hint: '数组元素是规则名，如 "required"。',
            extra: { componentId: id, type: comp.type },
          });
        }
      }
    }
  }

  // PROP005 表格列定义缺少 colId 指向
  for (const [id, comp] of Object.entries(components)) {
    if (!comp || comp.type !== 'TableHook') continue;
    const cols = (comp.property && comp.property.columns) || [];
    cols.forEach((c, i) => {
      if (c && c.colId === undefined) {
        report({
          code: 'PROP005', severity: 'warning',
          path: `$.value.desktop.components.${id}.property.columns[${i}]`,
          message: `TableHook(${id}) 第 ${i} 列没有 colId`,
          hint: `若为前端自渲染列（如序号、操作列）可忽略；若为设计器列则必须指向 ColumnHook。字段: ${c.field || '(空)'}`,
          extra: { componentId: id, index: i, field: c.field },
        });
      }
    });
  }
}

module.exports = {
  group: 'properties',
  rules: [
    'PROP001', 'PROP002', 'PROP003', 'PROP004', 'PROP005', 'PROP006', 'PROP007', 'PROP008',
    'PROP009', 'PROP010',
  ],
  check,
};
