/**
 * 落盘门禁：格式检查 → 强制修订 → 两道门复核
 *
 * 解决的问题：
 *   「由于生成的 JSON 格式不正确导致的错误」成本极不对称 —— 尾随逗号、少一个
 *   闭合括号、字符串里塞了真实换行，看一眼就能改，却能让平台运行时报错，
 *   排查成本远高于修复成本。所以格式问题不该直接 fail，而应该**强制修订**。
 *
 * 但「可解析 ≠ 正确」：
 *   只补 JSON 闭合符能让文件变得可解析，补错位置却会把 phone/pad 塞进 desktop、
 *   把 layoutInfo 吞掉 —— 结构已经错位，运行时照样抛
 *     TypeError: Cannot read properties of undefined (reading 'field')
 *   所以修订后必须再走两道门，任何一道不过就**拒绝写入**，只输出诊断让人工补。
 *
 *   门 A：结构不变量 —— desktop 四件套齐全、设备节点不互相嵌套
 *   门 B：check 引擎零 error
 *
 * 调用方式：
 *   const { enforce } = require('./jsonGate');
 *   const r = enforce(layoutJsonOrFileText);
 *   if (r.ok) write(r.layout); else print(r.blocked);
 *
 * ⚠️ 依赖方向：本模块懒 require('../check')，因此**不要**从 ir/index.js 导出它，
 *    否则会形成 ir ⇄ check 的循环依赖。
 */

const { validateLayoutJson } = require('./jsonIntegrity');
const fmt = require('./jsonFormat');

const DEVICES = ['desktop', 'pad', 'phone'];
const REQUIRED_DESKTOP = ['layoutInfo', 'layoutList', 'components', 'subscribes'];

const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

/** Layout JSON 的标志就是「有 value 字段」；MdFunction 之类记录没有，不走内容门禁 */
const isLayoutJson = v => isPlainObject(v) && Object.prototype.hasOwnProperty.call(v, 'value');

const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** 结构不变量：只补闭合符最常见的破坏形态都在这里被拦住 */
function checkInvariants(layout) {
  const probe = validateLayoutJson(layout);
  if (!probe.ok) {
    const a = probe.analysis || {};
    return { ok: false, problems: [`value 层不可解析: ${a.message || (probe.error && probe.error.message) || '未知'}`], doc: null };
  }
  const doc = probe.doc;
  if (!isPlainObject(doc)) {
    return { ok: false, problems: [`value 解出的不是对象（实际 ${doc === null ? 'null' : Array.isArray(doc) ? 'array' : typeof doc}）`], doc };
  }
  const d = doc.desktop;
  if (!isPlainObject(d)) return { ok: false, problems: ['缺少 desktop 节点'], doc };

  const problems = [];
  for (const k of REQUIRED_DESKTOP) if (!(k in d)) problems.push(`desktop 缺少 ${k}`);
  for (const dev of DEVICES) {
    if (!isPlainObject(d[dev])) continue;
    for (const other of DEVICES) {
      if (dev !== other && d[dev][other]) {
        problems.push(`desktop.${dev} 里嵌入了 ${other}（闭合符补错位置的典型症状）`);
      }
    }
  }
  return { ok: problems.length === 0, problems, doc };
}

/**
 * 把一次修订压成一句「改了什么」。
 * jsonrepair 是整体重写、不产出逐处补丁，所以优先用「检测到的缺陷」计数，
 * 否则报告会出现「修订 0 处」这种自相矛盾的输出。
 */
function fixSummary(d) {
  const problems = d.problems || [];
  const labels = [...new Set(problems.map(p => p.label || p.reason))];
  const what = labels.length ? labels.join('、') : '格式问题';
  const n = problems.length || ((d.repair && d.repair.patches) || []).length;
  return `${what} ${n} 处（手段 ${d.repair.method}）`;
}

/**
 * 对文件文本做格式检查 + 强制修订，拿到 Layout JSON 对象
 * @param {string} text
 * @param {string[]} steps
 */
