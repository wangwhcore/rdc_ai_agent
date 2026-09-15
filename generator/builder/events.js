/**
 * 事件表达式工厂
 * 所有返回都是 JS 表达式字符串，用于 eventPayloadExpression
 *
 * ── 布局引用的命名空间（由 401 份 MdFrontLayout 语料实证）────────────────
 *   openM 载荷 id             -> 目标布局 frontId 命中 358，gid 命中 0
 *   @@navigator.push 的 url   -> 目标布局 frontId 命中 563，gid 命中 0
 *
 * 注意 MdFrontLayout 的**文件名是 gid**，而运行时解析引用用的是 **frontId**，
 * 两者不通用。把 gid（或随机 uuid、`...` 之类占位符）填进这两个位置，
 * 运行时会查不到目标布局，随后拿到一个空节点交给 RenderLayout，
 * 在 vendor chunk 里抛出：
 *   TypeError: Cannot read properties of undefined (reading 'field')
 *
 * 因此这里做「生成期守门」：形态不对直接抛错，不让必然崩溃的页面落盘。
 */

const { HEX32: LAYOUT_FRONT_ID_RE, PLACEHOLDER_REF: PLACEHOLDER_FRONT_ID_RE } = require('../ir/referenceSpec');

class LayoutRefError extends Error {
  constructor(field, value) {
    super(
      `${field} 必须是目标布局的 frontId（32 位十六进制），当前为 ${JSON.stringify(value)}。\n` +
      '提示：MdFrontLayout 的文件名是 gid，运行时引用用的是 frontId，两者不通用；' +
      '占位符（如 xxxx/zzzz/...）同样会让运行时解析不到目标布局。'
    );
    this.name = 'LayoutRefError';
    this.code = 'E_LAYOUT_REF';
    this.field = field;
    this.value = value;
  }
}

/**
 * 校验并返回布局 frontId。缺失或形态非法时抛错。
 * @param {string} value
 * @param {string} field 报错时展示的字段名
 * @returns {string}
 */
function assertLayoutFrontId(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new LayoutRefError(field, value);
  const v = value.trim();
  if (!LAYOUT_FRONT_ID_RE.test(v)) throw new LayoutRefError(field, value);
  return v;
}

/**
 * 是否为「全同一字符」的可疑占位符。不阻断生成，只供 check 提示。
 * @param {string} value
 */
function isPlaceholderFrontId(value) {
  return typeof value === 'string' && PLACEHOLDER_FRONT_ID_RE.test(value);
}

