const { uuid } = require('../uuid');

class UploadHook {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this._required = options.required || false;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.displayMode = options.displayMode || false;
    this.uploadMode = options.uploadMode || 'file'; // file / image
    this.multiple = options.multiple !== false;
    this.onlyDisplay = options.onlyDisplay || false;
    this.action = options.action || '';
    this.parameters = options.parameters || '';
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
      type: 'UploadHook',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'UploadHook',
        enabled: this.enabled,
        visible: this.visible,
        displayMode: this.displayMode,
        showRequiredStar: this._required,
        singleValidate: this._required ? 'required' : '',
        uploadMode: this.uploadMode,
        multiple: this.multiple,
        onlyDisplay: this.onlyDisplay,
        action: this.action,
        parameters: this.parameters,
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

function upload(field, label, options) {
  return new UploadHook(field, label, options);
}

module.exports = { UploadHook, upload };
