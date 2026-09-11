/**
 * designerToConfig 反解析器测试
 * 运行：node test/designerToConfig.test.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { designerToConfig } = require('../parser/designerToConfig');

function run() {
  console.log('开始测试 designerToConfig...\n');

  const viewFile = 'E:/2026demo/rdc-develop/front/MdFrontLayout/100947beb731493cbb18afc61476a1ef.json';
  const layoutJson = JSON.parse(fs.readFileSync(viewFile, 'utf-8'));

  const { pageType, config } = designerToConfig(layoutJson);
  assert.strictEqual(pageType, 'view');
  console.log('✅ 识别 pageType = view');

  assert.ok(Array.isArray(config.fields));
  assert.ok(config.fields.length > 0);
  console.log(`✅ 反解析出 ${config.fields.length} 个字段`);

  const textField = config.fields.find(f => f.type === 'text');
  assert.ok(textField);
  assert.ok(textField.field);
  assert.ok(textField.label);
  console.log('✅ 字段包含 type / field / label');

  // 所有字段都应标记 readonly（view 页面）
  const allReadonly = config.fields.every(f => f.options.readonly);
  assert.strictEqual(allReadonly, true);
  console.log('✅ view 页面字段全部标记 readonly');

  console.log('\n🎉 designerToConfig 测试通过！');
}

run();
