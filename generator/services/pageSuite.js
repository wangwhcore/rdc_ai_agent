/**
 * 成套页面生成器 —— 一次分配 id、一次接线，从结构上消除跨页引用的「循环依赖」。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────────────────
 * 单个页面构建器各要**别人的** frontId：
 *
 *   buildListPage()    需要 addEditPageFrontId + confirmModalFrontId（新建/编辑/删除按钮的跳转目标）
 *   buildAddEditPage() 需要 listPageFrontId（返回按钮的跳转目标）
 *   buildModal()       需要自己的 frontId（ok/closeM 的事件命名空间）
 *
 * 于是顺序调用时看起来像死锁：
 *   要调 /api/generate/list    → 得先知道编辑页 frontId
 *   要调 /api/generate/addEdit → 得先知道列表页 frontId
 *
 * ── 但这**不是**真死锁，是个建模问题 ────────────────────────────────────────
 * **frontId 是页面的主键（保存时分配的 id），不是生成器的输出。**
 * 它必须「先有页面、后有引用」，而不是「生成完才知道」。证据：
 * 生成器只在调用方没给时用 `uuid()` 兜底，而这个兜底值**永远不可能和另一端对上**
 * —— 那才是真正会把产物送进运行时 `reading 'field'` 的写法。
 *
 * 所以消除死锁只有两条路，本模块同时给出：
 *
 *   [A] 调用方**先分配** id，再分别调用（`/api/ids` + 各单页接口）
 *       —— 适用于「设计器已分配好 frontId」的真实项目流程
 *   [B] 一次调用生成整套（本模块 / `/api/generate/suite`）
 *       —— 适用于纯 API 自动化：id 在这里统一分配并**回传**，边界自然接得上
 *
 * 核心不变量（`test/pageSuite.test.js` 锁死）：
 *   list.addEditPageFrontId        === addEdit 的顶层 frontId
 *   list.confirmModalFrontId       === modal  的顶层 frontId
 *   addEdit.listPageFrontId        === list   的顶层 frontId
 *   modal 的 ok/closeM 事件命名空间 === modal  的顶层 frontId
 *
 * ⚠️ 未纳入本套件：查看页（`view`）。列表页的「查看」行操作当前指向
 * `addEditPageFrontId`（`TableHook.buildOperationItems` 的既有行为），
 * 要拆出独立的 viewPageFrontId 需先改那里，属另一件事。
 */

const { uuid } = require('../builder/uuid');
const { buildListPage } = require('../builder/listPage');
const { buildAddEditPage } = require('../builder/addEditPage');
const { buildModal } = require('../builder/modal');
const { span } = require('../builder/components/SpanHook');
const { assertLayoutFrontId } = require('../builder/events');
const { normalizeListConfig, normalizeAddEditConfig } = require('./configNormalizer');

/** 三个页面共享的元数据键（原样透传给每个构建器） */
const SHARED_KEYS = [
  'functionGid', 'serverName', 'entityPath', 'entityIdField',
  'appGid', 'productGid', 'projectGid', 'branch',
  'createBy', 'createTime', 'lastModifiedBy', 'lastModifyTime',
  'state', 'operator',
];

/** 取第一个「有内容」的候选值 —— 空串视为未提供 */
function firstGiven(...candidates) {
  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== '') return c;
  }
  return undefined;
}

/**
 * 解析一个 frontId：显式给了就必须合法（非法直接抛，不静默兜底），
 * 没给才分配新的。
 */
function resolveId(explicit, field) {
  if (explicit === undefined || explicit === null || explicit === '') return uuid();
  return assertLayoutFrontId(explicit, field);
}

function pick(config, keys) {
  const out = {};
  for (const k of keys) if (config[k] !== undefined) out[k] = config[k];
  return out;
}

/** 行操作里有没有删除 —— 决定要不要生成删除确认弹窗 */
function needsConfirmModal(rowOperations) {
  return (rowOperations || ['edit', 'delete']).some(
    op => (typeof op === 'string' ? op : op && op.type) === 'delete'
  );
}

