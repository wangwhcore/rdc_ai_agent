const { uuid } = require('../uuid');

/**
 * 语料中 GridFieldTable 的列注册条目（EditTableColumnHook）恒定具备的默认属性。
 * 依据：401 份 MdFrontLayout 语料中 117 个可解析的 GridFieldTable 列，全部与 EditTableColumnHook 配对。
 */
const REGISTERED_COLUMN_DEFAULTS = {
  align: 'left',
  colgroup: false,
  columnsSorter: false,
  componentTypeName: '',
  fillData: false,
  fuzzyQuery: false,
  headerHidden: false,
  iconShowSet: '',
  mergeCheckcolAndOperationBasedOnCurrentCol: false,
  openValueEqualMerge: false,
  showFiled: '',
  showTitleTips: false,
  supportAccumulation: false,
  tipsField: '',
  titleTips: '',
};

class GridFieldTableColumn {
  constructor(field, headerName, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.headerName = headerName;
    this.description = options.description || headerName;
    this.width = options.width || 150;
    this.editable = options.editable !== false;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.resizable = options.resizable !== false;
    this.fixed = options.fixed || false;
    this.cellEditor = options.cellEditor || 'cellComponents';
    this.cellEditorParams = options.cellEditorParams || { type: 'inputTextField' };
    this.cellType = options.cellType || null;
    this.columnsType = options.columnsType || {};
    this.pinned = options.pinned || '';
    this.checkboxSelection = options.checkboxSelection || false;
    this.headerCheckboxSelection = options.headerCheckboxSelection || false;
  }

  /**
   * 内嵌字段组件 -> 扁平 cellType。
   * 语料中 cellType 是「property 本体 + 顶层补 type/propType」，不是 {type, isForm, property} 包装。
   * @returns {object|null}
   */
  buildCellType() {
    if (!this.cellType) return null;
    const json = typeof this.cellType.toJSON === 'function' ? this.cellType.toJSON() : this.cellType;
    if (json && json.property) {
      return { ...json.property, type: json.type, propType: json.type };
    }
    return json ? { ...json } : null;
  }

  /**
   * 注册进 desktop.components 的条目。
   * 语料中 GridFieldTable 的列一律以 EditTableColumnHook 形态注册（117/117），
   * 与 TableHook/ColumnHook、EditTableHook/EditTableColumnHook 的既有约定一致。
   */
  toJSON() {
    const property = {
      id: this.id,
      field: this.field,
      headerName: this.headerName,
      description: this.description,
      width: this.width,
      enabled: this.enabled,
      visible: this.visible,
      fixed: this.fixed,
      columnsType: this.columnsType,
      reservedCellTypes: {},
      ...REGISTERED_COLUMN_DEFAULTS,
    };
    const cellType = this.buildCellType();
    if (cellType) property.cellType = cellType;
    return { type: 'EditTableColumnHook', property };
  }

  /**
   * 内联进 GridFieldTable.property.columns[] 的列描述，通过 colId 指向上面的注册条目。
   * @param {number} [index] 数据列序号（从 1 开始，不含序号列）
   */
  toTableColumn(index) {
    const col = {
      field: this.field,
      colId: this.id,
      headerName: this.headerName,
      description: this.description,
      width: this.width,
      editable: this.editable,
      enabled: this.enabled,
      visible: this.visible,
      resizable: this.resizable,
      cellEditor: this.cellEditor,
      cellEditorParams: this.cellEditorParams,
      columnsType: this.columnsType,
    };
    if (index !== undefined) col.index = index;
    if (this.pinned) col.pinned = this.pinned;
    const cellType = this.buildCellType();
    if (cellType) col.cellType = cellType;
    return col;
  }
}

