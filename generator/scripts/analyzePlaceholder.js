/**
 * 占位载荷分析器（只读）
 *
 * 回答一个具体问题：componentTypeName / actionConfig / outside
 * 这三个「有键无值」的字段，到底**能不能从产物里省掉**。
 *
 * ══════════════════════════════════════════════════════════════════════
 * ★ 核心方法：绝对次数没有意义，必须算分母。
 * ══════════════════════════════════════════════════════════════════════
 * 「componentTypeName 出现 11216 次」这句话本身回答不了「能不能省」。
 * 能回答的是三层递进判据：
 *
 *   第一层 · 算分母
 *     注册表内 N 个 property，其中 M 个有该字段 → 若 M < N，
 *     说明**存在已省略的实例**，而它们都上线了。
 *     ⚠️ 本脚本 v1 问错过对象：把「含 property 键的对象」当宿主，
 *        得到的是**组件数**而非 property 数，结论整个偏了。
 *        真实宿主是 node.property 本身。
 *
 *   第二层 · 逐文件「有 / 无 / 混用」
 *     排除「版本差异」这个致命可能 —— 若某字段在语料里「要么全有、要么全无」，
 *     那很可能是设计器版本差异，不能证明字段可选。
 *
 *   第三层 · 同文件 + 同类型 混用（最硬）
 *     第二层会被**跨组件类型**污染：ButtonHook 有 actionConfig、ColumnHook 没有，
 *     同一文件里自然就「混用」了 —— 但那只说明「不同组件类型字段集不同」。
 *     只有**同一文件、同一类型、≥2 个实例**里两种写法并存，
 *     才是「同一人、同一页面、同一版本、同一类组件」的实证。
 * ══════════════════════════════════════════════════════════════════════
 *
 * 用法：
 *   node scripts/analyzePlaceholder.js --input ../../MdFrontLayout
 */
const fs = require('fs');
const path = require('path');

let DIR = path.join(__dirname, '../../MdFrontLayout');
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && argv[i + 1]) DIR = argv[i + 1];
    else if (!argv[i].startsWith('--') && i === 0) DIR = argv[i];
  }
}

const TARGETS = ['componentTypeName', 'actionConfig', 'outside'];

function listFiles(d) {
  const out = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

function loadLayout(file) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  let v = raw && typeof raw === 'object' && raw.value !== undefined ? raw.value : raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  return v && typeof v === 'object' ? v : null;
}

/** 路径归一化：抹平具体 id 与数组下标，让路径可聚合 */
function normPath(p) {
  return p.replace(/[0-9a-f]{32}/g, '<ID>').replace(/\[\d+\]/g, '[*]');
}

/** 值形态（小值精确打印，大值截断） */
function valueForm(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') {
    return v === '' ? '"" (空串)'
      : 'string 非空: ' + JSON.stringify(v.length > 30 ? v.slice(0, 30) + '…' : v);
  }
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return 'array(' + v.length + ')';
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return 'obj ' + (s.length > 70 ? s.slice(0, 70) + '…' : s);
  }
  return typeof v;
}

const S = {};
for (const t of TARGETS) {
  S[t] = { occurrences: 0, filesWith: 0, paths: {}, signatures: {}, forms: {}, inLayoutList: 0, samples: [] };
}

const D = {
  // 真实宿主是 property 对象（node.property），不是组件对象
  propInRegistry: 0, propInLayoutList: 0,
  propWithCTN: 0, propNoCTN: 0,
  propWithAC: 0, propNoAC: 0,
  byType: {},
  noCTNSamples: [], noACSamples: [],
  // 发布条目 = 含 event 键、且不含 pubs/behaviors 的对象
  pubEntries: 0, pubWithOutside: 0, pubOutsideTrue: 0, pubOutsideFalse: 0,
  pubNoOutside: { count: 0, samples: [] },
  outsideByEventForm: {},
  // 第二层：逐文件「全有 / 全无 / 混用」
  mix: { ctn: {}, ac: {}, outside: {} },
  // 第三层：同文件 + 同类型 混用
  mixSame: { ctn: {}, ac: {}, outside: {} },
};

let loaded = 0;

