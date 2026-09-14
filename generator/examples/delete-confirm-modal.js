const { buildModal, span } = require('../index');

// 弹窗布局的 frontId —— 必须与引用它的列表页里的 confirmModalFrontId 一致。
// 这里是 inquiry-list.js 中那个占位符所指的弹窗；真实项目里替换成设计器分配的 frontId。
const frontId = '22222222222222222222222222222222';

module.exports = buildModal({
  pageName: '删除确认弹窗',
  frontId,
  functionGid: '92bc6124ae5a475dad12cfd1ebc286fa',
  productGid: '181A7E84452003',
  projectGid: 'PJ181A490E5D4001',
  appGid: '181A7E84452003',
  branch: 'test',
  createBy: 'sysadmin',
  createTime: '2022-09-14 02:02:39',
  lastModifiedBy: 'sysadmin',
  lastModifyTime: '2022-09-14 02:02:39',
  state: 1,
  content: span('msg', '$${message.delete.reminder}', {
    valueStyle: "{display:'block', fontWeight:'bold', height:'32px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}",
  }),
  okEvent: `pubsub.publish('${frontId}.ok', eventPayload);`,
  cancelEvent: `pubsub.publish('${frontId}.closeM');`,
});