function normalizeOuterText(text, steps) {
  const d = fmt.diagnose(text, { label: '文件文本' });
  if (d.ok) return { ok: true, layout: d.value, repair: null, problems: [], warnings: [] };
  if (!d.repairable) return { ok: false, layout: null, repair: null, problems: d.problems, warnings: [], diagnose: d };
  steps.push(`文件文本强制修订: ${fixSummary(d)}`);
  return {
    ok: true, layout: d.repair.value, repair: d.repair,
    problems: d.problems, warnings: d.repair.warnings, diagnose: d,
  };
}

/** 对 value 层做格式检查 + 强制修订 */
function normalizeValueLayer(layout, steps) {
  const v = layout.value;
  if (typeof v !== 'string') return { ok: true, layout, repair: null, problems: [], warnings: [] };

  const d = fmt.diagnose(v, { label: 'value' });
  if (d.ok) return { ok: true, layout, repair: null, problems: [], warnings: [] };
  if (!d.repairable) {
    return { ok: false, layout, repair: null, problems: d.problems, warnings: [], diagnose: d };
  }
  steps.push(`value 文本强制修订: ${fixSummary(d)}`);
  return {
    ok: true,
    layout: { ...layout, value: d.repair.text },
    repair: d.repair,
    problems: d.problems,
    warnings: d.repair.warnings,
    diagnose: d,
  };
}

function blocked(stage, reason, details) {
  return { ok: false, blocked: { stage, reason, details: details || [] } };
}

/**
 * 门禁主入口
 *
 * @param {object|string} input Layout JSON 对象，或磁盘上的文件原始文本
 * @param {object} [options]
 * @param {boolean} [options.skipCheck=false]      跳过门 B（仅当调用方自己会跑 check 时用）
 * @param {boolean} [options.allowCheckErrors]     门 B 是否降级为「只报不拦」
 *                                                 默认：文本/值层被修订过 → 必须零 error；未修订 → 不拦
 * @param {boolean} [options.invariantsOnClean=false] 未被修订时是否也强跑门 A
 * @param {object}  [options.checkOptions]         透传给 check 引擎
 * @returns {{
 *   ok: boolean,
 *   layout: object|null,
 *   steps: string[],
 *   warnings: string[],
 *   formatProblems: Array,
 *   repaired: boolean,
 *   repairMethods: string[],
 *   structural: object|null,
 *   check: object|null,
 *   blocked: null|{stage:string, reason:string, details:string[]}
 * }}
 */
