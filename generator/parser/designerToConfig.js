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

function inferPageType(desktop) {
  const hasTable = Object.values(desktop.components).some(c => c.type === 'TableHook');
  if (hasTable) return 'list';

  const hasSaveButton = Object.values(desktop.components).some(c =>
    c.type === 'ButtonHook' &&
    c.property &&
    (c.property.title === '$${button.save}' || c.property.description === '保存')
  );
  const hasFormCard = findFormLayoutIds(desktop).length > 0;

  if (hasFormCard && !hasSaveButton) return 'view';
  if (hasFormCard && hasSaveButton) return 'add';
  return 'unknown';
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
    'format', 'pickerType', 'showTime', 'precision', 'min', 'max', 'step',
    'valueField', 'displayField', 'childrenField', 'changeOnSelect', 'loadData',
    'checkable', 'checkStrictly', 'rowKey',
    'uploadMode', 'fileKey', 'source', 'customValue', 'columnsType', 'color',
    'tabPosition', 'drawerPlacement', 'drawerWidth', 'layoutId', 'tableHeight',
    'titleLeft', 'titleRight', 'renderFuc', 'showSearch', 'showSelectAll',
    'cellEditor', 'cellEditorParams', 'editable', 'resizable', 'pinned',
    'ruleField', 'customStyle', 'tagStyle', 'labelAlign', 'valueAlign',
    'rows', 'showCount', 'onlyDisplay', 'anchorTarget', 'border', 'theme',
    'size', 'type', 'icon', 'ghost', 'showLine', 'isLazy', 'draggable',
    'search', 'height', 'use12Hours', 'changeOnSelect',
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

/**
 * 还原一列。
 *
 * 两种形态都要吃：
 *   1. 注册条目 { type:'ColumnHook', property:{ field, fieldType, columnsType, ... } }
 *   2. 表格里的内联列描述符 { field, headerName, width, colId, ... }（没有 property 层）
 * 语料里表格的 columns[] 全是形态 2，类型信息（fieldType/columnsType/fuzzyQuery）
 * 只在 colId 指向的注册条目里 —— 调用方负责把注册条目合并进来（见 parseListPage）。
 */
function componentToColumnConfig(comp) {
  if (!comp) return null;
  const p = comp.property || comp;
  if (!p || typeof p !== 'object') return null;
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

/**
 * 从已生成的 Layout 里还原跨布局引用。
 *
 * 这些引用的语义是「目标布局的 frontId」，由 builder/events.js 写出：
 *   pubsub.publish('@@navigator.push', { url:'<目标布局 frontId>' })
 *   pubsub.publish('<本页 frontId>.openM', { id: "<目标弹窗布局 frontId>" })
 * 不还原的话，反解析 -> 重新生成这一圈会把引用丢掉（旧版本就是这样，
 * 于是 confirmModalId 退化成随机 uuid，运行时彻底找不到弹窗布局）。
 *
 * @param {object} desktop
 * @returns {{addEditPageFrontId?:string, confirmModalFrontId?:string, listPageFrontId?:string}}
 */
function extractLayoutRefs(desktop) {
  const out = {};
  const pushRe = /@@navigator\.push'[\s\S]{0,300}?\burl\s*:\s*(['"])([^'"]*)\1/;
  const modalRe = /(['"])([^'"]+)\.openM\1\s*,\s*\{[\s\S]{0,500}?\bid\s*:\s*(['"])([^'"]*)\3/;

  const components = (desktop && desktop.components) || {};
  for (const comp of Object.values(components)) {
    if (!comp || !comp.property) continue;
    // property 里可能有嵌套数组（subscribes[].pubs[]），整体扫描字符串
    const stack = [comp.property];
    while (stack.length) {
      const node = stack.pop();
      if (typeof node === 'string') {
        const push = node.match(pushRe);
        if (push && !out.addEditPageFrontId) out.addEditPageFrontId = push[2];
        const modal = node.match(modalRe);
        if (modal && !out.confirmModalFrontId) out.confirmModalFrontId = modal[4];
        continue;
      }
      if (Array.isArray(node)) { stack.push(...node); continue; }
      if (node && typeof node === 'object') stack.push(...Object.values(node));
    }
  }
  return out;
}

/** 从字典数据源的 bodyExpression 里抠出 groupCode */
function readGroupCode(dataSource) {
  const expr = dataSource && dataSource.bodyExpression;
  if (typeof expr !== 'string') return '';
  const m = expr.match(/groupCode\s*:\s*['"]([^'"]+)['"]/);
  return m ? m[1] : '';
}

/**
 * 还原高级查询条件。
 *
 * 真实产物的形态是 `advancedQuery: [{ field, operation, type, value }]`
 * （注意不是早期生成器输出的 queryData，那个属性在语料里根本不存在），
 * 条件组件的类型/标签/字典则要从 `<id>_filterId` 容器里按序取。
 * 两条列表严格按序对齐（语料 224/225），所以按下标配即可。
 */
function extractQueryFields(desktop, queryComp) {
  if (!queryComp || !queryComp.property) return [];
  const hookId = queryComp.property.id;
  const aq = Array.isArray(queryComp.property.advancedQuery) ? queryComp.property.advancedQuery : [];

  const container = (desktop.layoutList || {})[`${hookId}_filterId`];
  const inner = [];
  for (const row of (container && container.rows) || []) {
    for (const col of row.cols || []) {
      const span = col.property && col.property.style && col.property.style.span;
      for (const c of col.components || []) inner.push({ node: c, span });
    }
  }

  return aq
    .filter(q => q && q.field)
    .map((q, i) => {
      const hit = inner[i];
      const p = (hit && hit.node && hit.node.property) || {};
      const component = hit && hit.node ? hit.node.type : null;
      return {
        field: q.field,
        // 新形态：组件 + operation 直接就能重新生成
        component: component || undefined,
        operation: q.operation || undefined,
        // 旧字段名兼容（batchParseDesigner / configNormalizer 仍按这套读）
        fieldType: component || q.fieldType || 'TextHook',
        queryType: q.operation || q.queryType || 'like',
        label: p.label || q.label || `\$\${label.${q.field}}`,
        dict: readGroupCode(p.dataSource) || q.dict || '',
        span: hit && hit.span ? hit.span : undefined,
      };
    });
}

function parseListPage(desktop, layoutJson) {
  const tableComp = Object.values(desktop.components).find(c => c.type === 'TableHook');
  const queryComp = Object.values(desktop.components).find(c => c.type === 'AdvanceQueryHook');

  const columns = [];
  if (tableComp && tableComp.property && Array.isArray(tableComp.property.columns)) {
    const registry = desktop.components || {};
    for (const col of tableComp.property.columns) {
      // 内联描述符 + colId 指向的注册条目合并：
      // fieldType / columnsType / fuzzyQuery 只存在于注册条目里，
      // 不合并就没法还原「列是什么类型」，高级查询条件也就推导不出来。
      const registered = col && col.colId ? registry[col.colId] : null;
      const merged = registered && registered.property
        ? { property: { ...col, ...registered.property } }
        : { property: col };
      const cfg = componentToColumnConfig(merged);
      if (cfg && cfg.field) columns.push(cfg);
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
    queryFields: extractQueryFields(desktop, queryComp),
    // 跨布局引用（frontId 语义），不还原就会在重新生成时丢失
    ...extractLayoutRefs(desktop),
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
  const declaredPageType = desktop.layoutInfo && desktop.layoutInfo.pageType;
  const pageType = declaredPageType || inferPageType(desktop);

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
