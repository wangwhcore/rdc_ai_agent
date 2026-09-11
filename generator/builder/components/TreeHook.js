const { uuid } = require('../uuid');

class TreeHook {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this.title = options.title || label;
    this.visible = options.visible !== false;
    this.enabled = options.enabled !== false;
    this.checkable = options.checkable || false;
    this.checkStrictly = options.checkStrictly || false;
    this.draggable = options.draggable || false;
    this.search = options.search !== false;
    this.showLine = options.showLine || false;
    this.isLazy = options.isLazy || false;
    this.onLoadData = options.onLoadData !== false;
    this.height = options.height || '400';
    this.valueField = options.valueField || 'id';
    this.displayField = options.displayField || 'text';
    this.leafField = options.leafField || 'leaf';
    this.dataSource = options.dataSource || null;
    this.actionBtnContainerId = options.actionBtnContainerId || '';
    this.menuList = options.menuList || '';
    this.expression = options.expression || '';
    this.showTitle = options.showTitle || false;
    this.tagStyle = options.tagStyle || '';
    this.subscribes = options.subscribes || [];
  }

  toJSON() {
    return {
      type: 'TreeHook',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        propType: 'TreeHook',
        title: this.title,
        visible: this.visible,
        enabled: this.enabled,
        checkable: this.checkable,
        checkStrictly: this.checkStrictly,
        draggable: this.draggable,
        search: this.search,
        showLine: this.showLine,
        isLazy: this.isLazy,
        onLoadData: this.onLoadData,
        height: this.height,
        valueField: this.valueField,
        displayField: this.displayField,
        leafField: this.leafField,
        dataSource: this.dataSource || {
          type: 'api',
          method: 'post',
          serverName: 'mdgeneric',
          url: '/md/materialgroup/gettreeall',
          bodyExpression: 'callback({ node:"root" })',
        },
        actionBtnContainerId: this.actionBtnContainerId,
        menuList: this.menuList,
        expression: this.expression,
        showTitle: this.showTitle,
        enterale: false,
        componentTypeName: '',
        tagStyle: this.tagStyle,
        subscribes: this.subscribes,
      },
    };
  }
}

function tree(field, label, options) {
  return new TreeHook(field, label, options);
}

module.exports = { TreeHook, tree };
