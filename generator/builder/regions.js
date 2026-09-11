const { uuid } = require('./uuid');

const DEFAULT_COL_STYLE = {
  pull: 0,
  span: 24,
  xxl: 24,
  order: 0,
  offset: 0,
  xl: 24,
  md: 24,
  sm: 24,
  push: 0,
  lg: 24,
  xs: 24,
};

const DEFAULT_ROW_STYLE = {
  gutter: 32,
  justify: 'start',
  align: 'top',
  type: 'flex',
};

/**
 * 创建一列 ColContainer
 * @param {object} options
 * @param {number} options.span 栅格宽度 1-24
 * @param {array} options.components 该列包含的组件
 * @param {string} options.id 可选，自定义 id
 */
function col({ span = 24, components = [], id } = {}) {
  const colId = id || uuid();
  return {
    type: 'ColContainer',
    property: {
      id: colId,
      style: { ...DEFAULT_COL_STYLE, span },
    },
    components: components.map(c => ({
      ...c,
      colId: c.colId || colId,
    })),
  };
}

/**
 * 创建一行 RowContainer
 * @param {array} cols 列数组
 * @param {string} id 可选，自定义 id
 */
function row(cols = [], id) {
  return {
    type: 'RowContainer',
    property: {
      id: id || uuid(),
      style: { ...DEFAULT_ROW_STYLE },
    },
    cols,
  };
}

/**
 * 创建 layoutList 中的一个区域
 * @param {string} regionId 区域 ID，如 'LayoutMain'
 * @param {array} rows 行数组
 */
function region(regionId, rows = []) {
  return {
    [regionId]: { rows },
  };
}

/**
 * 将多个 region 对象合并为一个 layoutList
 */
function mergeRegions(...regions) {
  return regions.reduce((acc, r) => ({ ...acc, ...r }), {});
}

module.exports = {
  col,
  row,
  region,
  mergeRegions,
  DEFAULT_ROW_STYLE,
  DEFAULT_COL_STYLE,
};
