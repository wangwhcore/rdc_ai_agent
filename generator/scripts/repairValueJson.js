#!/usr/bin/env node
/**
 * 双层 JSON 的 value 层诊断与「受限修复」
 *
 * 平台上的 Layout JSON 是**两层**的：
 *   外层对象 {... "value": "<一个 JSON 字符串>" ...}
 * value 这一层常常是手写/字符串拼出来的，于是有两类高发问题：
 *
 *   1) 裸控制字符：表达式里的换行写成真实换行而不是 \n 两字符。
 *      外层仍能解析（外层文本里是 \n 转义），但运行时 JSON.parse(value) 直接崩。
 *   2) 括号缺口：少一个 ] 或 }，解析器报
 *      "Expected ',' or ']' after array element" / "Unexpected end of JSON input"。
 *
 * ⚠️ 为什么要「受限」：
 * 只补闭合符能让一部分文件「变得可解析」，但补错位置会让 `phone`/`pad` 被塞进
 * `desktop`、`layoutInfo` 被吞掉 —— 结构已经错位，运行时照样抛
 *   TypeError: Cannot read properties of undefined (reading 'field')
 * 可解析 ≠ 正确。所以这里修完必须通过两道门：
 *   A. 结构不变量：desktop 四件套齐全、设备节点不互相嵌套
 *   B. check 引擎零 error
 * 任何一道不过，就**原样保留**并只输出诊断，让人工去补缺失的内容。
 *
 * 用法：
 *   node scripts/repairValueJson.js <file.json> [more.json...] [--write] [--backup]
 * 默认 dry-run，只有显式 --write 才落盘。
 */

const fs = require('fs');
const path = require('path');
const { escapeRawControlChars } = require('../ir/jsonIntegrity');

const MAX_PATCHES = 30;
const DEVICES = ['desktop', 'pad', 'phone'];
const REQUIRED_DESKTOP = ['layoutInfo', 'layoutList', 'components', 'subscribes'];

/** 解析失败时判断该补哪个字符 */
function closerFor(message, text, pos) {
  if (/Expected ',' or '\]' after array element/.test(message)) return ']';
  if (/Expected ',' or '\}' after (last )?property/.test(message)) return '}';
  if (/Expected double-quoted property name/.test(message)) return '}';
  const next = (text.slice(pos).match(/\S/) || [''])[0];
  if (next === '}') return ']';
  if (next === ']') return '}';
  return null;
}

/** 用括号栈算出还需要补的闭合符（用于 Unexpected end of JSON input） */
function pendingClosers(text) {
  const stack = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  return stack.slice().reverse().map(c => (c === '{' ? '}' : ']')).join('');
}

/** 结构不变量：只补闭合符最常见的破坏形态都在这里被拦住 */
function checkInvariants(text) {
  const problems = [];
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return { ok: false, problems: [`内层仍不可解析: ${e.message}`], doc: null };
  }
  const d = doc && doc.desktop;
  if (!d) return { ok: false, problems: ['缺少 desktop 节点'], doc };
  for (const k of REQUIRED_DESKTOP) if (!(k in d)) problems.push(`desktop 缺少 ${k}`);
  for (const dev of DEVICES) {
    if (!d[dev] || typeof d[dev] !== 'object') continue;
    for (const other of DEVICES) {
      if (dev !== other && d[dev][other]) problems.push(`desktop.${dev} 里嵌入了 ${other}（闭合符补错了位置）`);
    }
  }
  return { ok: problems.length === 0, problems, doc };
}

/** 逐步补齐，每一步都记录上下文，便于人工判断是否真的补对了 */
function repairValue(rawValue) {
  const patches = [];
  if (typeof rawValue !== 'string') {
    return { ok: false, text: rawValue, patches, controlChars: 0, error: 'value 不是字符串' };
  }
  const esc = escapeRawControlChars(rawValue);
  let text = esc.text;
  const controlChars = esc.replaced || 0;

  let lastError = null;
  for (let i = 0; i < MAX_PATCHES; i++) {
    try {
      JSON.parse(text);
      return { ok: true, text, patches, controlChars };
    } catch (e) {
      lastError = e;
      if (/Unexpected end of JSON input/.test(e.message)) {
        const closers = pendingClosers(text);
        text += closers;
        patches.push({ at: text.length, insert: closers, why: 'Unexpected end of JSON input', context: '(文件结尾)' });
        continue;
      }
      const m = e.message.match(/position (\d+)/);
      if (!m) return { ok: false, text, patches, controlChars, error: e.message };
      const pos = Number(m[1]);
      const closer = closerFor(e.message, text, pos);
      if (!closer) return { ok: false, text, patches, controlChars, error: e.message };
      patches.push({
        at: pos,
        insert: closer,
        why: e.message,
        context: text.slice(Math.max(0, pos - 70), pos + 40),
      });
      text = text.slice(0, pos) + closer + text.slice(pos);
    }
  }
  return {
    ok: false, text, patches, controlChars,
    error: lastError ? lastError.message : '补丁次数超限',
  };
}

