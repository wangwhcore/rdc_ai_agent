#!/usr/bin/env node
/**
 * 语料扫描器：扫描 MdFrontLayout 目录，统计组件类型与 property key 分布
 *
 * 用途：
 *   1. 为 check 的「未知组件类型 / 未知 property key」规则提供白名单依据
 *   2. 沉淀真实语料的 schema，避免手拍脑袋定白名单
 *
 * 用法：
 *   node scripts/surveyCorpus.js --input ../../MdFrontLayout
 *   node scripts/surveyCorpus.js --input ../../MdFrontLayout --json --out ../ir/schema.generated.json
 *   node scripts/surveyCorpus.js --input ../../MdFrontLayout --min-count 3
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { input: '../../MdFrontLayout', out: '', json: false, minCount: 1, quiet: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') args.input = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--quiet') args.quiet = true;
    else if (a === '--min-count') args.minCount = Number(argv[++i]) || 1;
  }
  return args;
}

/**
 * 统一读取 Layout JSON，兼容 value 为字符串或对象两种形态
 * @returns {{ok:true,layout:object,value:object,desktop:object}|{ok:false,reason:string}}
 */
function readLayout(filePath) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return { ok: false, reason: `JSON 解析失败: ${e.message}` };
  }
  let value;
  if (typeof raw.value === 'string') {
    try {
      value = JSON.parse(raw.value);
    } catch (e) {
      return { ok: false, reason: `value 反序列化失败: ${e.message}` };
    }
  } else {
    value = raw.value;
  }
  if (!value || !value.desktop) return { ok: false, reason: '缺少 value.desktop' };
  return { ok: true, layout: raw, value, desktop: value.desktop };
}

/** 深度遍历 layoutList 结构（region → rows → cols → components） */
function walkLayout(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach(n => walkLayout(n, visit));
    return;
  }
  visit(node);
  if (node.cols) walkLayout(node.cols, visit);
  if (node.rows) walkLayout(node.rows, visit);
  if (node.components) walkLayout(node.components, visit);
}

/**
 * 扫描一个目录，产出语料统计
 * @param {string} dir 布局目录
 * @returns {object} 统计结果
 */
function survey(dir) {
  const files = fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort();

  const componentTypes = {};   // type -> 出现次数
  const propertyKeys = {};     // "type.key" -> 出现次数
  const keysPerType = {};      // type -> { key -> count }
  const outerFields = {};
  const pageTypes = {};
  const containerTypes = {};
  const failures = [];
  const seenLayoutIds = new Set();
  let scanned = 0;

  const bump = (obj, k) => {
    obj[k] = (obj[k] || 0) + 1;
  };

  for (const f of files) {
    const res = readLayout(path.join(dir, f));
    if (!res.ok) {
      failures.push({ file: f, reason: res.reason });
      continue;
    }
    scanned++;
    const { layout, desktop } = res;

    for (const k of Object.keys(layout)) bump(outerFields, k);

    const pageType = (desktop.layoutInfo && desktop.layoutInfo.pageType) || '(none)';
    bump(pageTypes, pageType);

    const record = comp => {
      const t = comp && comp.type ? comp.type : '(none)';
      bump(componentTypes, t);
      if (!keysPerType[t]) keysPerType[t] = {};
      const prop = (comp && comp.property) || {};
      for (const k of Object.keys(prop)) {
        bump(propertyKeys, `${t}.${k}`);
        bump(keysPerType[t], k);
      }
    };

    for (const regionId of Object.keys(desktop.layoutList || {})) {
      seenLayoutIds.add(regionId);
      const rows = (desktop.layoutList[regionId] || {}).rows || [];
      walkLayout(rows, node => {
        if (node.type && (node.type === 'RowContainer' || node.type === 'ColContainer')) {
          bump(containerTypes, node.type);
        }
        if (node.property && node.property.id && node.cols === undefined && node.components === undefined) {
          record(node);
        }
      });
    }

    for (const comp of Object.values(desktop.components || {})) record(comp);
  }

  const sorted = obj =>
    Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]));

  return {
    generatedAt: new Date().toISOString(),
    sourceDir: path.resolve(dir),
    fileCount: files.length,
    scanned,
    failures,
    componentTypes: sorted(componentTypes),
    containerTypes: sorted(containerTypes),
    pageTypes: sorted(pageTypes),
    outerFields: sorted(outerFields),
    propertyKeys: sorted(propertyKeys),
    keysPerType,
  };
}

/** 从统计结果推导白名单：过滤低频噪音 */
function toSchema(result, minCount = 1) {
  const knownTypes = {};
  for (const [t, c] of Object.entries(result.componentTypes)) {
    if (t === '(none)') continue;
    if (c >= minCount) knownTypes[t] = { count: c, propertyKeys: [] };
  }
  for (const [t, keys] of Object.entries(result.keysPerType)) {
    if (!knownTypes[t]) continue;
    knownTypes[t].propertyKeys = Object.entries(keys)
      .filter(([, c]) => c >= minCount)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
  }
  return {
    generatedAt: result.generatedAt,
    source: result.sourceDir,
    sampleSize: result.scanned,
    minCount,
    componentTypes: knownTypes,
  };
}

/** 渲染为人类可读文本 */
function renderText(result) {
  const lines = [];
  lines.push(`语料目录: ${result.sourceDir}`);
  lines.push(`文件总数: ${result.fileCount}  成功解析: ${result.scanned}  失败: ${result.failures.length}`);
  lines.push('');
  lines.push(`-- 组件类型 (${Object.keys(result.componentTypes).length}) --`);
  for (const [t, c] of Object.entries(result.componentTypes)) lines.push(`${t}\t${c}`);
  lines.push('');
  lines.push(`-- 容器类型 --`);
  for (const [t, c] of Object.entries(result.containerTypes)) lines.push(`${t}\t${c}`);
  lines.push('');
  lines.push(`-- pageType 分布 --`);
  for (const [t, c] of Object.entries(result.pageTypes)) lines.push(`${t}\t${c}`);
  lines.push('');
  lines.push(`-- 外层字段 --`);
  for (const [t, c] of Object.entries(result.outerFields)) lines.push(`${t}\t${c}`);
  lines.push('');
  lines.push(`-- property key (${Object.keys(result.propertyKeys).length}) --`);
  for (const [t, c] of Object.entries(result.propertyKeys)) lines.push(`${t}\t${c}`);
  if (result.failures.length) {
    lines.push('');
    lines.push('-- 解析失败 --');
    for (const f of result.failures.slice(0, 20)) lines.push(`${f.file}\t${f.reason}`);
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.input)) {
    console.error(`目录不存在: ${args.input}`);
    process.exit(1);
  }
  const result = survey(args.input);
  const schema = toSchema(result, args.minCount);

  if (args.out) {
    const outPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const payload = args.json ? schema : result;
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
    if (!args.quiet) console.log(`已写入: ${outPath}`);
    return;
  }

  console.log(args.json ? JSON.stringify(schema, null, 2) : renderText(result));
}

module.exports = { survey, toSchema, renderText, readLayout, walkLayout };

if (require.main === module) main();
