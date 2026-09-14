/**
 * 格式类规则：双层 JSON 的「文本形态」与「合法性」
 *
 * 为什么单独成组：
 *   结构类规则（STRUCT/ID/REF）看的都是「解析之后」的对象，而真实的线上事故里
 *   相当一部分发生在「解析之前」——value 里塞了真实换行、少一个闭合括号、
 *   键名重复导致后值静默覆盖先值。这类问题不改语义、只改一个字符，
 *   却能让平台直接崩，成本极不对称。
 *
 * 与 engine 提前返回的分工（三者不重叠）：
 *   value 文本**根本不能解析** → engine 返回 INPUT003（附带可修订性与修订手段）
 *   value 解出的**不是对象**   → engine 返回 JSON002（典型是双重编码）
 *   本组规则负责「能解析、且解出对象，但仍有格式问题」的部分。
 *
 * 与 ir/jsonGate 的分工：
 *   本组是**只读报告**；真正落盘前的「检查 + 强制修订 + 两道门复核」在 ir/jsonGate。
 *   外层文件文本的合法性由 ir/jsonGate 负责（它能把文本修好再解析），
 *   这里不再重复报一遍，避免同一问题出现两条诊断。
 */

const fmt = require('../../ir/jsonFormat');

/** 缺陷清单压成诊断 extra，避免把整段文本塞进诊断里 */
function problemsExtra(problems) {
  return (problems || []).slice(0, 8).map(p => ({
    reason: p.reason,
    label: p.label,
    line: p.line,
    column: p.column,
    ...(p.key ? { key: p.key } : {}),
    ...(p.charLabel ? { charLabel: p.charLabel } : {}),
  }));
}

function check(ctx, report) {
  const raw = ctx.raw;
  if (!ctx.rawProvided || !raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  if (!Object.prototype.hasOwnProperty.call(raw, 'value')) return;   // 缺失由 STRUCT001 报出

  const v = raw.value;

  // JSON001：value 是对象而不是「套着第二层 JSON 的字符串」
  // 语料 401/401 都是字符串；对象形态会让设计器保存结果与生成结果不可比，
  // 往返测试（逐字节比较 value）也必然失败，属形态不一致，用告警提示。
  if (typeof v !== 'string') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return;   // 其它类型由 STRUCT 组报出
    report({
      code: 'JSON001', severity: 'warning', path: '$.value',
      message: 'value 是对象而不是 JSON 字符串',
      hint: '设计器保存的 value 恒为「一个 JSON 字符串」（双层结构）。'
        + '对象形态可被部分链路容错读取，但会让往返比较与设计器行为不一致，'
        + '建议由 JSON.stringify(desktop) 生成字符串。',
      extra: { actualType: 'object' },
    });
    return;
  }

  const d = fmt.diagnose(v, { label: 'value' });
  if (d.ok) return;

  // 走到这里 engine 已保证 value 可解析、且解出的是对象
  // （不可解析 → INPUT003 提前返回；解出非对象 → JSON002 提前返回）
  report({
    code: 'JSON003', severity: 'warning', path: '$.value',
    message: `value 文本存在会静默丢配置的格式缺陷：${fmt.summarizeProblems(d.problems)}`,
    hint: d.repairable
      ? `可用 \`node scripts/repairValueJson.js <文件> --write\` 强制修订（手段 ${d.howToFix}）`
      : '这类缺陷（如键名重复）自动修订会替你做语义取舍，因此只报不改，需人工确认保留哪个键。',
    extra: { repairable: d.repairable, howToFix: d.howToFix, problems: problemsExtra(d.problems) },
  });
}

module.exports = {
  group: 'format',
  rules: ['JSON001', 'JSON002', 'JSON003'],
  check,
};
