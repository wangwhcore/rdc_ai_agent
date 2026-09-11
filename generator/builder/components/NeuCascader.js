const { uuid } = require('../uuid');

class NeuCascader {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.displayMode = options.displayMode || false;
    this.valueField = options.valueField || 'value';
    this.displayField = options.displayField || 'label';
    this.childrenField = options.childrenField || 'children';
    this.changeOnSelect = options.changeOnSelect || false;
    this.loadData = options.loadData !== false;
    this.dataSource = options.dataSource || null;
    this.placeholder = options.placeholder || '$${pleaseChoose}';
    this.labelAlign = options.labelAlign || '';
    this.valueAlign = options.valueAlign || '';
    this.wrapperSpan = options.wrapperSpan || 24;
    this.labelSpan = options.labelSpan || 24;
    this.subscribes = options.subscribes || [];
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
      type: 'NeuCascader',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'NeuCascader',
        enabled: this.enabled,
        visible: this.visible,
        displayMode: this.displayMode,
        valueField: this.valueField,
        displayField: this.displayField,
        children: this.childrenField,
        changeOnSelect: this.changeOnSelect,
        loadData: this.loadData,
        showRequiredStar: !!this._required,
        singleValidate: this._required ? 'required' : '',
        labelAlign: this.labelAlign,
        valueAlign: this.valueAlign,
        placeholder: this.placeholder,
        isDescription: false,
        componentTypeName: '',
        anchorTarget: false,
        subscribes: this.subscribes,
        columnsType: {},
        tagStyle: '{}',
        wrapperSpan: this.wrapperSpan,
        labelSpan: this.labelSpan,
        dataSource: this.dataSource || {
          type: 'api',
          method: 'post',
          serverName: 'mdgeneric',
          url: '/md/address/getall',
          bodyExpression: 'callback({ addressLevel: 1 })',
        },
      },
    };
  }
}

function neuCascader(field, label, options) {
  return new NeuCascader(field, label, options);
}

module.exports = { NeuCascader, neuCascader };
