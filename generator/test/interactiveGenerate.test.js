/**
 * interactiveGenerate 测试
 * 运行：node test/interactiveGenerate.test.js
 */
const assert = require('assert');
const { generateScript, fieldTypeToDSL, fieldToDSL } = require('../scripts/interactiveGenerate');

function run() {
  console.log('开始测试 interactiveGenerate...\n');

  assert.strictEqual(fieldTypeToDSL('daterange'), 'dateRange');
  assert.strictEqual(fieldTypeToDSL('reupload'), 'reUpload');
  console.log('✅ fieldTypeToDSL');

  const dsl = fieldToDSL({ name: 'code', label: '编码', type: 'text', required: true });
  assert.ok(dsl.includes("text('code', \"编码\")"));
  assert.ok(dsl.includes('.required()'));
  console.log('✅ fieldToDSL');

  const addEditScript = generateScript('addEdit', '测试表单', [
    { name: 'code', label: '编码', type: 'text', required: true },
    { name: 'status', label: '状态', type: 'select', dict: 'statusDict' },
  ]);
  assert.ok(addEditScript.includes('buildAddEditPage'));
  assert.ok(addEditScript.includes("text('code', \"编码\").required()"));
  assert.ok(addEditScript.includes("select('status', \"状态\", { dict: \"statusDict\" })"));
  console.log('✅ addEdit DSL 脚本生成');

  const listScript = generateScript('list', '测试列表', [
    { name: 'code', label: '编码', type: 'text' },
  ]);
  assert.ok(listScript.includes('buildListPage'));
  assert.ok(listScript.includes("column('code', \"编码\")"));
  console.log('✅ list DSL 脚本生成');

  const viewScript = generateScript('view', '测试查看', [
    { name: 'code', label: '编码', type: 'text' },
  ]);
  assert.ok(viewScript.includes('buildViewPage'));
  console.log('✅ view DSL 脚本生成');

  console.log('\n🎉 interactiveGenerate 测试通过！');
}

run();
