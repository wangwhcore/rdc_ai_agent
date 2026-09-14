#!/usr/bin/env node
/**
 * 双层 JSON 的「格式体检 + 强制修订」CLI
 *
 * 平台上的 Layout JSON 是**两层**的：
 *   外层对象 {... "value": "<一个 JSON 字符串>" ...}
 * 两层都可能因为手写/拼接/LLM 直出而带格式缺陷：尾随逗号、单引号、JSON 注释、
 * 未加引号的键、少一个闭合括号、BOM、字符串里塞了真实换行、键名重复……
 * 这类问题改一个字符就能好，却会让平台运行时崩，成本极不对称。
 *
 * ⚠️ 为什么要「受限强制修订」：
 *   只补闭合符能让一部分文件「变得可解析」，但补错位置会让 phone/pad 被塞进
 *   desktop、layoutInfo 被吞掉 —— 结构已经错位，运行时照样抛
 *     TypeError: Cannot read properties of undefined (reading 'field')
 *   可解析 ≠ 正确。所以修订后必须过两道门：
 *     A. 结构不变量：desktop 四件套齐全、设备节点不互相嵌套
 *     B. check 引擎零 error
 *   任何一道不过就**原样保留**并只输出诊断，让人工补缺失的内容。
 *
 * 用法：
 *   node scripts/repairValueJson.js <file.json|目录> [...]      # 默认 dry-run（体检）
 *   node scripts/repairValueJson.js <file.json> --write         # 落盘
 *   node scripts/repairValueJson.js <目录> --write --backup     # 落盘前写 .bak
 *   node scripts/repairValueJson.js <目录> --json               # 机器可读输出
 *
 * 修订引擎在 ir/jsonFormat（文本层）+ ir/jsonGate（门禁），本脚本只做 IO 与报告。
 */

const fs = require('fs');
const path = require('path');
const { enforce, describe: describeGate } = require('../ir/jsonGate');
const { hasJsonRepair } = require('../ir/jsonFormat');

/** 递归收集 .json 文件 */
function collect(target) {
  const st = fs.statSync(target);
  if (st.isFile()) return [target];
  const out = [];
  for (const name of fs.readdirSync(target).sort()) {
    const p = path.join(target, name);
    const s = fs.statSync(p);
    if (s.isDirectory()) out.push(...collect(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

function processFile(file, options) {
  const name = path.relative(process.cwd(), file) || path.basename(file);
  let text;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch (e) {
    return { file, name, ok: false, readError: e.message };
  }

  const result = enforce(text, { rawText: text });

  const entry = {
    file,
    name,
    ok: result.ok,
    repaired: result.repaired,
    repairMethods: result.repairMethods,
    steps: result.steps,
    warnings: result.warnings,
    blocked: result.blocked,
    checkErrors: result.check ? result.check.errorCount : null,
    checkTotal: result.check ? result.check.total : null,
    written: false,
  };

  if (!options.json) {
    console.log('');
    for (const line of describeGate(result, name)) console.log(line);
    if (result.check) {
      console.log(`  · check: error ${result.check.errorCount} / 共 ${result.check.total} 条`);
    }
  }

  if (result.ok && result.repaired && options.write) {
    try {
      if (options.backup) {
        fs.copyFileSync(file, `${file}.bak`);
        if (!options.json) console.log(`  · 已备份 -> ${path.basename(file)}.bak`);
      }
      fs.writeFileSync(file, `${JSON.stringify(result.layout, null, 2)}\n`, 'utf-8');
      entry.written = true;
      if (!options.json) console.log('  · ✅ 已写入（内层可解析 + 结构完整 + check 零 error）');
    } catch (e) {
      entry.writeError = e.message;
      if (!options.json) console.log(`  · ⛔ 写入失败: ${e.message}`);
    }
  } else if (result.ok && result.repaired && !options.write && !options.json) {
    console.log('  · 🔎 dry-run：可安全修订，加 --write 才会落盘');
  }

  return entry;
}

function main() {
  const argv = process.argv.slice(2);
  const options = {
    write: argv.includes('--write'),
    backup: argv.includes('--backup'),
    json: argv.includes('--json'),
  };
  const targets = argv.filter(a => !a.startsWith('--'));

  if (!targets.length) {
    console.log('用法: node scripts/repairValueJson.js <file.json|目录> [...] [--write] [--backup] [--json]');
    process.exit(1);
  }

  if (!options.json) {
    console.log(`JSON 格式体检${options.write ? ' + 强制修订（落盘）' : '（dry-run）'}`);
    console.log(`修订引擎: ${hasJsonRepair() ? 'ir/jsonFormat（jsonrepair 可用，覆盖宽松语法与截断）' : 'ir/jsonFormat（内置兜底，jsonrepair 未安装）'}`);
  }

  const files = [];
  for (const t of targets) {
    if (!fs.existsSync(t)) {
      console.error(`\n⛔ 路径不存在: ${t}`);
      continue;
    }
    files.push(...collect(t));
  }

  const entries = files.map(f => processFile(f, options));

  const cleanCount = entries.filter(e => e.ok && !e.repaired).length;
  const fixedCount = entries.filter(e => e.ok && e.repaired).length;
  const writtenCount = entries.filter(e => e.written).length;
  const rejected = entries.filter(e => !e.ok);

  const summary = {
    total: entries.length,
    clean: cleanCount,
    repairable: fixedCount,
    written: writtenCount,
    rejected: rejected.length,
    jsonrepairAvailable: hasJsonRepair(),
    rejectedFiles: rejected.map(e => ({ name: e.name, stage: e.blocked && e.blocked.stage, reason: e.blocked && e.blocked.reason })),
  };

  if (options.json) {
    console.log(JSON.stringify({ summary, entries }, null, 2));
  } else {
    console.log('\n────────────────────────────────────────');
    console.log(`共 ${summary.total} 个文件`);
    console.log(`  格式本就合法      : ${cleanCount}`);
    console.log(`  存在格式缺陷      : ${fixedCount}${options.write ? `（已写入 ${writtenCount}）` : '（dry-run，未落盘）'}`);
    console.log(`  拒绝修订（需人工）: ${rejected.length}`);
    if (rejected.length) {
      for (const e of rejected) console.log(`      ⛔ ${e.name}  [${e.blocked.stage}] ${e.blocked.reason}`);
    }
    if (!options.write && fixedCount) console.log('\n加 --write 落盘（建议同时加 --backup）。');
  }

  process.exit(rejected.length ? 1 : 0);
}

main();
