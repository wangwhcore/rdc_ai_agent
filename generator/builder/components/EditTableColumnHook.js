const { uuid } = require('../uuid');

/**
 * 子表列组件
 * 与 ColumnHook 不同，EditTableColumnHook 的 cellType 内嵌完整字段组件定义
 */
class EditTableColumnHook {
  constructor(field, headerName, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.headerName = headerName;
    this.width = options.width || 120;
    this.align = options.align || 'left';
    this.hide = options.hide || false;
    this.fixed = options.fixed || false;
    this.editable = options.editable !== false;
    this.cellEditor = options.cellEditor || 'cellComponents';
    this.cellEditorParams = options.cellEditorParams || { type: 'inputTextField' };
    this.cellType = options.cellType || null; // 内嵌字段组件实例
    this.reservedCellTypes = options.reservedCellTypes || {};
    this.fuzzyQuery = options.fuzzyQuery || false;
    this.sort = options.sort || 'none';
  }

  toJSON() {
    const property = {
      id: this.id,
      field: this.field,
      headerName: this.headerName,
      width: this.width,
      align: this.align,
      hide: this.hide,
      fixed: this.fixed,
      editable: this.editable,
      cellEditor: this.cellEditor,
      cellEditorParams: this.cellEditorParams,
      reservedCellTypes: this.reservedCellTypes,
      fuzzyQuery: this.fuzzyQuery,
      sort: this.sort,
    };

    if (this.cellType) {
      property.cellType = this.cellType.toJSON().property;
      property.cellType.type = this.cellType.toJSON().type;
      property.cellType.propType = this.cellType.toJSON().type;
    }

    return {
      type: 'EditTableColumnHook',
      property,
    };
  }

  toTableColumn() {
    const col = {
      field: this.field,
      colId: this.id,
      headerName: this.headerName,
      width: this.width,
      minWidth: 100,
      resizable: true,
      editable: this.editable,
      cellEditor: this.cellEditor,
      cellEditorParams: this.cellEditorParams,
    };

    if (this.cellType) {
      col.cellType = this.cellType.toJSON().property;
      col.cellType.type = this.cellType.toJSON().type;
      col.cellType.propType = this.cellType.toJSON().type;
    }

    return col;
  }
}

function editColumn(field, headerName, options) {
  return new EditTableColumnHook(field, headerName, options);
}

module.exports = { EditTableColumnHook, editColumn };
