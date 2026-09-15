const { uuid } = require('../uuid');
const { subscribe } = require('../events');

class ButtonHook {
  constructor(title, options = {}) {
    this.id = options.id || uuid();
    this.title = title;
    this.type = options.type || 'primary';      // primary / default / dashed / link / text
    this.ghost = options.ghost || false;
    this.border = options.border || 'all';       // all / none
    this.block = options.block || false;
    this.size = options.size || 'default';
    this.shape = options.shape || 'default';
    this.icon = options.icon || '';
    this.description = options.description || title;
    this.action = options.action || '';
    this.actionConfig = options.actionConfig || { enabled: false };
    this.visible = options.visible !== false;
    this.enabled = options.enabled !== false;
    this.loading = options.loading || false;
    this.isConfirm = options.isConfirm || false;
    this.subscribes = options.subscribes || [];
    this.tagStyle = options.tagStyle || "{display:'inline-block',marginLeft:'4px'}";
    this.$mode = options.$mode || ['create', 'modify', 'query'];
    this.ruleField = options.ruleField || '';
  }

  primary() {
    this.type = 'primary';
    return this;
  }

  default() {
    this.type = 'default';
    return this;
  }

  ghost() {
    this.ghost = true;
    this.border = 'none';
    return this;
  }

  danger() {
    this.type = 'primary';
    // 低代码平台可能用 theme 或 style 表达危险样式，这里保持简单
    return this;
  }

  onClick(eventExpression) {
    this.subscribes = [
      subscribe(`${this.id}.click`, [
        { event: '', eventPayloadExpression: eventExpression },
      ]),
    ];
    return this;
  }

  toJSON() {
    return {
      type: 'ButtonHook',
      property: {
        id: this.id,
        description: this.description,
        title: this.title,
        icon: this.icon,
        type: this.type,
        size: this.size,
        shape: this.shape,
        enabled: this.enabled,
        visible: this.visible,
        ghost: this.ghost,
        block: this.block,
        hiddenTitle: false,
        isConfirm: this.isConfirm,
        loading: this.loading,
        border: this.border,
        theme: '',
        style: '{}',
        tagStyle: this.tagStyle,
        action: this.action,
        actionConfig: this.actionConfig,
        anchorTarget: false,
        commonProperty: [],
        $mode: this.$mode,
        propType: 'ButtonHook',
        subscribes: this.subscribes,
        ruleField: this.ruleField,
      },
    };
  }
}

function button(title, options) {
  return new ButtonHook(title, options);
}

module.exports = { ButtonHook, button };
