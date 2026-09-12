/**
 * 交互式 CLI 向导：通过命令行问答生成 DSL 脚本
 *
 * 用法：
 *   node scripts/interactiveGenerate.js --out ./generated/dsl
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

function question(rl, q) {
  return new Promise(resolve => {
    rl.question(q, resolve);
  });
}

function fieldTypeToDSL(type) {
  const map = {
    text: 'text',
    textarea: 'textarea',
    number: 'number',
    select: 'select',
    date: 'date',
    time: 'time',
    daterange: 'dateRange',
    radio: 'radio',
    checkbox: 'checkbox',
    switch: 'switchField',
    upload: 'upload',
    reupload: 'reUpload',
    image: 'image',
    findback: 'findback',
    cascader: 'neuCascader',
    tree: 'tree',
    transfer: 'neuTransfer',
    tag: 'neuTag',
  };
  return map[type] || type;
}

function fieldToDSL(field) {
  const type = fieldTypeToDSL(field.type);
  const options = [];
  if (field.dict) options.push(`dict: ${JSON.stringify(field.dict)}`);
  if (field.precision && type === 'number') options.push(`precision: ${field.precision}`);

  let expr = `${type}('${field.name}', ${JSON.stringify(field.label)}${options.length ? ', { ' + options.join(', ') + ' }' : ''})`;
  if (field.required) expr += '.required()';
  return expr;
}

function generateScript(pageType, pageName, fields) {
  const importFields = [...new Set(fields.map(f => fieldTypeToDSL(f.type)))];
  if (pageType === 'list') importFields.unshift('column');
  const builderMap = {
    list: 'buildListPage',
    addEdit: 'buildAddEditPage',
    view: 'buildViewPage',
    simpleForm: 'buildSimpleForm',
  };
  const builder = builderMap[pageType] || 'buildAddEditPage';

  const imports = [...new Set([builder, ...importFields])];
  let script = `const { ${imports.join(', ')} } = require('../index');\n\n`;

  if (pageType === 'list') {
    script += `const columns = [\n${fields.map(f => `  column('${f.name}', ${JSON.stringify(f.label)}),`).join('\n')}\n];\n\n`;
    script += `module.exports = ${builder}({\n`;
    script += `  pageName: ${JSON.stringify(pageName)},\n`;
    script += `  serverName: 'example',\n`;
    script += `  listUrl: '/example/list',\n`;
    script += `  functionGid: '00000000000000000000000000000000',\n`;
    script += `  addEditPageId: '00000000000000000000000000000000',\n`;
    script += `  confirmModalId: '00000000000000000000000000000000',\n`;
    script += `  rowKey: 'id',\n`;
    script += `  columns,\n`;
    script += '});\n';
  } else {
    script += `const fields = [\n${fields.map(f => `  ${fieldToDSL(f)},`).join('\n')}\n];\n\n`;
    script += `module.exports = ${builder}({\n`;
    script += `  pageName: ${JSON.stringify(pageName)},\n`;
    if (pageType !== 'simpleForm') {
      script += `  serverName: 'example',\n`;
      script += `  entityPath: 'example',\n`;
      script += `  entityIdField: 'id',\n`;
      script += `  listPageId: '00000000000000000000000000000000',\n`;
      script += `  functionGid: '00000000000000000000000000000000',\n`;
    }
    script += `  fields,\n`;
    script += '});\n';
  }

  return script;
}

async function main() {
  const args = parseArgs(process.argv);
  const outDir = args.out || './generated/dsl';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log('\n=== RDC Layout DSL 生成向导 ===\n');

    let pageType = await question(rl, '请选择页面类型 (list/addEdit/view/simpleForm) [addEdit]: ');
    pageType = pageType.trim() || 'addEdit';
    if (!['list', 'addEdit', 'view', 'simpleForm'].includes(pageType)) {
      console.error('不支持的页面类型');
      process.exit(1);
    }

    const pageName = await question(rl, '请输入页面名称: ');
    if (!pageName.trim()) {
      console.error('页面名称不能为空');
      process.exit(1);
    }

    const fields = [];
    let addMore = true;

    console.log('\n支持字段类型: text, textarea, number, select, date, time, dateRange, radio, checkbox, switch, upload, reUpload, image, findback, cascader, tree, transfer, tag');

    while (addMore) {
      console.log(`\n--- 字段 #${fields.length + 1} ---`);
      const name = await question(rl, '字段名 (英文): ');
      if (!name.trim()) {
        console.log('跳过该字段');
        continue;
      }
      const label = await question(rl, '字段标签 (中文): ');
      const type = (await question(rl, '字段类型 [text]: ')).trim() || 'text';
      const required = (await question(rl, '是否必填 (y/N): ')).trim().toLowerCase() === 'y';
      let dict = '';
      let precision = '';
      if (['select', 'radio', 'checkbox'].includes(type)) {
        dict = (await question(rl, '字典编码 (可选): ')).trim();
      }
      if (type === 'number') {
        precision = (await question(rl, '精度 [0]: ')).trim() || '0';
      }

      fields.push({
        name: name.trim(),
        label: label.trim() || name.trim(),
        type: type.trim(),
        required,
        ...(dict ? { dict } : {}),
        ...(precision ? { precision: Number(precision) } : {}),
      });

      const more = await question(rl, '是否继续添加字段 (y/N): ');
      addMore = more.trim().toLowerCase() === 'y';
    }

    const script = generateScript(pageType, pageName.trim(), fields);

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const fileName = `${pageName.trim().replace(/\s+/g, '-').replace(/[^\w\-]/g, '')}.js`;
    const filePath = path.join(outDir, fileName);
    fs.writeFileSync(filePath, script, 'utf-8');

    console.log(`\n✅ DSL 脚本已生成: ${filePath}`);
    console.log('\n接下来可以运行:');
    console.log(`  node cli.js --input ${filePath} --check`);
    console.log(`  node cli.js --input ${filePath} --out ../generated`);
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('向导异常:', err);
    process.exit(1);
  });
}

module.exports = { generateScript, fieldTypeToDSL, fieldToDSL };
