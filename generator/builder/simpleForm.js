const { uuid } = require('./uuid');
const { region, col, row, mergeRegions } = require('./regions');

/**
 * 构建最简表单页（自由布局 v50.Base）
 * 结构与 MdFrontLayout 设计器保存的最简单页面一致
 * @param {object} config
 * @param {string} config.pageName 页面名称
 * @param {string} config.frontId 可选
 * @param {string} config.functionGid 功能 GID
 * @param {string} config.productGid 产品 GID，默认 181A7E84452003
 * @param {array} config.fields 字段组件实例数组
 */
function buildSimpleForm(config) {
  const pageGid = config.pageGid || uuid();
  const frontId = config.frontId || uuid();
  const now = new Date().toISOString();
  const productGid = config.productGid || '181A7E84452003';

  const layoutMainRows = [];
  for (const field of config.fields || []) {
    const rowId = uuid();
    const colId = uuid();
    layoutMainRows.push(
      row([
        col({
          span: 24,
          components: [field.toJSON()],
        }, colId),
      ], rowId)
    );
  }

  const layoutList = region('LayoutMain', layoutMainRows);

  const components = (config.fields || []).reduce((acc, f) => {
    acc[f.id] = f.toJSON();
    return acc;
  }, {});

  const desktop = {
    flows: [],
    defaultDataSource: [],
    graphic: { containers: {}, components: {} },
    layoutList,
    subscribes: [],
    reference: '',
    validateList: {},
    components,
    updateTime: now,
    canvas: { containers: {}, components: {} },
    layoutInfo: {
      type: 'layout',
      formUse: true,
      title: '自由布局',
      component: {
        _status: -1,
        _result: null,
      },
      componentIds: ['LayoutMain'],
      field: 'v50.Base',
    },
    validates: '',
  };

  const value = {
    bizCode: null,
    layoutRef: 0,
    entityName: null,
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
    gitBranch: 'origin/master',
    type: null,
    desktop,
  };

  return {
    gid: pageGid,
    frontId,
    name: config.pageName,
    pid: config.pid || null,
    functionGid: config.functionGid,
    productGid,
    value: JSON.stringify(value),
  };
}

module.exports = { buildSimpleForm };
