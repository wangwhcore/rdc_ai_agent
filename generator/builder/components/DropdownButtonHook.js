const { uuid } = require('../uuid');

class DropdownButtonHook {
  constructor(label, options = {}) {
    this.id = options.id || uuid();
    this.label = label;
    this.description = options.description || label;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.type = options.type || 'default';
    this.size = options.size || 'default';
    this.icon = options.icon || 'down';
    this.ghost = options.ghost || false;
    this.border = options.border || 'all';
    this.theme = options.theme || '';
    this.styleType = options.styleType || '1';
    this.isTitleChange = options.isTitleChange || false;
    this.valueField = options.valueField || 'key';
    this.displayField = options.displayField || 'val';
    this.dataSource = options.dataSource || [];
    this.actionList = options.actionList || [];
    this.tagStyle = options.tagStyle || "{display:'inline-block',marginLeft:'4px'}";
    this.subscribes = options.subscribes || [];
  }

  onClick(expression) {
    this.subscribes.push({
      event: `${this.id}.onClick`,
      pubs: [{ event: '', eventPayloadExpression: expression }],
    });
    return this;
  }

  toJSON() {
    return {
      type: 'DropdownButtonHook',
      isForm: false,
      property: {
        id: this.id,
        description: this.description,
        title: this.label,
        propType: 'DropdownButtonHook',
        enabled: this.enabled,
        visible: this.visible,
        type: this.type,
        size: this.size,
        icon: this.icon,
        ghost: this.ghost,
        border: this.border,
        theme: this.theme,
        styleType: this.styleType,
        isTitleChange: this.isTitleChange,
        valueField: this.valueField,
        displayField: this.displayField,
        dataSource: this.dataSource,
        actionList: this.actionList,
        commonProperty: [],
        anchorTarget: false,
        tagStyle: this.tagStyle,
        subscribes: this.subscribes,
      },
    };
  }
}

function dropdownButton(label, options) {
  return new DropdownButtonHook(label, options);
}

module.exports = { DropdownButtonHook, dropdownButton };
