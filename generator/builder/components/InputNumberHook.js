const { uuid } = require('../uuid');

class InputNumberHook {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this._required = options.required || false;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.displayMode = options.displayMode || false;
    this.min = options.min !== undefined ? options.min : null;
    this.max = options.max !== undefined ? options.max : null;
    this.precision = options.precision !== undefined ? options.precision : null;
    this.step = options.step !== undefined ? options.step : null;
    this.numberUnit = options.numberUnit || '';
    this.currencyMode = options.currencyMode || false;
    this.thousandsFormat = options.thousandsFormat || '';
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
    const property = {
      id: this.id,
      description: this.description,
      label: this.label,
      filed: this.field,
      propType: 'InputNumberHook',
      enabled: this.enabled,
      visible: this.visible,
      displayMode: this.displayMode,
      placeholder: '$${rdc.label.pleaseEnter}',
      showRequiredStar: this._required,
      singleValidate: this._required ? 'required' : '',
      min: this.min,
      max: this.max,
      precision: this.precision,
      step: this.step,
      numberUnit: this.numberUnit,
      currencyMode: this.currencyMode,
      thousandsFormat: this.thousandsFormat,
      isDescription: false,
      componentTypeName: '',
      anchorTarget: false,
      subscribes: this.subscribes,
      columnsType: {},
      tagStyle: '{}',
      wrapperSpan: this.wrapperSpan,
      labelSpan: this.labelSpan,
    };

    // 清理 null 值，保持输出简洁
    if (this.min === null) delete property.min;
    if (this.max === null) delete property.max;
    if (this.precision === null) delete property.precision;
    if (this.step === null) delete property.step;

    return { type: 'InputNumberHook', isForm: true, property };
  }
}

function number(field, label, options) {
  return new InputNumberHook(field, label, options);
}

module.exports = { InputNumberHook, number };
