/**
 * 新设计器增量白名单（overlay）审计 —— 只读
 *
 * ── 为什么需要这个脚本 ────────────────────────────────────────────────────
 * `ir/schema.overlay.json` 是「语料不可能证明、但引擎确实认识」的键的台账。
 * 它天生是例外清单，所以天生有腐烂风险：登记完就没人再看，
 * 半年后没人知道某条还在不在用、当初凭什么加进来。
 *
 * 本脚本把台账摊开，并回答三个问题：
 *   ① 每条登记现在还有没有实际打击面？（builder 还在输出它吗）
 *   ② 登记的类型范围对不对？（有没有被用在没登记的类型上）
 *   ③ 白名单之外还剩多少漂移？（生成器输出 vs 语料白名单的差值）
 *
 * ── 判读要点 ─────────────────────────────────────────────────────────────
 * 打击面 = 0     → 死条目。要么 builder 已经不输出了，要么从来只有语料在输出。
 *                  应该删掉，留着只会掩盖将来的真问题。
 * 越界使用 > 0   → 该键出现在了 types 未登记的类型上。确认后补登记 types。
 * 残留漂移       → 每一条都要定性成下面两类之一，不留悬而未决：
 *                  · 设计器认 → 补进 overlay（带出处）
 *                  · 设计器不认 → 从 builder 删掉多余的输出
 *
 * 用法:
 *   node scripts/auditOverlay.js
 *   npm run audit:overlay
 */

const fs = require('fs');
const path = require('path');
const { loadSchema, loadOverlay } = require('../ir/schema');

const EXAMPLES = [
  'inquiry-list', 'inquiry-add-edit', 'purchase-order-with-lines',
  'delete-confirm-modal', 'product-detail-with-p1', 'xxx-page',
];

/** 解析 layout 的 value（兼容字符串/对象两种形态） */
function parseValue(layout) {
  return typeof layout.value === 'string' ? JSON.parse(layout.value) : layout.value;
}

/**
 * 扫描**生成器实际输出**的每个 property key。
 * 刻意不走 check 的诊断结果：诊断只报「未登记的」，那样永远算不出
 * 已登记键的打击面（会把活条目误判成死条目 —— 本脚本第一版就踩了这个坑）。
 * 这里直接读产物，登记与否无关，才能同时得到「打击面」和「越界使用」。
 *
 * @returns {Map<string,{type:string,key:string,count:number,files:Set<string>}>}
 */
function scanGenerated(examples) {
  const agg = new Map();
  for (const name of EXAMPLES) {
    let layout;
    try { layout = require(path.join(__dirname, '..', 'examples', name + '.js')); } catch { continue; }
    const layouts = Array.isArray(layout) ? layout : [layout];
    for (const l of layouts) {
      let value;
      try { value = parseValue(l); } catch { continue; }
      const comps = (value && value.desktop && value.desktop.components) || {};
      for (const comp of Object.values(comps)) {
        if (!comp || !comp.type || !comp.property) continue;
        for (const key of Object.keys(comp.property)) {
          const k = `${comp.type}.${key}`;
          if (!agg.has(k)) agg.set(k, { type: comp.type, key, count: 0, files: new Set() });
          const rec = agg.get(k);
          rec.count++;
          rec.files.add(name);
        }
      }
    }
  }
  return agg;
}

function main() {
  const schema = loadSchema();
  const overlay = loadOverlay();
  const scan = scanGenerated(EXAMPLES);

  const line = (s) => console.log(s);
  line('═'.repeat(78));
  line('新设计器增量白名单（ir/schema.overlay.json）');
  line('═'.repeat(78));
  line(`语料基准      : ${schema.sampleSize} 份（${schema.source || '未知来源'}）`);
  line(`语料登记的键数: ${Object.values(schema.componentTypes).reduce((s, e) => s + (e.propertyKeys || []).length, 0)}`);
  line(`增量登记条目  : ${overlay.entries.length}`);
  line('');

  if (overlay.problems.length) {
    line(`⚠️  ${overlay.problems.length} 条无效登记（缺 key/types/source/date，已忽略）：`);
    for (const p of overlay.problems) line(`     - ${p}`);
    line('');
  }

  if (!overlay.entries.length) {
    line('（无登记条目）');
  }

  for (const e of overlay.entries) {
    const inTypes = e.types.includes('*') ? Object.keys(schema.componentTypes) : e.types;
    let hit = 0;
    const byType = new Map();
    for (const rec of scan.values()) {
      if (rec.key !== e.key) continue;
      const known = e.types.includes('*') || e.types.includes(rec.type);
      if (known) { hit += rec.count; } else {
        byType.set(rec.type, (byType.get(rec.type) || 0) + rec.count);
      }
    }
    line(`▸ ${e.key}    [since ${e.since || '?'} / ${e.date}]`);
    line(`    types   : ${e.types.join(', ')}${e.types.includes('*') ? `（展开 ${inTypes.length} 个类型）` : ''}`);
    line(`    source  : ${e.source}`);
    line(`    打击面  : ${hit === 0 ? '0 —— ⚠️ 死条目，建议删除' : hit + ' 处（生成器输出命中）'}`);
    if (byType.size) {
      line(`    越界使用: ${Array.from(byType).map(([t, c]) => `${t}×${c}`).join(', ')} —— 确认后补登记 types，或从该组件去掉`);
    }
    line('');
  }

  line('─'.repeat(78));
  line('残留漂移：生成器输出里「语料从未见过」且未登记的键');
  line('─'.repeat(78));
  const residual = Array.from(scan.values())
    .filter(rec => !schema.isKnownKey(rec.type, rec.key))
    .sort((a, b) => b.count - a.count);
  if (!residual.length) {
    line('✅ 无残留 —— 生成器输出与白名单一致');
  } else {
    const total = residual.reduce((s, r) => s + r.count, 0);
    line(`${residual.length} 个键 / ${total} 处。每条都要定性：设计器认 → 补 overlay；不认 → 改 builder 删掉。`);
    line('');
    line('次数  ' + '键'.padEnd(42) + '出现样例');
    for (const r of residual) {
      line(`${String(r.count).padStart(4)}  ${(r.type + '.' + r.key).padEnd(42)}${r.files.size}`);
    }
  }
  line('');
  line('提示: 语料本身 PROP002 恒为 0（白名单就是语料自己），');
  line('      所以 PROP002 只会在**新产物**上响 —— 它抓的就是「新产物越出历史」这件事。');
}

main();
