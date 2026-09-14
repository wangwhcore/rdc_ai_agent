const { uuid } = require('../uuid');

class FindbackHook {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this._required = options.required || false;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.displayMode = options.displayMode || false;
    this.modalTitle = options.modalTitle || label;
    this.modalWidth = options.modalWidth || 'middle';
    this.modalType = options.modalType || 'modal';
    this.showDropdown = options.showDropdown !== false;
    this.showAdd = options.showAdd || false;
    this.clearOther = options.clearOther || false;
    this.valueAdd = options.valueAdd || false;
    this.setKeywords = options.setKeywords || false;
    this.getReference = options.getReference || false;
    this.defaultOption = options.defaultOption || false;
    this.showRefresh = options.showRefresh !== false;
    this.wrapperSpan = options.wrapperSpan || 24;
    this.labelSpan = options.labelSpan || 24;
    this.subscribes = options.subscribes || [];

    // 参照弹窗表格配置
    this.tableInfo = options.tableInfo || {};
    this.associatedFields = options.associatedFields || [];

    // 嵌套 id 的记忆化结果。
    // buildTableInfo() / associatedFields 里的 uuid() 若在 toJSON() 里每次重新生成，
    // 同一组件的「内联挂载副本」与「components 映射副本」会拿到不同 id，
    // 导致页面无法 diff、无法幂等生成。这里首次解析后固定下来。
    this._resolvedTableInfo = null;
    this._resolvedAssociatedFields = null;
  }

  required() {
    this._required = true;
    return this;
  }

  readonly() {
    this.displayMode = true;
    this.enabled = false;
    return this;
  }

  /** buildTableInfo 的记忆化包装：保证多次 toJSON 得到同一份 id */
  resolveTableInfo() {
    if (!this._resolvedTableInfo) this._resolvedTableInfo = this.buildTableInfo();
    return this._resolvedTableInfo;
  }

  /** associatedFields 里缺失的 id 只生成一次 */
  resolveAssociatedFields() {
    if (!this._resolvedAssociatedFields) {
      this._resolvedAssociatedFields = this.associatedFields.map(a => ({
        id: a.id || uuid(),
        from: a.from,
        to: a.to,
      }));
    }
    return this._resolvedAssociatedFields;
  }

  buildTableInfo() {
    const tableId = this.tableInfo.id || uuid();
    const rowKey = this.tableInfo.rowKey || 'gid';
    const columns = (this.tableInfo.columns || []).map((c, idx) => ({
      colId: c.colId || uuid(),
      field: c.field,
      headerName: c.headerName,
    }));

    return {
      id: tableId,
      rowKey,
      isSelectable: true,
      rowSelection: 'single',
      isTreeData: false,
      dynamicCol: true,
      simplePage: false,
      searchVisible: true,
      queryVisible: false,
      filterVisible: false,
      showOperation: false,
      showPage: true,
      onLoadData: true,
      showSerial: true,
      isAutoSize: true,
      tableHeight: '367',
      tableHeightOffset: '',
      searchTips: '',
      isShowPagerTools: true,
      operationWidth: 130,
      dataSource: this.tableInfo.dataSource || {},
      columns,
      subscribes: [],
    };
  }

  toJSON() {
    return {
      type: 'FindbackHook',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'FindbackHook',
        enabled: this.enabled,
        visible: this.visible,
        displayMode: this.displayMode,
        placeholder: '$${rdc.label.pleaseEnter}',
        showRequiredStar: this._required,
        singleValidate: this._required ? 'required' : '',
        modalType: this.modalType,
        modalTitle: this.modalTitle,
        modalWidth: this.modalWidth,
        showDropdown: this.showDropdown,
        showAdd: this.showAdd,
        clearOther: this.clearOther,
        valueAdd: this.valueAdd,
        setKeywords: this.setKeywords,
        getReference: this.getReference,
        defaultOption: this.defaultOption,
        filterFields: '',
        showRefresh: this.showRefresh,
        showType: '',
        isMapRequest: false,
        associatedFields: this.resolveAssociatedFields(),
        tableInfo: this.resolveTableInfo(),
        pagination: {
          pageNoField: 'variables.page.page',
          pageSizeField: 'variables.page.pageSize',
          disabled: false,
          hideOnSinglePage: false,
          simple: false,
          small: true,
        },
        multiColsConfig: [],
        labelAlign: '',
        valueAlign: '',
        displayAuto: '',
        isDescription: false,
        componentTypeName: '',
        anchorTarget: false,
        subscribes: this.subscribes,
        tagStyle: '{}',
        wrapperSpan: this.wrapperSpan,
        labelSpan: this.labelSpan,
      },
    };
  }
}

function findback(field, label, options) {
  return new FindbackHook(field, label, options);
}

module.exports = { FindbackHook, findback };
