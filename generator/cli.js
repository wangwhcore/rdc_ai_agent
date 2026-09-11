#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { validate } = require('./builder/validator');

function showHelp() {
  console.log(`
Usage: node cli.js --input <dsl-file.js> --out <target-dir> [--name <filename>]

Options:
  --input   DSL 脚本路径，必须导出一个 Layout JSON 对象或对象数组
  --out     输出目录，默认当前目录
  --name    输出文件名，默认使用 layoutJson.gid
  --check   仅校验，不写入文件
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[key] = argv[i + 1];
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.input) {
    showHelp();
    process.exit(1);
  }

  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`输入文件不存在: ${inputPath}`);
    process.exit(1);
  }

  // 清除 require 缓存，支持二次修改后重新生成
  delete require.cache[require.resolve(inputPath)];
  const generated = require(inputPath);

  const layouts = Array.isArray(generated) ? generated : [generated];

  const results = [];
  for (const layout of layouts) {
    const result = validate(layout);
    results.push({ layout, result });
  }

  const allOk = results.every(r => r.result.ok);
  if (!allOk) {
    for (const { layout, result } of results) {
      console.error(`\n校验失败: ${layout.name || layout.gid}`);
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
    }
    process.exit(1);
  }

  console.log(`✅ 校验通过，共 ${layouts.length} 个 Layout`);

  if (args.check) {
    process.exit(0);
  }

  const outDir = path.resolve(args.out || '.');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  for (const layout of layouts) {
    const fileName = args.name || `${layout.gid}.json`;
    const outPath = path.join(outDir, fileName);
    fs.writeFileSync(outPath, JSON.stringify(layout, null, 2), 'utf-8');
    console.log(`📝 已生成: ${outPath}`);
  }
}

main();
