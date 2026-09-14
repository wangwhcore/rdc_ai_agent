/**
 * 属性类规则：组件类型白名单、property key 白名单、字段绑定完整性
 *
 * 白名单来自 ir/schema.generated.json（由 401 个真实布局挖掘）。
 * 因此「未知 key」这条规则的误报率在语料上是 0——语料里出现过的键全部登记在案，
 * 只有语料从未出现过的键才会被点出来，这正是我们要抓的漂移。
 */

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
        report({
          code: 'PROP002', severity: 'warning', path: `${basePath}.property.${key}`,
          message: `${comp.type} 上的未知属性 ${key}`,
          hint: others.length
            ? `该键在其他组件上出现过（${others.slice(0, 3).join(', ')}），确认是否用错组件或敲错名字`
            : '语料中从未出现过该键，引擎很可能忽略它',
          extra: { componentId: id, type: comp.type, key, usedBy: others.slice(0, 5) },
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
    const requiredFlag = p.singleValidate === 'required' || p.showRequiredStar === true;
    if (readonly && requiredFlag) {
      report({
        code: 'PROP006', severity: 'warning', path: `${basePath}.property`,
        message: `${comp.type}(${id}) 同时是只读和必填`,
        hint: '只读字段的必填校验永远无法通过，用户会卡在保存上',
        extra: { componentId: id, displayMode: p.displayMode, singleValidate: p.singleValidate },
      });
    }

    // PROP007 显示必填星号但没有校验规则
    if (p.showRequiredStar === true && !p.singleValidate) {
      report({
        code: 'PROP007', severity: 'warning', path: `${basePath}.property.singleValidate`,
        message: `${comp.type}(${id}) 显示了必填标记但没有配置校验规则`,
        hint: "需要把 singleValidate 设为 'required'，否则只是视觉上的必填",
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
  rules: ['PROP001', 'PROP002', 'PROP003', 'PROP004', 'PROP005', 'PROP006', 'PROP007', 'PROP008'],
  check,
};
