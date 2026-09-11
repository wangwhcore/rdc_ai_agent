// 公共工具
const { uuid } = require('./builder/uuid');
const events = require('./builder/events');
const regions = require('./builder/regions');

// 页面构建器
const { buildListPage } = require('./builder/listPage');
const { buildAddEditPage, groupFieldsIntoRows } = require('./builder/addEditPage');

// 校验器
const { validate } = require('./builder/validator');

// 组件 DSL
const { button } = require('./builder/components/ButtonHook');
const { card } = require('./builder/components/CardHook');
const { column } = require('./builder/components/ColumnHook');
const { addTable } = require('./builder/components/TableHook');
const { addQuery, queryField } = require('./builder/components/AdvanceQueryHook');
const { text } = require('./builder/components/TextHook');
const { select } = require('./builder/components/SelectHook');
const { date } = require('./builder/components/DatePickerHook');
const { textarea } = require('./builder/components/TextAreaHook');

module.exports = {
  // 工具
  uuid,
  events,
  regions,

  // 页面
  buildListPage,
  buildAddEditPage,
  groupFieldsIntoRows,

  // 校验
  validate,

  // DSL
  button,
  card,
  column,
  addTable,
  addQuery,
  queryField,
  text,
  select,
  date,
  textarea,
};
