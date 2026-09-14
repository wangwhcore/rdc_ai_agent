/**
 * 动作编排类规则：发布条目契约
 *
 * ── 为什么单开一组 ────────────────────────────────────────────────────────
 * 401 份语料里发布条目共 6344 条，全部走同一套 shape：
 *   { event, eventPayloadExpression, pageId, name, payload, outside }
 * 且这套 shape 出现在**三个时机**（订阅触发 / 动作成功 / 动作失败），
 * 产物字段名各不同（pubs / successPubs / errorPubs）。
 * 这三处过去由各 builder 手写字段名，是「生成器 ↔ 运行时契约不稳」的高危点。
 *
 * 收敛层（builder/events.js 的 buildPublish / PUBLISH_SLOT_TO_FIELD）已把
 * 字段名映射收敛到唯一一处。本组规则守的是**绕开收敛层手写**的情形。
 *
 * ── 严重级的取值依据（全部来自语料实测，不是拍脑袋）────────────────────────
 *   ACT001 命中 0     → error（预防；event 是唯一必填，6322/6322 都是 string）
 *   ACT002 命中 239   → info （历史遗留，运行时以表达式为准；不可自动删）
 *   ACT003 命中 0     → error（预防；放错层的字段运行时根本不读）
 *   ACT004 命中 81    → warning（真实的空操作条目）
 *   ACT005 命中 343   → info （同义异形，不是错误）
 */

const HEX32_EVENT_RE = /^([0-9a-f]{32})\.(.*)$/;

/** 「目标为空」的两种同义写法：空串（3111 条）与单个点号（304 条） */
const isNoTarget = ev => ev === '' || ev === '.';

/**
 * 逐条校验一组发布条目。
 * @param {Array} list  pubs / successPubs / errorPubs
 * @param {string} at   路径前缀（不含数组下标）
 * @param {object} where { scope, layer, entryName }
 */
function checkEntryList(list, at, where, report) {
  if (!Array.isArray(list)) return;
  list.forEach((entry, i) => {
    const p = `${at}[${i}]`;

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      report({
        code: 'ACT001', severity: 'error', path: p,
        message: `发布条目不是对象（${where.scope}）`,
        hint: '发布条目必须是 { event, ... } 形态的对象',
        extra: { ...where, index: i },
      });
      return;
    }

    // ACT001 —— event 是唯一必填键，且必须是字符串（允许空串）
    if (!('event' in entry)) {
      report({
        code: 'ACT001', severity: 'error', path: p,
        message: `发布条目缺少 event 键（${where.scope}）`,
        hint: 'event 是发布条目的唯一必填字段；不广播时写空串',
        extra: { ...where, index: i },
      });
    } else if (typeof entry.event !== 'string') {
      report({
        code: 'ACT001', severity: 'error', path: `${p}.event`,
        message: `发布条目 event 不是字符串，而是 ${typeof entry.event}`,
        hint: 'event 恒为字符串：空串 / "@@内置事件" / "<组件id>.<事件名>"',
        extra: { ...where, index: i, event: entry.event },
      });
    }

    const hasExpr = entry.eventPayloadExpression !== undefined;
    const hasData = entry.payload !== undefined;

    // ACT002 —— 同一条目同时声明动态表达式与静态载荷
    if (hasExpr && hasData) {
      report({
        code: 'ACT002', severity: 'info', path: p,
        message: '发布条目同时声明了 eventPayloadExpression 与 payload',
        hint: '运行时以表达式为准，payload 多为早期遗留；确认无用后可手工清理，禁止自动删除',
        extra: { ...where, index: i, payload: entry.payload },
      });
    }

    // ACT004 —— 什么都不做的空条目
    if (isNoTarget(entry.event) && !hasExpr && !hasData) {
      report({
        code: 'ACT004', severity: 'warning', path: p,
        message: '发布条目是空操作：没有目标事件，也没有表达式或载荷',
        hint: '该条目运行时不会产生任何效果，可直接删除',
        extra: { ...where, index: i, event: entry.event },
      });
    }

    // ACT005 —— 事件名为空的两种同义写法（不是错误，但作者通常不知道它没生效）
    const ev = typeof entry.event === 'string' ? entry.event : '';
    const m = HEX32_EVENT_RE.exec(ev);
    if (ev === '.' || (m && m[2] === '')) {
      report({
        code: 'ACT005', severity: 'info', path: `${p}.event`,
        message: `发布目标没有事件名: ${JSON.stringify(ev)}`,
        hint: '空串与 "." 是同义写法，都表示「不向该目标广播具体事件」；'
          + '若本意是广播某事件（如 closeM / openM），此处漏写了事件名',
        extra: { ...where, index: i, event: ev },
      });
    }
  });
}

/**
 * 递归收集一个对象下**任意深度**的 subscribes，连同其 JSON 路径。
 *
 * 为什么递归而不是枚举位置：语料里订阅除了 `property.subscribes`，
 * 还出现在 `property.cellType.subscribes`(20) / `property.columns[*].cellType.subscribes`(11)
 * / `property.tableInfo.subscribes`(3)。按名字枚举位置会漏掉以后新增的嵌套形态，
 * 递归是结构性的，不会随平台加字段而失效。
 */
