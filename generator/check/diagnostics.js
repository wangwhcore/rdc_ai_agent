/**
 * 诊断对象：check 的唯一输出单元
 *
 * 设计要点：
 *   - code    稳定标识，可被抑制/白名单，不随文案变化
 *   - severity  error 会阻断生成；warning 需要人确认；info 是改进建议
 *   - path     定位到具体节点，而不是「整个页面有问题」
 *   - hint     怎么修，而不是只报错
 */

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

const SEVERITY_LABEL = { error: '错误', warning: '告警', info: '建议' };

/** 构造一条诊断 */
function makeDiagnostic({ code, severity = 'error', path = '$', message, hint = '', extra = null }) {
  if (!code) throw new Error('诊断必须带 code');
  if (!message) throw new Error(`诊断 ${code} 必须带 message`);
  return { code, severity, path, message, hint, extra };
}

/** 稳定排序：级别优先，其次 code，再次 path，保证多次运行输出一致 */
function sortDiagnostics(list) {
  return list.slice().sort((a, b) => {
    const s = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    if (s !== 0) return s;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
  });
}

/** 按 code+path+message 去重，避免同一问题被多条规则重复报出 */
function dedupeDiagnostics(list) {
  const seen = new Set();
  const out = [];
  for (const d of list) {
    const key = `${d.code}|${d.path}|${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** 汇总各级别数量 */
function summarize(list) {
  const bySeverity = { error: 0, warning: 0, info: 0 };
  const byCode = {};
  for (const d of list) {
    bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
    byCode[d.code] = (byCode[d.code] || 0) + 1;
  }
  return { total: list.length, bySeverity, byCode };
}

module.exports = {
  SEVERITY_ORDER,
  SEVERITY_LABEL,
  makeDiagnostic,
  sortDiagnostics,
  dedupeDiagnostics,
  summarize,
};
