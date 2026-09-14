const { uuid } = require('./uuid');
const { region, col, row, mergeRegions } = require('./regions');
const { card } = require('./components/CardHook');
const { button } = require('./components/ButtonHook');
const { addTable } = require('./components/TableHook');
const { addQuery, deriveQueryFields } = require('./components/AdvanceQueryHook');
const { navigate, assertLayoutFrontId } = require('./events');

/**
 * 构建标准列表页 Layout JSON
 * @param {object} config
 * @param {string} config.pageName 页面名称
 * @param {string} config.functionGid 功能 GID（MdFunction 的 gid）
 * @param {string} config.serverName 后端服务名
 * @param {string} config.listUrl 列表接口路径
 * @param {string} config.addEditPageFrontId 新增/编辑页布局的 **frontId**（必填；旧名 addEditPageId 仍兼容）
 * @param {string} config.confirmModalFrontId 删除确认弹窗布局的 **frontId**（有 delete 操作时必填；旧名 confirmModalId 仍兼容）
 * @param {array} config.columns ColumnHook 实例数组
 * @param {array} config.rowOperations 行内操作 ['edit','delete','copy',...]
 * @param {array|false} config.queryFields 高级查询条件。**条件一律来自表格字段（含类型）**：
 *   - 省略 / 'auto'：取全部可查询列（排除 serialNum/operation、link 列、query:false 的列）
 *   - 数组：`['status','createTime']` 或 `[{ field:'status', component:'CheckboxHook' }]`
 *     —— 只写字段名时，类型自动从表格列上取（columnsType 优先，其次 fieldType）
 *   - false：不生成高级查询，页面只有一个单独的表格
 * @param {string} config.cardTitle 卡片标题
 * @param {string} config.tableTitle 表格标题
 * @param {string} config.listFrontId 列表页 frontId（可选）
 *
 * 注意：跨页引用一律使用**目标布局的 frontId**，不是 MdFrontLayout 的文件名 gid。
 * 传 gid / 随机 uuid / 占位符都会让运行时解析不到目标布局并在 vendor chunk 抛
 * `TypeError: Cannot read properties of undefined (reading 'field')`。
 * 因此这两个参数缺失或形态非法时，本函数直接抛错，不再静默生成随机 uuid。
 */
/**
 * 解析高级查询条件 —— 条件一律来自表格字段（含类型）。
 *
 * | config.queryFields      | 行为                                                     |
 * |-------------------------|----------------------------------------------------------|
 * | 省略 / 'auto'           | 取全部可查询列（自动排除 serialNum/operation/link/query:false） |
 * | ['status','createTime'] | 按给定顺序取这些列，**类型从表格列上读**（columnsType 优先）      |
 * | [{field, component}]    | 同上，并可覆盖组件/operation/span/dict                        |
 * | false / null            | 不生成高级查询 —— 页面只有一个单独的表格                        |
 *
 * @returns {array} 规范化后的条件数组（可能为空）
 */
function resolveQueryConditions(config) {
  const opt = config.queryFields;

  // 「只有一个单独的表格」：显式关掉高级查询
  if (opt === false || opt === null) return [];

  const columns = config.columns || [];

  if (Array.isArray(opt) && opt.length) {
    return deriveQueryFields(columns, { only: opt });
  }
  // 省略 / 'auto' / 空数组：全部可查询列
  return deriveQueryFields(columns);
}

