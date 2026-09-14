#!/usr/bin/env node
/**
 * 规则标定器：在真实语料上跑 check，统计每条规则的真实触发情况
 *
 * 用途：new 规则写完之后，必须先在语料上验证误报率。
 *   「错误」级别在语料上应当为 0 —— 否则说明规则把设计器的正常习惯当成了缺陷。
 *
 * 用法：
 *   node scripts/calibrate.js --input ../../MdFrontLayout
 *   node scripts/calibrate.js --input ../../MdFrontLayout --samples 3 --fix-suggest
 *   node scripts/calibrate.js --input ../../MdFrontLayout --out calibration-report.json
 *   node scripts/calibrate.js --input ../generated   # 校验生成器产物
 */

const fs = require('fs');
const path = require('path');
const { run, formatBatchSummary, summarize } = require('../check');
const { collectFiles } = require('./roundtrip');
const { readLayout } = require('./surveyCorpus');

function parseArgs(argv) {
  const args = { input: '../../MdFrontLayout', out: '', samples: 0, quiet: false, strict: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') args.input = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--samples') args.samples = Number(argv[++i]) || 0;
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--strict') args.strict = true;
  }
  return args;
}

/**
 * 对目录执行标定
 * @returns {object} 批次结果 + 样本
 */
function calibrate(dir, options = {}) {
  const files = collectFiles(dir);
  const items = [];
  const unreadable = [];
  for (const f of files) {
    const loaded = readLayout(f);
    const rel = path.relative(dir, f);
    if (!loaded.ok) {
      unreadable.push({ name: rel, reason: loaded.reason });
      continue;
    }
    items.push({ name: rel, layout: loaded.layout });
  }

  const batch = run ? require('../check').runBatch(items, { strict: !!options.strict }) : null;

  // 收集每条规则的样例 + 级别矩阵，便于人工判断是不是误报
  const samplesByCode = {};
  const severityByCode = {};
  for (const r of batch.results) {
    for (const d of r.diagnostics) {
      if (!samplesByCode[d.code]) samplesByCode[d.code] = [];
      if (!severityByCode[d.code]) severityByCode[d.code] = { error: 0, warning: 0, info: 0 };
      severityByCode[d.code][d.severity]++;
      if (samplesByCode[d.code].length < 8) {
        samplesByCode[d.code].push({
          file: r.name, path: d.path, message: d.message,
          severity: d.severity, hint: d.hint,
        });
      }
    }
  }

  return { dir: path.resolve(dir), batch, unreadable, samplesByCode, severityByCode };
}

/** 渲染 规则 × 级别 的标定矩阵 */
function formatMatrix(batch, severityByCode) {
  const lines = ['规则\t错误\t告警\t建议\t合计'];
  const rows = Object.entries(batch.codeTotals).sort((a, b) => b[1] - a[1]);
  for (const [code, total] of rows) {
    const s = severityByCode[code] || { error: 0, warning: 0, info: 0 };
    lines.push(`${code}\t${s.error}\t${s.warning}\t${s.info}\t${total}`);
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.input)) {
    console.error(`目录不存在: ${args.input}`);
    process.exit(1);
  }
  const report = calibrate(args.input, { strict: args.strict });

  if (!args.quiet) {
    console.log(`语料目录: ${report.dir}`);
    if (report.unreadable.length) {
      console.log(`无法解析: ${report.unreadable.length} 个（已跳过）`);
    }
    console.log('');
    console.log(formatBatchSummary(report.batch));
    console.log('');
    console.log('-- 规则 × 级别矩阵 --');
    console.log(formatMatrix(report.batch, report.severityByCode));

    if (args.samples) {
      console.log('');
      console.log('-- 规则样例 --');
      const codes = Object.entries(report.batch.codeTotals);
      for (const [code] of codes) {
        console.log(`\n[${code}]`);
        for (const s of (report.samplesByCode[code] || []).slice(0, args.samples)) {
          console.log(`  ${s.file}: ${s.path}`);
          console.log(`    ${s.message}`);
        }
      }
    }
  }

  if (args.out) {
    const outPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          dir: report.dir,
          total: report.batch.total,
          passed: report.batch.passed,
          failed: report.batch.failed,
          severityTotals: report.batch.severityTotals,
          codeTotals: report.batch.codeTotals,
          samplesByCode: report.samplesByCode,
          unreadable: report.unreadable,
        },
        null, 2
      ),
      'utf8'
    );
    if (!args.quiet) console.log(`\n已写入报告: ${outPath}`);
  }

  process.exit(report.batch.severityTotals.error > 0 ? 1 : 0);
}

module.exports = { calibrate };

if (require.main === module) main();