for (const file of listFiles(DIR)) {
  const root = loadLayout(file);
  if (!root) continue;
  loaded++;
  const hit = new Set();
  const pfHas = { ctn: 0, ac: 0, outside: 0 };
  const pfNone = { ctn: 0, ac: 0, outside: 0 };
  const byTypeInFile = {};
  const evFormInFile = {};

  (function walk(node, p) {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((x, i) => walk(x, p + '[' + i + ']')); return; }
    const keys = Object.keys(node);
    const np = normPath(p);
    const inLL = p.indexOf('layoutList') !== -1;

    for (const t of TARGETS) {
      if (keys.indexOf(t) !== -1) {
        const st = S[t];
        st.occurrences++;
        hit.add(t);
        if (inLL) st.inLayoutList++;
        st.paths[np] = (st.paths[np] || 0) + 1;
        const sig = keys.filter(k => k !== t).sort().join(',');
        st.signatures[sig] = (st.signatures[sig] || 0) + 1;
        const f = valueForm(node[t]);
        st.forms[f] = (st.forms[f] || 0) + 1;
        if (st.samples.length < 5) st.samples.push(path.basename(file).slice(0, 12) + '  ' + np + '  →  ' + f);
      }
    }

    // ---- 第一层分母：property 对象 ----
    const prop = node.property;
    if (prop && typeof prop === 'object' && !Array.isArray(prop)) {
      const pKeys = Object.keys(prop);
      const reg = !inLL;
      if (reg) D.propInRegistry++; else D.propInLayoutList++;
      const hasCTN = pKeys.indexOf('componentTypeName') !== -1;
      const hasAC = pKeys.indexOf('actionConfig') !== -1;
      if (reg) {
        if (hasCTN) { D.propWithCTN++; pfHas.ctn++; }
        else {
          D.propNoCTN++; pfNone.ctn++;
          if (D.noCTNSamples.length < 3) D.noCTNSamples.push(path.basename(file).slice(0, 12) + '  ' + np + '  type=' + JSON.stringify(node.type));
        }
        if (hasAC) { D.propWithAC++; pfHas.ac++; }
        else {
          D.propNoAC++; pfNone.ac++;
          if (D.noACSamples.length < 3) D.noACSamples.push(path.basename(file).slice(0, 12) + '  ' + np + '  type=' + JSON.stringify(node.type));
        }
        const t = typeof node.type === 'string' ? node.type : '(组件对象无 type)';
        const g = D.byType[t] = D.byType[t] || { total: 0, ctn: 0, ac: 0 };
        g.total++; if (hasCTN) g.ctn++; if (hasAC) g.ac++;
        const bt = byTypeInFile[t] = byTypeInFile[t] || { ctTotal: 0, ctHas: 0, acTotal: 0, acHas: 0 };
        bt.ctTotal++; if (hasCTN) bt.ctHas++;
        bt.acTotal++; if (hasAC) bt.acHas++;
      }
    }

    // ---- 分母：发布条目（订阅对象也含 event，区别是它带 pubs/behaviors）----
    if (keys.indexOf('event') !== -1 && keys.indexOf('pubs') === -1 && keys.indexOf('behaviors') === -1) {
      D.pubEntries++;
      const ev = node.event;
      let form;
      if (typeof ev !== 'string') form = '<非字符串>';
      else if (ev === '') form = '"" 空串';
      else if (ev === '.') form = '"." 仅点';
      else if (ev.indexOf('@@') === 0) form = ev;
      else if (/^[0-9a-f]{32}\./.test(ev)) form = '<ID>.<事件名>';
      else if (/^[^.]*\./.test(ev)) form = '<中文标签>.<事件名>';
      else form = '其他: ' + ev.slice(0, 20);
      const g = D.outsideByEventForm[form] = D.outsideByEventForm[form] || { has: 0, none: 0 };
      const ef = evFormInFile[form] = evFormInFile[form] || { has: 0, none: 0 };
      if (keys.indexOf('outside') === -1) {
        g.none++; ef.none++; pfNone.outside++;
        D.pubNoOutside.count++;
        if (D.pubNoOutside.samples.length < 4) D.pubNoOutside.samples.push(path.basename(file).slice(0, 12) + '  event=' + JSON.stringify(String(ev).slice(0, 34)));
      } else {
        g.has++; ef.has++; pfHas.outside++;
        D.pubWithOutside++;
        if (node.outside === true) D.pubOutsideTrue++; else D.pubOutsideFalse++;
      }
    }

    for (const k of keys) walk(node[k], p + '.' + k);
  })(root, '$');

  for (const t of TARGETS) if (hit.has(t)) S[t].filesWith++;

  // 第二层：逐文件分类
  for (const k of ['ctn', 'ac', 'outside']) {
    if (pfHas[k] === 0 && pfNone[k] === 0) continue;
    const kind = pfHas[k] > 0 && pfNone[k] > 0 ? 'mixed' : (pfHas[k] > 0 ? 'all' : 'none');
    D.mix[k][kind] = (D.mix[k][kind] || 0) + 1;
  }

  // 第三层：同文件 + 同类型混用（要求该类型 ≥2 个实例，否则「混用」无意义）
  let ctnSameMix = false, acSameMix = false;
  for (const t of Object.keys(byTypeInFile)) {
    const b = byTypeInFile[t];
    if (b.ctTotal > 1 && b.ctHas > 0 && b.ctHas < b.ctTotal) ctnSameMix = true;
    if (b.acTotal > 1 && b.acHas > 0 && b.acHas < b.acTotal) acSameMix = true;
  }
  let outSameMix = false;
  for (const f of Object.keys(evFormInFile)) {
    const e = evFormInFile[f];
    if (e.has > 0 && e.none > 0) outSameMix = true;
  }
  if (Object.keys(byTypeInFile).length) {
    const k1 = ctnSameMix ? 'mixed' : 'clean';
    D.mixSame.ctn[k1] = (D.mixSame.ctn[k1] || 0) + 1;
    const k2 = acSameMix ? 'mixed' : 'clean';
    D.mixSame.ac[k2] = (D.mixSame.ac[k2] || 0) + 1;
  }
  if (Object.keys(evFormInFile).length) {
    const k3 = outSameMix ? 'mixed' : 'clean';
    D.mixSame.outside[k3] = (D.mixSame.outside[k3] || 0) + 1;
  }
}

