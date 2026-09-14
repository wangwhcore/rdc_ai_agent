const { uuid } = require('../uuid');
const { singleValidateOf } = require('../../ir/validateSpec');
const { buildPublish } = require('../events');

class TextHook {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this.placeholder = options.placeholder || '$${rdc.label.pleaseEnter}';
    this._required = options.required || false;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.displayMode = options.displayMode || false;
    this.maxWords = options.maxWords || 200;
    this.wrapperSpan = options.wrapperSpan || 24;
    this.labelSpan = options.labelSpan || 24;
    this.subscribes = options.subscribes || [];

    // 与真实设计器保存文件对齐的额外属性
    this.remark = options.remark || '';
    this.componentTypeName = options.componentTypeName || '';
    this.sceneStyle = options.sceneStyle || '';
    this.isAddonAfter = options.isAddonAfter || false;
    this.isAddonBefore = options.isAddonBefore || false;
    this.isScan = options.isScan || false;
    this.enableAutoComplete = options.enableAutoComplete || false;
    this.thousandsFormat = options.thousandsFormat || '';
    this.defaultValue = options.defaultValue || '';
    this.labelAlign = options.labelAlign || '';
    this.displayAuto = options.displayAuto || '';
    this.isDescription = options.isDescription || false;
    this.prefix = options.prefix || '';
    this.valueAlign = options.valueAlign || '';
    this.isSuffix = options.isSuffix || false;
    this.displayLink = options.displayLink || false;
    this.enableDesensitization = options.enableDesensitization || false;
    this.passWordMode = options.passWordMode || false;
    this.ruleField = options.ruleField || '';
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
      ...buildPublish('emit', [{ event: '', eventPayloadExpression: expression }]),
    });
    return this;
  }

  toJSON() {
    return {
      type: 'TextHook',
      isForm: true,
      property: {
        remark: this.remark,
        enabled: this.enabled,
        componentTypeName: this.componentTypeName,
        sceneStyle: this.sceneStyle,
        displayMode: this.displayMode,
        maxWords: this.maxWords,
        isAddonAfter: this.isAddonAfter,
        isScan: this.isScan,
        filed: this.field,
        subscribes: this.subscribes,
        enableAutoComplete: this.enableAutoComplete,
        thousandsFormat: this.thousandsFormat,
        showRequiredStar: this._required,
        defaultValue: this.defaultValue,
        labelAlign: this.labelAlign,
        displayAuto: this.displayAuto,
        isDescription: this.isDescription,
        visible: this.visible,
        prefix: this.prefix,
        placeholder: this.placeholder,
        valueAlign: this.valueAlign,
        label: this.label,
        isAddonBefore: this.isAddonBefore,
        tagStyle: '{}',
        id: this.id,
        isSuffix: this.isSuffix,
        displayLink: this.displayLink,
        description: this.description,
        propType: 'TextHook',
        wrapperSpan: this.wrapperSpan,
        enableDesensitization: this.enableDesensitization,
        labelSpan: this.labelSpan,
        singleValidate: singleValidateOf(this._required),
        passWordMode: this.passWordMode,
        ruleField: this.ruleField,
      },
    };
  }
}

function text(field, label, options) {
  return new TextHook(field, label, options);
}

module.exports = { TextHook, text };
