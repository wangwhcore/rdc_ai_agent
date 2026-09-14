/**
 * 批量反解析：把 MdFrontLayout 目录下的所有 Layout JSON 转换为 DSL 脚本
 *
 * 用法：
 *   node scripts/batchParseDesigner.js --input ../../MdFrontLayout --out ../../parsed-dsl
 *
 * 输出文件按原文件名命名，如 xxx.json -> xxx.js
 */

const fs = require('fs');
const path = require('path');
const { designerToConfig, COMPONENT_TYPE_MAP } = require('../parser/designerToConfig');

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

function fieldConfigToDSL(cfg) {
  const { type, field, label, options = {} } = cfg;
  const opts = { ...options };
  const readonly = opts.readonly;
  delete opts.readonly;

  const optEntries = Object.entries(opts)
    .filter(([_, v]) => v !== undefined && v !== '' && JSON.stringify(v) !== '{}')
    .map(([k, v]) => {
      if (typeof v === 'string') return `${k}: ${JSON.stringify(v)}`;
      return `${k}: ${JSON.stringify(v)}`;
    });

  let expr = `${type}('${field}', ${JSON.stringify(label)}${optEntries.length ? ', { ' + optEntries.join(', ') + ' }' : ''})`;
  if (readonly) expr += '.readonly()';
  return expr;
}

function configToDSLScript(pageType, config) {
  const imports = new Set(['buildListPage', 'buildAddEditPage', 'buildViewPage', 'buildSimpleForm']);
  const fieldTypes = new Set();

  if (Array.isArray(config.fields)) {
    for (const f of config.fields) {
      if (f && f.type) fieldTypes.add(f.type);
    }
  }

  for (const t of fieldTypes) {
    imports.add(t);
  }

  if (pageType === 'list') {
    imports.add('column');
    imports.add('queryField');
  }

  const importList = [...imports].sort();

  let script = `const { ${importList.join(', ')} } = require('../index');\n\n`;

  if (pageType === 'list') {
    script += generateListScript(config);
  } else if (pageType === 'add' || pageType === 'addEdit') {
    script += generateFormScript('buildAddEditPage', config);
  } else if (pageType === 'view') {
    script += generateFormScript('buildViewPage', config);
  } else if (pageType === 'simple') {
    script += generateFormScript('buildSimpleForm', config);
  } else {
    script += generateFormScript('buildAddEditPage', config);
  }

  return script;
}

function generateListScript(config) {
  let script = '';

  if (Array.isArray(config.columns) && config.columns.length) {
    script += 'const columns = [\n';
    for (const c of config.columns) {
      const optEntries = [];
      if (c.width) optEntries.push(`width: ${c.width}`);
      if (c.fuzzyQuery) optEntries.push(`fuzzyQuery: true`);
      if (c.tag) optEntries.push(`tag: ${JSON.stringify(c.tag)}`);
      if (c.sort) optEntries.push(`sort: ${JSON.stringify(c.sort)}`);
      script += `  column('${c.field}', ${JSON.stringify(c.headerName)}${optEntries.length ? ', { ' + optEntries.join(', ') + ' }' : ''}),\n`;
    }
    script += '];\n\n';
  }

  if (Array.isArray(config.queryFields) && config.queryFields.length) {
    script += 'const queryFields = [\n';
    for (const q of config.queryFields) {
      const optEntries = [];
      if (q.label) optEntries.push(`label: ${JSON.stringify(q.label)}`);
      if (q.placeholder) optEntries.push(`placeholder: ${JSON.stringify(q.placeholder)}`);
      if (q.dict) optEntries.push(`dict: ${JSON.stringify(q.dict)}`);
      if (q.colSpan) optEntries.push(`colSpan: ${q.colSpan}`);
      script += `  queryField('${q.field}', ${JSON.stringify(q.fieldType)}, ${JSON.stringify(q.queryType)}${optEntries.length ? ', { ' + optEntries.join(', ') + ' }' : ''}),\n`;
    }
    script += '];\n\n';
  }

  script += 'module.exports = buildListPage({\n';
  script += `  pageName: ${JSON.stringify(config.pageName || '列表页')},\n`;
  script += `  serverName: ${JSON.stringify(config.serverName || 'mdgeneric')},\n`;
  script += `  listUrl: ${JSON.stringify(config.listUrl || '/example/list')},\n`;
  script += `  functionGid: ${JSON.stringify(config.functionGid || '')},\n`;

  // 跨布局引用：从源布局的事件表达式里还原（frontId 语义，详见 builder/events.js）
  if (config.addEditPageFrontId) {
    script += `  addEditPageFrontId: ${JSON.stringify(config.addEditPageFrontId)},\n`;
  } else {
    script += '  // TODO 源布局里没有可用的跳转目标，请补上新增/编辑页布局的 frontId\n';
    script += `  addEditPageFrontId: '00000000000000000000000000000000',\n`;
  }
  if (config.confirmModalFrontId) {
    script += `  confirmModalFrontId: ${JSON.stringify(config.confirmModalFrontId)},\n`;
  } else {
    // 没有弹窗引用就不要声明 delete，否则生成期守门会直接抛 E_LAYOUT_REF
    script += "  rowOperations: ['edit'],\n";
  }
  script += `  rowKey: ${JSON.stringify(config.rowKey || 'id')},\n`;
  if (config.columns) script += '  columns,\n';
  if (config.queryFields) script += '  queryFields,\n';
  script += '});\n';

  return script;
}

function generateFormScript(builderName, config) {
  let script = '';

  if (Array.isArray(config.fields) && config.fields.length) {
    script += 'const fields = [\n';
    for (const f of config.fields) {
      script += `  ${fieldConfigToDSL(f)},\n`;
    }
    script += '];\n\n';
  }

  script += `module.exports = ${builderName}({\n`;
  script += `  pageName: ${JSON.stringify(config.pageName || '表单页')},\n`;
  script += `  functionGid: ${JSON.stringify(config.functionGid || '')},\n`;
  if (config.fields) script += '  fields,\n';
  script += '});\n';

  return script;
}

async function main() {
  const args = parseArgs(process.argv);
  const inputDir = args.input || '../../MdFrontLayout';
  const outDir = args.out || '../../parsed-dsl';

  if (!fs.existsSync(inputDir)) {
    console.error(`输入目录不存在: ${inputDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.json'));
  let success = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(inputDir, file);
    try {
      const layoutJson = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const { pageType, config } = designerToConfig(layoutJson);
      const dslScript = configToDSLScript(pageType, config);
      const outFile = path.join(outDir, file.replace(/\.json$/, '.js'));
      fs.writeFileSync(outFile, dslScript, 'utf-8');
      success++;
      console.log(`✅ ${file} -> ${path.basename(outFile)} (${pageType})`);
    } catch (err) {
      failed++;
      console.error(`❌ ${file} 反解析失败: ${err.message}`);
    }
  }

  console.log(`\n🎉 完成：成功 ${success} 个，失败 ${failed} 个，输出目录 ${outDir}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('脚本异常:', err);
    process.exit(1);
  });
}

module.exports = { configToDSLScript, fieldConfigToDSL };