function reportPatches(patches) {
  for (const p of patches) {
    console.log(`    · 位置 ${p.at} 插入 ${JSON.stringify(p.insert)}  <- ${p.why}`);
    if (p.context && p.context !== '(文件结尾)') {
      console.log(`      上下文: ${p.context.replace(/\n/g, '\\n')}`);
    }
  }
}

function processFile(file, write, backup) {
  const name = path.basename(file);
  let outer;
  try {
    outer = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    console.log(`\n${name}\n  ⛔ 外层 JSON 本身就不可解析: ${e.message}`);
    console.log('     （外层损坏属另一类问题，需要人工修复，本脚本不动它）');
    return false;
  }

  console.log(`\n${name}`);
  const r = repairValue(outer.value);
  console.log(`  裸控制字符（真实换行/制表）: ${r.controlChars} 处`);
  console.log(`  括号缺口: ${r.patches.length} 处`);
  reportPatches(r.patches);

  if (!r.ok) {
    console.log(`  ⛔ 无法补齐为合法 JSON，原样保留: ${r.error}`);
    return false;
  }
  if (!r.patches.length && !r.controlChars) {
    console.log('  ✅ 本来就合法，无需改动');
    return true;
  }

  // 门 A：结构不变量
  const inv = checkInvariants(r.text);
  if (!inv.ok) {
    console.log('  ⛔ 补齐后能解析，但结构不变量不过关 —— 拒绝写入：');
    for (const p of inv.problems) console.log(`       - ${p}`);
    console.log('     说明这里缺的不只是闭合符，而是整块内容，只能人工补或重新生成。');
    return false;
  }

  // 门 B：check 引擎零 error
  let checkRes = null;
  try {
    checkRes = require('../check').run({ ...outer, value: r.text });
  } catch (e) {
    console.log(`  ⛔ check 无法执行，拒绝写入: ${e.message}`);
    return false;
  }
  const errors = checkRes.diagnostics.filter(d => d.severity === 'error');
  if (errors.length) {
    console.log(`  ⛔ 补齐后 check 仍有 ${errors.length} 条 error —— 拒绝写入：`);
    for (const e of errors.slice(0, 6)) console.log(`       - [${e.code}] ${e.message}`);
    if (errors.length > 6) console.log(`       ... 另有 ${errors.length - 6} 条`);
    return false;
  }

  if (write) {
    if (backup) {
      fs.copyFileSync(file, `${file}.bak`);
      console.log(`  已备份 -> ${name}.bak`);
    }
    outer.value = r.text;
    fs.writeFileSync(file, `${JSON.stringify(outer, null, 2)}\n`, 'utf-8');
    console.log(`  ✅ 已写入（内层可解析 + 结构完整 + check 零 error）`);
  } else {
    console.log('  🔎 dry-run：两道门都通过，可以安全修复');
    console.log('     加 --write 才会落盘');
  }
  return true;
}

function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const backup = argv.includes('--backup');
  const files = argv.filter(a => !a.startsWith('--'));

  if (!files.length) {
    console.log('用法: node scripts/repairValueJson.js <file.json> [...] [--write] [--backup]');
    process.exit(1);
  }
  let ok = 0;
  for (const f of files) {
    if (!fs.existsSync(f)) { console.log(`\n${f}\n  ⛔ 文件不存在`); continue; }
    if (processFile(path.resolve(f), write, backup)) ok++;
  }
  console.log(`\n处理完成: ${ok}/${files.length} 个文件通过${write ? '（已写入）' : '（dry-run）'}`);
}

main();
