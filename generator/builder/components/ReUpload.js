const { uuid } = require('../uuid');

class ReUpload {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.uploadMode = options.uploadMode || 'Dragger';
    this.fileKey = options.fileKey || 'fileCodes';
    this.onlyDisplay = options.onlyDisplay || false;
    this.anchorTarget = options.anchorTarget || false;
    this.tagStyle = options.tagStyle || '{}';
    this.subscribes = options.subscribes || [];
  }

  toJSON() {
    return {
      type: 'ReUpload',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'ReUpload',
        enabled: this.enabled,
        visible: this.visible,
        uploadMode: this.uploadMode,
        anchorTarget: this.anchorTarget,
        subscribes: this.subscribes,
        onlyDisplay: this.onlyDisplay,
        tagStyle: this.tagStyle,
        title: this.label,
        key: this.fileKey,
      },
    };
  }
}

function reUpload(field, label, options) {
  return new ReUpload(field, label, options);
}

module.exports = { ReUpload, reUpload };