function enforce(input, options = {}) {
  const steps = [];
  const warnings = [];
  const formatProblems = [];
  const repairMethods = [];
  let layout;

  // ── 阶段 1：拿到 Layout JSON 对象 ──
  if (typeof input === 'string') {
    const r = normalizeOuterText(input, steps);
    if (!r.ok) {
      return {
        ...blocked('file-format', '文件文本不是合法 JSON，且无法自动修订',
          r.problems.map(p => p.message).concat(r.diagnose && r.diagnose.fatal ? [r.diagnose.fatal.hint] : [])),
        steps, warnings, formatProblems: r.problems, repaired: false, repairMethods,
        structural: null, check: null,
      };
    }
    layout = r.layout;
    if (r.repair) repairMethods.push(...r.repair.methods);
    formatProblems.push(...r.problems);
    warnings.push(...r.warnings);
  } else if (isPlainObject(input)) {
    layout = clone(input);
  } else {
    return {
      ...blocked('input', 'enforce 需要一个 Layout JSON 对象或文件文本', [`实际类型: ${Array.isArray(input) ? 'array' : typeof input}`]),
      steps, warnings, formatProblems, repaired: false, repairMethods, structural: null, check: null,
    };
  }

  if (!isPlainObject(layout)) {
    return {
      ...blocked('file-format', '解析结果不是对象', [`实际: ${layout === null ? 'null' : typeof layout}`]),
      steps, warnings, formatProblems, repaired: false, repairMethods, structural: null, check: null,
    };
  }

  // ── 阶段 2：Layout JSON 专属 —— value 层格式检查 + 强制修订 ──
  //
  // 没有 value 字段的（如 MdFunction 功能记录）不是 Layout JSON：
  // 只做文本层格式检查就够了，不该套用 desktop 结构不变量与页面级 check。
  if (!isLayoutJson(layout)) {
    return {
      ok: true,
      layout,
      steps,
      warnings: warnings.concat(['对象没有 value 字段，判定为非 Layout JSON：只做了文本层格式检查']),
      formatProblems,
      repaired: steps.length > 0,
      repairMethods,
      structural: null,
      check: null,
      blocked: null,
    };
  }

  const rv = normalizeValueLayer(layout, steps);
  if (!rv.ok) {
    return {
      ...blocked('value-format', 'value 文本不是合法 JSON，且无法自动修订',
        rv.problems.map(p => p.message).concat(rv.diagnose && rv.diagnose.fatal ? [rv.diagnose.fatal.hint] : [])),
      steps, warnings, formatProblems: rv.problems, repaired: steps.length > 0, repairMethods,
      structural: null, check: null,
    };
  }
  layout = rv.layout;
  if (rv.repair) repairMethods.push(...rv.repair.methods);
  formatProblems.push(...rv.problems);
  warnings.push(...rv.warnings);

  const repaired = steps.length > 0;

  // ── 门 A：结构不变量 ──
  // 未修订时也跑一遍：开销极小，且能把「本来就错位」的文件在落盘前拦下
  const inv = checkInvariants(layout);
  if (!inv.ok && (repaired || options.invariantsOnClean)) {
    return {
      ...blocked('structure', '能解析但结构不变量不过关 —— 拒绝写入', inv.problems.concat([
        '说明这里缺的不只是闭合符，而是整块内容，只能人工补或重新生成。',
      ])),
      steps, warnings, formatProblems, repaired, repairMethods,
      structural: inv, check: null,
    };
  }

  // ── 门 B：check 引擎零 error ──
  let checkResult = null;
  if (!options.skipCheck) {
    try {
      const { run } = require('../check');
      const res = run(layout, options.checkOptions || {});
      const errors = res.diagnostics.filter(d => d.severity === 'error');
      checkResult = { ok: errors.length === 0, errorCount: errors.length, total: res.summary.total, summary: res.summary, errors, diagnostics: res.diagnostics };
      // 默认策略：被修订过 → 必须零 error；未修订 → 只报不拦
      const strict = options.allowCheckErrors === undefined ? repaired : !options.allowCheckErrors;
      if (errors.length && strict) {
        return {
          ...blocked('check', `修订后 check 仍有 ${errors.length} 条 error —— 拒绝写入`,
            errors.slice(0, 6).map(e => `[${e.code}] ${e.message}`)
              .concat(errors.length > 6 ? [`... 另有 ${errors.length - 6} 条`] : [])),
          steps, warnings, formatProblems, repaired, repairMethods,
          structural: inv, check: checkResult,
        };
      }
    } catch (e) {
      return {
        ...blocked('check', `check 引擎无法执行 —— 拒绝写入`, [e.message]),
        steps, warnings, formatProblems, repaired, repairMethods,
        structural: inv, check: null,
      };
    }
  }

  return {
    ok: true,
    layout,
    steps,
    warnings,
    formatProblems,
    repaired,
    repairMethods,
    structural: inv,
    check: checkResult,
    blocked: null,
  };
}

/** 把结果渲染成人类可读的行，供各 CLI 统一输出 */
function describe(result, name) {
  const lines = [];
  if (name) lines.push(name);
  for (const s of result.steps || []) lines.push(`  🔧 ${s}`);
  for (const w of result.warnings || []) lines.push(`  ⚠️  ${w}`);
  if (result.blocked) {
    lines.push(`  ⛔ [${result.blocked.stage}] ${result.blocked.reason}`);
    for (const d of result.blocked.details || []) lines.push(`       - ${d}`);
  } else if (result.repaired) {
    const how = (result.repairMethods || []).length ? `（${result.repairMethods.join(' → ')}）` : '';
    lines.push(`  ✅ 已强制修订，并通过两道门${how}`);
  } else {
    lines.push('  ✅ 格式本来合法，无需修订');
  }
  return lines;
}

module.exports = {
  enforce,
  checkInvariants,
  describe,
  isLayoutJson,
  REQUIRED_DESKTOP,
  DEVICES,
};
