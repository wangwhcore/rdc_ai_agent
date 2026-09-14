#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { validate } = require('./builder/validator');
const { stringifyLayout } = require('./ir');

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

  // 落盘前守门：值层 JSON 必须可解析，拒绝生成「打不开」的文件
  const integrityFailures = [];
  for (const { layout } of results) {
    const { problem } = stringifyLayout(layout);
    if (problem) integrityFailures.push({ layout, problem });
  }
  if (integrityFailures.length) {
    for (const { layout, problem } of integrityFailures) {
      console.error(`\n❌ 序列化自检失败: ${layout.name || layout.gid}`);
      console.error(`   ${problem}`);
      console.error('   提示: value 应由 JSON.stringify(desktop对象) 生成，不要手写拼接；');
      console.error('         多行表达式里的换行必须写成 \\n 两字符转义。');
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
    fs.writeFileSync(outPath, stringifyLayout(layout).text, 'utf-8');
    console.log(`📝 已生成: ${outPath}`);
  }
}

main();
