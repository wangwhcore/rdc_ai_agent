const { uuid } = require('../uuid');

class TabsHook {
  constructor(label, options = {}) {
    this.id = options.id || uuid();
    this.label = label;
    this.description = options.description || label;
    this.visible = options.visible !== false;
    this.enabled = options.enabled !== false;
    this.tabPosition = options.tabPosition || 'top';
    this.size = options.size || 'default';
    this.forceRender = options.forceRender || false;
    this.freeLayout = options.freeLayout !== false;
    this.autoHidden = options.autoHidden || false;
    this.isFixed = options.isFixed || false;
    this.paddingTop = options.paddingTop !== false;
    this.paddingLeft = options.paddingLeft || false;
    this.bodyStyle = options.bodyStyle || '{}';
    this.tabBarStyle = options.tabBarStyle || '{}';
    this.style = options.style || '{}';
    this.tagStyle = options.tagStyle || '{}';
    this.tabPanels = options.tabPanels || [];
    this.subscribes = options.subscribes || [];
  }

  addTab(title, layoutId, options = {}) {
    this.tabPanels.push({
      id: options.id || uuid(),
      title,
      description: options.description || title,
      code: options.code || '',
      layoutId,
      visible: options.visible !== false,
      enabled: options.enabled !== false,
      toolButtonsArry: options.toolButtonsArry || [],
      isShowButton: options.isShowButton || false,
      paddingType: options.paddingType || '',
      layoutHeight: options.layoutHeight || '',
      afterIcon: options.afterIcon || '',
      beforeIcon: options.beforeIcon || '',
    });
    return this;
  }

  toJSON() {
    return {
      type: 'TabsHook',
      isForm: false,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        title: this.label,
        propType: 'TabsHook',
        visible: this.visible,
        enabled: this.enabled,
        tabPosition: this.tabPosition,
        size: this.size,
        forceRender: this.forceRender,
        freeLayout: this.freeLayout,
        autoHidden: this.autoHidden,
        isFixed: this.isFixed,
        paddingTop: this.paddingTop,
        paddingLeft: this.paddingLeft,
        bodyStyle: this.bodyStyle,
        tabBarStyle: this.tabBarStyle,
        style: this.style,
        tagStyle: this.tagStyle,
        tabPanels: this.tabPanels,
        componentTypeName: '',
        subscribes: this.subscribes,
      },
    };
  }
}

function tabs(label, options) {
  return new TabsHook(label, options);
}

module.exports = { TabsHook, tabs };
