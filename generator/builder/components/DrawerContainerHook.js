const { uuid } = require('../uuid');

class DrawerContainerHook {
  constructor(label, options = {}) {
    this.id = options.id || uuid();
    this.label = label;
    this.description = options.description || label;
    this.visible = options.visible !== false;
    this.enabled = options.enabled !== false;
    this.open = options.open !== false;
    this.layoutId = options.layoutId || uuid();
    this.drawerContainerId = options.drawerContainerId || uuid();
    this.drawerPlacement = options.drawerPlacement || 'right';
    this.drawerWidth = options.drawerWidth || 600;
    this.enableFull = options.enableFull !== false;
    this.drawerStyle = options.drawerStyle || '{}';
    this.drawerBodyStyle = options.drawerBodyStyle || '{}';
    this.style = options.style || '{}';
    this.tagStyle = options.tagStyle || '{}';
    this.field = options.field || '';
    this.subscribes = options.subscribes || [];
  }

  toJSON() {
    return {
      type: 'DrawerContainerHook',
      isForm: false,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        title: this.label,
        propType: 'DrawerContainerHook',
        visible: this.visible,
        enabled: this.enabled,
        open: this.open,
        layoutId: this.layoutId,
        drawerContainerId: this.drawerContainerId,
        drawerPlacement: this.drawerPlacement,
        drawerWidth: this.drawerWidth,
        enableFull: this.enableFull,
        drawerStyle: this.drawerStyle,
        drawerBodyStyle: this.drawerBodyStyle,
        style: this.style,
        tagStyle: this.tagStyle,
        field: this.field,
        componentTypeName: '',
        anchorTarget: false,
        subscribes: this.subscribes,
      },
    };
  }
}

function drawerContainer(label, options) {
  return new DrawerContainerHook(label, options);
}

module.exports = { DrawerContainerHook, drawerContainer };
