const { uuid } = require('../uuid');

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
    this.cellEditor = options.cellEditor || 'cellComponents';
    this.cellEditorParams = options.cellEditorParams || { type: 'inputTextField' };
    this.cellType = options.cellType || null;
    this.columnsType = options.columnsType || {};
    this.pinned = options.pinned || '';
    this.checkboxSelection = options.checkboxSelection || false;
    this.headerCheckboxSelection = options.headerCheckboxSelection || false;
  }

  toJSON() {
    const json = {
      id: this.id,
      field: this.field,
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
      pinned: this.pinned,
      checkboxSelection: this.checkboxSelection,
      headerCheckboxSelection: this.headerCheckboxSelection,
    };
    if (this.cellType) {
      json.cellType = typeof this.cellType.toJSON === 'function' ? this.cellType.toJSON() : this.cellType;
    }
    return json;
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
        columns: this.columns.map(c => c.toJSON()),
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
