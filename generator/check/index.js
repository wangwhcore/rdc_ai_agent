/**
 * check：低代码页面的契约校验器
 *
 * 用法：
 *   const { check, formatText } = require('./check');
 *   const res = check(layoutJson);
 *   console.log(formatText(res.diagnostics, { name: '供应商列表' }));
 *
 * 与 builder/validator.js 的关系：
 *   validator 是历史 API（返回 { ok, errors: string[] }），
 *   内部已改为调用本模块，只是在结果上做了一层兼容包装。
 *   新代码请直接用 check。
 */

const { run, runBatch, looksLikeIR } = require('./engine');
const { formatText, formatJson, formatSummary, formatBatchSummary } = require('./report');
const diagnostics = require('./diagnostics');
const rules = require('./rules');

module.exports = {
  // 主入口
  run,
  check: run,
  runBatch,

  // 输出
  formatText,
  formatJson,
  formatSummary,
  formatBatchSummary,

  // 诊断工具
  ...diagnostics,

  // 规则元信息
  ALL_CODES: rules.ALL_CODES,
  GROUPS: rules.GROUPS,
  byGroup: rules.byGroup,

  looksLikeIR,
};
