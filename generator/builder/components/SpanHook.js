const { uuid } = require('../uuid');

class SpanHook {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this.value = options.value || '';
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.displayMode = options.displayMode || false;
    this.valueStyle = options.valueStyle || '';
    this.labelStyle = options.labelStyle || '';
    this.styleType = options.styleType || [];
    this.statusEnumerate = options.statusEnumerate || '[]';
    this.calFormula = options.calFormula || '';
    this.isCount = options.isCount || false;
    this.isTooltip = options.isTooltip || false;
    this.wrapperSpan = options.wrapperSpan || 24;
    this.labelSpan = options.labelSpan || 24;
    this.subscribes = options.subscribes || [];
  }

  toJSON() {
    return {
      type: 'SpanHook',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'SpanHook',
        enabled: this.enabled,
        visible: this.visible,
        displayMode: this.displayMode,
        value: this.value,
        valueStyle: this.valueStyle,
        labelStyle: this.labelStyle,
        styleType: this.styleType,
        statusEnumerate: this.statusEnumerate,
        calFormula: this.calFormula,
        isCount: this.isCount,
        isTooltip: this.isTooltip,
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

function span(field, label, options) {
  return new SpanHook(field, label, options);
}

module.exports = { SpanHook, span };
