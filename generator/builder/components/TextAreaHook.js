const { uuid } = require('../uuid');
const { singleValidateOf } = require('../../ir/validateSpec');

class TextAreaHook {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this._required = options.required || false;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.displayMode = options.displayMode || false;
    this.placeholder = options.placeholder || '$${label.pleaseEnter}';
    this.maxWords = options.maxWords || 2000;
    this.minRows = options.minRows || 2;
    this.maxRows = options.maxRows || 4;
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
      type: 'TextAreaHook',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'TextAreaHook',
        enabled: this.enabled,
        visible: this.visible,
        displayMode: this.displayMode,
        placeholder: this.placeholder,
        showRequiredStar: this._required,
        singleValidate: singleValidateOf(this._required),
        maxWords: this.maxWords,
        minRows: this.minRows,
        maxRows: this.maxRows,
        isDescription: false,
        displayAuto: '',
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

function textarea(field, label, options) {
  return new TextAreaHook(field, label, options);
}

module.exports = { TextAreaHook, textarea };
