const { uuid } = require('../uuid');
const { subscribe } = require('../events');
const { ButtonHook } = require('./ButtonHook');

const OPERATION_WIDTH_MAP = {
  1: 80,
  2: 130,
  3: 180,
  4: 230,
};

class TableHook {
  constructor(options = {}) {
    this.id = options.id || uuid();
    this.title = options.title || '';
    this.description = options.description || this.title;
    this.dataSource = options.dataSource || {};
    this.rowKey = options.rowKey || 'gid';
    this.rowSelection = options.rowSelection || 'multiple';
    this.showOperation = options.showOperation !== false;
    this.showPage = options.showPage !== false;
    this.operationWidth = options.operationWidth || 200;
    this.tableHeight = options.tableHeight || '';
    this.associateIds = options.associateIds || '';
    this.referenceDetailId = options.referenceDetailId || '';
    this.subscribes = options.subscribes || [];

    this.columns = options.columns || [];
    this.rowOperations = options.rowOperations || [];
    this.rowOperationItems = [];
    this.operationButtons = [];
  }

  buildOperationItems(listFrontId, addEditPageId, confirmModalId) {
    const defs = this.rowOperations.map(op => {
      if (typeof op === 'string') {
        return { type: op };
      }
      return op;
    });

    this.operationWidth =
      this.operationWidth || OPERATION_WIDTH_MAP[defs.length] || 200;

    defs.forEach(def => {
      const btnId = uuid();
      let btn;
      let eventExpr;

      switch (def.type) {
        case 'edit':
          eventExpr = require('../events').navigate(addEditPageId, {
            type: 'modify',
            data: 'rowData',
          });
          btn = new ButtonHook('$${button.edit}', {
            id: btnId,
            description: '编辑',
            ghost: true,
            border: 'none',
          }).onClick(eventExpr);
          break;
        case 'delete':
          eventExpr = require('../events').openModal(listFrontId, confirmModalId, {
            type: 'delete',
            data: 'rowData',
          });
          btn = new ButtonHook('$${button.delete}', {
            id: btnId,
            description: '删除',
            ghost: true,
            border: 'none',
          }).onClick(eventExpr);
          break;
        case 'copy':
          eventExpr = require('../events').navigate(addEditPageId, {
            type: 'copy',
            data: 'rowData',
          });
          btn = new ButtonHook('$${button.copy}', {
            id: btnId,
            description: '复制',
            ghost: true,
            border: 'none',
          }).onClick(eventExpr);
          break;
        case 'view':
          eventExpr = require('../events').navigate(addEditPageId, {
            type: 'view',
            data: 'rowData',
          });
          btn = new ButtonHook('$${button.view}', {
            id: btnId,
            description: '查看',
            ghost: true,
            border: 'none',
          }).onClick(eventExpr);
          break;
        default:
          eventExpr = def.eventExpr || '';
          btn = new ButtonHook(def.label || def.type, {
            id: btnId,
            description: def.label || def.type,
            ghost: true,
            border: 'none',
          }).onClick(eventExpr);
      }

      this.rowOperationItems.push({ id: btnId, title: btn.title });
      this.operationButtons.push(btn);
    });
  }

  buildColumns() {
    const serialColumn = {
      width: 94,
      checkboxSelection: true,
      headerClass: 'serialNum',
      rowDrag: false,
      minWidth: 100,
      cellClass: 'multiple',
      headerName: '序号',
      filter: false,
      pinned: 'left',
      sortable: false,
      suppressMovable: true,
      field: 'serialNum',
      colId: 'operationLeft',
      headerCheckboxSelection: true,
    };

    const dataColumns = this.columns.map(c => c.toTableColumn());

    const operationColumn = {
      cellRenderer: 'renderOperation',
      width: this.operationWidth,
      minWidth: 100,
      headerName: '操作',
      filter: false,
      pinned: 'right',
      sortable: false,
      suppressMovable: true,
      field: 'operation',
      colId: 'operationRight',
    };

    return [serialColumn, ...dataColumns, operationColumn];
  }

  toJSON() {
    return {
      type: 'TableHook',
      property: {
        id: this.id,
        description: this.description,
        title: this.title,
        dataSource: this.dataSource,
        rowKey: this.rowKey,
        rowSelection: this.rowSelection,
        showOperation: this.showOperation,
        operationWidth: this.operationWidth,
        columns: this.buildColumns(),
        rowOperationItem: this.rowOperationItems,
        associateIds: this.associateIds,
        referenceDetailId: this.referenceDetailId,
        subscribes: this.subscribes,
        showPage: this.showPage,
        tableHeight: this.tableHeight,
      },
    };
  }
}

function addTable(options) {
  return new TableHook(options);
}

module.exports = { TableHook, addTable };
