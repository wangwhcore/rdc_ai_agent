/**
 * add / view 页语料分析（只读）
 *
 *   npm run analyze:addedit
 *
 * 存在的理由：`builder/addEditPage.js` 与 `builder/viewPage.js` 里几乎每个魔法值
 * （按钮文案、容器归属、卡片标题词条、事件骨架形态、componentIds 内容）都是
 * **从语料反推**出来的。这个脚本把「反推」这一步固化成可复跑的命令，
 * 改 builder 之前先跑一遍，避免凭印象改。
 *
 * 输出四组指标，每组都直接对应 builder 里的一段决策：
 *   ① 按钮：文案分布 / 容器归属 / action / $mode —— 决定生成哪几个按钮、放哪儿
 *   ② 页面级订阅：事件名 × behaviors/pubs 形态 —— 决定事件骨架（两级 vs 单级）
 *   ③ 卡片：标题词条 / 是否进 components —— 决定标题词条与注册行为
 *   ④ 区域登记：componentIds vs layoutList keys —— 决定哪些区域该登记
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = { input: path.resolve(__dirname, '../../../MdFrontLayout') };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--input') out.input = path.resolve(argv[++i]);
  }
  return out;
}

function loadDocs(dir) {
  const docs = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    } catch (e) { continue; }
    const v = typeof raw.value === 'string' ? safeParse(raw.value) : raw.value;
    const d = v && v.desktop;
    if (!d) continue;
    docs.push({ file: f, root: raw, value: v, desktop: d, pageType: (d.layoutInfo || {}).pageType || '(none)' });
  }
  return docs;
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

function walk(node, visit, seen = new Set()) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach(n => walk(n, visit, seen));
  visit(node);
  for (const k of ['cols', 'rows', 'components']) if (node[k]) walk(node[k], visit, seen);
}

/** 收集某布局里的按钮/卡片（layoutList 内联 ∪ components 注册，按 id 去重） */
function collectByType(desktop, type) {
  const map = new Map();
  for (const rid of Object.keys(desktop.layoutList || {})) {
    walk(desktop.layoutList[rid], n => { if (n.type === type && n.property) map.set(n.property.id, n); });
  }
  for (const c of Object.values(desktop.components || {})) {
    if (c && c.type === type && c.property) map.set(c.property.id, c);
  }
  return map;
}

/** 按钮 -> 出现在哪些区域 */
function buttonRegions(desktop) {
  const out = new Map();
  for (const [rid, reg] of Object.entries(desktop.layoutList || {})) {
    walk(reg, n => {
      if (n.type !== 'ButtonHook' || !n.property) return;
      const t = n.property.title || '(empty)';
      if (!out.has(t)) out.set(t, new Map());
      const m = out.get(t);
      m.set(rid, (m.get(rid) || 0) + 1);
    });
  }
  return out;
}

const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
const sum = obj => Object.values(obj).reduce((a, b) => a + b, 0);
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : 'n/a');

