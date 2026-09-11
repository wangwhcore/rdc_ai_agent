const { uuid } = require('./uuid');
const { region, col, row, mergeRegions } = require('./regions');
const { card } = require('./components/CardHook');
const { button } = require('./components/ButtonHook');
const { navigate, formInit, apiRequest, subscribe } = require('./events');

/**
 * 将字段按每行 colsPerRow 个分组
 * @param {array} fields 字段组件实例数组
 * @param {number} colsPerRow 每行字段数
 * @param {number} span 每个字段占的栅格
 */
function groupFieldsIntoRows(fields, colsPerRow = 4, span = 6) {
  const rows = [];
  for (let i = 0; i < fields.length; i += colsPerRow) {
    const rowFields = fields.slice(i, i + colsPerRow);
    const colsArr = rowFields.map(f => col({ span, components: [f.toJSON()] }));
    rows.push(row(colsArr));
  }
  return rows;
}

/**
 * 构建新增/编辑页 Layout JSON
 * @param {object} config
 * @param {string} config.pageName 页面名称
 * @param {string} config.functionGid 功能 GID
 * @param {string} config.serverName 后端服务名
 * @param {string} config.entityPath 实体路径（接口前缀）
 * @param {string} config.entityIdField 主键字段
 * @param {string} config.listPageId 列表页 Layout GID
 * @param {array} config.fields 字段组件实例数组
 * @param {number} config.colsPerRow 每行字段数（默认 4）
 * @param {number} config.colSpan 每个字段栅格宽度（默认 6）
 */
function buildAddEditPage(config) {
  const pageGid = config.pageGid || uuid();
  const frontId = config.frontId || uuid();
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

  const cardId = uuid();
  const formLayoutId = uuid();
  const toolContainerId = uuid();
  const extraContainerId = uuid();
  const ltContainerId = uuid();

  const btnBackId = uuid();
  const btnSaveNewId = uuid();
  const btnSaveEditId = uuid();

  const formRows = groupFieldsIntoRows(config.fields, config.colsPerRow || 4, config.colSpan || 6);

  // 返回按钮
  const btnBack = button('$${button.back}', {
    id: btnBackId,
    description: '返回',
    icon: 'arrow-left',
    type: 'default',
    size: 'middle',
  }).onClick(navigate(config.listPageId));

  // 保存按钮（新建模式）
  const saveNewExpr = `pubsub.publish('${frontId}.save', { type: 'add' });`;
  const btnSaveNew = button('$${button.save}', {
    id: btnSaveNewId,
    description: '保存',
    type: 'primary',
    action: `${config.serverName}_${config.entityPath}_save`,
  }).onClick(saveNewExpr);

  // 保存按钮（编辑模式）
  const saveEditExpr = `pubsub.publish('${frontId}.update', { type: 'modify' });`;
  const btnSaveEdit = button('$${button.save}', {
    id: btnSaveEditId,
    description: '保存',
    type: 'primary',
    action: `${config.serverName}_${config.entityPath}_update`,
  }).onClick(saveEditExpr);

  // 表单 Card
  const formCard = card({
    id: cardId,
    title: '$${label.baseInformation}',
    showType: 'borderAndTitle',
    layoutId: formLayoutId,
    toolContainerId,
    extraContainerId,
    ltContainerId,
    toolButtons: [],
    isShowButton: false,
  });

  // componentDidMount：编辑模式下拉取详情
  const getDetailSubscribe = {
    name: '获取详情',
    event: `${frontId}.componentDidMount`,
    behaviors: [
      {
        ...apiRequest({
          method: 'post',
          serverName: config.serverName,
          url: `/${config.entityPath}/get`,
          bodyExpression: `callback({ ${config.entityIdField}: eventPayload.${config.entityIdField} })`,
        }),
        successPubs: [
          {
            event: '@@form.init',
            eventPayloadExpression: formInit(frontId, 'eventPayload'),
          },
        ],
        errorPubs: [
          {
            pageId: 'global',
            event: '@@message.error',
            eventPayloadExpression: 'callback(eventPayload)',
          },
        ],
      },
    ],
  };

  const layoutList = mergeRegions(
    region('LayoutMain', [
      row([
        col({
          span: 24,
          components: [formCard.toJSON()],
        }),
      ]),
    ]),
    region('TopMain', [row([col({ span: 24, components: [] })])]),
    region('TitleSiderExtra', [
      row([
        col({
          span: 24,
          components: [btnBack.toJSON()],
        }),
      ]),
    ]),
    region('TitleSider', [row([col({ span: 24, components: [] })])]),
    region('TitleTools', [
      row([
        col({
          span: 24,
          components: [btnSaveNew.toJSON(), btnSaveEdit.toJSON()],
        }),
      ]),
    ]),
    region('BottomLeft', [row([col({ span: 24, components: [] })])]),
    region('BottomRight', [row([col({ span: 24, components: [] })])]),
    region(formLayoutId, formRows)
  );

  const components = {
    [btnBack.id]: btnBack.toJSON(),
    [btnSaveNew.id]: btnSaveNew.toJSON(),
    [btnSaveEdit.id]: btnSaveEdit.toJSON(),
    ...config.fields.reduce((acc, f) => {
      acc[f.id] = f.toJSON();
      return acc;
    }, {}),
  };

  const desktop = {
    flows: [],
    defaultDataSource: [],
    graphic: { containers: {}, components: {} },
    canvas: { containers: {}, components: {} },
    layoutInfo: {
      formUse: true,
      topSideColsNum: 1,
      pageType: 'add',
      showTopSide: true,
      rightSideWidth: 240,
      showRightSide: false,
      title: '详情页布局v1.8',
      field: 'v18.Info',
      type: 'layout',
      componentIds: [
        'LayoutMain',
        'TopMain',
        'RightMain',
        'TitleSiderExtra',
        'TitleSider',
        'TitleTools',
        'BottomLeft',
        'BottomRight',
      ],
      showBottomSide: false,
    },
    validates: config.validates || '',
    validateList: {},
    layoutList,
    subscribes: [getDetailSubscribe],
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
    frontId,
    functionGid: config.functionGid,
    gid: pageGid,
    isSystem: 1,
    lastModifiedBy,
    lastModifyTime,
    layoutRef: 0,
    logicDelete: 0,
    name: config.name || `${config.pageName}-新增编辑`,
    pid: config.pid || '',
    productGid,
    projectGid,
    projectType: config.projectType || '1',
    state,
    value: JSON.stringify(value),
  };
}

module.exports = { buildAddEditPage, groupFieldsIntoRows };