/** 把文本安全地嵌进 JS 表达式（单引号包裹 + 转义），供 setLabel 等使用 */
function quoteJsText(text) {
  return `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * 跳转到目标布局。
 *
 * ── 语料实证（401 份 MdFrontLayout，`@@navigator.push`）──────────────
 * 载荷形态 100% 是 `{ url: '<目标布局 frontId>' }`，可选附加 query / paramN。
 * 常见的富形态（返回按钮实测）：
 *   pubsub.publish('@@navigator.push', { url: '<hex32>', query:'', param1:'', param2:'' });
 *
 * @param {string} targetPageFrontId 目标布局 frontId（必填，形态不对直接抛错）
 * @param {object} [opts]
 * @param {string} [opts.type]  导航类型
 * @param {string} [opts.query] 查询串
 * @param {string} [opts.data]  数据表达式；传 'rowData' 简写为 eventPayload.rowData
 * @param {object} [opts.params] 附加参数（param1/param2…），值原样作为表达式片段
 */
function navigate(targetPageFrontId, { type, query = '', data = null, params = null } = {}) {
  const target = assertLayoutFrontId(targetPageFrontId, 'navigate() 的 targetPageFrontId');
  const payloadParts = [`url:'${target}'`];
  if (type) payloadParts.push(`type:'${type}'`);
  if (query) payloadParts.push(`query:'${query}'`);
  if (data) {
    payloadParts.push(`data:${data === 'rowData' ? 'eventPayload.rowData' : data}`);
  }
  if (params && typeof params === 'object') {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      payloadParts.push(`${k}:${typeof v === 'string' ? v : JSON.stringify(v)}`);
    }
  }
  return `pubsub.publish('@@navigator.push', { ${payloadParts.join(', ')} });`;
}

/**
 * 设置**本页标题**（标题栏文本）。
 *
 * ── 语料实证（401 份 MdFrontLayout）────────────────────────────────
 * `<frontId>-title.setLabel` 出现 **97 次，主语 100% === 本页 frontId**（0 例外）；
 * 97 处调用**全部位于页面级订阅内**（组件订阅里 0 处）。
 * `layoutList` 里没有任何以 `-title` 结尾的 key —— 它是**运行时约定的标题命名空间**，
 * 不需要、也不能在布局里创建对应组件。
 *
 * 此前生成器完全没有标题设置，页面标题栏只能显示设计器默认值。
 *
 * @param {string} frontId 本页 frontId（`-title` 命名空间的主语）
 * @param {string} text    标题文本，支持 `$${label.x}` / `$${button.x}` 词条占位
 */
function setLabel(frontId, text) {
  const owner = assertLayoutFrontId(frontId, 'setLabel() 的 frontId（本页 frontId）');
  return `pubsub.publish('${owner}-title.setLabel', ${quoteJsText(text)});`;
}

/**
 * 发布**本页自己命名空间**下的事件：`<frontId>.<name>`。
 *
 * 这是「按钮只负责发事件、页面订阅负责干活」编排方式的一半（另一半由
 * `subscribe('<frontId>.<name>', ...)` 承接）。语料里按钮点击的常见形态正是
 * `pubsub.publish('<本页frontId>.save')` 这类，而不是把业务代码塞进按钮订阅。
 *
 * @param {string} frontId  本页 frontId
 * @param {string} name     事件名（如 save / submit / getMainInfo）
 * @param {string} [payloadExpr] 载荷表达式片段；省略时不带第二参数
 */
function emitSelf(frontId, name, payloadExpr) {
  const owner = assertLayoutFrontId(frontId, 'emitSelf() 的 frontId（本页 frontId）');
  return payloadExpr
    ? `pubsub.publish('${owner}.${name}', ${payloadExpr});`
    : `pubsub.publish('${owner}.${name}');`;
}

function openModal(listFrontId, modalFrontId, { title = '$${button.delete}', width = 'small', type = 'delete', data = 'rowData' } = {}) {
  const owner = assertLayoutFrontId(listFrontId, 'openModal() 的 listFrontId（本页 frontId）');
  const target = assertLayoutFrontId(modalFrontId, 'openModal() 的 modalFrontId（目标弹窗布局 frontId）');
  return `pubsub.publish('${owner}.openM', { id: "${target}", title: "${title}", width: "${width}", type: "${type}", data: eventPayload.${data} });`;
}

function message(type, key) {
  return `pubsub.publish('@@message.${type}', '$${key}');`;
}

function formInit(frontId, dataExpr = 'eventPayload') {
  return `pubsub.publish('@@form.init', { id: '${frontId}', data: ${dataExpr} });`;
}

function formChange(field, valueExpr = 'eventPayload') {
  return `pubsub.publish('@@form.change', { name: '${field}', value: ${valueExpr} });`;
}

function apiRequest({ method, serverName, url, bodyExpression }) {
  return {
    type: 'request',
    dataSource: {
      type: 'api',
      method,
      serverName,
      url,
      bodyExpression,
    },
  };
}

function subscribe(event, pubs = [], behaviors = []) {
  return {
    event,
    pubs,
    ...(behaviors.length ? { behaviors } : {}),
  };
}

// ---------------------------------------------------------------------------
// 发布条目：唯一构造入口 + 双向映射（动作编排收敛）
//
// ── 背景（401 份语料实证，见 docs/action-wiring-convergence.md）──────────────
// 同一套发布条目结构出现在**三个时机**，产物字段名各不相同：
//   订阅触发（无条件） → subscribes[].pubs
//   动作成功后         → subscribes[].behaviors[].successPubs
//   动作失败后         → subscribes[].behaviors[].errorPubs
//
// 三者的条目 shape 完全一致：
//   { event, eventPayloadExpression, pageId, name, payload, outside }
// 其中 **event 是唯一必填**（语料 6322/6322 都是 string，允许空串）。
// 实测分布：空串 3091（只跑表达式、不广播）/ `<组件id>.<事件名>` 1939 / `@@内置` 1292。
//
// ── 收敛原则 ─────────────────────────────────────────────────────────────
// **产物格式一个字节都不改。** 产物由不受控的运行时消费，改它 = 改运行时 + 401 份迁移。
// 收敛只发生在三层：
//   ① DSL 层用 slot（emit / then / fail）表达时机，不再手选字段名
//   ② buildPublish() 是**唯一**的 slot → 字段名映射处
//   ③ 产物仍然写 pubs / successPubs / errorPubs
// ---------------------------------------------------------------------------

/** 时机 -> 产物字段名。**这是整个代码库里唯一知道这个映射的地方。** */
const PUBLISH_SLOT_TO_FIELD = { emit: 'pubs', then: 'successPubs', fail: 'errorPubs' };

/** 产物字段名 -> 时机 */
const PUBLISH_FIELD_TO_SLOT = Object.fromEntries(
  Object.entries(PUBLISH_SLOT_TO_FIELD).map(([slot, field]) => [field, slot])
);

/**
 * slot 对应的产物字段名。非法 slot 直接抛错，避免静默写出错误字段。
 * @param {'emit'|'then'|'fail'} slot
 * @returns {string}
 */
function publishField(slot) {
  const field = PUBLISH_SLOT_TO_FIELD[slot];
  if (!field) {
    throw new Error(
      `未知的发布时机 ${JSON.stringify(slot)}；可选：${Object.keys(PUBLISH_SLOT_TO_FIELD).join(' / ')}`
    );
  }
  return field;
}

/**
 * 按时机构造「发布字段」片段，供对象字面量展开。
 *
 *   { ...apiRequest({...}), ...buildPublish('then', [ ... ]), ...buildPublish('fail', [ ... ]) }
 *
 * 对 items 是**恒等**的（不重建对象），因此改用它不会改变任何产物字节。
 * @param {'emit'|'then'|'fail'} slot
 * @param {Array} items
 */
function buildPublish(slot, items = []) {
  return { [publishField(slot)]: items };
}

/** 只在来源确实有该键时才复制（避免写入 undefined 造成往返不等） */
function copyIf(dst, src, from, to = from) {
  if (src && src[from] !== undefined) dst[to] = src[from];
}

/**
 * 由 DSL 风格描述构造发布条目（新代码用这个）。
 * 字段插入顺序固定：event → eventPayloadExpression / payload → name → pageId → outside。
 *
 * ── `run` 与 `data` 的关系 ───────────────────────────────────────────────
 * `run`（动态表达式，语料 5028 条）与 `data`（静态载荷，656 条）是**同一语义的两种写法**。
 *
 * **构造端不做取舍：给什么写什么。** 理由：语料里有 239 条历史遗留条目两者并存
 * （先写静态 payload、后改用表达式，旧值没清）。若构造端做取舍，这 239 条在
 * read→build 往返中会被静默改写 —— 那是改数据，不是收敛。
 *
 * 「新代码只应给一个」这条风格约束由 check 的 `ACT002` 负责提示，不在这里隐式执行。
 */
function publishEntry({ to = '', run, data, label, scope, crossPage } = {}) {
  const entry = { event: to };
  if (run !== undefined && run !== null) entry.eventPayloadExpression = run;
  if (data !== undefined && data !== null) entry.payload = data;
  if (label !== undefined) entry.name = label;
  if (scope !== undefined) entry.pageId = scope;
  if (crossPage !== undefined) entry.outside = crossPage;
  return entry;
}

/**
 * 产物发布条目 → DSL 风格。
 * **保留全部可选键**（含两者并存的历史形态），否则 read→build 往返会丢字段。
 */
function readPublishEntry(entry) {
  if (!entry || typeof entry !== 'object') return { to: entry };
  const item = { to: typeof entry.event === 'string' ? entry.event : '' };
  copyIf(item, entry, 'eventPayloadExpression', 'run');
  copyIf(item, entry, 'payload', 'data');
  copyIf(item, entry, 'name', 'label');
  copyIf(item, entry, 'pageId', 'scope');
  copyIf(item, entry, 'outside', 'crossPage');
  return item;
}

function readPublishList(list) {
  return Array.isArray(list) ? list.map(readPublishEntry) : [];
}

/** 产物动作条目 → DSL 风格 */
function readBehavior(beh) {
  if (!beh || typeof beh !== 'object') return { type: beh };
  const b = {};
  copyIf(b, beh, 'type');
  copyIf(b, beh, 'dataSource', 'resource');
  copyIf(b, beh, 'name', 'label');
  b.then = readPublishList(beh.successPubs);
  b.fail = readPublishList(beh.errorPubs);
  return b;
}

/**
 * 产物 subscribe 条目 → DSL handler。
 * 保留 name / index / type / rules 等可选键，否则 readHandler ∘ buildHandler 往返会丢字段。
 *
 * 实测订阅条目上的非主干键（401 份语料）：index 160、name 320、rules 19、type 20。
 * `rules` / `type` 命中少但不是垃圾 —— 语料里有真实取值，必须原样搬运。
 */
function readHandler(sub) {
  if (!sub || typeof sub !== 'object') return null;
  const h = { on: typeof sub.event === 'string' ? sub.event : '' };
  copyIf(h, sub, 'name', 'label');
  copyIf(h, sub, 'index');
  copyIf(h, sub, 'type');
  copyIf(h, sub, 'rules');
  h.emit = readPublishList(sub.pubs);
  h.actions = Array.isArray(sub.behaviors) ? sub.behaviors.map(readBehavior) : [];
  return h;
}

/**
 * DSL 动作条目 → 产物。
 * 空的 `successPubs` / `errorPubs` 不写出（语料 1189 个 action 里 95%+ 非空；
 * 「空数组」与「无此键」在运行时等价，不写可少 54 处无意义空键）。
 */
function buildBehavior(b) {
  const beh = {};
  copyIf(beh, b, 'type');
  copyIf(beh, b, 'resource', 'dataSource');
  copyIf(beh, b, 'label', 'name');
  if (b.then && b.then.length) beh.successPubs = b.then.map(publishEntry);
  if (b.fail && b.fail.length) beh.errorPubs = b.fail.map(publishEntry);
  return beh;
}

/**
 * DSL handler → 产物 subscribe 条目。
 *
 * 规范化约定（与既有 `subscribe()` 构造器一致，不新立规矩）：
 *   - `pubs` **恒写出**（空则 `[]`）—— 与 subscribe() 同
 *   - `behaviors` 仅在非空时写出    —— 与 subscribe() 同
 *   - `label` / `index` / `type` / `rules` 有则原样搬运
 *
 * 因此对语料里 700 条「没有 pubs 键」的订阅，重建会补出 `pubs: []`。
 * 这是**已存在的生成器契约**（subscribe() 一直这么写），且两者运行时等价；
 * 是否需要省掉空键属于「省略占位载荷」议题，单独评估，不在这里顺手改。
 */
function buildHandler(h) {
  const sub = { event: h.on };
  copyIf(sub, h, 'label', 'name');
  copyIf(sub, h, 'index');
  copyIf(sub, h, 'type');
  copyIf(sub, h, 'rules');
  sub.pubs = (h.emit || []).map(publishEntry);
  const actions = (h.actions || []).map(buildBehavior);
  if (actions.length) sub.behaviors = actions;
  return sub;
}

module.exports = {
  navigate,
  setLabel,
  emitSelf,
  quoteJsText,
  openModal,
  message,
  formInit,
  formChange,
  apiRequest,
  subscribe,
  // 发布条目收敛层：时机 -> 字段名的唯一映射处
  PUBLISH_SLOT_TO_FIELD,
  PUBLISH_FIELD_TO_SLOT,
  publishField,
  buildPublish,
  publishEntry,
  readPublishEntry,
  readPublishList,
  readBehavior,
  readHandler,
  buildBehavior,
  buildHandler,
  // 布局引用守门（供 builder / check / 脚本复用同一套判定）
  assertLayoutFrontId,
  isPlaceholderFrontId,
  LayoutRefError,
  LAYOUT_FRONT_ID_RE,
};
