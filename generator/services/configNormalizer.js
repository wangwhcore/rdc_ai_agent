/**
 * 把用户传来的普通 JSON config 转换为 DSL 实例
 * 供 server.js 和 batch 脚本复用
 */

const {
  column,
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
} = require('../index');

const FIELD_BUILDERS = {
  text,
  TextHook: text,
  select,
  SelectHook: select,
  date,
  DatePickerHook: date,
  textarea,
  TextAreaHook: textarea,
  number,
  InputNumberHook: number,
  radio,
  RadioHook: radio,
  checkbox,
  CheckboxHook: checkbox,
  switch: switchField,
  switchField,
  SwitchHook: switchField,
  upload,
  UploadHook: upload,
  findback,
  FindbackHook: findback,
  span,
  SpanHook: span,
  dateRange,
  RangePickerComponent: dateRange,
  editTable,
  EditTableHook: editTable,
  editColumn,
  EditTableColumnHook: editColumn,
  neuTag,
  NeuTag: neuTag,
  image,
  ImageHook: image,
  reUpload,
  ReUpload: reUpload,
  dropdownButton,
  DropdownButtonHook: dropdownButton,
  proCard,
  ProCardHook: proCard,
  neuCascader,
  NeuCascader: neuCascader,
  tree,
  TreeHook: tree,
  neuTransfer,
  NeuTransfer: neuTransfer,
  tabs,
  TabsHook: tabs,
  drawerContainer,
  DrawerContainerHook: drawerContainer,
  time,
  TimePickerHook: time,
  gridFieldTable,
  GridFieldTable: gridFieldTable,
  gridColumn,
  GridFieldTableColumn: gridColumn,
};

function normalizeListConfig(config) {
  const normalized = { ...config };

  if (Array.isArray(config.columns)) {
    normalized.columns = config.columns.map(c =>
      c && typeof c === 'object' && c.field
        ? column(c.field, c.headerName, {
            width: c.width,
            sort: c.sort,
            fuzzyQuery: c.fuzzyQuery,
            tag: c.tag,
            link: c.link,
            fieldType: c.fieldType,
            columnsType: c.columnsType,
          })
        : c
    );
  }

  if (Array.isArray(config.queryFields)) {
    normalized.queryFields = config.queryFields.map(f =>
      f && typeof f === 'object' && f.field
        ? queryField(f.field, f.fieldType, f.queryType, {
            label: f.label,
            placeholder: f.placeholder,
            colSpan: f.colSpan,
            dict: f.dict,
          })
        : f
    );
  }

  return normalized;
}

function normalizeAddEditConfig(config) {
  return normalizeFieldsConfig(config);
}

function normalizeSimpleFormConfig(config) {
  return normalizeFieldsConfig(config);
}

function normalizeViewConfig(config) {
  return normalizeFieldsConfig(config);
}

function normalizeField(f) {
  if (!f || typeof f !== 'object' || !f.type || !f.field) {
    return f;
  }

  const builder = FIELD_BUILDERS[f.type];
  if (!builder) {
    throw new Error(`不支持的字段类型: ${f.type}`);
  }

  const options = { ...f.options };

  // 递归处理子表列
  if ((f.type === 'editTable' || f.type === 'gridFieldTable') && Array.isArray(options.columns)) {
    options.columns = options.columns.map(col => {
      if (!col || typeof col !== 'object' || (!col.field && !col.type)) return col;

      const colType = col.type === 'editColumn' ? 'editColumn' : (col.type === 'gridColumn' ? 'gridColumn' : (f.type === 'editTable' ? 'editColumn' : 'gridColumn'));
      const colBuilder = FIELD_BUILDERS[colType];
      const colOptions = { ...col.options };

      // 递归处理 cellType
      if (colOptions.cellType && typeof colOptions.cellType === 'object') {
        colOptions.cellType = normalizeField(colOptions.cellType);
      }

      let colInst = colBuilder(col.field, col.label, colOptions);
      return colInst;
    });
  }

  let inst = builder(f.field, f.label, options);
  if (f.required) inst = inst.required();
  if (f.readonly) inst = inst.readonly();
  return inst;
}

function normalizeFieldsConfig(config) {
  const normalized = { ...config };

  if (Array.isArray(config.fields)) {
    normalized.fields = config.fields.map(normalizeField);
  }

  return normalized;
}

module.exports = {
  FIELD_BUILDERS,
  normalizeListConfig,
  normalizeAddEditConfig,
  normalizeSimpleFormConfig,
  normalizeViewConfig,
};