function main() {
  const { input } = parseArgs(process.argv);
  if (!fs.existsSync(input)) {
    console.error(`语料目录不存在: ${input}`);
    process.exit(1);
  }
  const docs = loadDocs(input);
  const adds = docs.filter(d => d.pageType === 'add');
  const views = docs.filter(d => d.pageType === 'view');

  console.log(`语料目录: ${input}`);
  console.log(`共 ${docs.length} 份；其中 pageType=add ${adds.length} 份 / pageType=view ${views.length} 份`);

  // ── ① 按钮 ─────────────────────────────────────────────────────────────
  console.log('\n══════ ① 按钮（决定生成哪几个按钮、放哪个区域、文案是什么）══════');
  for (const [label, set] of [['add', adds], ['view', views]]) {
    if (!set.length) continue;
    const titles = {};
    const modes = {};
    const actions = {};
    const perPage = [];
    const combos = {};
    const coexist = {};
    for (const { desktop } of set) {
      const btns = [...collectByType(desktop, 'ButtonHook').values()];
      perPage.push(btns.length);
      const sig = [];
      for (const b of btns) {
        const p = b.property;
        titles[p.title || '(empty)'] = (titles[p.title || '(empty)'] || 0) + 1;
        const m = JSON.stringify(p.$mode || null);
        modes[m] = (modes[m] || 0) + 1;
        const a = p.action ? p.action.replace(/[0-9a-f]{8,}/g, '<hex>') : '(empty)';
        actions[a] = (actions[a] || 0) + 1;
        sig.push(p.title || '(empty)');
      }
      sig.sort();
      combos[sig.join(' + ') || '(无按钮)'] = (combos[sig.join(' + ') || '(无按钮)'] || 0) + 1;
      const has = t => sig.includes(t);
      coexist[`save=${has('$${button.save}')} submit=${has('$${button.submit}')} update=${has('$${button.update}')}`] =
        (coexist[`save=${has('$${button.save}')} submit=${has('$${button.submit}')} update=${has('$${button.update}')}`] || 0) + 1;
    }
    console.log(`\n-- ${label} 页（${set.length} 份）--`);
    console.log('   每页按钮数分布:', JSON.stringify(perPage.reduce((a, n) => (a[n] = (a[n] || 0) + 1, a), {})));
    console.log('   save/submit/update 共存情况（说明为什么「不能生成两个同名按钮」）:');
    for (const [k, v] of top(coexist, 8)) console.log(`      ${String(v).padStart(4)}  ${k}`);
    console.log('   按钮 title top14:');
    for (const [k, v] of top(titles, 14)) console.log(`      ${String(v).padStart(4)}  ${k}`);
    console.log('   $mode 分布（若只有一种，说明它不参与区分按钮）:');
    for (const [k, v] of top(modes, 4)) console.log(`      ${String(v).padStart(4)}  ${k}`);
    console.log('   action 有值比例:', pct(actions['(empty)'] === undefined ? sum(actions) : sum(actions) - actions['(empty)'], sum(actions)),
      `（empty ${actions['(empty)'] || 0} / 共 ${sum(actions)}）`);

    // 容器归属
    const regions = buttonRegions(set[0].desktop);
    const merged = new Map();
    for (const { desktop } of set) {
      for (const [t, m] of buttonRegions(desktop)) {
        if (!merged.has(t)) merged.set(t, new Map());
        for (const [r, n] of m) merged.get(t).set(r, (merged.get(t).get(r) || 0) + n);
      }
    }
    console.log('   按钮 → 区域归属（决定性证据）:');
    for (const t of ['$${button.back}', '$${button.save}', '$${button.submit}', '$${button.edit}', '$${button.delete}']) {
      if (!merged.has(t)) continue;
      const regs = [...merged.get(t).entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      console.log(`      ${t.padEnd(22)} ${regs.map(([r, n]) => `${r}×${n}`).join(', ')}`);
    }
  }

  // ── ② 页面级订阅 ───────────────────────────────────────────────────────
  console.log('\n══════ ② 页面级订阅（决定事件骨架：两级编排 vs 单级）══════');
  for (const [label, set] of [['add', adds], ['view', views]]) {
    if (!set.length) continue;
    const shape = {};
    for (const { desktop } of set) {
      for (const s of desktop.subscribes || []) {
        const n = (s.event || '').split('.').slice(1).join('.') || '(无后缀)';
        const k = `${n} [behaviors=${(s.behaviors || []).length} pubs=${(s.pubs || []).length}]`;
        shape[k] = (shape[k] || 0) + 1;
      }
    }
    console.log(`\n-- ${label} 页（${set.length} 份，共 ${sum(shape)} 条订阅）--`);
    for (const [k, v] of top(shape, 12)) console.log(`   ${String(v).padStart(4)}  ${k}`);
    const cdm = Object.entries(shape).filter(([k]) => k.startsWith('componentDidMount'));
    const pubs = cdm.filter(([k]) => /pubs=\d/.test(k) && !/behaviors=[1-9]/.test(k));
    console.log(`   → componentDidMount 里 pubs 型 ${sum(Object.fromEntries(pubs))} 条 / 共 ${sum(Object.fromEntries(cdm))} 条：`
      + '这决定 mount 是否应该直接持有请求');
  }

  // ── ③ 卡片 ─────────────────────────────────────────────────────────────
  console.log('\n══════ ③ CardHook（决定标题词条与是否登记 components）══════');
  let cardTotal = 0, cardRegistered = 0;
  const cardTitles = {};
  for (const { desktop } of docs) {
    const reg = new Set(Object.keys(desktop.components || {}));
    for (const c of collectByType(desktop, 'CardHook').values()) {
      cardTotal++;
      if (reg.has(c.property.id)) cardRegistered++;
      if (['add', 'view'].includes((desktop.layoutInfo || {}).pageType)) {
        cardTitles[c.property.title] = (cardTitles[c.property.title] || 0) + 1;
      }
    }
  }
  console.log(`   卡片总数 ${cardTotal}，已登记进 components ${cardRegistered}（${pct(cardRegistered, cardTotal)}）`);
  console.log('   add/view 页卡片 title top10（标题词条的唯一依据）:');
  for (const [k, v] of top(cardTitles, 10)) console.log(`      ${String(v).padStart(4)}  ${k}`);

  // ── ④ 标题命名空间 ─────────────────────────────────────────────────────
  console.log('\n══════ ④ 页面标题命名空间 <frontId>-title ══════');
  let subjectOk = 0, subjectBad = 0, inPageSub = 0, inComponent = 0, layoutKeyTitle = 0;
  for (const { root, desktop } of docs) {
    const fid = root.frontId;
    const text = JSON.stringify(desktop);
    for (const m of text.matchAll(/['"]([0-9a-f]{32})-title\./g)) {
      if (m[1] === fid) subjectOk++; else subjectBad++;
    }
    if (text.includes('-title.setLabel')) inPageSub++;
    for (const rid of Object.keys(desktop.layoutList || {})) if (/-title$/.test(rid)) layoutKeyTitle++;
  }
  console.log(`   主语 === 本页 frontId: ${subjectOk} / 不等: ${subjectBad}`);
  console.log(`   含 -title.setLabel 的布局数: ${inPageSub} / ${docs.length}`);
  console.log(`   layoutList 里以 -title 结尾的 key: ${layoutKeyTitle}（应为 0 —— 它是运行时命名空间，不是组件）`);

  // ── ⑤ 区域登记 ─────────────────────────────────────────────────────────
  console.log('\n══════ ⑤ componentIds 与 layoutList keys（决定哪些区域该登记）══════');
  const rel = {};
  let cardLayoutIdInComponentIds = 0, cardLayoutIdTotal = 0;
  for (const { desktop } of docs) {
    const cids = (desktop.layoutInfo || {}).componentIds || [];
    const keys = Object.keys(desktop.layoutList || {});
    const named = keys.filter(k => !/^[0-9a-f]{32}$/.test(k));
    const hexExtra = keys.filter(k => /^[0-9a-f]{32}$/.test(k) && !cids.includes(k));
    const k = `componentIds=${cids.length} keys=${keys.length} 具名多出=${named.filter(x => !cids.includes(x)).length} hex多出=${hexExtra.length}`;
    rel[k] = (rel[k] || 0) + 1;
    for (const c of collectByType(desktop, 'CardHook').values()) {
      if (!c.property.layoutId) continue;
      cardLayoutIdTotal++;
      if (cids.includes(c.property.layoutId)) cardLayoutIdInComponentIds++;
    }
  }
  for (const [k, v] of top(rel, 10)) console.log(`   ${String(v).padStart(4)}  ${k}`);
  console.log(`   卡片 layoutId 在 componentIds 内: ${cardLayoutIdInComponentIds} / ${cardLayoutIdTotal}`
    + '（0 = 卡片区域从不登记，故 STRUCT007 需排除被引用区域）');

  // ── ⑥ 卡片容器归属 ─────────────────────────────────────────────────────
  //
  // 这一节是 REF007 与 builder 里「卡片容器必须自建」的那段注释的唯一依据。
  //
  // 背景：生成器曾把 CardHook.toolContainerId 指到 'TitleTools'（页面级标题栏插槽）。
  // 那样写**能通过** REF001 —— 具名区域确实是 layoutList 的 key，引用解析得通 ——
  // 但运行时 TitleTools 会被渲染两遍（页面插槽一次 + 卡片标题栏一次），
  // 页面上出现两组一模一样的「保存 / 提交」。
  //
  // 判据分两层：
  //   ① 取值形态：是 hex 私有容器，还是具名页面区域
  //   ② ★ 交叉：该值是否同时登记在 layoutInfo.componentIds 里（= 页面级渲染路径）
  //      语料为 0 → 卡片容器**从不**复用页面级插槽。
  const HEX32 = /^[0-9a-f]{32}$/;
  const isHex = s => HEX32.test(s);
  const compose = node => {
    const out = {};
    walk(node, n => { if (n.type) out[n.type] = (out[n.type] || 0) + 1; });
    return out;
  };
  const regionCompose = (desktop, rid) =>
    ((desktop.layoutList || {})[rid] ? compose(desktop.layoutList[rid]) : null);

  console.log('\n══════ ⑥ 卡片容器归属（REF007 与「卡片容器必须自建」的依据）══════');
  const cardSets = { add: adds, view: views };
  for (const [label, set] of Object.entries(cardSets)) {
    if (!set.length) continue;
    const slots = { toolContainerId: {}, extraContainerId: {}, ltContainerId: {} };
    const content = { toolContainerId: {}, extraContainerId: {}, ltContainerId: {} };
    let cards = 0, inCids = 0, resolvable = 0, slotRefs = 0;
    for (const { desktop } of set) {
      const cids = (desktop.layoutInfo || {}).componentIds || [];
      const keys = Object.keys(desktop.layoutList || {});
      for (const c of collectByType(desktop, 'CardHook').values()) {
        cards++;
        for (const slot of ['toolContainerId', 'extraContainerId', 'ltContainerId']) {
          const val = c.property[slot];
          if (!val) continue;
          slotRefs++;
          const kind = isHex(val) ? 'hex-uuid' : `★named(${val})`;
          slots[slot][kind] = (slots[slot][kind] || 0) + 1;
          if (keys.includes(val)) resolvable++;
          if (cids.includes(val)) inCids++;
          const comp = regionCompose(desktop, val);
          const k = comp === null ? '未在 layoutList 建区域（悬空）'
            : (sum(comp) ? JSON.stringify(comp) : 'EMPTY-region');
          content[slot][k] = (content[slot][k] || 0) + 1;
        }
      }
    }
    console.log(`\n-- ${label} 页：${cards} 张卡，容器引用 ${slotRefs} 条 --`);
    for (const slot of ['toolContainerId', 'extraContainerId', 'ltContainerId']) {
      console.log(`   ${slot.padEnd(17)} 取值: ${top(slots[slot], 4).map(([k, v]) => `${k}×${v}`).join(', ') || '(无)'}`);
      console.log(`   ${' '.repeat(17)} 指向: ${top(content[slot], 4).map(([k, v]) => `${k}×${v}`).join(', ') || '(无)'}`);
    }
    console.log(`   可在 layoutList 解析: ${resolvable} / ${slotRefs}`);
    console.log(`   ★ 同时登记在 componentIds（= 页面级渲染路径，应为 0）: ${inCids}`);
  }

  // 具名标题区在 add/view 页里的角色：是「页面级插槽」，从不被卡片认领
  console.log('\n-- 具名区域角色（key / componentIds / 被卡片认领 / 内含按钮）--');
  const NAMED = ['LayoutMain', 'TopMain', 'TitleSiderExtra', 'TitleSider', 'TitleTools'];
  for (const n of NAMED) {
    let asKey = 0, inCids = 0, asSlot = 0, withBtn = 0;
    const btns = {};
    for (const { desktop } of [...adds, ...views]) {
      const cids = (desktop.layoutInfo || {}).componentIds || [];
      const keys = Object.keys(desktop.layoutList || {});
      if (keys.includes(n)) asKey++;
      if (cids.includes(n)) inCids++;
      for (const c of collectByType(desktop, 'CardHook').values()) {
        if (['toolContainerId', 'extraContainerId', 'ltContainerId'].some(s => c.property[s] === n)) asSlot++;
      }
      const comp = compose((desktop.layoutList || {})[n] || {});
      if (comp.ButtonHook) withBtn++;
      walk({ rows: ((desktop.layoutList || {})[n] || {}).rows || [] }, x => {
        if (x.type === 'ButtonHook' && x.property) btns[x.property.title || '(empty)'] = (btns[x.property.title || '(empty)'] || 0) + 1;
      });
    }
    console.log(`   ${n.padEnd(16)} key=${String(asKey).padStart(3)}  componentIds=${String(inCids).padStart(3)}`
      + `  ★被卡片认领=${asSlot}  含按钮页=${withBtn}  ${top(btns, 4).map(([k, v]) => `${k}×${v}`).join(', ')}`);
  }
}

main();
