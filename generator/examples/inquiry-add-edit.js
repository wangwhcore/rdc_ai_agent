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
const listPageId = 'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'; // 替换为实际列表页 GID

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
  listPageId,
  fields,
});