function collectSubscribes(node, path, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((n, i) => collectSubscribes(n, `${path}[${i}]`, out));
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'subscribes' && Array.isArray(v)) {
      out.push({ list: v, path: `${path}.${k}` });
      continue; // subscribes 内部（pubs / behaviors）交给 checkSubscribes
    }
    collectSubscribes(v, `${path}.${k}`, out);
  }
}

/**
 * 遍历一个订阅数组。
 *
 * ★ 必须同时覆盖页面级与组件级 —— 只扫 desktop.subscribes 会漏掉 3766/4622 条。
 * （元模型审计 v1 就是只扫页面级，把「触发时机」结论整个搞反了；
 *   组件级才是交互事件的主战场。详见 docs/meta-model-audit.md 的修正记录。）
 */
function checkSubscribes(list, at, scope, report) {
  if (!Array.isArray(list)) return;
  list.forEach((sub, i) => {
    if (!sub || typeof sub !== 'object') return;
    const p = `${at}[${i}]`;

    // ACT003 —— 发布字段放错层：订阅条目只该有 pubs，不该有 successPubs/errorPubs
    for (const wrong of ['successPubs', 'errorPubs']) {
      if (wrong in sub) {
        report({
          code: 'ACT003', severity: 'error', path: `${p}.${wrong}`,
          message: `订阅条目上出现了 ${wrong}（这是「动作」层才有的字段）`,
          hint: '订阅条目用 pubs；successPubs / errorPubs 属于 behaviors[] 里的动作条目。'
            + '运行时不会读错层的字段，这段逻辑等于没写',
          extra: { scope, index: i, wrongField: wrong, correct: 'pubs' },
        });
      }
    }

    if ('pubs' in sub && !Array.isArray(sub.pubs)) {
      report({
        code: 'ACT003', severity: 'error', path: `${p}.pubs`,
        message: `subscribes[${i}].pubs 不是数组，而是 ${typeof sub.pubs}`,
        hint: 'pubs 恒为发布条目数组',
        extra: { scope, index: i },
      });
    }

    checkEntryList(sub.pubs, `${p}.pubs`, { scope, layer: 'emit', entryName: sub.event }, report);

    const behs = sub.behaviors;
    if (behs !== undefined && !Array.isArray(behs)) {
      report({
        code: 'ACT003', severity: 'error', path: `${p}.behaviors`,
        message: `subscribes[${i}].behaviors 不是数组，而是 ${typeof behs}`,
        hint: 'behaviors 恒为动作条目数组',
        extra: { scope, index: i },
      });
      return;
    }

    (behs || []).forEach((beh, bi) => {
      if (!beh || typeof beh !== 'object') return;
      const bp = `${p}.behaviors[${bi}]`;

      // ACT003 —— 反向：动作条目上不该有 pubs
      if ('pubs' in beh) {
        report({
          code: 'ACT003', severity: 'error', path: `${bp}.pubs`,
          message: `动作条目上出现了 pubs（这是「订阅」层才有的字段）`,
          hint: '动作条目用 successPubs / errorPubs；pubs 属于订阅条目，运行时不会读',
          extra: { scope, index: i, behaviorIndex: bi, wrongField: 'pubs', correct: 'successPubs / errorPubs' },
        });
      }
      for (const [slot, field] of [['then', 'successPubs'], ['fail', 'errorPubs']]) {
        if (field in beh && !Array.isArray(beh[field])) {
          report({
            code: 'ACT003', severity: 'error', path: `${bp}.${field}`,
            message: `动作条目的 ${field} 不是数组，而是 ${typeof beh[field]}`,
            hint: `${field} 恒为发布条目数组（对应时机 ${slot}）`,
            extra: { scope, index: i, behaviorIndex: bi, slot },
          });
        }
        checkEntryList(beh[field], `${bp}.${field}`,
          { scope, layer: slot, entryName: sub.event }, report);
      }
    });
  });
}

/**
 * ── 覆盖范围（401 份语料实测，4622 条订阅）────────────────────────────────
 *   本规则覆盖 3433 (74.3%)
 *     页面级 desktop.subscribes                     842
 *     组件级 components[*].property 下递归全部位置  2591
 *
 *   故意跳过 1167 —— `desktop.layoutList` 里的**内联组件副本**。
 *     实测：3916 个内联组件副本 100% 与 components 注册表里的对应组件**逐字节相同**
 *     （identicalToRegistry 3916 / differs 0）。扫进去只会把同一批订阅重复报一遍。
 *     lift 的 stubRegions 已把内联副本替换成 id 字符串，IR 天然不会重复。
 *
 *   不在范围 22 —— draftComponents 14 / phone 4 / pad 4。
 *     前者是未应用的草稿，后两者是移动端镜像树，都不是运行时主路径。
 */
function check(ctx, report) {
  const { ir } = ctx;

  // ① 页面级：$.value.desktop.subscribes
  checkSubscribes(ir.subscribes, '$.value.desktop.subscribes', 'page', report);

  // ② 组件级：components[*].property 下任意深度的 subscribes
  for (const [id, comp] of Object.entries(ir.components || {})) {
    if (!comp) continue;
    const prop = comp.property;
    if (!prop || typeof prop !== 'object') continue;
    const found = [];
    collectSubscribes(prop, `$.value.desktop.components.${id}.property`, found);
    for (const { list, path } of found) checkSubscribes(list, path, 'component', report);
  }
}

module.exports = {
  group: 'action',
  rules: ['ACT001', 'ACT002', 'ACT003', 'ACT004', 'ACT005'],
  check,
};
