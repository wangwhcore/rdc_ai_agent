const { uuid } = require('../uuid');

class RadioHook {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this._required = options.required || false;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.displayMode = options.displayMode || false;
    this.mode = options.mode || 'single'; // single / button
    this.valueField = options.valueField || 'itemCode';
    this.displayField = options.displayField || 'itemName';
    this.dict = options.dict || '';
    this.dataSource = options.dataSource || null;
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
      type: 'RadioHook',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'RadioHook',
        enabled: this.enabled,
        visible: this.visible,
        displayMode: this.displayMode,
        showRequiredStar: this._required,
        singleValidate: this._required ? 'required' : '',
        mode: this.mode,
        valueField: this.valueField,
        displayField: this.displayField,
        dataSource: this.dataSource || (this.dict ? {
          type: 'api',
          method: 'post',
          serverName: 'mdgeneric',
          url: '/md/datadict/getall',
          bodyExpression: `callback({ groupCode: '${this.dict}' })`,
        } : {}),
        isDescription: false,
        componentTypeName: '',
        anchorTarget: false,
        subscribes: this.subscribes,
        columnsType: {},
        tagStyle: '{}',
        wrapperSpan: this.wrapperSpan,
        labelSpan: this.labelSpan,
      },
    };
  }
}

function radio(field, label, options) {
  return new RadioHook(field, label, options);
}

module.exports = { RadioHook, radio };
