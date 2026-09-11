const { uuid } = require('../uuid');

class EditTableHook {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this.title = options.title || label;
    this.rowKey = options.rowKey || 'gid';
    this.rowSelection = options.rowSelection || 'multiple';
    this.isSelectable = options.isSelectable !== false;
    this.isShowAddButton = options.isShowAddButton !== false;
    this.showDeleteButton = options.showDeleteButton !== false;
    this.showSerial = options.showSerial !== false;
    this.dynamicCol = options.dynamicCol !== false;
    this.displayMode = options.displayMode || false;
    this.tableHeight = options.tableHeight || '';
    this.tableOffsetHeight = options.tableOffsetHeight || '300';
    this.operationSet = options.operationSet || [];
    this.operationWidth = options.operationWidth || 130;
    this.columns = options.columns || [];
    this.subscribes = options.subscribes || [];
    this.wrapperSpan = options.wrapperSpan || 24;
    this.labelSpan = options.labelSpan || 24;
  }

  buildColumns() {
    const serialColumn = {
      field: 'rowSerialNum_EditTable',
      colId: 'rowSerialNum_EditTable',
      checkboxSelection: true,
      headerCheckboxSelection: true,
      pinned: 'left',
      width: 60,
    };

    const dataColumns = this.columns.map(c => c.toTableColumn());

    return [serialColumn, ...dataColumns];
  }

  toJSON() {
    return {
      type: 'EditTableHook',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'EditTableHook',
        title: this.title,
        rowKey: this.rowKey,
        rowSelection: this.rowSelection,
        isSelectable: this.isSelectable,
        isShowAddButton: this.isShowAddButton,
        showDeleteButton: this.showDeleteButton,
        showSerial: this.showSerial,
        dynamicCol: this.dynamicCol,
        displayMode: this.displayMode,
        tableHeight: this.tableHeight,
        tableOffsetHeight: this.tableOffsetHeight,
        operationSet: this.operationSet,
        operationWidth: this.operationWidth,
        columns: this.buildColumns(),
        subscribes: this.subscribes,
        wrapperSpan: this.wrapperSpan,
        labelSpan: this.labelSpan,
      },
    };
  }
}

function editTable(field, label, options) {
  return new EditTableHook(field, label, options);
}

module.exports = { EditTableHook, editTable };
