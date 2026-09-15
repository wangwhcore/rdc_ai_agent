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
 *
 * ── 本函数里每个「魔法值」都有语料出处（61 份 pageType=add 的 MdFrontLayout）──
 * 详见各段落注释；改这些值之前请先跑 `node scripts/analyzeAddEditCorpus.js`。
 *
 * @param {object} config
 * @param {string} config.pageName 页面名称
 * @param {string} config.functionGid 功能 GID
 * @param {string} config.serverName 后端服务名
 * @param {string} config.entityPath 实体路径（接口前缀）
 * @param {string} [config.entityIdField='id'] 主键字段
 * @param {string} config.listPageFrontId 列表页布局的 **frontId**（保存/返回的跳转目标，必填；旧名 listPageId 仍兼容）
 * @param {array} config.fields 字段组件实例数组
 * @param {number} [config.colsPerRow=4] 每行字段数
 * @param {number} [config.colSpan=6] 每个字段栅格宽度
 * @param {string} [config.pageTitle] 页面标题文本（标题栏），默认取 pageName；
 *        支持 `$${label.x}` 词条占位
 * @param {string} [config.primaryLabel='$${label.baseInfo}'] 表单卡片标题
 * @param {string} [config.layoutTitle='详情页布局v1.8'] layoutInfo.title（设计器版式名）
 * @param {string} [config.layoutField='v18.Info'] layoutInfo.field
 * @param {string} [config.saveAction] 保存按钮 action，默认 `{serverName}_{entityPath}_save`
 * @param {string} [config.submitAction] 提交按钮 action，默认 `{serverName}_{entityPath}_submit`
 * @param {boolean} [config.withSubmit=true] 是否生成「提交」按钮
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

  const entityIdField = config.entityIdField || 'id';
  const listPageFrontId = assertLayoutFrontId(
    config.listPageFrontId || config.listPageId,
    'buildAddEditPage(): listPageFrontId'
  );

  const cardId = uuid();
  const formLayoutId = uuid();
  // 卡片挂载的三个容器必须指向真实存在的区域。
  // 原来是三个随机 uuid，但 layoutList 里从没创建过对应区域，
  // 语料中 CardHook.toolContainerId 的解析率是 459/459（必须命中），
  // 悬空时卡片拿不到工具栏内容。这里改为指向下方实际创建的具名区域：
  //   TitleTools      —— 保存/提交按钮
  //   TitleSiderExtra —— 返回按钮
  //   TitleSider      —— 左侧标题区
  const toolContainerId = 'TitleTools';
  const extraContainerId = 'TitleSiderExtra';
  const ltContainerId = 'TitleSider';

  const btnBackId = uuid();
  const btnSaveId = uuid();
  const btnSubmitId = uuid();

  const formRows = groupFieldsIntoRows(config.fields, config.colsPerRow || 4, config.colSpan || 6);

  // ── 工具栏按钮 ──────────────────────────────────────────────────────────
  // 语料实证（61 份 add 页，位置与文案）：
  //   $${button.back}   61/61  → 100% 挂在 TitleSiderExtra
  //   $${button.save}   94 次  → TitleTools 32
  //   $${button.submit} 23 次  → TitleTools 20
  //   $${button.update} 36 次  → 与 save **从不共存于同一页**（0 例）
  //   $mode 482 个全部是 ['create','modify','query'] —— 它**不参与区分按钮**，
  //     所以「同文案两个按钮」在同一容器里必然视觉重复。
  //
  // ★ 修复前：造了两个文案**完全相同**的 $${button.save}（一个发 .save、
  //   一个发 .update），都在 TitleTools、都是全模式 → value 里出现 4 处同名
  //   文案（内联 2 + 注册 2），页面上就是并排两个一模一样的「保存」。
  //   现在按语料主流组合「保存 + 提交」（16/61 页如此）生成，语义各自独立：
  //     保存 → 存草稿/暂存，action 走 _save
  //     提交 → 走流程，action 走 _submit，且 submit 在语料里恒为 primary
  const btnBack = button('$${button.back}', {
    id: btnBackId,
    description: '返回',
    icon: 'arrow-left',
    type: 'default',
    size: 'middle',
  }).onClick(navigate(listPageFrontId));

  const btnSave = button('$${button.save}', {
    id: btnSaveId,
    description: '保存',
    type: 'primary',
    action: config.saveAction || `${config.serverName}_${config.entityPath}_save`,
  }).onClick(emitSelf(frontId, 'save', `{ type: 'add' }`));

  const btnSubmit = config.withSubmit === false ? null : button('$${button.submit}', {
    id: btnSubmitId,
    description: '提交',
    type: 'primary',
    action: config.submitAction || `${config.serverName}_${config.entityPath}_submit`,
  }).onClick(emitSelf(frontId, 'submit', `{ type: 'add' }`));

  // 表单 Card
  // 卡片 title 用 $${label.baseInfo}：语料 add 页出现 45 次，是最常用的表单卡片标题；
  // 此前用的 $${label.baseInformation} 全语料仅出现 2 次（词条对不上的话运行时显示原文）。
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

  // ── 页面级订阅骨架 ──────────────────────────────────────────────────────
  // 语料实证（61 份 add 页共 407 条页面级订阅）：
  //   componentDidMount 61/61（必带），其中 **48/61 是 pubs 型**（behaviors=0 pubs=1）
  //     —— 即「mount 只负责发事件 + 设标题」，不在这里直接请求
  //   getMainInfo       38 次，全部 behaviors=1 pubs=0 —— 真正的取详情写在这里
  //   getDraft          18 次（草稿），同构
  //
  // 这就是**两级编排**：mount 发事件 → 具名取数事件持有请求。
  // 修复前把 apiRequest 直接塞进 componentDidMount.behaviors，虽然能跑，但与
  // 语料主流形态相反，且「保存后重新拉取」没有可复用入口。

  // ① 页面初始化：设标题 + 触发取数（pubs 型，对齐 48/61）
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
          {
            pageId: 'global',
            event: '@@message.error',
            eventPayloadExpression: 'callback(eventPayload)',
          },
        ]),
      },
    ],
  };

  // ③ 保存 / 提交：承接按钮发布的 <frontId>.save / <frontId>.submit
  //
  // 语料里 save 主要靠按钮 action 直调（20/61 按钮 action 有值、click 订阅 pubs 为空），
  // 但生成器在按钮上**同时**发布了 <frontId>.save —— 若不补这两条订阅，那条事件
  // 永远没有订阅者：生成成功、单文件 check 也过，只有点按钮时没反应。
  // 属「错误不可见」类，因此这里把链路闭合（按钮发事件 → 页面订阅持有请求）。
  //
  // 成功后：提示 + 回到列表页。回到列表用 @@navigator.push，与返回按钮同一条链路。
  const saveSubscribe = {
    name: '保存',
    event: `${frontId}.save`,
    behaviors: [
      {
        ...apiRequest({
          method: 'post',
          serverName: config.serverName,
          url: `/${config.entityPath}/save`,
          bodyExpression: `callback(Object.assign({ ${entityIdField}: eventPayload.${entityIdField} }, eventPayload))`,
        }),
        ...buildPublish('then', [
          publishEntry({ to: '@@message.success', data: '$${message.save.success}' }),
          publishEntry({
            to: '@@navigator.push',
            run: `callback({ url: '${listPageFrontId}' })`,
          }),
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

  const submitSubscribe = config.withSubmit === false ? null : {
    name: '提交',
    event: `${frontId}.submit`,
    behaviors: [
      {
        ...apiRequest({
          method: 'post',
          serverName: config.serverName,
          url: `/${config.entityPath}/submit`,
          bodyExpression: `callback(Object.assign({ ${entityIdField}: eventPayload.${entityIdField} }, eventPayload))`,
        }),
        ...buildPublish('then', [
          publishEntry({ to: '@@message.success', data: '$${label.submitted.successfully}' }),
          publishEntry({
            to: '@@navigator.push',
            run: `callback({ url: '${listPageFrontId}' })`,
          }),
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

  const toolButtons = [btnSave.toJSON()];
  if (btnSubmit) toolButtons.push(btnSubmit.toJSON());

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
    // 这里补一个空区域，避免出现「登记了不存在的区域」
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
          components: toolButtons,
        }),
      ]),
    ]),
    region('BottomLeft', [row([col({ span: 24, components: [] })])]),
    region('BottomRight', [row([col({ span: 24, components: [] })])]),
    region(formLayoutId, formRows)
  );

  // 工具栏按钮必须**同时**进 components 注册表（语料 add 页 61/61 都是「内联 + 注册」两份）；
  // 卡片同样要注册（语料里 CardHook 133/133 都是两份，此前生成器只内联不进注册表）。
  const components = collectComponents(config.fields || [], {
    [formCard.id]: formCard.toJSON(),
    [btnBack.id]: btnBack.toJSON(),
    [btnSave.id]: btnSave.toJSON(),
    ...(btnSubmit ? { [btnSubmit.id]: btnSubmit.toJSON() } : {}),
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
      pageType: 'add',
      showTopSide: true,
      rightSideWidth: 240,
      showRightSide: false,
      title: config.layoutTitle || '详情页布局v1.8',
      field: config.layoutField || 'v18.Info',
      type: 'layout',
      // 只登记**具名区域**（LayoutMain / TopMain / … 共 8 个）。
      // 卡片的 layoutId 不进这里：语料 303 个 CardHook.layoutId **0 个**在
      // componentIds 内（它们在 layoutList 里作为独立 key 存在即可）。
      // 此前多写了一个 formLayoutId，比语料多 1 项。
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
    subscribes: [mountSubscribe, fetchSubscribe, saveSubscribe, submitSubscribe].filter(Boolean),
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
