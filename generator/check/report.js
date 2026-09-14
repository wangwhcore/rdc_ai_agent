/**
 * 诊断输出：文本（类 tsc 风格）与 JSON
 *
 * 文本格式刻意做成「文件:规则 级别 路径 说明 / 建议」，
 * 方便在 CI 日志里直接 Ctrl+Click 定位。
 */

const { SEVERITY_LABEL, summarize } = require('./diagnostics');

const ICON = { error: 'x', warning: '!', info: 'i' };

/**
 * 渲染为文本
 * @param {Array} diagnostics
 * @param {object} [options]
 * @param {string} [options.name] 文件/页面名，会显示在每一行前
 * @param {number} [options.max]  最多输出条数，超出折叠
 * @param {boolean} [options.color] 是否着色（默认不着色，CI 友好）
 */
function formatText(diagnostics, options = {}) {
  const name = options.name || '';
  const max = options.max === undefined ? 50 : options.max;
  const color = !!options.color;
  const lines = [];

  const paint = (sev, text) => {
    if (!color) return text;
    const codes = { error: '\u001b[31m', warning: '\u001b[33m', info: '\u001b[36m' };
    return `${codes[sev] || ''}${text}\u001b[0m`;
  };

  const shown = max > 0 ? diagnostics.slice(0, max) : diagnostics;
  for (const d of shown) {
    const head = paint(d.severity, `${ICON[d.severity] || '-'} [${SEVERITY_LABEL[d.severity] || d.severity}] ${d.code}`);
    const loc = name ? `${name}: ` : '';
    lines.push(`${loc}${head} ${d.path}`);
    lines.push(`    ${d.message}`);
    if (d.hint) lines.push(`    建议: ${d.hint}`);
  }
  if (max > 0 && diagnostics.length > max) {
    lines.push(`... 另有 ${diagnostics.length - max} 条未显示（用 --json 或 --max 0 查看全部）`);
  }
  return lines.join('\n');
}

/** 渲染为机器可读结构，便于喂给报告系统 */
function formatJson(diagnostics, meta = {}) {
  return JSON.stringify(
    {
      ...meta,
      summary: summarize(diagnostics),
      diagnostics,
    },
    null,
    2
  );
}

/** 单行摘要，用于批量跑分输出 */
function formatSummary(summary) {
  const s = summary.bySeverity;
  return `错误 ${s.error} / 告警 ${s.warning} / 建议 ${s.info}，共 ${summary.total} 条`;
}

/** 批量结果汇总表 */
function formatBatchSummary(batch) {
  const lines = [];
  lines.push(`用例 ${batch.total}  通过 ${batch.passed}  未通过 ${batch.failed}`);
  lines.push(`问题合计: 错误 ${batch.severityTotals.error} / 告警 ${batch.severityTotals.warning} / 建议 ${batch.severityTotals.info}`);
  const codes = Object.entries(batch.codeTotals);
  if (codes.length) {
    lines.push('');
    lines.push('-- 命中规则 Top --');
    for (const [code, n] of codes.slice(0, 25)) lines.push(`${code}\t${n}`);
  }
  return lines.join('\n');
}

module.exports = { formatText, formatJson, formatSummary, formatBatchSummary };
