const { uuid } = require('../uuid');

class DatePickerHook {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this._required = options.required || false;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.displayMode = options.displayMode || false;
    this.format = options.format || 'YYYY-MM-DD';
    this.pickerType = options.pickerType || 'date';
    this.showTime = options.showTime || false;
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
      type: 'DatePickerHook',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'DatePickerHook',
        enabled: this.enabled,
        visible: this.visible,
        displayMode: this.displayMode,
        placeholder: '$${label.pleaseSelect}',
        showRequiredStar: this._required,
        singleValidate: this._required ? 'required' : '',
        pickerType: this.pickerType,
        format: this.format,
        showTime: this.showTime,
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

function date(field, label, options) {
  return new DatePickerHook(field, label, options);
}

module.exports = { DatePickerHook, date };
