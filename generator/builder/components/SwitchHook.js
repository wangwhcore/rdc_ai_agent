const { uuid } = require('../uuid');

class SwitchHook {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this._required = options.required || false;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.displayMode = options.displayMode || false;
    this.checkedChildren = options.checkedChildren || '';
    this.unCheckedChildren = options.unCheckedChildren || '';
    this.checkMode = options.checkMode || '';
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
      type: 'SwitchHook',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'SwitchHook',
        enabled: this.enabled,
        visible: this.visible,
        displayMode: this.displayMode,
        showRequiredStar: this._required,
        singleValidate: this._required ? 'required' : '',
        checkedChildren: this.checkedChildren,
        unCheckedChildren: this.unCheckedChildren,
        checkMode: this.checkMode,
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

function switchField(field, label, options) {
  return new SwitchHook(field, label, options);
}

module.exports = { SwitchHook, switchField };
