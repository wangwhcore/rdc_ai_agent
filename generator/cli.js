#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { validate } = require('./builder/validator');
const { stringifyLayout } = require('./ir');
const { enforce, describe: describeGate } = require('./ir/jsonGate');

function showHelp() {
  console.log(`
Usage: node cli.js --input <dsl-file.js> --out <target-dir> [--name <filename>]

Options:
  --input                 DSL 脚本路径，必须导出一个 Layout JSON 对象或对象数组
  --out                   输出目录，默认当前目录
  --name                  输出文件名，默认使用 layoutJson.gid
  --check                 仅校验，不写入文件
  --allow-check-errors    落盘门禁的 check 环节降级为「只报不拦」（默认：被强制修订过则必须零 error）

落盘前会依次执行：
  1. DSL 层校验（builder/validator）
  2. 格式门禁（ir/jsonGate）：格式检查 → 强制修订 → 两道门复核
     · 尾随逗号 / 单引号 / 注释 / 未引号键 / 缺闭合符 / BOM / 裸换行 会被自动修掉
     · 修订后仍必须过「结构不变量」与「check 零 error」，否则拒绝写入
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

  // 落盘门禁：格式检查 → 强制修订 → 两道门复核
  //
  // 格式问题不该直接 fail：尾随逗号、单引号、少一个闭合括号改一个字符就能好，
  // 却会让平台运行时崩。所以这里默认「强制修订 + 复核」，而不是报错了事。
  const gates = results.map(({ layout }) => ({
    layout,
    gate: enforce(layout, {
      allowCheckErrors: args['allow-check-errors'] ? true : undefined,
    }),
  }));

  const rejected = gates.filter(g => !g.gate.ok);
  if (rejected.length) {
    for (const { layout, gate } of rejected) {
      console.error(`\n❌ 落盘门禁未通过: ${layout.name || layout.gid}`);
      for (const line of describeGate(gate)) console.error(line.replace(/^  /, '  '));
    }
    console.error('\n提示: 只有「补对位置的括号」才能救回结构错位的文件；');
    console.error('      缺整块内容时请重新生成，不要手工补 JSON。');
    process.exit(1);
  }

  for (const { layout, gate } of gates) {
    if (!gate.repaired) continue;
    console.log(`\n🔧 已强制修订: ${layout.name || layout.gid}`);
    for (const line of describeGate(gate)) console.log(line);
  }

  // 序列化自检（对修订后的对象）：拒绝生成「打不开」的文件
  const integrityFailures = [];
  for (const { gate } of gates) {
    const { problem } = stringifyLayout(gate.layout);
    if (problem) integrityFailures.push({ layout: gate.layout, problem });
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

  for (const { gate } of gates) {
    const layout = gate.layout;
    const fileName = args.name || `${layout.gid}.json`;
    const outPath = path.join(outDir, fileName);
    fs.writeFileSync(outPath, stringifyLayout(layout).text, 'utf-8');
    console.log(`📝 已生成: ${outPath}`);
  }
}

main();
