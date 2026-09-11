const { uuid } = require('../uuid');

class RangePickerComponent {
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
    this.showTime = options.showTime || false;
    this.allowEmpty = options.allowEmpty !== false;
    this.placeholder1 = options.placeholder1 || '$${rdc.label.startTime}';
    this.placeholder2 = options.placeholder2 || '$${rdc.label.endTime}';
    this.disabledDate = options.disabledDate || '';
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
      type: 'RangePickerComponent',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'RangePickerComponent',
        enabled: this.enabled,
        visible: this.visible,
        displayMode: this.displayMode,
        placeholder: '$${rdc.label.pleaseSelect}',
        showRequiredStar: this._required,
        singleValidate: this._required ? 'required' : '',
        format: this.format,
        showTime: this.showTime,
        allowEmpty: this.allowEmpty,
        placeholder1: this.placeholder1,
        placeholder2: this.placeholder2,
        disabledDate: this.disabledDate,
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

function dateRange(field, label, options) {
  return new RangePickerComponent(field, label, options);
}

module.exports = { RangePickerComponent, dateRange };
