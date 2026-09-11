const { uuid } = require('../uuid');

class CardHook {
  constructor(options = {}) {
    this.id = options.id || uuid();
    this.title = options.title || '';
    this.description = options.description || this.title;
    this.showType = options.showType || 'borderAndNotitle'; // borderAndTitle / borderAndNotitle
    this.layoutId = options.layoutId || '';
    this.toolContainerId = options.toolContainerId || '';
    this.extraContainerId = options.extraContainerId || '';
    this.ltContainerId = options.ltContainerId || '';
    this.toolButtons = options.toolButtons || [];
    this.isFullScreen = options.isFullScreen !== false;
    this.paddingTop = options.paddingTop !== false;
    this.isShowButton = options.isShowButton !== false;
    this.open = options.open !== false;
    this.visible = options.visible !== false;
    this.hoverable = options.hoverable || false;
    this.isSplitScreen = options.isSplitScreen || false;
    this.showContent = options.showContent !== false;
    this.cardLazy = options.cardLazy || false;
    this.switchTableButtonShow = options.switchTableButtonShow || false;
    this.tipsIcon = options.tipsIcon || '!icon-a-shanchuxinxibeifen2';
    this.bodyStyle = options.bodyStyle || '{}';
    this.style = options.style || '{}';
    this.headStyle = options.headStyle || '{}';
    this.size = options.size || 'default';
    this.tagStyle = options.tagStyle || "{display:'inline-block',minWidth:'300px',width:'100%',background:'#fff'}";
    this.subscribes = options.subscribes || [];
  }

  toJSON() {
    return {
      type: 'CardHook',
      property: {
        id: this.id,
        description: this.description,
        title: this.title,
        showType: this.showType,
        layoutId: this.layoutId,
        toolContainerId: this.toolContainerId,
        extraContainerId: this.extraContainerId,
        ltContainerId: this.ltContainerId,
        toolButtons: this.toolButtons,
        isFullScreen: this.isFullScreen,
        paddingTop: this.paddingTop,
        isShowButton: this.isShowButton,
        open: this.open,
        visible: this.visible,
        hoverable: this.hoverable,
        isSplitScreen: this.isSplitScreen,
        showContent: this.showContent,
        cardLazy: this.cardLazy,
        switchTableButtonShow: this.switchTableButtonShow,
        relatedTableId: '',
        groupCode: '',
        rowNum: '',
        tipsTitle: '',
        tipsLinkId: '',
        tipsIcon: this.tipsIcon,
        tipsBoxWidth: '',
        bodyStyle: this.bodyStyle,
        style: this.style,
        headStyle: this.headStyle,
        size: this.size,
        anchorTarget: false,
        showTopLayout: false,
        subscribes: this.subscribes,
        columnsType: {},
        tagStyle: this.tagStyle,
        loadComponent: false,
        pickUpDes: '收起更多信息',
        moreDes: '更多信息',
      },
    };
  }
}

function card(options) {
  return new CardHook(options);
}

module.exports = { CardHook, card };
