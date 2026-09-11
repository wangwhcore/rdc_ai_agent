const { uuid } = require('./uuid');
const { region, col, row, mergeRegions } = require('./regions');
const { card } = require('./components/CardHook');
const { button } = require('./components/ButtonHook');
const { addTable } = require('./components/TableHook');
const { addQuery } = require('./components/AdvanceQueryHook');
const { navigate } = require('./events');

/**
 * 构建标准列表页 Layout JSON
 * @param {object} config
 * @param {string} config.pageName 页面名称
 * @param {string} config.functionGid 功能 GID
 * @param {string} config.serverName 后端服务名
 * @param {string} config.listUrl 列表接口路径
 * @param {string} config.addEditPageId 新增/编辑页 Layout GID
 * @param {string} config.confirmModalId 删除确认弹窗 Layout GID（可选，未传则自动生成）
 * @param {array} config.columns ColumnHook 实例数组
 * @param {array} config.rowOperations 行内操作 ['edit','delete','copy',...]
 * @param {array} config.queryFields 查询字段定义数组
 * @param {string} config.cardTitle 卡片标题
 * @param {string} config.tableTitle 表格标题
 * @param {string} config.listFrontId 列表页 frontId（可选）
 */
function buildListPage(config) {
  const listFrontId = config.listFrontId || uuid();
  const listLayoutGid = config.listLayoutGid || uuid();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const operator = config.operator || 'ai';
  const appGid = config.appGid || '1766F6ACFAB00B';
  const projectGid = config.projectGid || 'PJ181A490E5D4001';
  const confirmModalId = config.confirmModalId || uuid();

  // 区域/容器 id
  const layoutMainRowContainerId = uuid();
  const layoutMainRowId = uuid();
  const toolContainerRowContainerId = uuid();
  const toolContainerRowId = uuid();
  const tableContainerRowContainerId = uuid();
  const tableContainerRowId = uuid();
  const queryContainerRowContainerId = uuid();
  const queryContainerRowId = uuid();

  const toolContainerId = uuid();
  const tableContainerId = uuid();
  const queryContainerId = uuid();

  // 组件
  const addButton = button('$${button.new}', { description: '新建' }).primary().onClick(
    navigate(config.addEditPageId, { type: 'add' })
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
    rowOperations: config.rowOperations || ['edit', 'delete'],
  });
  table.buildOperationItems(listFrontId, config.addEditPageId, confirmModalId);

  const query = addQuery({
    associateId: table.id,
    fields: config.queryFields || [],
  });

  const listCard = card({
    title: config.cardTitle || config.pageName,
    showType: 'borderAndNotitle',
    toolButtons: [addButton.id],
    toolContainerId,
    layoutId: tableContainerId,
  });

  // 构建 layoutList
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
          components: [query.toJSON()],
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
    region(queryContainerId, [
      row([
        col({
          span: 24,
          components: [],
        }, queryContainerRowId),
      ], queryContainerRowContainerId),
    ])
  );

  // 构建 components Map
  const components = {
    [addButton.id]: addButton.toJSON(),
    [table.id]: table.toJSON(),
    [query.id]: query.toJSON(),
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
    updateTime: now,
    flows: [],
    defaultDataSource: [],
    graphic: { containers: {}, components: {} },
    canvas: { containers: {}, components: {} },
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
    branch: 'master',
    createBy: operator,
    createTime: now,
    entityUpdate: false,
    frontId: listFrontId,
    functionGid: config.functionGid,
    gid: listLayoutGid,
    isSystem: 1,
    lastModifiedBy: operator,
    lastModifyTime: now,
    layoutRef: 0,
    logicDelete: 0,
    name: `${config.pageName}-列表`,
    productGid: appGid,
    projectGid,
    projectType: '1',
    state: -1,
    value: JSON.stringify(value),
  };
}

module.exports = { buildListPage };
