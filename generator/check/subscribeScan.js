/**
 * 订阅条目的全位置扫描（action 组与 identity 组共用）
 *
 * ── 为什么必须共享 ────────────────────────────────────────────────────────
 * 「订阅写在哪里」这件事被两个判定同时需要：
 *   action 组   —— 校验发布条目契约（pubs / successPubs / errorPubs）
 *   identity 组 —— 判断组件是否被「事件寻址」引用（ID004 孤儿）
 * 两套实现必然分叉，而分叉点正是过去踩过的坑（只扫页面级 / 枚举嵌套位置）。
 *
 * ── 三条铁律 ──────────────────────────────────────────────────────────────
 * ★ 必须同时覆盖页面级与组件级 —— 只扫 desktop.subscribes 会漏掉 3758/4600 条。
 *   （元模型审计 v1 就是只扫页面级，把「触发时机」结论整个搞反了；
 *     组件级才是交互事件的主战场。详见 docs/meta-model-audit.md 修正记录 v2。）
 * ★ 组件级必须**递归**，不能枚举位置 —— 语料里订阅还出现在
 *   property.cellType.subscribes(20) / property.columns[*].cellType.subscribes(11)
 *   / property.tableInfo.subscribes(3)。枚举会随平台加字段而失效。
 * ★ desktop.layoutList 里的**内联组件副本故意不扫** —— 实测 3916 个副本
 *   100% 与 components 注册表里的对应组件逐字节相同
 *   （identicalToRegistry 3916 / differs 0），扫进去只会把同一批订阅重复报一遍。
 *   lift 的 stubRegions 已把内联副本替换成 id 字符串，IR 天然不重复。
 *
 * ── 覆盖范围（401 份语料实测，4622 条订阅）────────────────────────────────
 *   覆盖 3433 (74.3%) = 页面级 842 + 组件级递归 2591
 *   故意跳过 1167     = layoutList 内联副本
 *   不在范围   22     = draftComponents 14 / phone 4 / pad 4（非运行时主路径）
 */

/**
 * 递归收集一个对象下**任意深度**的 subscribes，连同其 JSON 路径。
 * 不深入 subscribes 内部（pubs / behaviors 交给调用方）。
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
      continue;
    }
    collectSubscribes(v, `${path}.${k}`, out);
  }
}

/** 页面级订阅（desktop.subscribes） */
function pageSubscribes(ir) {
  return Array.isArray(ir && ir.subscribes) ? ir.subscribes : [];
}

/**
 * 全部组件级订阅，带宿主 id。
 * @returns {Array<{list:Array, path:string, hostId:string}>}
 */
function componentSubscribes(components) {
  const out = [];
  for (const [id, comp] of Object.entries(components || {})) {
    const prop = comp && comp.property;
    if (!prop || typeof prop !== 'object') continue;
    const found = [];
    collectSubscribes(prop, `$.value.desktop.components.${id}.property`, found);
    for (const f of found) out.push({ list: f.list, path: f.path, hostId: id });
  }
  return out;
}

/**
 * 事件寻址形态：`<组件id>.<事件名>`
 *
 * ── 实测取值形态（401 份语料，本模块覆盖的 3433 条订阅）──────────────────
 * 订阅条目 `subscribes[].event`  **恒为组件事件寻址，100% 可解析**：
 *     <hex32>.<事件名>        2673
 *     <hex32>-xxx.<事件名>     704   约定命名 id（<父组件id>-okBtn 形态）
 *     <hex32>.                  56   事件名漏写（ACT005）
 *
 * 发布条目 `pubs[].event` 形态更杂（三元：静态载荷 / 内置事件 / 组件寻址）：
 *     ""                      2233   不广播具体事件（与 "." 同义，见 ACT005）
 *     <hex32>.<事件名>         1264   ★ 组件寻址
 *     @@内置事件                987   form.init / message.error 等
 *     "."                      252
 *     <hex32>.                  39
 *     <中文标签>.                20   不以 id 寻址，无法解析成组件引用
 */
const EVENT_TARGET_RE = /^([0-9a-f]{32}(?:-[\w-]+)?)\./i;

module.exports = {
  collectSubscribes,
  pageSubscribes,
  componentSubscribes,
  EVENT_TARGET_RE,
};
