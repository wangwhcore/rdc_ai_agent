const { uuid } = require('../uuid');

class TextHook {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this.placeholder = options.placeholder || '$${label.pleaseEnter}';
    this._required = options.required || false;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.displayMode = options.displayMode || false;
    this.maxWords = options.maxWords || 10000;
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

  on(event, expression) {
    this.subscribes.push({
      event: `${this.id}.${event}`,
      pubs: [{ event: '', eventPayloadExpression: expression }],
    });
    return this;
  }

  toJSON() {
    return {
      type: 'TextHook',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'TextHook',
        enabled: this.enabled,
        visible: this.visible,
        displayMode: this.displayMode,
        placeholder: this.placeholder,
        showRequiredStar: this._required,
        singleValidate: this._required ? ['required'] : [],
        maxWords: this.maxWords,
        isAddonAfter: false,
        isScan: false,
        isSuffix: false,
        displayLink: false,
        passWordMode: false,
        prefix: '',
        thousandsFormat: '',
        labelAlign: '',
        valueAlign: '',
        displayAuto: '',
        isDescription: false,
        sceneStyle: '',
        componentTypeName: '',
        anchorTarget: false,
        subscribes: this.subscribes,
        columnsType: {},
        tagStyle: '{}',
        wrapperSpan: this.wrapperSpan,
        labelSpan: this.labelSpan,
        commonProperty: [],
      },
    };
  }
}

function text(field, label, options) {
  return new TextHook(field, label, options);
}

module.exports = { TextHook, text };