const top = (m, n) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
const pct = (a, b) => b ? ((a / b) * 100).toFixed(1) + '%' : 'n/a';
const LABEL = { ctn: 'componentTypeName', ac: 'actionConfig', outside: 'outside' };

console.log('扫描文件: ' + loaded);
console.log('');

for (const t of TARGETS) {
  const st = S[t];
  console.log('='.repeat(70));
  console.log('## ' + t);
  console.log('  出现 ' + st.occurrences + ' 次 / 覆盖 ' + st.filesWith + ' 份文件' + (st.inLayoutList ? '（其中 layoutList 内联副本 ' + st.inLayoutList + '）' : ''));
  console.log('  -- 宿主路径 top 5 --');
  top(st.paths, 5).forEach(([k, v]) => console.log('    ' + String(v).padStart(6) + '  ' + k));
  console.log('  -- 宿主键集签名 top 5 --');
  top(st.signatures, 5).forEach(([k, v]) => console.log('    ' + String(v).padStart(6) + '  ' + (k.length > 110 ? k.slice(0, 110) + '…' : k)));
  console.log('  -- ★ 取值形态 --');
  top(st.forms, 8).forEach(([k, v]) => console.log('    ' + String(v).padStart(6) + '  ' + k));
  const extra = Object.keys(st.forms).length - 8;
  if (extra > 0) console.log('    ... 另有 ' + extra + ' 种形态（上方只列 top 8，非空值需看全部）');
  st.samples.forEach(s => console.log('    ' + s));
  console.log('');
}

console.log('='.repeat(70));
console.log('## ★ 第一层：分母（决定「能不能省」的关键）');
console.log('');
console.log('property 对象（node.property 本身 —— 这才是真实宿主）');
console.log('  注册表内                : ' + D.propInRegistry);
console.log('  layoutList 内联副本     : ' + D.propInLayoutList);
console.log('  ┌ componentTypeName : 有 ' + D.propWithCTN + ' / 无 ' + D.propNoCTN + '  → 省略率 ' + pct(D.propNoCTN, D.propInRegistry));
console.log('  └ actionConfig      : 有 ' + D.propWithAC + ' / 无 ' + D.propNoAC + '  → 省略率 ' + pct(D.propNoAC, D.propInRegistry));
console.log('');
if (D.noCTNSamples.length) { console.log('  省略 componentTypeName 的实例:'); D.noCTNSamples.forEach(s => console.log('    ' + s)); }
if (D.noACSamples.length) { console.log('  省略 actionConfig 的实例:'); D.noACSamples.forEach(s => console.log('    ' + s)); }

