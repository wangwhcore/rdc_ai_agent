/**
 * /api/repair 的服务端逻辑
 *
 * 与路由解耦，便于脱离 HTTP 直接测试（沿用 services/deployService.js 的既有模式）。
 * 真正的门禁在 ir/jsonGate，这里只负责「请求体 → 入参」的归一化与错误语义。
 */

const { enforce, describe: describeGate, isLayoutJson } = require('../ir/jsonGate');
const { hasJsonRepair } = require('../ir/jsonFormat');

const INPUT_ERROR = '请求体必须是 { layout } 或 { text }，或直接传 Layout JSON 对象';

/**
 * 从请求体里取出「要被修订的输入」。
 *   1. { layout: {...}, ... }   -> 对象形态
 *   2. { text: "..." }          -> 文件文本形态（能顺带修外层信封）
 *   3. { ...Layout JSON... }    -> 直接传 Layout JSON
 *
 * 显式给了 text / layout 但类型不对时返回 null（→ 400），
 * 不能「降级成整体对象」蒙混过关 —— 那会静默把一个坏请求当成合法 Layout 收下。
 * @returns {object|string|null}
 */
function extractRepairInput(body) {
  if (typeof body === 'string') return body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if ('text' in body) return typeof body.text === 'string' ? body.text : null;
  if ('layout' in body) return body.layout;
  return body;
}

/**
 * 执行格式检查 + 强制修订
 * @param {object|string} body 请求体
 * @param {object} [options]
 * @param {object} [options.gate] 透传给 ir/jsonGate.enforce 的选项
 * @returns {object} 可直接作为响应载荷（去掉 report，路由自己渲染）
 */
function repairFromRequest(body, options = {}) {
  const input = extractRepairInput(body);
  if (typeof input !== 'string' && (!input || typeof input !== 'object' || Array.isArray(input))) {
    const err = new Error(INPUT_ERROR);
    err.status = 400;
    throw err;
  }

  const result = enforce(input, options.gate || {});

  return {
    ok: result.ok,
    repaired: result.repaired,
    repairMethods: result.repairMethods,
    steps: result.steps,
    warnings: result.warnings,
    formatProblems: result.formatProblems,
    structural: result.structural
      ? { ok: result.structural.ok, problems: result.structural.problems }
      : null,
    blocked: result.blocked,
    check: result.check
      ? { ok: result.check.ok, errorCount: result.check.errorCount, total: result.check.total }
      : null,
    report: describeGate(result),
    isLayoutJson: isLayoutJson(result.layout),
    // 只有 ok 时才给 layout —— 拒绝写入时把残缺对象返回出去容易被误用
    layout: result.ok ? result.layout : null,
    engine: { jsonrepairAvailable: hasJsonRepair() },
  };
}

module.exports = { repairFromRequest, extractRepairInput, INPUT_ERROR };
