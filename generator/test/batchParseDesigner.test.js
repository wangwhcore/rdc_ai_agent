/**
 * batchParseDesigner 测试
 * 运行：node test/batchParseDesigner.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { configToDSLScript, fieldConfigToDSL } = require('../scripts/batchParseDesigner');

function run() {
  console.log('开始测试 batchParseDesigner...\n');

  // 1. 字段 DSL 生成
  const dsl = fieldConfigToDSL({ type: 'text', field: 'code', label: '编码', options: { required: true } });
  assert.ok(dsl.includes("text('code', \"编码\""));
  console.log('✅ fieldConfigToDSL');

  // 2. 表单页 DSL 生成
  const formScript = configToDSLScript('add', {
    pageName: '测试表单',
    functionGid: 'func1',
    fields: [
      { type: 'text', field: 'code', label: '编码', options: {} },
      { type: 'select', field: 'status', label: '状态', options: { dict: 'status' } },
    ],
  });
  assert.ok(formScript.includes('buildAddEditPage'));
  assert.ok(formScript.includes("text('code', \"编码\""));
  assert.ok(formScript.includes("select('status', \"状态\""));
  console.log('✅ add 页 DSL 生成');

  // 3. 查看页 DSL 生成
  const viewScript = configToDSLScript('view', {
    pageName: '测试查看',
    functionGid: 'func2',
    fields: [
      { type: 'text', field: 'code', label: '编码', options: { readonly: true } },
    ],
  });
  assert.ok(viewScript.includes('buildViewPage'));
  assert.ok(viewScript.includes('.readonly()'));
  console.log('✅ view 页 DSL 生成');

  // 4. 列表页 DSL 生成
  const listScript = configToDSLScript('list', {
    pageName: '测试列表',
    functionGid: 'func3',
    serverName: 'purchase',
    listUrl: '/purchase/list',
    rowKey: 'id',
    columns: [
      { field: 'code', headerName: '编码', width: 120 },
    ],
    queryFields: [
      { field: 'code', fieldType: '文本', queryType: 'like' },
    ],
  });
  assert.ok(listScript.includes('buildListPage'));
  assert.ok(listScript.includes('column(\'code\''));
  assert.ok(listScript.includes('queryField(\'code\''));
  console.log('✅ list 页 DSL 生成');

  console.log('\n🎉 batchParseDesigner 测试通过！');
}

run();