function buildListPage(config) {
  const listFrontId = config.listFrontId || uuid();
  const listLayoutGid = config.listLayoutGid || uuid();
  const createTime = config.createTime || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const lastModifyTime = config.lastModifyTime || createTime;
  const createBy = config.createBy || config.operator || 'ai';
  const lastModifiedBy = config.lastModifiedBy || createBy;
  const appGid = config.appGid || '1766F6ACFAB00B';
  const productGid = config.productGid || appGid;
  const projectGid = config.projectGid || 'PJ181A490E5D4001';
  const branch = config.branch || 'master';
  const state = config.state !== undefined ? config.state : -1;
  const nowIso = new Date().toISOString();

  // 跨布局引用：语义是目标布局的 frontId，不是 gid（旧字段名做兼容）
  const rowOperations = config.rowOperations || ['edit', 'delete'];
  const addEditPageFrontId = assertLayoutFrontId(
    config.addEditPageFrontId || config.addEditPageId,
    'buildListPage(): addEditPageFrontId'
  );
  const needsModal = rowOperations.some(
    op => (typeof op === 'string' ? op : (op && op.type)) === 'delete'
  );
  const confirmModalFrontId = needsModal
    ? assertLayoutFrontId(
        config.confirmModalFrontId || config.confirmModalId,
        'buildListPage(): confirmModalFrontId'
      )
    : (config.confirmModalFrontId || config.confirmModalId || null);

  // 区域/容器 id
  const layoutMainRowContainerId = uuid();
  const layoutMainRowId = uuid();
  const toolContainerRowContainerId = uuid();
  const toolContainerRowId = uuid();
  const tableContainerRowContainerId = uuid();
  const tableContainerRowId = uuid();

  const toolContainerId = uuid();
  const tableContainerId = uuid();

  // 组件
  const addButton = button('$${button.new}', { description: '新建' }).primary().onClick(
    navigate(addEditPageFrontId, { type: 'add' })
  );

  const table = addTable({
    title: config.tableTitle || `${config.pageName}列表`,
    dataSource: {
      method: 'post',
      serverName: config.serverName,
      type: 'api',
      url: config.listUrl,
    },
    rowKey: config.rowKey || 'gid',
    columns: config.columns || [],
    rowOperations,
  });
  table.buildOperationItems(listFrontId, addEditPageFrontId, confirmModalFrontId);

  // ── 高级查询（漏斗）─────────────────────────────────────────────────
  // 查询条件全部来自表格字段（含类型）。config.queryFields === false 时不生成，
  // 页面就是「只有一个单独的表格」。
  const conditions = resolveQueryConditions(config);
  const query = conditions.length
    ? addQuery({ associateId: table.id, conditions })
    : null;

  const listCard = card({
    title: config.cardTitle || config.pageName,
    showType: 'borderAndNotitle',
    toolButtons: [addButton.id],
    toolContainerId,
    layoutId: tableContainerId,
  });

  // 构建 layoutList
  // 语料实测的四个区域（98/98 一致）：
  //   LayoutMain                     -> [CardHook]
  //   <CardHook.toolContainerId>     -> [AdvanceQueryHook]        ← 高级查询组件放这里
  //   <CardHook.layoutId>            -> [TableHook]
  //   <AdvanceQueryHook.id>_filterId -> [条件组件, ...]            ← 漏斗条件容器
  const layoutList = mergeRegions(
    region('LayoutMain', [
      row([
        col({
          span: 24,
          components: [listCard.toJSON()],
        }, layoutMainRowId),
      ], layoutMainRowContainerId),
    ]),
    region(toolContainerId, [
      row([
        col({
          span: 24,
          components: query ? [query.toJSON()] : [],
        }, toolContainerRowId),
      ], toolContainerRowContainerId),
    ]),
    region(tableContainerId, [
      row([
        col({
          span: 24,
          components: [table.toJSON()],
        }, tableContainerRowId),
      ], tableContainerRowContainerId),
    ]),
    // 漏斗条件容器：没有条件时 query 为 null，此处不产生任何区域
    (query ? query.buildFilterRegion() : {})
  );

  // 构建 components Map
  const components = {
    [addButton.id]: addButton.toJSON(),
    [table.id]: table.toJSON(),
    ...(query ? {
      [query.id]: query.toJSON(),
      // 漏斗容器内的条件组件必须**全部**登记（语料 389/389）
      ...query.buildConditionRegistrations(),
    } : {}),
    ...table.operationButtons.reduce((acc, btn) => {
      acc[btn.id] = btn.toJSON();
      return acc;
    }, {}),
    ...config.columns.reduce((acc, c) => {
      acc[c.id] = c.toJSON();
      return acc;
    }, {}),
  };

  const desktop = {
    updateTime: nowIso,
    flows: [],
    defaultDataSource: [],
    graphic: { containers: {}, components: {} },
    canvas: { containers: {}, components: {} },
    // 语料 401/401 均带 reference（恒为 ''），缺失会让形状与设计器产物不一致
    reference: '',
    layoutInfo: {
      formUse: false,
      topSideColsNum: 1,
      pageType: 'list',
      showTopSide: true,
      rightSideWidth: 240,
      showRightSide: false,
      title: '基础列表页',
      field: 'v50.Base',
      type: 'layout',
      componentIds: ['LayoutMain'],
      showBottomSide: false,
    },
    validates: '',
    validateList: {},
    layoutList,
    subscribes: [],
    components,
  };

  const value = {
    phone: {
      defaultDataSource: [],
      graphic: {},
      layoutList: {},
      subscribes: [],
      reference: 'desktop',
      validateList: {},
      components: {},
      canvas: {},
      layoutInfo: {},
      validates: '',
    },
    pad: {
      defaultDataSource: [],
      graphic: {},
      layoutList: {},
      subscribes: [],
      reference: 'desktop',
      validateList: {},
      components: {},
      canvas: {},
      layoutInfo: {},
      validates: '',
    },
    draftComponents: [],
    desktop,
  };

  return {
    appGid,
    branch,
    createBy,
    createTime,
    entityUpdate: false,
    frontId: listFrontId,
    functionGid: config.functionGid,
    gid: listLayoutGid,
    isSystem: 1,
    lastModifiedBy,
    lastModifyTime,
    layoutRef: 0,
    logicDelete: 0,
    name: config.name || `${config.pageName}-列表`,
    productGid,
    projectGid,
    projectType: config.projectType || '1',
    state,
    value: JSON.stringify(value),
  };
}

module.exports = { buildListPage };
