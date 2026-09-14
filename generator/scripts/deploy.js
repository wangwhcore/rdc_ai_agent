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
const { validateLayoutJson } = require('../ir/jsonIntegrity');

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

function readJson(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(text);
  // 部署的是 Layout JSON：值层也必须能解析，否则运行时 JSON.parse(value) 会崩
  const probe = validateLayoutJson(data);
  if (!probe.ok) {
    const a = probe.analysis || {};
    throw new Error(`${filePath} 的 value 不是合法 JSON: ${a.message || probe.error.message}${a.hint ? `\n  ${a.hint}` : ''}`);
  }
  return data;
}

function writeJson(filePath, data) {
  // MdFunction 记录没有 value 字段；只有 Layout JSON 才需要验「值层 JSON」
  const isLayout = data && typeof data === 'object'
    && Object.prototype.hasOwnProperty.call(data, 'value');
  if (isLayout) {
    const { text, problem } = stringifyLayout(data);
    if (problem) throw new Error(`拒绝写入 ${filePath}: ${problem}`);
    fs.writeFileSync(filePath, text, 'utf-8');
    return;
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
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
};
