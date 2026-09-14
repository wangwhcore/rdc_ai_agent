const { uuid } = require('../uuid');
const { singleValidateOf } = require('../../ir/validateSpec');

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
    // 语料 67/67 恒为 false（另有 10 处无此键），从未出现 true —— 默认不允许半开区间
    this.allowEmpty = options.allowEmpty === true;
    // i18n 命名空间：语料里 startTime/endTime 恒为 $${label.*}（19 个文件），
    // 而 $${rdc.label.*} 只用于 pleaseEnter/pleaseSelect 这类通用提示（各 1 处）。
    // 写错命名空间界面会直接显示原始 key。
    this.placeholder1 = options.placeholder1 || '$${label.startTime}';
    this.placeholder2 = options.placeholder2 || '$${label.endTime}';
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
        enabled: this.enabled,
        visible: this.visible,
        displayMode: this.displayMode,
        showRequiredStar: this._required,
        singleValidate: singleValidateOf(this._required),
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
