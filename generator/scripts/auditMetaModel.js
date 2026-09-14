#!/usr/bin/env node
/**
 * 元模型反推审计（只读）
 *
 * 目的：用 401 份真实 Layout JSON 反推「现有 JSON 到底能表达什么」，
 *       把「V1 该新增哪些概念」从想象力问题变成统计问题。
 *
 * 判据：
 *   - 同一语义若在语料里有 ≥2 种写法 → 收敛项（不该新增概念，该统一写法）
 *   - 语料里从未使用的字段        → 该字段对应的概念不是真实需求
 *   - 逃生舱（裸 JS）里的高频模式  → 才是真正「表达不了」的候选
 *
 * 用法：
 *   node scripts/auditMetaModel.js --input ../../MdFrontLayout
 *   node scripts/auditMetaModel.js --input ../../MdFrontLayout --json
 *   node scripts/auditMetaModel.js --input ../../MdFrontLayout --out stats.json
 *
 * 本脚本只读，不写任何业务文件。
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { input: path.resolve(__dirname, '../../MdFrontLayout'), json: false, out: null, top: 40 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') args.input = path.resolve(argv[++i]);
    else if (a === '--json') args.json = true;
    else if (a === '--out') args.out = path.resolve(argv[++i]);
    else if (a === '--top') args.top = parseInt(argv[++i], 10) || 40;
  }
  return args;
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isArr = Array.isArray;

/** 把字符串按换行数折算「行数」，用于衡量裸 JS 的体量 */
function lineCount(s) {
  if (typeof s !== 'string') return 0;
  return s.split(/\r\n|\r|\n/).length;
}

/** 升序数组的分位值 */
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