console.log('');
console.log('-- 按组件 type 分组（注册表内）：看「同一类里有的有有的没有」--');
const byType = Object.entries(D.byType).sort((a, b) => b[1].total - a[1].total).slice(0, 14);
console.log('  ' + 'type'.padEnd(26) + 'total'.padStart(7) + '  ctn'.padStart(7) + '  ac'.padStart(7) + '   说明');
for (const [t, g] of byType) {
  const mixed = (g.ctn > 0 && g.ctn < g.total) || (g.ac > 0 && g.ac < g.total);
  const note = mixed ? '★ 同类内不一致' : (g.ctn === 0 && g.ac === 0 ? '该类全都没有' : '该类全都有');
  console.log('  ' + t.slice(0, 25).padEnd(26) + String(g.total).padStart(7) + String(g.ctn).padStart(7) + String(g.ac).padStart(7) + '   ' + note);
}

console.log('');
console.log('发布条目（含 event 键、不含 pubs/behaviors）');
console.log('  总数          : ' + D.pubEntries);
console.log('  带 outside    : ' + D.pubWithOutside + '（true ' + D.pubOutsideTrue + ' / false ' + D.pubOutsideFalse + '）');
console.log('  不带 outside  : ' + D.pubNoOutside.count + '  ← 已省略实例，省略率 ' + pct(D.pubNoOutside.count, D.pubEntries));
if (D.pubNoOutside.samples.length) {
  console.log('  省略样本:');
  D.pubNoOutside.samples.forEach(s => console.log('    ' + s));
}
console.log('');
console.log('-- 按 event 形态分组：同形态内「有的带有的不带」= 字段可选 --');
const ebf = Object.entries(D.outsideByEventForm).sort((a, b) => (b[1].has + b[1].none) - (a[1].has + a[1].none)).slice(0, 12);
console.log('  ' + 'event 形态'.padEnd(30) + '带'.padStart(7) + '不带'.padStart(8) + '   说明');
for (const [f, g] of ebf) {
  const mixed = g.has > 0 && g.none > 0;
  console.log('  ' + f.slice(0, 29).padEnd(30) + String(g.has).padStart(7) + String(g.none).padStart(8) + '   ' + (mixed ? '★ 同形态内不一致' : (g.has === 0 ? '全都不带' : '全都带')));
}

console.log('');
console.log('='.repeat(70));
console.log('## ★★ 第二层：逐文件「有 / 无 / 混用」（排除版本差异）');
console.log('');
console.log('  「要么全有、要么全无」→ 可能是设计器版本差异，不能证明可选。');
console.log('  存在混用 → 同一页面两种写法并存且都上线。');
console.log('');
for (const k of ['ctn', 'ac', 'outside']) {
  const m = D.mix[k];
  const all = m.all || 0, none = m.none || 0, mixed = m.mixed || 0;
  let verdict;
  if (mixed > 0) verdict = '★ 存在混用 → 字段可选';
  else if (all > 0 && none === 0) verdict = '只有「全有」文件 → 平台总是输出，省略 = 未走过的路径（高风险）';
  else if (none > 0 && all === 0) verdict = '只有「全无」文件 → 从未被输出过';
  else verdict = '既有全有又有全无、但无混用 → 疑似版本差异，不能直接判定';
  console.log('  ' + LABEL[k].padEnd(20) + '全有 ' + String(all).padStart(3) + ' / 全无 ' + String(none).padStart(3) + ' / 混用 ' + String(mixed).padStart(3) + ' 文件');
  console.log('    → ' + verdict);
}

console.log('');
console.log('='.repeat(70));
console.log('## ★★★ 第三层：同文件 + 同类型 内的混用（最硬判据）');
console.log('');
console.log('  第二层会被跨组件类型污染：ButtonHook 有 actionConfig、ColumnHook 没有，');
console.log('  同一文件里自然就「混用」了 —— 那只说明「不同组件类型字段集不同」。');
console.log('  只有在**同一文件、同一类型、至少 2 个实例**里两种写法并存，才证明字段可选。');
console.log('');
for (const k of ['ctn', 'ac', 'outside']) {
  const m = D.mixSame[k];
  const mixed = m.mixed || 0, clean = m.clean || 0;
  const unit = k === 'outside' ? '(按同一 event 形态比)' : '(按同一组件 type 比)';
  const verdict = mixed > 0
    ? '★ 混用 ' + mixed + ' 份 / 一致 ' + clean + ' 份 → 字段可选，已实证'
    : '一致 ' + clean + ' 份 / 混用 0 份 → 无同类内混用先例，省略 = 未走过的路径';
  console.log('  ' + LABEL[k].padEnd(20) + verdict + '  ' + unit);
}
