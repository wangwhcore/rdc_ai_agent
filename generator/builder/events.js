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

function navigate(targetPageFrontId, { type, query = '', data = null } = {}) {
  const target = assertLayoutFrontId(targetPageFrontId, 'navigate() 的 targetPageFrontId');
  const payloadParts = [`url:'${target}'`];
  if (type) payloadParts.push(`type:'${type}'`);
  if (query) payloadParts.push(`query:'${query}'`);
  if (data) {
    payloadParts.push(`data:${data === 'rowData' ? 'eventPayload.rowData' : data}`);
  }
  return `pubsub.publish('@@navigator.push', { ${payloadParts.join(', ')} });`;
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

module.exports = {
  navigate,
  openModal,
  message,
  formInit,
  formChange,
  apiRequest,
  subscribe,
  // 布局引用守门（供 builder / check / 脚本复用同一套判定）
  assertLayoutFrontId,
  isPlaceholderFrontId,
  LayoutRefError,
  LAYOUT_FRONT_ID_RE,
};
