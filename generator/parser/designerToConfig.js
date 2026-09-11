/**
 * 设计器 Layout JSON -> generator DSL config 反解析器
 * 把设计器保存的 MdFrontLayout JSON 还原为 buildXxxPage 可接收的 config 对象
 */

const COMPONENT_TYPE_MAP = {
  TextHook: 'text',
  TextAreaHook: 'textarea',
  InputNumberHook: 'number',
  SelectHook: 'select',
  DatePickerHook: 'date',
  RangePickerComponent: 'dateRange',
  RadioHook: 'radio',
  CheckboxHook: 'checkbox',
  SwitchHook: 'switchField',
  UploadHook: 'upload',
  FindbackHook: 'findback',
  SpanHook: 'span',
  NeuTag: 'neuTag',
  ImageHook: 'image',
  ReUpload: 'reUpload',
  NeuCascader: 'neuCascader',
  TreeHook: 'tree',
  NeuTransfer: 'neuTransfer',
  TimePickerHook: 'time',
  GridFieldTable: 'gridFieldTable',
  EditTableHook: 'editTable',
};

function parseValue(layoutJson) {
  if (!layoutJson) return null;
  if (typeof layoutJson.value === 'string') {
    try {
      return JSON.parse(layoutJson.value);
    } catch (e) {
      return null;
    }
  }
  return layoutJson.value || layoutJson;
}

function extractFieldsFromLayout(desktop, targetLayoutId) {
  const layout = desktop.layoutList[targetLayoutId];
  if (!layout || !layout.rows) return [];

  const fieldIds = [];
  for (const r of layout.rows) {
    for (const c of r.cols || []) {
      for (const comp of c.components || []) {
        if (comp && comp.property && comp.property.id) {
          fieldIds.push(comp.property.id);
        }
      }
    }
  }
  return fieldIds;
}

function findFormLayoutIds(desktop) {
  const layoutMain = desktop.layoutList.LayoutMain;
  if (!layoutMain || !layoutMain.rows) return [];

  const ids = [];
  for (const r of layoutMain.rows) {
    for (const c of r.cols || []) {
      for (const comp of c.components || []) {
        if (comp && comp.type === 'CardHook' && comp.property && comp.property.layoutId) {
          ids.push(comp.property.layoutId);
        }
      }
    }
  }
  return ids;
}

function componentToFieldConfig(comp) {
  if (!comp || !comp.type || !comp.property) return null;

  const type = COMPONENT_TYPE_MAP[comp.type];
  if (!type) return null;

  const p = comp.property;
  const options = {};

  // 通用可传递属性
  const passThrough = [
    'id', 'required', 'enabled', 'visible', 'displayMode', 'placeholder',
    'wrapperSpan', 'labelSpan', 'description', 'dict', 'dataSource',
    'format', 'pickerType', 'showTime', 'precision', 'valueField', 'displayField',
    'childrenField', 'changeOnSelect', 'loadData', 'checkable', 'rowKey',
    'uploadMode', 'fileKey', 'source', 'customValue', 'columnsType', 'color',
    'tabPosition', 'drawerPlacement', 'drawerWidth', 'layoutId', 'tableHeight',
    'titleLeft', 'titleRight', 'renderFuc', 'showSearch', 'showSelectAll',
    'cellEditor', 'cellEditorParams', 'editable', 'resizable', 'pinned',
  ];
  for (const key of passThrough) {
    if (p[key] !== undefined) options[key] = p[key];
  }

  // 字段名适配
  const field = p.filed || p.field || '';
  const label = p.label || p.title || '';

  // 只读标记：view 页面通常 displayMode=true
  if (p.displayMode === true) {
    options.readonly = true;
  }

  return { type, field, label, options };
}

function componentToColumnConfig(comp) {
  if (!comp || !comp.property) return null;
  const p = comp.property;
  return {
    field: p.filed || p.field || '',
    headerName: p.headerName || p.label || '',
    width: p.width,
    sort: p.sort,
    fuzzyQuery: p.fuzzyQuery,
    tag: p.tag,
    link: p.link,
    fieldType: p.fieldType,
    columnsType: p.columnsType,
  };
}

function parseListPage(desktop, layoutJson) {
  const tableComp = Object.values(desktop.components).find(c => c.type === 'TableHook');
  const queryComp = Object.values(desktop.components).find(c => c.type === 'AdvanceQueryHook');

  const columns = [];
  if (tableComp && tableComp.property && Array.isArray(tableComp.property.columns)) {
    for (const col of tableComp.property.columns) {
      const cfg = componentToColumnConfig(col);
      if (cfg) columns.push(cfg);
    }
  }

  const queryFields = [];
  if (queryComp && queryComp.property && Array.isArray(queryComp.property.queryData)) {
    for (const q of queryComp.property.queryData) {
      if (!q || !q.field) continue;
      queryFields.push({
        field: q.field,
        fieldType: q.type || '文本',
        queryType: q.queryType || 'like',
        label: q.label,
        placeholder: q.placeholder,
        colSpan: q.colSpan,
        dict: q.dict,
      });
    }
  }

  return {
    pageType: 'list',
    pageName: layoutJson.name || '列表页',
    functionGid: layoutJson.functionGid || '',
    serverName: tableComp?.property?.dataSource?.serverName || 'mdgeneric',
    listUrl: tableComp?.property?.dataSource?.url || '/example/list',
    rowKey: tableComp?.property?.rowKey || 'id',
    columns,
    queryFields,
  };
}

function parseFormPage(desktop, layoutJson, pageType) {
  const formLayoutIds = findFormLayoutIds(desktop);
  const fields = [];
  const isView = pageType === 'view';

  for (const layoutId of formLayoutIds) {
    const fieldIds = extractFieldsFromLayout(desktop, layoutId);
    for (const id of fieldIds) {
      const comp = desktop.components[id];
      const cfg = componentToFieldConfig(comp);
      if (!cfg) continue;
      // view 页面所有字段统一只读
      if (isView) {
        cfg.options.readonly = true;
      }
      fields.push(cfg);
    }
  }

  return {
    pageType,
    pageName: layoutJson.name || (pageType === 'view' ? '查看页' : '表单页'),
    functionGid: layoutJson.functionGid || '',
    fields,
  };
}

/**
 * 把设计器 Layout JSON 反解析为 generator config
 * @param {object} layoutJson 设计器保存的 Layout JSON（含 value 字符串）
 * @returns {object} { pageType, config }
 */
function designerToConfig(layoutJson) {
  const value = parseValue(layoutJson);
  if (!value || !value.desktop) {
    throw new Error('无效的 Layout JSON');
  }

  const desktop = value.desktop;
  const pageType = desktop.layoutInfo && desktop.layoutInfo.pageType;

  let config;
  if (pageType === 'list') {
    config = parseListPage(desktop, layoutJson);
  } else if (pageType === 'add' || pageType === 'view' || pageType === 'simple') {
    config = parseFormPage(desktop, layoutJson, pageType);
  } else {
    // 默认按表单页解析
    config = parseFormPage(desktop, layoutJson, pageType || 'unknown');
  }

  return { pageType, config };
}

module.exports = { designerToConfig, COMPONENT_TYPE_MAP };
