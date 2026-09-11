const { uuid } = require('../uuid');

class TimePickerHook {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.displayMode = options.displayMode || false;
    this.format = options.format || 'HH:mm:ss';
    this.use12Hours = options.use12Hours || false;
    this.placeholder = options.placeholder || '$${label.pleaseSelect}';
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
      type: 'TimePickerHook',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'TimePickerHook',
        enabled: this.enabled,
        visible: this.visible,
        displayMode: this.displayMode,
        format: this.format,
        use12Hours: this.use12Hours,
        placeholder: this.placeholder,
        showRequiredStar: !!this._required,
        singleValidate: this._required ? 'required' : '',
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

function time(field, label, options) {
  return new TimePickerHook(field, label, options);
}

module.exports = { TimePickerHook, time };
