// 公共工具
const { uuid } = require('./builder/uuid');
const events = require('./builder/events');
const regions = require('./builder/regions');

// 页面构建器
const { buildListPage } = require('./builder/listPage');
const { buildAddEditPage, groupFieldsIntoRows } = require('./builder/addEditPage');
const { buildViewPage } = require('./builder/viewPage');
const { buildSimpleForm } = require('./builder/simpleForm');

// 校验器（兼容层，内部走 check 引擎）
const { validate } = require('./builder/validator');

// Page IR：语义中间层
const ir = require('./ir');

// 契约校验器
const check = require('./check');

// 反解析器
const { designerToConfig } = require('./parser/designerToConfig');

// 组件 DSL
const { button } = require('./builder/components/ButtonHook');
const { card } = require('./builder/components/CardHook');
const { column } = require('./builder/components/ColumnHook');
const { addTable } = require('./builder/components/TableHook');
const { addQuery, queryField, deriveQueryFields, normalizeCondition } = require('./builder/components/AdvanceQueryHook');
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
const { neuTag } = require('./builder/components/NeuTag');
const { image } = require('./builder/components/ImageHook');
const { reUpload } = require('./builder/components/ReUpload');
const { dropdownButton } = require('./builder/components/DropdownButtonHook');
const { proCard } = require('./builder/components/ProCardHook');
const { neuCascader } = require('./builder/components/NeuCascader');
const { tree } = require('./builder/components/TreeHook');
const { neuTransfer } = require('./builder/components/NeuTransfer');
const { tabs } = require('./builder/components/TabsHook');
const { drawerContainer } = require('./builder/components/DrawerContainerHook');
const { time } = require('./builder/components/TimePickerHook');
const { gridFieldTable, gridColumn } = require('./builder/components/GridFieldTable');

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

  // 校验（兼容 API，返回 { ok, errors: string[] }）
  validate,

  // Page IR：Layout JSON ⇄ IR
  ir,

  // 契约校验引擎（结构化诊断）
  check,

  // 反解析
  designerToConfig,

  // DSL
  button,
  card,
  column,
  addTable,
  addQuery,
  queryField,
  deriveQueryFields,
  normalizeCondition,
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
  neuTag,
  image,
  reUpload,
  dropdownButton,
  proCard,
  neuCascader,
  tree,
  neuTransfer,
  tabs,
  drawerContainer,
  time,
  gridFieldTable,
  gridColumn,
};
