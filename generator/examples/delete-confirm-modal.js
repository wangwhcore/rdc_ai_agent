const { buildModal, span } = require('../index');

module.exports = buildModal({
  pageName: '删除确认弹窗',
  frontId: 'deleteConfirmModal',
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
  okEvent: "pubsub.publish('deleteConfirmModal.ok', eventPayload);",
  cancelEvent: "pubsub.publish('deleteConfirmModal.closeM');",
});
