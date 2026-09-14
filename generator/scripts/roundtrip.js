#!/usr/bin/env node
/**
 * 往返验证器：对语料目录下每一个 Layout JSON 执行
 *   Layout JSON ──lift──▶ Page IR ──emit──▶ Layout JSON ──lift──▶ Page IR
 * 并校验 IR 幂等性与 value 字符串的逐字节一致性。
 *
 * 用法：
 *   node scripts/roundtrip.js --input ../../MdFrontLayout
 *   node scripts/roundtrip.js --input ../../MdFrontLayout --limit 20 --show 5
 *   node scripts/roundtrip.js --input ../../MdFrontLayout --out roundtrip-report.json
 *   node scripts/roundtrip.js --input ../generated --fail-fast
 */

const fs = require('fs');
const path = require('path');
const { roundTrip } = require('../ir');
const { readLayout } = require('./surveyCorpus');

function parseArgs(argv) {
  const args = {
    input: '../../MdFrontLayout', out: '', limit: 0, show: 3, failFast: false, quiet: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') args.input = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]) || 0;
    else if (a === '--show') args.show = Number(argv[++i]) || 0;
    else if (a === '--fail-fast') args.failFast = true;
    else if (a === '--quiet') args.quiet = true;
  }
  return args;
}

/** 收集目录下所有 json 文件（含一层子目录） */
function collectFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else if (entry.name.endsWith('.json') && !entry.name.startsWith('.')) out.push(full);
  }
  return out.sort();
}

/**
 * 对目录执行往返验证
 * @returns {{total:number, passed:number, failed:Array, byteExact:number, elapsed:number}}
 */
function runRoundTrip(dir, options = {}) {
  const started = Date.now();
  const files = collectFiles(dir);
  const limit = options.limit || 0;
  const target = limit ? files.slice(0, limit) : files;
  const failed = [];
  let passed = 0;
  let byteExact = 0;

  for (const file of target) {
    const rel = path.relative(dir, file);
    const loaded = readLayout(file);
    if (!loaded.ok) {
      failed.push({ file: rel, stage: 'read', reason: loaded.reason });
      if (options.failFast) break;
      continue;
    }
    try {
      const res = roundTrip(loaded.layout);
      if (!res.irStable) {
        failed.push({ file: rel, stage: 'ir-idempotence', reason: 'lift(emit(lift(x))) 与 lift(x) 不等价' });
        if (options.failFast) break;
        continue;
      }
      if (!res.byteExact) {
        failed.push({ file: rel, stage: 'value-bytes', reason: 'value 字符串与原文件不一致' });
        if (options.failFast) break;
        continue;
      }
      byteExact++;
      passed++;
    } catch (e) {
      failed.push({ file: rel, stage: 'exception', reason: e.message });
      if (options.failFast) break;
    }
  }

  return {
    dir: path.resolve(dir),
    total: target.length,
    passed,
    failed: failed.length,
    byteExact,
    elapsed: Date.now() - started,
    failures: failed,
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.input)) {
    console.error(`目录不存在: ${args.input}`);
    process.exit(1);
  }
  const report = runRoundTrip(args.input, { limit: args.limit, failFast: args.failFast });

  if (!args.quiet) {
    console.log(`语料目录: ${report.dir}`);
    console.log(`用例: ${report.total}  通过: ${report.passed}  失败: ${report.failed}  value 逐字节一致: ${report.byteExact}  耗时: ${report.elapsed}ms`);
    if (report.failures.length && args.show) {
      console.log('');
      console.log('-- 失败样例 --');
      for (const f of report.failures.slice(0, args.show)) {
        console.log(`${f.file}\t[${f.stage}] ${f.reason}`);
      }
    }
  }

  if (args.out) {
    const outPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
    if (!args.quiet) console.log(`\n已写入报告: ${outPath}`);
  }

  process.exit(report.failed > 0 ? 1 : 0);
}

module.exports = { runRoundTrip, collectFiles };

if (require.main === module) main();
