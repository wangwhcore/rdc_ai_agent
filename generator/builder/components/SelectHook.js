const { uuid } = require('../uuid');

class SelectHook {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this.dict = options.dict || '';
    this.dataSource = options.dataSource || null;
    this._required = options.required || false;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.displayMode = options.displayMode || false;
    this.mode = options.mode || 'single';
    this.valueField = options.valueField || 'itemCode';
    this.displayField = options.displayField || 'itemName';
    this.wrapperSpan = options.wrapperSpan || 24;
    this.labelSpan = options.labelSpan || 24;
    this.subscribes = options.subscribes || [];
    // multiColsConfig 的嵌套 id 必须在构造期确定：
    // 若在 toJSON() 里生成，同一组件的「内联挂载副本」与「components 映射副本」
    // 会拿到不同的 id，同一页面重复生成的结果也不一致，导致无法 diff 与幂等。
    this.multiColsConfig = options.multiColsConfig || [
      { id: uuid(), title: '名称', displayField: this.displayField, search: true, width: 12 },
    ];
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

  toJSON() {
    return {
      type: 'SelectHook',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'SelectHook',
        enabled: this.enabled,
        visible: this.visible,
        displayMode: this.displayMode,
        placeholder: '',
        showRequiredStar: this._required,
        singleValidate: this._required ? 'required' : '',
        mode: this.mode,
        valueField: this.valueField,
        showFiled: this.displayField,
        displayField: this.displayField,
        onLoadData: true,
        remoteSearch: true,
        multiCols: true,
        multiColsConfig: this.multiColsConfig.map(c => ({ ...c })),
        showAdd: false,
        defaultOption: false,
        multiPagination: false,
        multipleColor: '',
        wordColor: '',
        dataSource: this.dataSource || {
          type: 'api',
          method: 'post',
          serverName: 'mdgeneric',
          url: '/md/datadict/getall',
          bodyExpression: `callback({ groupCode: '${this.dict}' })`,
        },
        pagination: {
          pageNoField: 'page',
          pageSizeField: 'pageSize',
          filterField: 'filter',
          totalField: 'pager.totalRecords',
          disabled: false,
          hideOnSinglePage: false,
          simple: false,
          small: true,
        },
        isMapRequest: false,
        displayAuto: '',
        isDescription: false,
        sceneStyle: '',
        componentTypeName: '',
        anchorTarget: false,
        subscribes: this.subscribes,
        columnsType: {},
        tagStyle: '{}',
        wrapperSpan: this.wrapperSpan,
        labelSpan: this.labelSpan,
        showRefresh: true,
        commonProperty: [],
      },
    };
  }
}

function select(field, label, options) {
  return new SelectHook(field, label, options);
}

module.exports = { SelectHook, select };
