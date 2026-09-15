const { uuid } = require('./uuid');
const { region, col, row, mergeRegions } = require('./regions');
const { card } = require('./components/CardHook');
const { button } = require('./components/ButtonHook');
const {
  navigate,
  setLabel,
  emitSelf,
  formInit,
  apiRequest,
  buildPublish,
  publishEntry,
  assertLayoutFrontId,
} = require('./events');
const { collectComponents } = require('./utils');

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
 * 构建查看页 Layout JSON（pageType=view）
 * 结构与新增/编辑页类似，但字段默认只读，工具栏只有返回/关闭按钮
 * @param {object} config
 * @param {string} config.pageName 页面名称
 * @param {string} config.functionGid 功能 GID
 * @param {string} config.serverName 后端服务名
 * @param {string} config.entityPath 实体路径
 * @param {string} config.entityIdField 主键字段
 * @param {string} config.listPageFrontId 列表页布局的 **frontId**（返回按钮的跳转目标，必填；旧名 listPageId 仍兼容）
 * @param {array} config.fields 字段组件实例数组（会被自动设为 readonly）
 * @param {number} config.colsPerRow 每行字段数
 * @param {number} config.colSpan 每个字段栅格宽度
 */
function buildViewPage(config) {
  const pageGid = config.pageGid || uuid();
  const frontId = config.frontId || uuid();
  const createTime = config.createTime || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const lastModifyTime = config.lastModifyTime || createTime;
  const createBy = config.createBy || 'ai';
  const lastModifiedBy = config.lastModifiedBy || createBy;
  const appGid = config.appGid || '1766F6ACFAB00B';
  const productGid = config.productGid || appGid;
  const projectGid = config.projectGid || 'PJ181A490E5D4001';
  const branch = config.branch || 'master';
  const state = config.state !== undefined ? config.state : -1;
  const nowIso = new Date().toISOString();

  const cardId = uuid();
  const formLayoutId = uuid();
  // 同 addEditPage：卡片挂载的容器必须指向真实存在的区域（语料中 toolContainerId 解析率 459/459），
  // 否则卡片拿不到工具栏内容。这里指向下方实际创建的具名区域。
  const toolContainerId = 'TitleTools';
  const extraContainerId = 'TitleSiderExtra';
  const ltContainerId = 'TitleSider';

  const btnBackId = uuid();
  const btnCloseId = uuid();

  const entityIdField = config.entityIdField || 'id';
  const listPageFrontId = assertLayoutFrontId(
    config.listPageFrontId || config.listPageId,
    'buildViewPage(): listPageFrontId'
  );

  // 查看页字段默认只读
  const viewFields = (config.fields || []).map(f => {
    if (typeof f.readonly === 'function') {
      f.readonly();
    }
    return f;
  });

  const formRows = groupFieldsIntoRows(viewFields, config.colsPerRow || 4, config.colSpan || 6);

  // 返回按钮（语料 view 页 11/11 都有 $${button.back}）
  const btnBack = button('$${button.back}', {
    id: btnBackId,
    description: '返回',
    icon: 'arrow-left',
    type: 'default',
    size: 'middle',
  }).onClick(navigate(listPageFrontId));

  // 关闭按钮（$${button.close} 全语料 20 处；view 页里用于弹窗式详情）
  const btnClose = button('$${button.close}', {
    id: btnCloseId,
    description: '关闭',
    type: 'default',
  }).onClick(emitSelf(frontId, 'closeM'));

  // 卡片 title 用 $${label.baseInfo}：语料 view 页 11 份里 10 份用它，
  // 是表单卡片最常用的标题；此前用的 $${label.baseInformation} 全语料仅 2 处。
  const formCard = card({
    id: cardId,
    title: config.primaryLabel || '$${label.baseInfo}',
    showType: 'borderAndTitle',
    layoutId: formLayoutId,
    toolContainerId,
    extraContainerId,
    ltContainerId,
    toolButtons: [],
    isShowButton: false,
  });

  // ── 页面级订阅骨架（与 addEditPage 同构）─────────────────────────────────
  // 语料实证（11 份 pageType=view）：
  //   componentDidMount  10/11 是 **pubs 型**（behaviors=0 pubs=1）—— mount 只发事件
  //   getMainInfo         8 次，全部 behaviors=1 pubs=0 —— 请求写在这里
  // 同 addEditPage 的「两级编排」；此前把 apiRequest 直接塞进 componentDidMount。

  // ① 页面初始化：设标题 + 触发取数
  const pageTitle = config.pageTitle !== undefined ? config.pageTitle : (config.pageName || '');
  const mountSubscribe = {
    name: '页面初始化',
    event: `${frontId}.componentDidMount`,
    pubs: [
      publishEntry({
        run: `${setLabel(frontId, pageTitle)}\n${emitSelf(frontId, 'getMainInfo')}`,
      }),
    ],
  };

  // ② 取详情：behaviors 持有请求，成功后 @@form.init 回填表单
  const fetchSubscribe = {
    name: '获取详情',
    event: `${frontId}.getMainInfo`,
    behaviors: [
      {
        ...apiRequest({
          method: 'post',
          serverName: config.serverName,
          url: `/${config.entityPath}/get`,
          bodyExpression: `callback({ ${entityIdField}: eventPayload.${entityIdField} })`,
        }),
        ...buildPublish('then', [
          {
            event: '@@form.init',
            eventPayloadExpression: formInit(frontId, 'eventPayload'),
          },
        ]),
        ...buildPublish('fail', [
          publishEntry({
            to: '@@message.error',
            run: 'callback(eventPayload)',
            scope: 'global',
          }),
        ]),
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
    // RightMain 与 componentIds 中的登记保持一致：设计器会预置该插槽，
    // 这里补一个空区域，避免出现「登记了不存在的区域」（STRUCT006）。
    // addEditPage 一直有这块，viewPage 漏了。
    region('RightMain', [row([col({ span: 24, components: [] })])]),
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
          components: [btnClose.toJSON()],
        }),
      ]),
    ]),
    region('BottomLeft', [row([col({ span: 24, components: [] })])]),
    region('BottomRight', [row([col({ span: 24, components: [] })])]),
    region(formLayoutId, formRows)
  );

  // 按钮与卡片都要同时进 components 注册表。
  // 语料实测：CardHook 的「已注册数 === 卡片数」完全相等（35 份 1/1、14 份 2/2、12 份 5/5…），
  // 即卡片 100% 都在注册表里；此前生成器只在 layoutList 内联、没注册，
  // 会被 ID007（内联挂载但未登记到 components）报出。
  const components = collectComponents(viewFields, {
    [formCard.id]: formCard.toJSON(),
    [btnBack.id]: btnBack.toJSON(),
    [btnClose.id]: btnClose.toJSON(),
  });

  const desktop = {
    flows: [],
    defaultDataSource: [],
    graphic: { containers: {}, components: {} },
    canvas: { containers: {}, components: {} },
    // 语料 401/401 均带 reference（恒为 ''）
    reference: '',
    layoutInfo: {
      formUse: true,
      topSideColsNum: 1,
      pageType: 'view',
      showTopSide: true,
      rightSideWidth: 240,
      showRightSide: false,
      title: config.layoutTitle || '详情页布局v1.8',
      field: config.layoutField || 'v18.Info',
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
    subscribes: [mountSubscribe, fetchSubscribe],
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
    name: config.name || `${config.pageName}-查看`,
    pid: config.pid || '',
    productGid,
    projectGid,
    projectType: config.projectType || '1',
    state,
    value: JSON.stringify(value),
  };
}

module.exports = { buildViewPage, groupFieldsIntoRows };
