/**
 * 引用规格表（REFERENCES）完整性审计 —— 只读
 *
 * ── 为什么需要这个脚本 ────────────────────────────────────────────────────
 * `ir/referenceSpec.js` 这张表是「哪些字段是组件/区域引用」的唯一真相。
 * 它决定了三件事：
 *   ① check 的 REF 规则报什么
 *   ② ID004 孤儿组件怎么判（被引用 = 不是孤儿）
 *   ③ lift 抽出的引用图谱长什么样
 * 表一旦漏了一条，后果不是「少报一个错」，而是**相关组件被误判为孤儿**
 * ——本轮就踩到这个坑：`TableHook.rowOperationItem[].id` 漏在表外，
 *   导致 364 个行操作按钮被报成孤儿。
 *
 * ── 方法：反向排查 ────────────────────────────────────────────────────────
 * 逐个字段猜是不够的。本脚本反过来做：遍历所有组件 property 里
 * 「像引用的值」（32 位 hex，或能在 components / regions 命中），
 * 把 (宿主类型, 字段路径) 与现有表对照，列出**没进表的组合**。
 *
 * 判读要点：
 *   命中 > 0        → 确凿的真引用，必须补进表（如 rowOperationItem[].id 365）
 *   命中 = 0 全悬空 → 通常是**局部标识**（multiColsConfig[].id / tabPanels[].id /
 *                     associatedFields[].id / tableInfo.id），或平台元数据
 *                     （actionConfig.metaId）。**不要收录**。
 *   同名同字段但命中 0 → 说明平台自己就在用 id 做局部键，`id` 命名 ≠ 引用
 *
 * 用法:
 *   node scripts/auditReferences.js [--input ../../MdFrontLayout]
 *   npm run audit:refs
 */

const fs = require('fs');
const path = require('path');
const { lift } = require('../ir');
const { REFERENCES } = require('../ir/referenceSpec');

const HEX32 = /^[0-9a-f]{32}$/i;

function parseArgs(argv) {
  const out = { input: '../../MdFrontLayout' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--input' || argv[i] === '-i') out.input = argv[++i];
  }
  return out;
}

function listFiles(dir) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(f));
    else if (e.name.endsWith('.json')) out.push(f);
  }
  return out;
}

const exact = new Set();
for (const r of REFERENCES) exact.add(r.ownerType + '::' + r.path);

/** 路径模板兼容表里两种风格：toolButtons（数组元素）与 columns[].colId（数组内对象字段） */
function covered(hostType, t) {
  return exact.has(hostType + '::' + t)
    || exact.has(hostType + '::' + t.replace(/\[\]/g, ''))
    || exact.has(hostType + '::' + t.replace(/\[\]/g, '[]'));
}

function main() {
  const { input } = parseArgs(process.argv);
  const files = listFiles(input);
  if (!files.length) {
    console.error(`未找到语料：${path.resolve(input)}`);
    process.exit(1);
  }

  const S = {
    files: 0, skipped: 0,
    covered: 0, selfId: 0, ignored: 0,
    coveredFields: {},
    uncovered: {},
  };

  for (const file of files) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof raw.value === 'string') JSON.parse(raw.value);
    } catch { S.skipped++; continue; }

    let ir;
    try { ir = lift(raw); } catch { S.skipped++; continue; }
    if (!ir.components || !Object.keys(ir.components).length) continue;
    S.files++;

    const components = ir.components;
    const compIds = new Set(Object.keys(components));

    for (const [hostId, comp] of Object.entries(components)) {
      const prop = comp && comp.property;
      if (!prop || typeof prop !== 'object') continue;
      const hostType = comp.type;

      (function walk(node, segs) {
        if (typeof node === 'string') {
          const t = segs.join('.');
          if (!t) return;
          if (t === 'id') { S.selfId++; return; }        // property.id = 自身标识
          if (!node.trim()) return;
          const isHex = HEX32.test(node);
          const resolves = compIds.has(node);
          if (!isHex && !resolves) { S.ignored++; return; }
          if (covered(hostType, t)) {
            S.covered++;
            const k = hostType + '.' + t;
            S.coveredFields[k] = (S.coveredFields[k] || 0) + 1;
            return;
          }
          const key = hostType + '.' + t;
          const g = S.uncovered[key] = S.uncovered[key] || { count: 0, hex: 0, resolves: 0, dangling: 0, sample: '' };
          g.count++;
          if (isHex) g.hex++;
          if (resolves) g.resolves++; else g.dangling++;
          if (!g.sample) g.sample = JSON.stringify(node).slice(0, 44);
          return;
        }
        if (node === null || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(x => walk(x, segs)); return; }
        for (const [k, v] of Object.entries(node)) {
          if (k === 'subscribes' || k === 'behaviors') continue;   // 事件另有一套判定
          walk(v, segs.concat([Array.isArray(v) ? k + '[]' : k]));
        }
      })(prop, []);
    }
  }

  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);

  console.log('='.repeat(74));
  console.log(`引用规格表完整性审计   语料 ${path.resolve(input)}`);
  console.log(`  读取 ${S.files} 份（跳过 ${S.skipped}）    规则 ${REFERENCES.length} 条`);
  console.log('');
  console.log(`已进表命中 ${S.covered}   自身标识跳过 ${S.selfId}   非引用形态忽略 ${S.ignored}`);
  console.log('');
  console.log('── ① 已进表字段复核（前 15，用于发现规则失效）──');
  top(S.coveredFields, 15).forEach(([k, v]) => console.log(String(v).padStart(6) + '  ' + k));
  console.log('');

  const unc = top(S.uncovered, 40);
  if (!unc.length) {
    console.log('── ② 未进表组合：空（规格表已覆盖语料中的全部引用）──');
    return;
  }

  console.log('── ② 未进表的 (宿主类型, 字段) 组合 ──');
  console.log('   命中  = 目标存在于 components → 确凿的真引用，应补进表');
  console.log('   悬空  = 目标不存在 → 多为局部标识 / 平台元数据，不应收录');
  console.log('');
  unc.forEach(([k, g]) => {
    const flag = g.resolves > 0 ? '★ 真引用' : '  局部?  ';
    console.log(`  ${flag} ${String(g.count).padStart(5)} 条 | hex ${String(g.hex).padStart(5)} | 命中 ${String(g.resolves).padStart(5)} | 悬空 ${String(g.dangling).padStart(5)} | ${k}  例:${g.sample}`);
  });
  console.log('');
  const suspects = unc.filter(([, g]) => g.resolves > 0);
  if (suspects.length) {
    console.log(`⚠️  有 ${suspects.length} 个组合存在「能命中目标」的值 —— 请逐个判断是否应补进 REFERENCES：`);
    suspects.forEach(([k, g]) => console.log(`   - ${k}   命中 ${g.resolves} / 悬空 ${g.dangling}`));
  } else {
    console.log('✅ 未进表的组合全部「命中 0」—— 说明现有规格表的边界是准确的，没有漏掉真引用。');
  }
}

main();
