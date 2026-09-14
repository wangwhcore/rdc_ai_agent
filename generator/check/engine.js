/**
 * check 引擎
 *
 * 输入可以是 Layout JSON，也可以是已经 lift 过的 Page IR。
 * 规则只依赖 IR，因此 formatter、language-server、自然语言生成链路
 * 都能复用同一套校验，不必各写一遍遍历逻辑。
 */

const { lift, emitValue } = require('../ir');
const { loadSchema } = require('../ir/schema');
const { validateLayoutJson } = require('../ir/jsonIntegrity');
const { diagnose: fmtDiagnose, summarizeProblems: fmtSummarize } = require('../ir/jsonFormat');
const { makeDiagnostic, sortDiagnostics, dedupeDiagnostics, summarize, SEVERITY_ORDER } = require('./diagnostics');
const RULE_GROUPS = require('./rules');

/** 判断传入的是 Layout JSON 还是 Page IR */
function looksLikeIR(input) {
  return !!(input && typeof input === 'object' && input.regions && input.meta && input.irVersion);
}

/** 建立规则运行上下文 */
function createContext(ir, options = {}) {
  const raw = options.raw;
  const regions = ir.regions || {};
  const regionOrder = (ir.keyOrder && ir.keyOrder.region) || Object.keys(regions);
  const orderedRegions = regionOrder.slice();
  for (const k of Object.keys(regions)) if (!orderedRegions.includes(k)) orderedRegions.push(k);

  /** 遍历所有行/列容器节点，回调带上可定位的 path */
  function walkContainers(visit) {
    for (const regionId of orderedRegions) {
      const region = regions[regionId] || {};
      const rows = region.rows || [];
      rows.forEach((rowNode, ri) => {
        const rowPath = `$.value.desktop.layoutList.${regionId}.rows[${ri}]`;
        visit({ kind: 'row', node: rowNode, path: rowPath, regionId, rowIndex: ri, colIndex: -1 });
        (rowNode.cols || []).forEach((colNode, ci) => {
          visit({
            kind: 'col', node: colNode, path: `${rowPath}.cols[${ci}]`,
            regionId, rowIndex: ri, colIndex: ci,
          });
        });
      });
    }
  }

  /** 统计某个区域内实际挂载的组件数量（用于判断「空占位区域」与「漏登记区域」） */
  function countMountedComponents(regionId) {
    const region = regions[regionId];
    if (!region) return 0;
    let n = 0;
    for (const rowNode of region.rows || []) {
      for (const colNode of rowNode.cols || []) {
        n += (colNode.components || []).length;
      }
    }
    return n;
  }

  return {
    ir,
    raw,
    rawProvided: !!raw,
    schema: options.schema || loadSchema(),
    options,
    regions,
    regionIds: new Set(orderedRegions),
    regionOrder: orderedRegions,
    components: ir.components || {},
    references: ir.references || [],
    queries: ir.queries || [],
    page: ir.page || {},
    kind: ir.kind,
    walkContainers,
    countMountedComponents,
  };
}

/**
 * 执行校验
 * @param {object} input Layout JSON 或 Page IR
 * @param {object} [options]
 * @param {Array<string>} [options.ignore]  忽略的规则 code
 * @param {Array<string>} [options.only]    只运行指定 code
 * @param {object} [options.severity]       覆盖某规则级别，如 { PROP002: 'info' }
 * @param {boolean} [options.strict]        为 true 时 warning 也视为不通过
 * @returns {{ok:boolean, diagnostics:Array, summary:object, ir:object, error?:string}}
 */
