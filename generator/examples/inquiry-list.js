const {
  buildListPage,
  column,
  // queryField,   // 需要显式声明查询条件时再用：queryField('status', '下拉', 'eq', { dict: 'x' })
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
  // tag 表示这列背后是一个字典 -> 查询条件会自动变成「下拉单选」
  column('status', '$${label.status}', { width: 100, tag: 'inquiryStatus' }),
  column('inquiryType', '$${label.inquiryType}', { width: 120, tag: 'inquiryType' }),
  column('inquiryMethod', '$${label.inquiryMethod}', { width: 120 }),
  column('quantityLadderMethod', '$${label.quantityLadderMethod}', { width: 140 }),
  column('currentRound', '$${label.currentRound}', { width: 100 }),
  column('sealControl', '$${label.sealControl}', { width: 100 }),
  // fieldType: 'date' -> 查询条件自动变成「日期范围」
  column('inquiryDate', '$${label.inquiryDate}', { width: 120, fieldType: 'date' }),
  column('inquirySheetName', '$${label.inquirySheet}', { width: 150 }),
];

// ── 高级查询条件：**来自表格字段（含类型）** ───────────────────────────────
// 这里只写字段名，查询组件与 operation 全部从上面的列推导：
//   inquiryCode / title / purchaseOrgName -> 文本输入框        like
//   status / inquiryType                  -> 下拉单选          eq   （字典来自列的 tag）
//   inquiryDate                           -> 日期范围          range
// 生成结果：
//   desktop.components.<hookId>.property.advancedQuery = [{field,operation,type,value}]
//   desktop.layoutList['<hookId>_filterId']            = 装着这些条件组件的漏斗容器
//
// 其它写法：
//   queryFields: ['status']                                   // 只查部分列
//   queryFields: [{ field:'status', component:'CheckboxHook' }] // 覆盖组件（多选 -> in）
//   queryFields: false                                        // 不生成高级查询，只有一个单独的表格
//   queryFields 省略                                           // 取全部可查询列
const queryFields = [
  'inquiryCode',
  'title',
  'status',
  'purchaseOrgName',
  'inquiryType',
  'inquiryDate',
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
