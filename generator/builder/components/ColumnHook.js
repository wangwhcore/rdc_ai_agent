const { uuid } = require('../uuid');

const COLUMNS_TYPE_MAP = {
  text: {},
  date: { type: 'date' },
  currency: { type: 'currency', precision: 2 },
};

class ColumnHook {
  constructor(field, headerName, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.headerName = headerName;
    this.width = options.width || 120;
    this.sort = options.sort || 'none';
    this.fuzzyQuery = options.fuzzyQuery !== undefined ? options.fuzzyQuery : false;
    this.hide = options.hide || false;
    this.align = options.align || 'left';
    this.fixed = options.fixed || false;
    this.fieldType = options.fieldType || 'text';
    // 该列是否参与高级查询。默认参与；false 表示不生成查询条件，
    // 也可以传对象覆盖推导结果，如 { component:'CheckboxHook', span:24 }。
    // 注意 buildColumnsType 不消费 query，所以这里必须显式留存。
    this.query = options.query;
    this.columnsType = this.buildColumnsType(options);
  }

  buildColumnsType(options) {
    if (options.link) {
      const { link, pk = 'id' } = options;
      return {
        type: 'link',
        eventPayloadExpression: `pubsub.publish('@@navigator.push',{url:'${link}',query:'?${pk}='+eventPayload.${pk},data:eventPayload});`,
      };
    }
    if (options.tag) {
      return { type: 'tag', tagType: options.tag };
    }
    if (options.columnsType) {
      return options.columnsType;
    }
    return COLUMNS_TYPE_MAP[this.fieldType] || {};
  }

  toTableColumn() {
    return {
      level: '',
      width: this.width,
      resizable: true,
      cellEditor: 'cellComponents',
      minWidth: 100,
      headerName: this.headerName,
      filter: false,
      field: this.field,
      colId: this.id,
      description: this.headerName.replace(/\$\$\{label\./, '').replace('}', ''),
      sort: this.sort,
    };
  }

  toJSON() {
    return {
      type: 'ColumnHook',
      property: {
        id: this.id,
        tipsField: '',
        componentTypeName: '',
        hide: this.hide,
        align: this.align,
        width: this.width,
        summary: false,
        columnsSorter: false,
        schedulingBtns: '',
        advFilter: false,
        openValueEqualMerge: false,
        iconShowSet: '',
        thousandsFormat: '',
        serverName: 'appServer',
        colMapping: [],
        extendedColumn: false,
        titleTips: '',
        findBackProps: {},
        tipsIconSet: '',
        supportAccumulation: false,
        cardColumnTag: '',
        fieldType: this.fieldType,
        fixed: this.fixed,
        columnsType: this.columnsType,
        headerHidden: true,
        authorityField: '',
        merge: false,
        headerName: this.headerName,
        mergeCheckcolAndOperationBasedOnCurrentCol: false,
        field: this.field,
        description: this.headerName.replace(/\$\$\{label\./, '').replace('}', ''),
        fuzzyQuery: this.fuzzyQuery,
        tipsRemote: false,
        colgroup: false,
      },
    };
  }
}

function column(field, headerName, options) {
  return new ColumnHook(field, headerName, options);
}

module.exports = { ColumnHook, column };
