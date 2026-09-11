const {
  buildListPage,
  column,
  queryField,
} = require('../index');

const pageName = '询价单管理';
const serverName = 'purchase';
const listUrl = '/inquiry/list';
const functionGid = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // 替换为实际功能 GID
const addEditPageId = 'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'; // 替换为实际新增/编辑页 GID
const confirmModalId = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'; // 删除确认弹窗 GID

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
  addEditPageId,
  confirmModalId,
  cardTitle: '$${label.inquiryManagement}',
  tableTitle: '$${label.inquiryList}',
  rowKey: 'inquiryId',
  columns,
  queryFields,
  rowOperations: ['edit', 'delete', 'copy', { label: '调整时间', eventExpr: "pubsub.publish('@@message.warn','待实现')" }],
});
