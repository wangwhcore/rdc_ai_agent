/**
 * 兼容层：保留历史 API validate(layoutJson) -> { ok, errors: string[] }
 *
 * 实现已切换到 check 引擎（30+ 条规则、带 code / severity / path / hint）。
 * 新代码请直接用 `require('../check')`，能拿到结构化诊断。
 */

const { run } = require('../check');

/**
 * @param {object} layoutJson 设计器 Layout JSON
 * @param {object} [options] 透传给 check.run，例如 { strict: true, ignore: ['ID005'] }
 * @returns {{ok:boolean, errors:string[], warnings:string[], diagnostics:Array}}
 */
function validate(layoutJson, options = {}) {
  const res = run(layoutJson, options);

  const errors = [];
  const warnings = [];
  for (const d of res.diagnostics) {
    const line = `[${d.code}] ${d.path} ${d.message}`;
    if (d.severity === 'error') errors.push(line);
    else if (d.severity === 'warning') warnings.push(line);
  }

  return {
    ok: res.ok,
    errors,
    warnings,
    diagnostics: res.diagnostics,
    summary: res.summary,
    ir: res.ir,
  };
}

module.exports = { validate };
