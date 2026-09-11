const { uuid } = require('../uuid');

class ImageHook {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this.source = options.source || '';
    this.visible = options.visible !== false;
    this.anchorTarget = options.anchorTarget || false;
    this.customStyle = options.customStyle || "{maxWidth: '100%', maxHeight: '100%', height:'unset', margin: '0'}";
    this.tagStyle = options.tagStyle || "{display: 'inline-block', float: 'left', width: '24px', height: '24px'}";
    this.subscribes = options.subscribes || [];
  }

  toJSON() {
    return {
      type: 'ImageHook',
      isForm: false,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'ImageHook',
        source: this.source,
        visible: this.visible,
        anchorTarget: this.anchorTarget,
        customStyle: this.customStyle,
        tagStyle: this.tagStyle,
        title: this.label,
        subscribes: this.subscribes,
      },
    };
  }
}

function image(field, label, options) {
  return new ImageHook(field, label, options);
}

module.exports = { ImageHook, image };