function run(input, options = {}) {
  if (!input || typeof input !== 'object') {
    const d = makeDiagnostic({
      code: 'INPUT001', severity: 'error', path: '$',
      message: 'check 需要一个 Layout JSON 或 Page IR 对象',
      hint: '传入设计器保存的 Layout JSON 即可，会自动 lift 为 IR',
    });
    return { ok: false, diagnostics: [d], summary: summarize([d]), ir: null, error: d.message };
  }

  // value 是「套在字符串里的第二层 JSON」：先单独验一层，
  // 失败时能给出精确位置（裸换行/漏括号），比笼统的 lift 报错有用得多。
  //
  // 同时给出「能不能强制修订」：格式问题不该直接 fail ——
  // 尾随逗号、单引号、少一个闭合括号这类改一个字符就能好的问题，
  // 应该修掉而不是让人对着报错猜。所以这里附带修订手段，
  // 落盘链路可直接调 ir/jsonGate 的 enforce() 拿修订后的对象。
  if (!looksLikeIR(input)) {
    const probe = validateLayoutJson(input);
    if (!probe.ok && probe.stage === 'value') {
      const a = probe.analysis || {};
      const d = fmtDiagnose(input.value, { label: 'value' });
      const problems = (d.problems || []).slice(0, 8).map(p => ({
        reason: p.reason, label: p.label, line: p.line, column: p.column,
        ...(p.key ? { key: p.key } : {}),
      }));
      const repairable = !d.ok && d.repairable;
      const diag = makeDiagnostic({
        code: 'INPUT003', severity: 'error', path: '$.value',
        message: `value 不是合法 JSON: ${a.message || probe.error.message}`
          + (repairable ? `（可强制修订：${fmtSummarize(d.problems)}）` : ''),
        hint: repairable
          ? `运行 \`node scripts/repairValueJson.js <文件> --write\` 可自动修掉；`
            + `生成链路请在落盘前调用 ir/jsonGate 的 enforce()，它会强制修订并复核两道门。`
          : a.hint,
        extra: {
          reason: a.reason,
          position: a.position,
          line: a.line,
          column: a.column,
          count: a.count,
          label: a.label,
          snippet: a.snippet,
          repairable,
          howToFix: repairable ? d.howToFix : null,
          warnings: repairable ? d.repair.warnings : [],
          problems,
        },
      });
      return { ok: false, diagnostics: [diag], summary: summarize([diag]), ir: null, error: diag.message };
    }

    // value 解出的不是对象：最常见的是「被 JSON.stringify 了两次」。
    // 这个形态拿不到 desktop，直接 lift 只会抛出笼统的「value.desktop 不存在」，
    // 所以在进 IR 之前就给出精确诊断。
    // （注意：此判据必须在 engine 里而不是 format 规则组里 —— 拿不到 IR 就跑不了规则。）
    if (probe.ok) {
      const doc = probe.doc;
      if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
        const actual = doc === null ? 'null' : Array.isArray(doc) ? 'array' : typeof doc;
        const diag = makeDiagnostic({
          code: 'JSON002', severity: 'error', path: '$.value',
          message: `value 解出的不是对象（实际 ${actual}）—— 疑似多重转义（双重编码）`,
          hint: actual === 'string'
            ? 'value 解出来还是一个字符串，说明被 JSON.stringify 了两次；去掉外层一次转义即可。'
            : 'value 的内容必须是一个含 desktop 的对象。',
          extra: { actualType: actual },
        });
        return { ok: false, diagnostics: [diag], summary: summarize([diag]), ir: null, error: diag.message };
      }
    }
  }

  let ir;
  try {
    ir = looksLikeIR(input) ? input : lift(input);
  } catch (e) {
    const d = makeDiagnostic({
      code: 'INPUT002', severity: 'error', path: '$.value',
      message: `无法解析为 Page IR: ${e.message}`,
      hint: '确认这是设计器导出的 Layout JSON（value 为 JSON 字符串）',
    });
    return { ok: false, diagnostics: [d], summary: summarize([d]), ir: null, error: e.message };
  }

  const ctx = createContext(ir, {
    ...options,
    raw: looksLikeIR(input) ? options.raw : input,
  });

  const diagnostics = [];
  const report = d => diagnostics.push(makeDiagnostic(d));

  const ignore = new Set(options.ignore || []);
  const only = options.only ? new Set(options.only) : null;

  const failures = [];
  for (const group of RULE_GROUPS) {
    const groupFn = typeof group.check === 'function' ? group.check : null;
    if (!groupFn) continue;
    try {
      groupFn(ctx, d => {
        if (only && !only.has(d.code)) return;
        if (ignore.has(d.code)) return;
        if (options.severity && options.severity[d.code]) d.severity = options.severity[d.code];
        report(d);
      });
    } catch (e) {
      failures.push({ group: group.group, error: e.message });
    }
  }

  if (failures.length) {
    for (const f of failures) {
      report({
        code: 'ENGINE001', severity: 'error', path: '$',
        message: `规则组 ${f.group} 执行失败: ${f.error}`,
        hint: '这是 checker 自身的缺陷，请附上被检查的文件反馈',
      });
    }
  }

  const finalList = sortDiagnostics(dedupeDiagnostics(diagnostics));
  const summary = summarize(finalList);
  const strict = !!options.strict;
  const blocking = strict ? summary.bySeverity.error + summary.bySeverity.warning : summary.bySeverity.error;

  return {
    ok: blocking === 0 && failures.length === 0,
    diagnostics: finalList,
    summary,
    ir,
    engineErrors: failures,
  };
}

/**
 * 批量运行
 * @param {Array<{name:string, layout:object}>} items
 * @param {object} [options]
 */
function runBatch(items, options = {}) {
  const results = [];
  const codeTotals = {};
  const severityTotals = { error: 0, warning: 0, info: 0 };
  let passed = 0;

  for (const item of items) {
    const res = run(item.layout, options);
    if (res.ok) passed++;
    for (const [code, n] of Object.entries(res.summary.byCode)) codeTotals[code] = (codeTotals[code] || 0) + n;
    for (const [sev, n] of Object.entries(res.summary.bySeverity)) severityTotals[sev] += n;
    results.push({ name: item.name, ok: res.ok, summary: res.summary, diagnostics: res.diagnostics });
  }

  return {
    total: items.length,
    passed,
    failed: items.length - passed,
    severityTotals,
    codeTotals: Object.fromEntries(Object.entries(codeTotals).sort((a, b) => b[1] - a[1])),
    results,
  };
}

module.exports = { run, runBatch, createContext, looksLikeIR, SEVERITY_ORDER };
