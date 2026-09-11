// 公共工具
const { uuid } = require('./builder/uuid');
const events = require('./builder/events');
const regions = require('./builder/regions');

// 页面构建器
const { buildListPage } = require('./builder/listPage');
const { buildAddEditPage, groupFieldsIntoRows } = require('./builder/addEditPage');
const { buildViewPage } = require('./builder/viewPage');
const { buildSimpleForm } = require('./builder/simpleForm');

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
const { number } = require('./builder/components/InputNumberHook');
const { radio } = require('./builder/components/RadioHook');
const { checkbox } = require('./builder/components/CheckboxHook');
const { switchField } = require('./builder/components/SwitchHook');
const { upload } = require('./builder/components/UploadHook');
const { findback } = require('./builder/components/FindbackHook');
const { span } = require('./builder/components/SpanHook');
const { dateRange } = require('./builder/components/RangePickerComponent');
const { buildModal } = require('./builder/modal');
const { editTable } = require('./builder/components/EditTableHook');
const { editColumn } = require('./builder/components/EditTableColumnHook');

module.exports = {
  // 工具
  uuid,
  events,
  regions,

  // 页面
  buildListPage,
  buildAddEditPage,
  buildViewPage,
  buildSimpleForm,
  buildModal,
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
  number,
  radio,
  checkbox,
  switchField,
  upload,
  findback,
  span,
  dateRange,
  editTable,
  editColumn,
};
