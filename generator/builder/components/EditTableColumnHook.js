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

  /**
   * 内嵌字段组件 -> 扁平 cellType。
   * 语料中 cellType 是「property 本体 + 顶层补 type/propType」，不是 {type, isForm, property} 包装。
   * 用展开构造新对象，避免把 type/propType 写回子组件的返回值（那会让重复 toJSON 相互污染）。
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

    const cellType = this.buildCellType();
    if (cellType) property.cellType = cellType;

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

    const cellType = this.buildCellType();
    if (cellType) col.cellType = cellType;

    return col;
  }
}

function editColumn(field, headerName, options) {
  return new EditTableColumnHook(field, headerName, options);
}

module.exports = { EditTableColumnHook, editColumn };
