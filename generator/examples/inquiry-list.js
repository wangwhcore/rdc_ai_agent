const {
  buildListPage,
  column,
  queryField,
} = require('../index');

const pageName = '询价单管理';
const serverName = 'purchase';
const listUrl = '/inquiry/list';

// functionGid：功能 GID，取自 MdFunction/<gid>.json 的文件名
const functionGid = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // 替换为实际功能 GID

// ⚠️ 下面两个是「跨布局引用」，运行时按**目标布局的 frontId** 解析（不是 MdFrontLayout 的文件名 gid）
// 这里故意写成「全同一字符」的显眼占位符 —— check 会以 REF004/REF006 告警提醒替换，
// 且不会像随机 uuid 那样伪装成一个“看起来合法”的悬空引用。
// 不替换的后果：运行时查不到目标布局 -> RenderLayout 收到空节点 ->
//   TypeError: Cannot read properties of undefined (reading 'field')
const addEditPageFrontId = '11111111111111111111111111111111'; // 替换为新增/编辑页布局的 frontId
const confirmModalFrontId = '22222222222222222222222222222222'; // 替换为删除确认弹窗布局的 frontId
// ↑ 这个值必须等于 examples/delete-confirm-modal.js 里的 frontId，两者才配得上对

const columns = [
  column('inquiryCode', '$${label.inquiryCode}', { width: 150, sort: 'none', fuzzyQuery: true }),
  column('title', '$${label.title}', { width: 200, fuzzyQuery: true }),
  column('purchaseOrgName', '$${label.purchaseOrg}', { width: 150 }),
  column('status', '$${label.status}', { width: 100, tag: 'inquiryStatus' }),
  column('inquiryType', '$${label.inquiryType}', { width: 120 }),
  column('inquiryMethod', '$${label.inquiryMethod}', { width: 120 }),
  column('quantityLadderMethod', '$${label.quantityLadderMethod}', { width: 140 }),
  column('currentRound', '$${label.currentRound}', { width: 100 }),
  column('sealControl', '$${label.sealControl}', { width: 100 }),
  column('inquirySheetName', '$${label.inquirySheet}', { width: 150 }),
];

const queryFields = [
  queryField('inquiryCode', '文本', 'like'),
  queryField('title', '文本', 'like'),
  queryField('status', '下拉', 'eq', { dict: 'inquiryStatus' }),
  queryField('purchaseOrgName', '文本', 'like'),
  queryField('inquiryType', '下拉', 'eq', { dict: 'inquiryType' }),
  queryField('inquiryDate', '日期范围', 'between'),
];

module.exports = buildListPage({
  pageName,
  serverName,
  listUrl,
  functionGid,
  addEditPageFrontId,
  confirmModalFrontId,
  cardTitle: '$${label.inquiryManagement}',
  tableTitle: '$${label.inquiryList}',
  rowKey: 'inquiryId',
  columns,
  queryFields,
  rowOperations: ['edit', 'delete', 'copy', { label: '调整时间', eventExpr: "pubsub.publish('@@message.warn','待实现')" }],
});