/** 频次表 → 降序数组 */
function topEntries(map, n) {
  return Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

function bump(map, key, by = 1) {
  map[key] = (map[key] || 0) + by;
}

/** 跳过的大字段（base64 缩略图等），避免递归爆内存 */
const SKIP_KEYS = new Set(['thumbnail', 'png', 'base64']);

/**
 * 组件实例的「真属性」在 components[].property 里，
 * 外层只有 type / property 两个键。取真属性对象。
 */
const compProps = c => (isObj(c) && isObj(c.property) ? c.property : {});

/** 判断一个值是否「非空」——只看这一层 */
function nonEmpty(v) {
  if (v === undefined || v === null) return false;
  if (isArr(v)) return v.length > 0;
  if (isObj(v)) return Object.keys(v).length > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  return true;
}

/**
 * 递归判定「是否全空」。
 * 关键区别：`canvas: { containers: {}, components: {} }` 有 2 个键（浅层非空），
 * 但递归下去一个叶子都没有 —— 这是「占位空壳」，必须与「真承载语义」区分开。
 */
function deepEmpty(v) {
  if (v === undefined || v === null) return true;
  if (isArr(v)) return v.every(deepEmpty);
  if (isObj(v)) return Object.values(v).every(deepEmpty);
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

/**
 * 递归收集文档中出现的所有键名 → 命中文件数 / 命中次数
 * 只在「键名层面」统计，不关心值；对超长字符串值不再深入。
 */
function collectKeys(node, fileHits, keyHits, depth = 0, budget = { n: 0 }) {
  if (depth > 14 || budget.n > 200000) return;
  if (isArr(node)) {
    for (const item of node) collectKeys(item, fileHits, keyHits, depth + 1, budget);
    return;
  }
  if (!isObj(node)) return;
  for (const k of Object.keys(node)) {
    if (SKIP_KEYS.has(k)) continue;
    budget.n++;
    if (!fileHits[k]) fileHits[k] = new Set();
    fileHits[k].add(budget.file);
    bump(keyHits, k);
    collectKeys(node[k], fileHits, keyHits, depth + 1, budget);
  }
}

// ---------------------------------------------------------------------------
// 同义键名分组：用于识别「同一语义多种写法」
//
// ⚠ 分组是「键名启发式」，**不等于语义判定**。
//   实测教训：首版把 `action` / `actionConfig` 归入「动作 / 编排」，
//   但语义验证（§4b）发现 —— `action` 是组件的语义事件名（70% 为空串占位），
//   `actionConfig` 是恒为 `{enabled:false}` 的假开关（93.6% 恒定）。
//   两者都不承载编排语义。**任何分组结论都必须过语义验证再采信。**
// ---------------------------------------------------------------------------

const SYNONYM_GROUPS = [
  { name: '动作 / 编排', keys: ['behaviors', 'pubs', 'successPubs', 'errorPubs'] },
  { name: '事件订阅', keys: ['subscribes', 'subscribe', 'events', 'event', 'listeners', 'listener'] },
  { name: '条件 / 启用', keys: ['visible', 'hidden', 'disabled', 'enabled', 'display', 'show', 'actionConfig', 'condition', 'conditions', 'showWhen', 'dependOn', 'linkage'] },
  { name: '组件语义事件名', keys: ['action', 'eventName', 'actionName'] },
  { name: '数据源', keys: ['dataSource', 'datasource', 'dataSources', 'defaultDataSource', 'dataSourceList', 'source', 'service', 'api'] },
  { name: '表单校验', keys: ['validates', 'validateList', 'rules', 'validate', 'required', 'singleValidate', 'regexp', 'pattern', 'max', 'min'] },
  { name: '跨页引用', keys: ['reference', 'frontId', 'layoutRef', 'targetId', 'pageId', 'link', 'anchorTarget', 'url', 'href'] },
  { name: '样式', keys: ['style', 'styles', 'css', 'className', 'class', 'inlineStyle', 'tagStyle', 'theme', 'customStyle'] },
  { name: '权限', keys: ['permission', 'permissions', 'auth', 'roles', 'role', 'guard', 'acl', 'privilege'] },
  { name: '流程编排', keys: ['flows', 'flow', 'workflow', 'steps', 'sequence', 'pipeline'] },
  { name: '布局容器', keys: ['layoutInfo', 'layoutList', 'canvas', 'graphic', 'regions', 'containers'] },
];

// ---------------------------------------------------------------------------
// 逃生舱特征：裸 JS 表达式里出现的模式
// ---------------------------------------------------------------------------

const JS_PATTERNS = [
  ['console 调试输出', /console\.(log|warn|error|info)\s*\(/g],
  ['数组遍历 forEach/map/filter', /\.(forEach|map|filter|reduce|some|every|find|findIndex)\s*\(/g],
  ['if 条件分支', /\bif\s*\(/g],
  ['for / while 循环', /\b(for|while)\s*\(/g],
  ['callback 回调', /\bcallback\s*\(/g],
  ['接口调用', /\b(ajax|fetch|axios|request|\.get|\.post|\.put|\.delete)\s*\(/g],
  ['JSON 解析/序列化', /JSON\.(parse|stringify)/g],
  ['字符串处理 replace/split/join', /\.(replace|split|join|slice|substring|trim|indexOf)\s*\(/g],
  ['基本声明 var/let/const', /\b(var|let|const)\s+/g],
  ['长度/类型判断', /\.length\s*[><=!]|\btypeof\s+/g],
  ['try / catch', /\b(try|catch)\s*[\({]/g],
  ['三元表达式', /\?[^:\n]{1,60}:/g],
];

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function loadCorpus(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const ok = [];
  const failed = [];
  for (const f of files) {
    const full = path.join(dir, f);
    try {
      const outer = JSON.parse(fs.readFileSync(full, 'utf-8'));
      if (typeof outer.value !== 'string') throw new Error('value 不是字符串');
      const doc = JSON.parse(outer.value);
      ok.push({ file: f, outer, doc, desktop: isObj(doc.desktop) ? doc.desktop : {} });
    } catch (err) {
      failed.push({ file: f, error: err.message });
    }
  }
  return { total: files.length, ok, failed };
}

function audit(corpus, topN) {
  const stats = {};
  const N = corpus.ok.length;

  // ---- §1 结构覆盖率 -------------------------------------------------------
  const outerKeyFiles = {};
  const valueTopFiles = {};
  const desktopKeyFiles = {};
  const desktopKeyNonEmpty = {};
  const desktopKeyDeepNonEmpty = {};
  for (const rec of corpus.ok) {
    for (const k of Object.keys(rec.outer)) bump(outerKeyFiles, k);
    for (const k of Object.keys(rec.doc)) bump(valueTopFiles, k);
    for (const [k, v] of Object.entries(rec.desktop)) {
      bump(desktopKeyFiles, k);
      if (nonEmpty(v)) bump(desktopKeyNonEmpty, k);
      if (!deepEmpty(v)) bump(desktopKeyDeepNonEmpty, k);
    }
  }
  const desktopKeys = topEntries(desktopKeyFiles, 40).map(([k, c]) => {
    const ne = desktopKeyNonEmpty[k] || 0;
    const dn = desktopKeyDeepNonEmpty[k] || 0;
    return {
      key: k, files: c, rate: +(c / N).toFixed(4),
      nonEmptyFiles: ne, nonEmptyRate: +(ne / N).toFixed(4),
      deepNonEmptyFiles: dn, deepNonEmptyRate: +(dn / N).toFixed(4),
      // 100% 存在 + 浅层有键但递归全空 → 占位空壳（补丁维护它毫无意义）
      shell: c === N && ne === N && dn === 0,
      // 100% 存在 + 从未承载语义
      dead: c === N && dn === 0,
    };
  });
  stats.overview = {
    files: corpus.total,
    parsed: N,
    failed: corpus.failed,
    outerKeys: topEntries(outerKeyFiles, 60).map(([k, c]) => ({ key: k, files: c, rate: +(c / N).toFixed(4) })),
    valueTopKeys: topEntries(valueTopFiles, 20).map(([k, c]) => ({ key: k, files: c, rate: +(c / N).toFixed(4) })),
    desktopKeys,
    requiredKeys: desktopKeys.filter(r => r.files === N).length,
    deadFields: desktopKeys.filter(r => r.dead).map(r => r.key),
    shellFields: desktopKeys.filter(r => r.shell).map(r => r.key),
  };

  // ---- §2 页面原型（layoutInfo.field / type）------------------------------
  const fieldDist = {};
  const typeDist = {};
  const keysByField = {};   // field → { desktopKey: fileCount }
  for (const rec of corpus.ok) {
    const li = isObj(rec.desktop.layoutInfo) ? rec.desktop.layoutInfo : {};
    const field = typeof li.field === 'string' ? li.field : '(缺失)';
    const type = typeof li.type === 'string' ? li.type : '(缺失)';
    bump(fieldDist, field);
    bump(typeDist, type);
    if (!keysByField[field]) keysByField[field] = { files: 0, keys: {} };
    keysByField[field].files++;
    for (const k of Object.keys(rec.desktop)) bump(keysByField[field].keys, k);
  }
  stats.pageArchetypes = {
    byField: topEntries(fieldDist, 40).map(([k, c]) => ({ field: k, files: c, rate: +(c / N).toFixed(4) })),
    byType: topEntries(typeDist, 20).map(([k, c]) => ({ type: k, files: c, rate: +(c / N).toFixed(4) })),
    desktopKeysByField: Object.fromEntries(
      Object.entries(keysByField)
        .sort((a, b) => b[1].files - a[1].files)
        .slice(0, 12)
        .map(([f, v]) => [f, {
          files: v.files,
          keys: topEntries(v.keys, 20).map(([k, c]) => ({ key: k, files: c, rate: +(c / v.files).toFixed(3) })),
        }])
    ),
  };

  // ---- §3 同义键名收敛表 ---------------------------------------------------
  const fileHits = {};
  const keyHits = {};
  for (const rec of corpus.ok) {
    const budget = { n: 0, file: rec.file };
    collectKeys(rec.desktop, fileHits, keyHits, 0, budget);
  }
  const groups = [];
  for (const g of SYNONYM_GROUPS) {
    const rows = g.keys
      .map(k => ({ key: k, files: fileHits[k] ? fileHits[k].size : 0, hits: keyHits[k] || 0 }))
      .filter(r => r.hits > 0)
      .sort((a, b) => b.files - a.files);
    const writers = rows.filter(r => r.files >= 5).length;   // ≥5 文件视为「在用的写法」
    groups.push({
      semantic: g.name,
      writers,
      verdict: writers <= 1 ? '唯一写法' : `多写法（${writers} 个在用）`,
      rows,
      unusedFromProposal: g.keys.filter(k => !keyHits[k]),
    });
  }
  stats.synonyms = { groups, staleProposalKeys: groups.flatMap(g => g.unusedFromProposal) };
  stats.keyFrequency = topEntries(keyHits, topN).map(([k, c]) => ({
    key: k, hits: c, files: fileHits[k] ? fileHits[k].size : 0,
  }));

  // ---- §4 事件 / 动作机制的真实使用 ---------------------------------------
  let withSubscribes = 0, withFlows = 0, withValidates = 0, withValidateList = 0;
  let subEntries = 0, subWithBehaviors = 0, subWithPubs = 0;
  const flowsShape = {};
  const behaviorTypes = {};
  const triggerSuffixes = {};
  const pubEvents = {};
  const compWithSubscribes = {};
  const compWithAction = {};
  const compWithActionConfig = {};
  const compWithVisible = {};
  let compSubscribesFiles = 0;
  let compActionFiles = 0;
  let compActionConfigFiles = 0;
  let compVisibleFiles = 0;

  for (const rec of corpus.ok) {
    const d = rec.desktop;
    const subs = isArr(d.subscribes) ? d.subscribes : null;
    if (subs && subs.length) withSubscribes++;
    if (isArr(d.flows) ? d.flows.length : isObj(d.flows) ? Object.keys(d.flows).length : !!d.flows) withFlows++;
    if (nonEmpty(d.validates)) withValidates++;   // validates 是数组，不能用 isObj 判
    if (nonEmpty(d.validateList)) withValidateList++;

    const fl = d.flows;
    const shape = fl === undefined ? '缺席'
      : fl === null ? 'null'
        : isArr(fl) ? `array(${fl.length})`
          : isObj(fl) ? `object(${Object.keys(fl).length} keys)` : typeof fl;
    bump(flowsShape, shape);

    if (subs) {
      for (const s of subs) {
        if (!isObj(s)) continue;
        subEntries++;
        if (isArr(s.behaviors) && s.behaviors.length) subWithBehaviors++;
        if (isArr(s.pubs) && s.pubs.length) subWithPubs++;
        if (typeof s.event === 'string') bump(triggerSuffixes, s.event.split('.').pop());
        for (const p of isArr(s.pubs) ? s.pubs : []) {
          if (isObj(p)) bump(pubEvents, typeof p.event === 'string' && p.event ? p.event : '(空事件名)');
        }
        for (const b of isArr(s.behaviors) ? s.behaviors : []) {
          if (isObj(b)) bump(behaviorTypes, typeof b.type === 'string' ? b.type : '(无 type)');
        }
      }
    }

    // 组件级事件 / 动作 / 条件：真属性在 components[].property 里，
    // 与页面级 desktop.subscribes 是「同一语义的两种存放位置」
    const comps = isObj(d.components) ? d.components : {};
    let hasCompSub = false, hasCompAction = false, hasCompActionConfig = false, hasCompVisible = false;
    for (const c of Object.values(comps)) {
      const p = compProps(c);
      const t = typeof c.type === 'string' ? c.type : '(无 type)';
      if (p.subscribes && nonEmpty(p.subscribes)) {
        hasCompSub = true;
        bump(compWithSubscribes, t);
      }
      if (nonEmpty(p.action) || nonEmpty(p.actions)) {
        hasCompAction = true;
        bump(compWithAction, t);
      }
      // actionConfig 是 {enabled} 开关，**不算动作**（实测 93.6% 恒为 false）
      if (nonEmpty(p.actionConfig)) {
        hasCompActionConfig = true;
        bump(compWithActionConfig, t);
      }
      if (p.visible !== undefined) {
        hasCompVisible = true;
        bump(compWithVisible, t);
      }
    }
    if (hasCompSub) compSubscribesFiles++;
    if (hasCompAction) compActionFiles++;
    if (hasCompActionConfig) compActionConfigFiles++;
    if (hasCompVisible) compVisibleFiles++;
  }

  stats.eventMechanism = {
    pageSubscribesFiles: withSubscribes,
    pageSubscribesRate: +(withSubscribes / N).toFixed(4),
    flowsFiles: withFlows,
    flowsShape: topEntries(flowsShape, 10),
    validatesFiles: withValidates,
    validatesRate: +(withValidates / N).toFixed(4),
    validateListFiles: withValidateList,
    validateListRate: +(withValidateList / N).toFixed(4),
    subscribeEntries: subEntries,
    entriesWithBehaviors: subWithBehaviors,
    entriesWithPubs: subWithPubs,
    triggerSuffixes: topEntries(triggerSuffixes, 25).map(([k, c]) => ({ trigger: k, count: c })),
    publishedEvents: topEntries(pubEvents, 25).map(([k, c]) => ({ event: k, count: c })),
    behaviorTypes: topEntries(behaviorTypes, 25).map(([k, c]) => ({ type: k, count: c })),
    componentLevel: {
      filesWithComponentSubscribes: compSubscribesFiles,
      filesWithComponentAction: compActionFiles,
      filesWithComponentActionConfig: compActionConfigFiles,
      actionConfigByComponentType: topEntries(compWithActionConfig, 10).map(([k, c]) => ({ type: k, count: c })),
      filesWithComponentVisible: compVisibleFiles,
      subscribesByComponentType: topEntries(compWithSubscribes, 15).map(([k, c]) => ({ type: k, count: c })),
      actionByComponentType: topEntries(compWithAction, 15).map(([k, c]) => ({ type: k, count: c })),
      visibleByComponentType: topEntries(compWithVisible, 15).map(([k, c]) => ({ type: k, count: c })),
    },
  };

  // ---- §5 数据源形态 -------------------------------------------------------
  const dsTypeDist = {};
  const dsServerDist = {};
  const dsMethodDist = {};
  const dsKeyDist = {};
  const urlShape = {};
  let dsTotal = 0;
  let defaultDsFiles = 0;
  let defaultDsNonEmpty = 0;

  const classifyUrl = u => {
    if (typeof u !== 'string') return '(非字符串)';
    if (!u) return '(空)';
    let tags = [];
    if (/^https?:\/\//i.test(u)) tags.push('绝对URL');
    else if (u.startsWith('/')) tags.push('根相对路径');
    else tags.push('相对路径');
    if (/\{\{|\{[\w$]+\}/.test(u)) tags.push('含{}占位符');
    if (/\$\{/.test(u)) tags.push('含${}模板');
    if (/^[^/]*:/.test(u) && !/^https?:/i.test(u)) tags.push('冒号前缀');
    if (/[?&][\w$]+=/.test(u)) tags.push('含查询串');
    return tags.join(' + ');
  };

  for (const rec of corpus.ok) {
    if (rec.desktop.defaultDataSource !== undefined) defaultDsFiles++;
    const dd = rec.desktop.defaultDataSource;
    if (isObj(dd) && Object.keys(dd).length) defaultDsNonEmpty++;

    const walk = node => {
      if (isArr(node)) { node.forEach(walk); return; }
      if (!isObj(node)) return;
      if (node.dataSource !== undefined && isObj(node.dataSource)) {
        const ds = node.dataSource;
        dsTotal++;
        bump(dsTypeDist, typeof ds.type === 'string' ? ds.type : '(无 type)');
        bump(dsServerDist, typeof ds.serverName === 'string' ? ds.serverName : '(无 serverName)');
        bump(dsMethodDist, typeof ds.method === 'string' ? ds.method : '(无 method)');
        for (const k of Object.keys(ds)) bump(dsKeyDist, k);
        bump(urlShape, classifyUrl(ds.url));
      }
      for (const k of Object.keys(node)) {
        if (k === 'dataSource' || SKIP_KEYS.has(k)) continue;
        walk(node[k]);
      }
    };
    walk(rec.desktop);
  }

  stats.dataSource = {
    totalOccurrences: dsTotal,
    byType: topEntries(dsTypeDist, 20),
    byServer: topEntries(dsServerDist, 40),
    byMethod: topEntries(dsMethodDist, 20),
    byKey: topEntries(dsKeyDist, 30),
    urlShapes: topEntries(urlShape, 30),
    defaultDataSource: { files: defaultDsFiles, nonEmptyFiles: defaultDsNonEmpty },
  };

  // ---- §6 组件与属性契约面 -------------------------------------------------
  const compTypeDist = {};
  const propKeyHits = {};
  const propFiles = {};
  const propsByType = {};
  for (const rec of corpus.ok) {
    const comps = isObj(rec.desktop.components) ? rec.desktop.components : {};
    for (const c of Object.values(comps)) {
      if (!isObj(c)) continue;
      const t = typeof c.type === 'string' ? c.type : '(无 type)';
      bump(compTypeDist, t);
      if (!propsByType[t]) propsByType[t] = { instances: 0, props: {} };
      propsByType[t].instances++;
      for (const k of Object.keys(compProps(c))) {
        if (SKIP_KEYS.has(k)) continue;
        bump(propKeyHits, k);
        if (!propFiles[k]) propFiles[k] = new Set();
        propFiles[k].add(rec.file);
        bump(propsByType[t].props, k);
      }
    }
  }
  stats.components = {
    typeCount: Object.keys(compTypeDist).length,
    types: topEntries(compTypeDist, topN).map(([k, c]) => ({ type: k, instances: c })),
    propKeys: topEntries(propKeyHits, topN).map(([k, c]) => ({
      key: k, hits: c, files: propFiles[k] ? propFiles[k].size : 0,
    })),
    longTailPropKeys: Object.entries(propKeyHits)
      .filter(([k]) => (propFiles[k] ? propFiles[k].size : 0) <= 2)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 30)
      .map(([k, c]) => ({ key: k, hits: c, files: propFiles[k] ? propFiles[k].size : 0 })),
    propsByType: Object.fromEntries(
      topEntries(compTypeDist, 20).map(([t]) => [t, {
        instances: propsByType[t].instances,
        props: topEntries(propsByType[t].props, 25).map(([k, c]) => ({ key: k, count: c })),
      }])
    ),
  };

  // ---- §7 逃生舱（裸 JS 表达式）规模与可回收模式 ---------------------------
  const exprLen = [];
  let exprTotal = 0, exprEmpty = 0, exprMultiline = 0;
  const patternCounts = JS_PATTERNS.map(([name]) => ({ name, hits: 0, exprs: 0 }));
  let maxExpr = 0;

  const collectExpressions = (node, sink) => {
    if (isArr(node)) { node.forEach(x => collectExpressions(x, sink)); return; }
    if (!isObj(node)) return;
    for (const [k, v] of Object.entries(node)) {
      if (SKIP_KEYS.has(k)) continue;
      if (typeof v === 'string' && /Expression$|^expression$/.test(k)) sink.push(v);
      else collectExpressions(v, sink);
    }
  };

  const allExprs = [];
  for (const rec of corpus.ok) collectExpressions(rec.desktop, allExprs);
  for (const s of allExprs) {
    exprTotal++;
    const len = s.length;
    exprLen.push(len);
    if (len > maxExpr) maxExpr = len;
    if (!s.trim()) { exprEmpty++; continue; }
    if (/\r\n|\r|\n/.test(s)) exprMultiline++;
    JS_PATTERNS.forEach(([, re], i) => {
      re.lastIndex = 0;
      const m = s.match(re);
      if (m) { patternCounts[i].hits += m.length; patternCounts[i].exprs++; }
    });
  }
  const sortedLen = exprLen.slice().sort((a, b) => a - b);
  stats.escapeHatch = {
    expressionCount: exprTotal,
    emptyExpressions: exprEmpty,
    multiline: exprMultiline,
    multilineRate: exprTotal ? +(exprMultiline / exprTotal).toFixed(4) : 0,
    length: {
      p50: quantile(sortedLen, 0.5),
      p90: quantile(sortedLen, 0.9),
      p99: quantile(sortedLen, 0.99),
      max: maxExpr,
    },
    patterns: patternCounts.filter(p => p.hits > 0).sort((a, b) => b.hits - a.hits),
  };

  // ---- §4b 全位置的 subscribe 扫描（页面级 + 组件级 + layoutList 内）---------
  // 注意：只扫 desktop.subscribes 会严重误判「触发时机」分布 ——
  // 组件级 subscribes 覆盖 99% 文件，交互事件（click/onChange）全在那里。
  const triggerAll = {};
  const triggerPage = {};
  const triggerComponent = {};
  let subscribesAll = 0, subscribesPage = 0, subscribesComponent = 0;
  let pubsAll = 0, successPubsAll = 0, errorPubsAll = 0, behaviorsAll = 0;

  const walkSubscribes = (node, depth, scope) => {
    if (depth > 16) return;
    if (isArr(node)) { node.forEach(x => walkSubscribes(x, depth + 1, scope)); return; }
    if (!isObj(node)) return;
    for (const [k, v] of Object.entries(node)) {
      if (SKIP_KEYS.has(k)) continue;
      if (k === 'subscribes' && isArr(v)) {
        for (const s of v) {
          if (!isObj(s)) continue;
          subscribesAll++;
          if (scope === 'page') subscribesPage++; else subscribesComponent++;
          const sfx = typeof s.event === 'string' ? s.event.split('.').pop() : '(无 event)';
          const label = sfx === '' ? '(空事件名)' : sfx;
          bump(triggerAll, label);
          bump(scope === 'page' ? triggerPage : triggerComponent, label);
        }
      }
      if (k === 'pubs' && isArr(v)) pubsAll += v.length;
      if (k === 'behaviors' && isArr(v)) behaviorsAll += v.length;
      if (k === 'successPubs' && isArr(v)) successPubsAll += v.length;
      if (k === 'errorPubs' && isArr(v)) errorPubsAll += v.length;
      // 进入 layoutList / components 后，scope 一律视为组件级
      walkSubscribes(v, depth + 1, (k === 'subscribes' || k === 'components' || k === 'layoutList')
        ? 'component' : scope);
    }
  };
  for (const rec of corpus.ok) walkSubscribes(rec.desktop, 0, 'page');

  stats.eventMechanism.triggerDistribution = {
    all: topEntries(triggerAll, 25).map(([k, c]) => ({ trigger: k, count: c })),
    pageLevel: topEntries(triggerPage, 15).map(([k, c]) => ({ trigger: k, count: c })),
    componentLevel: topEntries(triggerComponent, 15).map(([k, c]) => ({ trigger: k, count: c })),
    totals: {
      subscribesAll, subscribesPage, subscribesComponent,
      pubsAll, behaviorsAll, successPubsAll, errorPubsAll,
    },
  };

  // 键名分组的语义验证：名字像不代表语义像。
  // 这里专门抽查那些「分组命中但语义可能不符」的键名。
  const semanticChecks = {};
  const acEnabled = {}, actionStr = {};
  const walkSemantics = (node, depth) => {
    if (depth > 16) return;
    if (isArr(node)) { node.forEach(x => walkSemantics(x, depth + 1)); return; }
    if (!isObj(node)) return;
    if (isObj(node.property)) {
      const p = node.property;
      if (isObj(p.actionConfig)) {
        const keys = Object.keys(p.actionConfig);
        bump(acEnabled, keys.length === 1 && 'enabled' in p.actionConfig
          ? `仅 {enabled: ${String(p.actionConfig.enabled)}}`
          : `其他形态: ${keys.sort().join('+') || '{}'}`);
      }
      if ('action' in p) {
        const a = p.action;
        if (typeof a === 'string') bump(actionStr, a === '' ? '空串（占位）' : '非空串（语义事件名）');
        else if (isObj(a)) bump(actionStr, Object.keys(a).length ? '对象非空' : '空对象（占位）');
        else bump(actionStr, `(${typeof a})`);
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (SKIP_KEYS.has(k)) continue;
      walkSemantics(v, depth + 1);
    }
  };
  for (const rec of corpus.ok) walkSemantics(rec.desktop, 0);
  semanticChecks.actionConfig = topEntries(acEnabled, 6).map(([k, c]) => ({ shape: k, count: c }));
  semanticChecks.componentAction = topEntries(actionStr, 6).map(([k, c]) => ({ shape: k, count: c }));
  stats.semanticChecks = semanticChecks;

  // ---- §4c 恒定值属性（占位载荷：有键但取值恒定，等于无效字段）--------------
  const constVals = {};
  const constTotal = {};
  const walkConst = (node, depth) => {
    if (depth > 16) return;
    if (isArr(node)) { node.forEach(x => walkConst(x, depth + 1)); return; }
    if (!isObj(node)) return;
    if (isObj(node.property)) {
      for (const [k, v] of Object.entries(node.property)) {
        if (SKIP_KEYS.has(k)) continue;
        bump(constTotal, k);
        let s;
        try { s = JSON.stringify(v); } catch (e) { s = '(不可序列化)'; }
        if (s && s.length > 48) continue;   // 只看短值，长值是真实载荷
        constVals[k] = constVals[k] || {};
        bump(constVals[k], s);
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (SKIP_KEYS.has(k)) continue;
      walkConst(v, depth + 1);
    }
  };
  for (const rec of corpus.ok) walkConst(rec.desktop, 0);
  stats.constantPayload = topEntries(constTotal, 20).map(([k, total]) => {
    const dist = topEntries(constVals[k] || {}, 1)[0] || ['', 0];
    return {
      key: k, occurrences: total, dominantValue: dist[0], dominantCount: dist[1],
      dominantRate: total ? +(dist[1] / total).toFixed(4) : 0,
      constant: total >= 20 && dist[1] / total >= 0.99,   // ≥99% 恒定 → 占位载荷
    };
  }).filter(r => r.constant);

  // ---- §8 冗余位置（同一语义有多个存放点 —— 生成器最容易写错的地方）---------
  let canvasCompNonEmpty = 0, canvasContNonEmpty = 0;
  let topCompNonEmpty = 0, layoutListNonEmpty = 0;
  let canvasCompTwin = 0, canvasContTwin = 0;
  for (const rec of corpus.ok) {
    const d = rec.desktop;
    const cv = isObj(d.canvas) ? d.canvas : {};
    if (nonEmpty(cv.components)) canvasCompNonEmpty++;
    if (nonEmpty(cv.containers)) canvasContNonEmpty++;
    if (nonEmpty(d.components)) topCompNonEmpty++;
    if (nonEmpty(d.layoutList)) layoutListNonEmpty++;
    // 空的孪生位置：一边有内容、镜像的那边永远空 —— 极易误写
    if (nonEmpty(d.components) && !nonEmpty(cv.components)) canvasCompTwin++;
    if (nonEmpty(d.layoutList) && !nonEmpty(cv.containers)) canvasContTwin++;
  }
  stats.redundancy = {
    topComponentsNonEmpty: topCompNonEmpty,
    canvasComponentsNonEmpty: canvasCompNonEmpty,
    layoutListNonEmpty: layoutListNonEmpty,
    canvasContainersNonEmpty: canvasContNonEmpty,
    emptyTwinOfComponents: canvasCompTwin,
    emptyTwinOfContainers: canvasContTwin,
  };

  return stats;
}

// ---------------------------------------------------------------------------
// 报告
// ---------------------------------------------------------------------------

function bar(count, total, width = 20) {
  const n = total ? Math.round((count / total) * width) : 0;
  return '█'.repeat(n) + '·'.repeat(Math.max(0, width - n));
}

function pct(c, total) {
  return total ? `${(c / total * 100).toFixed(1)}%` : '0%';
}

function render(stats) {
  const L = [];
  const N = stats.overview.parsed;

  L.push('═'.repeat(78));
  L.push('  元模型反推审计（只读）');
  L.push('═'.repeat(78));
  L.push('');
  L.push(`语料：${stats.overview.files} 个文件，成功解析 ${N}，失败 ${stats.overview.failed.length}`);
  if (stats.overview.failed.length) {
    for (const f of stats.overview.failed.slice(0, 10)) L.push(`  ✗ ${f.file}: ${f.error}`);
  }

  L.push('');
  L.push('─'.repeat(78));
  L.push('§1 结构覆盖率（哪些键是真正必填的）');
  L.push('─'.repeat(78));
  L.push('');
  L.push('  desktop 下的键：');
  L.push(`    ${'键'.padEnd(18)}${'存在'.padStart(7)}${'浅非空'.padStart(8)}${'递归非空'.padStart(9)}   判定`);
  for (const r of stats.overview.desktopKeys) {
    const verdict = r.shell ? '✗ 占位空壳（有键无内容）'
      : r.dead ? '✗ 从未承载语义'
        : r.deepNonEmptyRate === 0 ? '✗ 从未非空'
          : r.deepNonEmptyRate < 0.1 ? '? 极少使用'
            : '';
    L.push(`    ${r.key.padEnd(18)}${pct(r.files, N).padStart(7)}${pct(r.nonEmptyFiles, N).padStart(8)}${pct(r.deepNonEmptyFiles, N).padStart(9)}   ${verdict}`);
  }
  L.push('');
  const ov = stats.overview;
  L.push(`  ▸ 必填键 ${ov.requiredKeys} 个，其中从未承载语义的 ${ov.deadFields.length} 个（${pct(ov.deadFields.length, ov.requiredKeys)}）`);
  L.push(`    ${ov.deadFields.join(', ') || '无'}`);
  if (ov.shellFields.length) {
    L.push(`  ▸ 占位空壳（浅层有键、递归全空）${ov.shellFields.length} 个：${ov.shellFields.join(', ')}`);
  }
  L.push('');
  L.push('  外层元数据键（Top 12）：');
  for (const r of stats.overview.outerKeys.slice(0, 12)) {
    L.push(`    ${r.key.padEnd(22)} ${String(r.files).padStart(4)}/${N}  ${pct(r.files, N)}`);
  }

  L.push('');
  L.push('─'.repeat(78));
  L.push('§2 页面原型分布（layoutInfo.field）（真实页面类型清单）');
  L.push('─'.repeat(78));
  L.push('');
  for (const r of stats.pageArchetypes.byField) {
    L.push(`    ${r.field.padEnd(30)} ${String(r.files).padStart(4)}  ${bar(r.files, N)}  ${pct(r.files, N)}`);
  }
  L.push('');
  L.push('  同原型下的 desktop 键一致性（前 6 个原型）：');
  for (const [field, v] of Object.entries(stats.pageArchetypes.desktopKeysByField).slice(0, 6)) {
    const inconsistent = v.keys.filter(k => k.rate > 0.02 && k.rate < 0.98);
    L.push(`    ${field}  (${v.files} 文件)  键数 ${v.keys.length}  不稳定键 ${inconsistent.length}`);
    if (inconsistent.length) {
      L.push(`       不稳定: ${inconsistent.map(k => `${k.key}=${pct(k.files, v.files)}`).join('  ')}`);
    }
  }

  L.push('');
  L.push('─'.repeat(78));
  L.push('§3 同义键名收敛表（≥2 个在用写法 = 收敛项，不该新增概念）');
  L.push('─'.repeat(78));
  L.push('');
  for (const g of stats.synonyms.groups) {
    const mark = g.writers <= 1 ? '✓' : '⚠';
    L.push(`  ${mark} ${g.semantic}  —— ${g.verdict}`);
    for (const r of g.rows) {
      L.push(`      ${r.key.padEnd(20)} ${String(r.files).padStart(4)} 文件 / ${String(r.hits).padStart(6)} 次`);
    }
    if (g.unusedFromProposal.length) {
      L.push(`      从未使用: ${g.unusedFromProposal.join(', ')}`);
    }
  }

  L.push('');
  L.push('─'.repeat(78));
  L.push('§4 事件 / 动作 / 编排机制的真实使用');
  L.push('─'.repeat(78));
  const em = stats.eventMechanism;
  L.push('');
  L.push(`  页面级 subscribes : ${em.pageSubscribesFiles}/${N}  ${bar(em.pageSubscribesFiles, N)}  ${pct(em.pageSubscribesFiles, N)}`);
  L.push(`  flows 字段（非空）  : ${em.flowsFiles}/${N}  ${bar(em.flowsFiles, N)}  ${pct(em.flowsFiles, N)}`);
  L.push(`  validates（非空）   : ${em.validatesFiles}/${N}  ${pct(em.validatesFiles, N)}`);
  L.push(`  validateList（非空）: ${em.validateListFiles}/${N}  ${pct(em.validateListFiles, N)}`);
  L.push('');
  L.push('  校验规则的两种位置（同义两种写法）：');
  L.push(`      页面级 validates/validateList : ${em.validatesFiles}/${N} 文件使用`);
  L.push(`      组件级 property.singleValidate : 见 §3「表单校验」组`);
  L.push(`  subscribe 条目总数 : ${em.subscribeEntries}（含 behaviors ${em.entriesWithBehaviors} / 含 pubs ${em.entriesWithPubs}）`);
  L.push('');
  L.push('  flows 字段的实际形态：');
  for (const [k, c] of em.flowsShape) L.push(`      ${k.padEnd(24)} ${c} 文件`);
  L.push('');
  L.push('  动作类型（behaviors[].type）：');
  for (const r of em.behaviorTypes.slice(0, 12)) {
    L.push(`      ${r.type.padEnd(24)} ${r.count}`);
  }
  L.push('');
  L.push('  组件级表达（真属性在 components[].property 里，与页面级构成「同义两种位置」）：');
  const c2 = em.componentLevel;
  L.push(`      组件自带 subscribes : ${c2.filesWithComponentSubscribes}/${N} 文件  ${pct(c2.filesWithComponentSubscribes, N)}`);
  L.push(`      组件自带 action（语义事件名）: ${c2.filesWithComponentAction}/${N} 文件  ${pct(c2.filesWithComponentAction, N)}`);
  L.push(`      组件自带 actionConfig（开关）: ${c2.filesWithComponentActionConfig}/${N} 文件  ${pct(c2.filesWithComponentActionConfig, N)}`);
  L.push(`      组件自带 visible    : ${c2.filesWithComponentVisible}/${N} 文件  ${pct(c2.filesWithComponentVisible, N)}`);
  if (c2.subscribesByComponentType.length) {
    L.push(`      组件级 subscribes 类型: ${c2.subscribesByComponentType.map(r => `${r.type}×${r.count}`).join(', ')}`);
  }
  if (c2.actionByComponentType.length) {
    L.push(`      组件级 action 类型    : ${c2.actionByComponentType.map(r => `${r.type}×${r.count}`).join(', ')}`);
  }
  if (c2.visibleByComponentType.length) {
    L.push(`      组件级 visible 类型   : ${c2.visibleByComponentType.map(r => `${r.type}×${r.count}`).join(', ')}`);
  }

  L.push('');
  L.push('  触发时机分布（⚠ 必须扫全位置：只扫页面级会严重误判）');
  const td = em.triggerDistribution;
  L.push(`      总数: ${td.totals.subscribesAll} 条（页面级 ${td.totals.subscribesPage} / 组件级 ${td.totals.subscribesComponent}）`);
  L.push('      全位置 top 12:');
  for (const r of td.all.slice(0, 12)) {
    L.push(`          ${r.trigger.padEnd(22)} ${String(r.count).padStart(5)}`);
  }
  L.push('      组件级 top 8:');
  for (const r of td.componentLevel.slice(0, 8)) {
    L.push(`          ${r.trigger.padEnd(22)} ${String(r.count).padStart(5)}`);
  }
  L.push('      页面级 top 8:');
  for (const r of td.pageLevel.slice(0, 8)) {
    L.push(`          ${r.trigger.padEnd(22)} ${String(r.count).padStart(5)}`);
  }
  L.push(`      发布/动作总量: pubs ${td.totals.pubsAll} / behaviors ${td.totals.behaviorsAll} / successPubs ${td.totals.successPubsAll} / errorPubs ${td.totals.errorPubsAll}`);

  L.push('');
  L.push('  键名语义验证（名字像 ≠ 语义像 —— 分组命中不代表该键属于这一组）');
  for (const [k, rows] of Object.entries(stats.semanticChecks)) {
    L.push(`      ${k}:`);
    for (const r of rows) L.push(`          ${String(r.count).padStart(6)}  ${r.shape}`);
  }

  L.push('');
  L.push('  恒定值属性（≥99% 取值恒定 → 占位载荷，等于无效字段）');
  if (!stats.constantPayload.length) L.push('      无');
  for (const r of stats.constantPayload) {
    const v = r.dominantValue.length > 28 ? r.dominantValue.slice(0, 28) + '…' : r.dominantValue;
    L.push(`      ${r.key.padEnd(18)} ${String(r.dominantCount).padStart(6)}/${String(r.occurrences).padEnd(6)} ${pct(r.dominantCount, r.occurrences)}  恒为 ${v}`);
  }

  L.push('');
  L.push('─'.repeat(78));
  L.push('§5 数据源（Resource）形态');
  L.push('─'.repeat(78));
  const ds = stats.dataSource;
  L.push('');
  L.push(`  出现次数: ${ds.totalOccurrences}`);
  L.push(`  defaultDataSource: ${ds.defaultDataSource.files}/${N} 文件声明，其中非空 ${ds.defaultDataSource.nonEmptyFiles}`);
  L.push('');
  L.push('  type 分布:');
  for (const [k, c] of ds.byType) L.push(`      ${k.padEnd(20)} ${c}`);
  L.push('');
  L.push('  method 分布:');
  for (const [k, c] of ds.byMethod) L.push(`      ${k.padEnd(20)} ${c}`);
  L.push('');
  L.push('  url 形态分布:');
  for (const [k, c] of ds.urlShapes.slice(0, 15)) L.push(`      ${k.padEnd(40)} ${c}`);
  L.push('');
  L.push('  serverName 分布（Top 15）:');
  for (const [k, c] of ds.byServer.slice(0, 15)) L.push(`      ${k.padEnd(20)} ${c}`);

  L.push('');
  L.push('─'.repeat(78));
  L.push('§6 组件与属性契约面');
  L.push('─'.repeat(78));
  const cp = stats.components;
  L.push('');
  L.push(`  组件类型数: ${cp.typeCount}`);
  L.push('  类型分布（Top 20）:');
  for (const r of cp.types.slice(0, 20)) L.push(`      ${r.type.padEnd(26)} ${String(r.instances).padStart(6)} 实例`);
  L.push('');
  L.push('  属性键分布（Top 10）:');
  for (const r of cp.propKeys.slice(0, 10)) {
    L.push(`      ${r.key.padEnd(22)} ${String(r.hits).padStart(6)} 次 / ${r.files} 文件`);
  }
  L.push('');
  L.push('  长尾属性键（仅 ≤2 个文件使用 —— 契约风险区）:');
  for (const r of cp.longTailPropKeys.slice(0, 15)) {
    L.push(`      ${r.key.padEnd(24)} ${r.files} 文件 / ${r.hits} 次`);
  }

  L.push('');
  L.push('─'.repeat(78));
  L.push('§7 逃生舱规模（裸 JS 表达式）—— 真正「表达不了」的证据');
  L.push('─'.repeat(78));
  const eh = stats.escapeHatch;
  L.push('');
  L.push(`  表达式总数: ${eh.expressionCount}（空 ${eh.emptyExpressions}）`);
  L.push(`  含换行(多语句): ${eh.multiline}  ${pct(eh.multiline, eh.expressionCount)}`);
  L.push(`  长度分位: p50=${eh.length.p50}  p90=${eh.length.p90}  p99=${eh.length.p99}  max=${eh.length.max}`);
  L.push('');
  L.push('  裸 JS 模式频次:');
  for (const p of eh.patterns) {
    L.push(`      ${p.name.padEnd(32)} ${String(p.hits).padStart(6)} 次 / ${p.exprs} 条表达式`);
  }

  L.push('');
  L.push('─'.repeat(78));
  L.push('§8 冗余位置（同一份数据的多个存放点 —— 生成器最容易写错的地方）');
  L.push('─'.repeat(78));
  const rd = stats.redundancy;
  L.push('');
  L.push(`  desktop.components  有内容 : ${rd.topComponentsNonEmpty}/${N}`);
  L.push(`  desktop.canvas.components  : ${rd.canvasComponentsNonEmpty}/${N}   ← 孪生位置（空 ${rd.emptyTwinOfComponents}）`);
  L.push(`  desktop.layoutList  有内容 : ${rd.layoutListNonEmpty}/${N}`);
  L.push(`  desktop.canvas.containers  : ${rd.canvasContainersNonEmpty}/${N}   ← 孪生位置（空 ${rd.emptyTwinOfContainers}）`);

  L.push('');
  L.push('═'.repeat(78));
  return L.join('\n');
}

// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.input)) {
    console.error(`语料目录不存在: ${args.input}`);
    process.exit(1);
  }
  const corpus = loadCorpus(args.input);
  const stats = audit(corpus, args.top);
  stats.meta = { input: args.input, generatedAt: new Date().toISOString() };

  if (args.out) {
    fs.writeFileSync(args.out, JSON.stringify(stats, null, 2), 'utf-8');
    console.log(`统计结果已写入: ${args.out}`);
  }
  if (args.json) {
    console.log(JSON.stringify(stats, null, 2));
  } else {
    console.log(render(stats));
  }
}

if (require.main === module) main();

module.exports = { loadCorpus, audit, render, parseArgs, SYNONYM_GROUPS, JS_PATTERNS };
