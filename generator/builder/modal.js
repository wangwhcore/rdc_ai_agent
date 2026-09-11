const { uuid } = require('./uuid');
const { region, col, row } = require('./regions');
const { ButtonHook } = require('./components/ButtonHook');

/**
 * 构建简单模态框 LayoutSimpleModal
 * 典型用途：删除确认、操作确认、提示弹窗
 * @param {object} config
 * @param {string} config.pageName 页面名称
 * @param {string} config.frontId 可选
 * @param {string} config.functionGid 功能 GID
 * @param {object} config.content 内容组件实例（如 SpanHook）
 * @param {string} config.okText 确认按钮文字，默认 $${button.ok}
 * @param {string} config.cancelText 取消按钮文字，默认 $${button.cancel}
 * @param {string} config.okEvent 确认按钮事件表达式
 * @param {string} config.cancelEvent 取消按钮事件表达式，默认关闭弹窗
 */
function buildModal(config) {
  const pageGid = config.pageGid || uuid();
  const frontId = config.frontId || uuid();
  const createTime = config.createTime || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const lastModifyTime = config.lastModifyTime || createTime;
  const createBy = config.createBy || 'sysadmin';
  const lastModifiedBy = config.lastModifiedBy || createBy;
  const productGid = config.productGid || '181A7E84452003';
  const appGid = config.appGid || productGid;
  const projectGid = config.projectGid || 'PJ181A490E5D4001';
  const branch = config.branch || 'test';
  const state = config.state !== undefined ? config.state : 1;

  const layoutMainRowId = uuid();
  const layoutMainColId = uuid();
  const layout1RowId = uuid();
  const layout1ColId = uuid();

  const content = config.content;
  const contentComponent = content ? content.toJSON() : null;

  const okBtn = new ButtonHook(config.okText || '$${button.ok}', {
    description: '确定',
    type: 'primary',
  });
  okBtn.subscribes = [{
    event: `${okBtn.id}.click`,
    pubs: [{
      event: '',
      eventPayloadExpression: config.okEvent || `pubsub.publish('${frontId}.ok', eventPayload);`,
    }],
  }];

  const cancelBtn = new ButtonHook(config.cancelText || '$${button.cancel}', {
    description: '取消',
    type: 'default',
  });
  cancelBtn.subscribes = [{
    event: `${cancelBtn.id}.click`,
    pubs: [{
      event: '',
      eventPayloadExpression: config.cancelEvent || `pubsub.publish('${frontId}.closeM');`,
    }],
  }];

  const components = {
    [okBtn.id]: okBtn.toJSON(),
    [cancelBtn.id]: cancelBtn.toJSON(),
  };
  if (content) {
    components[content.id] = contentComponent;
  }

  const desktop = {
    reference: '',
    layoutInfo: {
      thumbnail: '',
      componentIds: ['Layout1'],
      field: 'LayoutSimpleModal',
      type: 'layout',
      title: '简单模态框',
    },
    layoutList: {
      LayoutMain: {
        rows: [row([col({ span: 24, components: [] }, layoutMainColId)], layoutMainRowId)],
      },
      Layout1: {
        rows: [row([col({
          span: 24,
          components: contentComponent ? [contentComponent] : [],
        }, layout1ColId)], layout1RowId)],
      },
    },
    subscribes: [],
    validateList: {},
    components,
    updateTime: new Date().toISOString(),
    canvas: { containers: {}, components: {} },
    flows: [],
    defaultDataSource: [],
    graphic: { containers: {}, components: {} },
    validates: '',
  };

  const value = {
    pad: {
      reference: 'desktop',
      layoutInfo: {},
      layoutList: {},
      subscribes: [],
      components: {},
      canvas: {},
      flows: [],
      validates: '',
      validateList: {},
      defaultDataSource: [],
      graphic: {},
    },
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
    name: config.pageName,
    pid: config.pid || null,
    productGid,
    projectGid,
    state,
    value: JSON.stringify(value),
  };
}

module.exports = { buildModal };