class GridFieldTable {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this.title = options.title || label;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.displayMode = options.displayMode || false;
    this.rowKey = options.rowKey || 'id';
    this.tableType = options.tableType || 'baseTable';
    this.rowSelection = options.rowSelection || 'multiple';
    this.isDetailTable = options.isDetailTable !== false;
    this.isShowAddButton = options.isShowAddButton !== false;
    this.showDeleteButton = options.showDeleteButton !== false;
    this.showSerial = options.showSerial || false;
    this.showPage = options.showPage || false;
    this.showFrontPage = options.showFrontPage || false;
    this.showTableScrollbar = options.showTableScrollbar !== false;
    this.tableHeight = options.tableHeight || '300';
    this.heightAutoSize = options.heightAutoSize !== false;
    this.rowHeight = options.rowHeight || 40;
    this.border = options.border || false;
    this.rowDrag = options.rowDrag || false;
    this.dynamicCol = options.dynamicCol !== false;
    this.mergeTwoColumnsByDefault = options.mergeTwoColumnsByDefault !== false;
    this.isSelectable = options.isSelectable !== false;
    this.operationSet = options.operationSet || [];
    this.operationWidth = options.operationWidth || 200;
    this.operationShowSet = options.operationShowSet || '';
    this.columns = options.columns || [];
    this.dataSource = options.dataSource || '';
    this.subscribes = options.subscribes || [];
  }

  addColumn(field, headerName, options = {}) {
    this.columns.push(new GridFieldTableColumn(field, headerName, options));
    return this;
  }

  /**
   * 组装 property.columns。
   * 语料中 GridFieldTable 恒定携带一列序号列（21/21），且与 showSerial 取值无关
   * （15 例 showSerial=false 仍带序号列），故此处无条件前置。
   * colId 使用字面量哨兵 rowSerialNum_EditTable，与 EditTableHook.buildColumns 保持一致，
   * 避免生成不可解析的悬空 uuid 引用。
   */
  buildColumns() {
    const serialColumn = {
      display: true,
      width: 100,
      checkboxSelection: true,
      resizable: false,
      rowDrag: false,
      headerName: '',
      pinned: 'left',
      field: 'rowSerialNum_EditTable',
      colId: 'rowSerialNum_EditTable',
      headerCheckboxSelection: true,
    };

    const dataColumns = this.columns.map((c, i) => c.toTableColumn(i + 1));

    return [serialColumn, ...dataColumns];
  }

  toJSON() {
    return {
      type: 'GridFieldTable',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'GridFieldTable',
        enabled: this.enabled,
        visible: this.visible,
        displayMode: this.displayMode,
        rowKey: this.rowKey,
        tableType: this.tableType,
        rowSelection: this.rowSelection,
        isDetailTable: this.isDetailTable,
        isShowAddButton: this.isShowAddButton,
        showDeleteButton: this.showDeleteButton,
        showSerial: this.showSerial,
        showPage: this.showPage,
        showFrontPage: this.showFrontPage,
        showTableScrollbar: this.showTableScrollbar,
        tableHeight: this.tableHeight,
        heightAutoSize: this.heightAutoSize,
        rowHeight: this.rowHeight,
        border: this.border,
        rowDrag: this.rowDrag,
        dynamicCol: this.dynamicCol,
        mergeTwoColumnsByDefault: this.mergeTwoColumnsByDefault,
        isSelectable: this.isSelectable,
        operationSet: this.operationSet,
        operationWidth: this.operationWidth,
        operationShowSet: this.operationShowSet,
        columns: this.buildColumns(),
        dataSource: this.dataSource,
        title: this.title,
        componentTypeName: '',
        isMapRequest: false,
        groupOperation: [],
        groupInformation: [],
        tableGroup: false,
        enableMerge: false,
        tickExpression: '',
        pageParams: '',
        validate: '',
        tableOffsetHeight: '',
        isLoadData: true,
        subscribes: this.subscribes,
      },
    };
  }
}

function gridFieldTable(field, label, options) {
  return new GridFieldTable(field, label, options);
}

function gridColumn(field, headerName, options) {
  return new GridFieldTableColumn(field, headerName, options);
}

module.exports = { GridFieldTable, GridFieldTableColumn, gridFieldTable, gridColumn };
