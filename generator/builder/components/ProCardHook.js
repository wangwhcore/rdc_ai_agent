const { uuid } = require('../uuid');

class ProCardHook {
  constructor(label, options = {}) {
    this.id = options.id || uuid();
    this.label = label;
    this.description = options.description || label;
    this.visible = options.visible !== false;
    this.layoutId = options.layoutId || uuid();
    this.height = options.height || '';
    this.isTabsStatistic = options.isTabsStatistic || false;
    this.style = options.style || '{}';
    this.tagStyle = options.tagStyle || '{}';
    this.subscribes = options.subscribes || [];
  }

  toJSON() {
    return {
      type: 'ProCardHook',
      isForm: false,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        title: this.label,
        visible: this.visible,
        layoutId: this.layoutId,
        height: this.height,
        isTabsStatistic: this.isTabsStatistic,
        style: this.style,
        tagStyle: this.tagStyle,
        remark: '',
        componentTypeName: '',
        subscribes: this.subscribes,
      },
    };
  }
}

function proCard(label, options) {
  return new ProCardHook(label, options);
}

module.exports = { ProCardHook, proCard };
