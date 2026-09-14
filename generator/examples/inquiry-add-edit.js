const {
  buildAddEditPage,
  text,
  select,
  date,
  textarea,
} = require('../index');

const pageName = '询价单管理';
const serverName = 'purchase';
const entityPath = 'inquiry';
const entityIdField = 'inquiryId';
const functionGid = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // 替换为实际功能 GID
// ⚠️ 跨布局引用 —— 运行时按**目标布局的 frontId** 解析（不是 MdFrontLayout 的文件名 gid）
const listPageFrontId = '33333333333333333333333333333333'; // 替换为列表页布局的 frontId

const fields = [
  text('inquiryCode', '$${label.inquiryCode}').required(),
  text('title', '$${label.title}').required(),
  select('status', '$${label.status}', { dict: 'inquiryStatus' }),
  select('inquiryType', '$${label.inquiryType}', { dict: 'inquiryType' }),
  text('purchaseOrgName', '$${label.purchaseOrg}'),
  date('inquiryDate', '$${label.inquiryDate}'),
  textarea('remark', '$${label.remark}'),
];

module.exports = buildAddEditPage({
  pageName,
  serverName,
  entityPath,
  entityIdField,
  functionGid,
  listPageFrontId,
  fields,
});
