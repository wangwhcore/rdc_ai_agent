const { uuid } = require('../uuid');

class NeuTransfer {
  constructor(field, label, options = {}) {
    this.id = options.id || uuid();
    this.field = field;
    this.label = label;
    this.description = options.description || label;
    this.enabled = options.enabled !== false;
    this.visible = options.visible !== false;
    this.titleLeft = options.titleLeft || '$${Common.label.select}';
    this.titleRight = options.titleRight || '$${label.selected}';
    this.rowKey = options.rowKey || 'key';
    this.renderFuc = options.renderFuc || 'item.label';
    this.showSearch = options.showSearch !== false;
    this.showSelectAll = options.showSelectAll !== false;
    this.height = options.height || '390';
    this.enableTableMode = options.enableTableMode || false;
    this.enableBasisMode = options.enableBasisMode || false;
    this.bottom = options.bottom || '';
    this.dataSource = options.dataSource || null;
    this.tagStyle = options.tagStyle || '{}';
    this.subscribes = options.subscribes || [];
  }

  toJSON() {
    return {
      type: 'NeuTransfer',
      isForm: true,
      property: {
        id: this.id,
        description: this.description,
        label: this.label,
        filed: this.field,
        enabled: this.enabled,
        visible: this.visible,
        titleLeft: this.titleLeft,
        titleRight: this.titleRight,
        rowKey: this.rowKey,
        renderFuc: this.renderFuc,
        showSearch: this.showSearch,
        showSelectAll: this.showSelectAll,
        height: this.height,
        enableTableMode: this.enableTableMode,
        enableBasisMode: this.enableBasisMode,
        bottom: this.bottom,
        dataSource: this.dataSource || {
          type: 'api',
          method: 'post',
          serverName: 'mdgeneric',
          url: '/example/list',
          bodyExpression: 'callback({})',
        },
        tagStyle: this.tagStyle,
        title: this.label,
        subscribes: this.subscribes,
      },
    };
  }
}

function neuTransfer(field, label, options) {
  return new NeuTransfer(field, label, options);
}

module.exports = { NeuTransfer, neuTransfer };