/**
 * 生成「列表页 + 新增编辑页 + 删除确认弹窗」整套布局。
 *
 * @param {object} config
 * @param {object} [config.ids] 预分配的 frontId。三者都可省，省了就现分配
 * @param {string} [config.ids.listFrontId]           列表页（本页）frontId
 * @param {string} [config.ids.addEditPageFrontId]    新增/编辑页 frontId
 * @param {string} [config.ids.confirmModalFrontId]   删除确认弹窗 frontId
 *        （上面三个也接受平铺写法 listFrontId / addEditPageFrontId / confirmModalFrontId）
 * @param {string} config.pageName 页面名基名，三个页名由它派生（可用 config.names 覆盖）
 * @param {object} [config.names] { list, addEdit, modal } 逐页覆盖页名
 * @param {string} config.functionGid 功能 GID（三个布局同属一个 MdFunction）
 * @param {string} config.serverName 后端服务名
 * @param {string} [config.entityPath] 实体路径（编辑页保存动作名用）
 * @param {string} [config.listUrl] 列表接口路径
 * @param {array}  [config.columns] 列表列
 * @param {array}  [config.queryFields] 高级查询条件（同 buildListPage 语义）
 * @param {array}  [config.rowOperations] 行内操作，默认 ['edit','delete']
 * @param {array}  [config.fields] 表单字段（编辑页）
 * @param {boolean} [config.withConfirmModal] 强制/禁止生成弹窗；默认按 rowOperations 推导
 * @param {object}  [config.modal] 弹窗覆盖项 { content, okText, cancelText, okEvent, cancelEvent }
 * @returns {{ ids: object, layouts: { list: object, addEdit: object, modal: object|null } }}
 */
function buildPageSuite(config = {}) {
  const src = config.ids || {};

  const ids = {
    listFrontId: resolveId(
      firstGiven(src.listFrontId, config.listFrontId),
      'buildPageSuite(): ids.listFrontId'
    ),
    addEditPageFrontId: resolveId(
      firstGiven(src.addEditPageFrontId, config.addEditPageFrontId),
      'buildPageSuite(): ids.addEditPageFrontId'
    ),
    confirmModalFrontId: null,
  };

  const rowOperations = config.rowOperations || ['edit', 'delete'];
  const withModal = config.withConfirmModal !== undefined
    ? !!config.withConfirmModal
    : needsConfirmModal(rowOperations);

  if (withModal) {
    ids.confirmModalFrontId = resolveId(
      firstGiven(src.confirmModalFrontId, config.confirmModalFrontId),
      'buildPageSuite(): ids.confirmModalFrontId'
    );
  }

  const shared = pick(config, SHARED_KEYS);
  const names = config.names || {};
  const base = config.pageName || '未命名页面';

  // ── 列表页：引用编辑页 + 弹窗（接线点 ①②）────────────────────────────
  const list = buildListPage(normalizeListConfig({
    ...shared,
    pageName: names.list || `${base}列表`,
    listFrontId: ids.listFrontId,
    addEditPageFrontId: ids.addEditPageFrontId,
    confirmModalFrontId: ids.confirmModalFrontId,
    listUrl: config.listUrl,
    rowKey: config.rowKey,
    columns: config.columns,
    queryFields: config.queryFields,
    rowOperations,
    cardTitle: config.cardTitle,
    tableTitle: config.tableTitle,
  }));

  // ── 新增/编辑页：引用列表页（接线点 ③）──────────────────────────────
  const addEdit = buildAddEditPage(normalizeAddEditConfig({
    ...shared,
    pageName: names.addEdit || `${base}新增编辑`,
    frontId: ids.addEditPageFrontId,
    listPageFrontId: ids.listFrontId,
    fields: config.fields,
    colsPerRow: config.colsPerRow,
    colSpan: config.colSpan,
  }));

  // ── 删除确认弹窗：自身 frontId 就是它的事件命名空间（接线点 ④）────────
  const modalOverride = config.modal || {};
  const modal = withModal
    ? buildModal({
        ...shared,
        pageName: names.modal || `${base}删除确认`,
        frontId: ids.confirmModalFrontId,
        content: modalOverride.content || span('msg', '$${message.delete.reminder}', {
          valueStyle: "{display:'block', fontWeight:'bold', height:'32px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}",
        }),
        okText: modalOverride.okText,
        cancelText: modalOverride.cancelText,
        okEvent: modalOverride.okEvent,
        cancelEvent: modalOverride.cancelEvent,
      })
    : null;

  return { ids, layouts: { list, addEdit, modal } };
}

/**
 * 成套生成的可复现入口：先拿到一组 id，再按 id 复现同一套产物。
 * 用于 [A] 路径（调用方自行分配 id 后分别调用单页接口）。
 */
function allocateIds(seed = {}) {
  return {
    listFrontId: resolveId(seed.listFrontId, 'allocateIds(): listFrontId'),
    addEditPageFrontId: resolveId(seed.addEditPageFrontId, 'allocateIds(): addEditPageFrontId'),
    confirmModalFrontId: resolveId(seed.confirmModalFrontId, 'allocateIds(): confirmModalFrontId'),
  };
}

module.exports = { buildPageSuite, allocateIds, needsConfirmModal, SHARED_KEYS };
