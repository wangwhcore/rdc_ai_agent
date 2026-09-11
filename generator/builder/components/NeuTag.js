const { uuid } = require('../uuid');

class NeuTag {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.customValue = options.customValue || '';
    this.columnsType = options.columnsType || {};
    this.color = options.color || 'transparent';
    this.type = options.type || '';
    this.tagType = options.tagType || '';
    this.tagSpec = options.tagSpec || '';
    this.tagPattern = options.tagPattern || '';
    this.customStyle = options.customStyle || '{}';
    this.tagStyle = options.tagStyle || "{display:'inline-block'}";
    this.wrapperSpan = options.wrapperSpan || 24;
    this.labelSpan = options.labelSpan || 24;
    this.subscribes = options.subscribes || [];
  }

  toJSON() {
    return {
      type: 'NeuTag',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'NeuTag',
        enabled: this.enabled,
        visible: this.visible,
        customValue: this.customValue,
        customStyle: this.customStyle,
        componentTypeName: '',
        color: this.color,
        tagType: this.tagType,
        tagSpec: this.tagSpec,
        tagPattern: this.tagPattern,
        columnsType: this.columnsType,
        tagStyle: this.tagStyle,
        title: this.label,
        type: this.type,
        subscribes: this.subscribes,
        wrapperSpan: this.wrapperSpan,
        labelSpan: this.labelSpan,
      },
    };
  }
}

function neuTag(field, label, options) {
  return new NeuTag(field, label, options);
}

module.exports = { NeuTag, neuTag };
