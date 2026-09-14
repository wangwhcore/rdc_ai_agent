/**
 * 部署脚本：把生成的 Layout JSON 写入项目 MdFrontLayout/MdFunction
 *
 * 用法：
 *   node scripts/deploy.js --layout path/to/generated/layout.json
 *                          [--layoutDir ../../MdFrontLayout]
 *                          [--functionDir ../../MdFunction]
 *                          [--createFunction]
 *                          [--parentGid xxx]
 *                          [--code xxx]
 *                          [--sequence 0]
 */

const fs = require('fs');
const path = require('path');
const { stringifyLayout } = require('../ir');
const { enforce, describe: describeGate, isLayoutJson } = require('../ir/jsonGate');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith('--')) {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key.slice(2)] = next;
        i++;
      } else {
        args[key.slice(2)] = true;
      }
    }
  }
  return args;
}

/**
 * 读入并过「格式门禁」。
 *
 * 为什么要修而不是直接拒绝：
 *   目标目录里的文件往往是人工/历史产物，尾随逗号、少一个闭合括号这类问题
 *   改一个字符就能好，却会让运行时 JSON.parse(value) 直接崩。
 *   所以这里先强制修订，再复核门 A（结构不变量）+ 门 B（check 零 error）。
 *
 * ⚠️ 只补闭合符能让文件「变得可解析」，补错位置会把 phone/pad 塞进 desktop、
 *    把 layoutInfo 吞掉 —— 结构错位的文件一律拒绝，交给人工或重新生成。
 */
function readJson(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const result = enforce(text, { rawText: text });
  if (!result.ok) {
    throw new Error(`拒绝读取 ${filePath}：未通过落盘门禁\n${describeGate(result).join('\n')}`);
  }
  for (const line of result.steps) console.log(`  🔧 ${path.basename(filePath)}: ${line}`);
  for (const w of result.warnings) console.log(`  ⚠️  ${path.basename(filePath)}: ${w}`);
  return result.layout;
}

function writeJson(filePath, data) {
  // MdFunction 记录没有 value 字段，不套用页面级门禁
  if (!isLayoutJson(data)) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return;
  }

  const result = enforce(data, { rawText: null });
  if (!result.ok) {
    throw new Error(`拒绝写入 ${filePath}：未通过落盘门禁\n${describeGate(result).join('\n')}`);
  }
  const { text, problem } = stringifyLayout(result.layout);
  if (problem) throw new Error(`拒绝写入 ${filePath}: ${problem}`);
  fs.writeFileSync(filePath, text, 'utf-8');
}

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function deployLayout(layoutJson, layoutDir) {
  if (!layoutJson.gid) {
    throw new Error('Layout JSON 缺少 gid');
  }
  ensureDir(layoutDir);
  const filePath = path.join(layoutDir, `${layoutJson.gid}.json`);
  writeJson(filePath, layoutJson);
  return filePath;
}

function createFunctionRecord(layoutJson, options) {
  const {
    parentGid,
    code,
    sequence = 0,
    functionDir,
    existingFunction,
  } = options;

  const functionGid = layoutJson.functionGid;
  if (!functionGid) {
    throw new Error('Layout JSON 缺少 functionGid');
  }

  ensureDir(functionDir);
  const filePath = path.join(functionDir, `${functionGid}.json`);

  const nowStr = now();
  const base = existingFunction || {};

  const record = {
    appGid: layoutJson.appGid || base.appGid || '1766F6ACFAB00B',
    branch: layoutJson.branch || base.branch || 'master',
    code: code || base.code || functionGid,
    createBy: base.createBy || 'ai',
    createTime: base.createTime || nowStr,
    defaultActions: base.defaultActions !== undefined ? base.defaultActions : true,
    desc: base.desc || '',
    enabled: base.enabled !== undefined ? base.enabled : 1,
    frontId: layoutJson.frontId || base.frontId || functionGid,
    gid: functionGid,
    icon: base.icon || '',
    isSystem: base.isSystem !== undefined ? base.isSystem : 1,
    lastModifiedBy: 'ai',
    lastModifyTime: nowStr,
    layoutCount: base.layoutCount || '0',
    logicDelete: base.logicDelete || 0,
    name: layoutJson.name || base.name || '未命名功能',
    parentGid: parentGid || base.parentGid || '',
    productGid: layoutJson.productGid || base.productGid || 'PJ181A490E5D4001',
    projectGid: layoutJson.projectGid || base.projectGid || 'PJ181A490E5D4001',
    remark: base.remark || '',
    sequence: base.sequence !== undefined ? base.sequence : sequence,
    state: base.state !== undefined ? base.state : -1,
    url: base.url || '',
    viewScopeGid: base.viewScopeGid || '',
    virtual: base.virtual || 0,
  };

  writeJson(filePath, record);
  return filePath;
}

function main() {
  const args = parseArgs(process.argv);
  const layoutPath = args.layout;
  if (!layoutPath) {
    console.error('用法：node scripts/deploy.js --layout path/to/layout.json [--layoutDir ../../MdFrontLayout] [--functionDir ../../MdFunction] [--createFunction] [--parentGid xxx] [--code xxx] [--sequence 0]');
    process.exit(1);
  }

  const cwd = process.cwd();
  const layoutDir = path.resolve(cwd, args.layoutDir || '../../MdFrontLayout');
  const functionDir = path.resolve(cwd, args.functionDir || '../../MdFunction');

  const layoutJson = readJson(path.resolve(cwd, layoutPath));

  const layoutFile = deployLayout(layoutJson, layoutDir);
  console.log(`✅ Layout 已部署: ${layoutFile}`);

  if (args.createFunction) {
    let existingFunction = null;
    if (layoutJson.functionGid) {
      const functionFile = path.join(functionDir, `${layoutJson.functionGid}.json`);
      if (fs.existsSync(functionFile)) {
        existingFunction = readJson(functionFile);
      }
    }

    const functionFile = createFunctionRecord(layoutJson, {
      parentGid: args.parentGid,
      code: args.code,
      sequence: args.sequence !== undefined ? Number(args.sequence) : 0,
      functionDir,
      existingFunction,
    });
    console.log(`✅ Function 已同步: ${functionFile}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  deployLayout,
  createFunctionRecord,
  // 导出以便测试「读入/写入都过格式门禁」（main 仍由 require.main 守卫，import 不会执行）
  readJson,
  writeJson,
  parseArgs,
};
