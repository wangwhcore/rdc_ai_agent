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

  // 验证属性提取：构造一个带丰富属性的 Layout
  const customLayout = {
    value: JSON.stringify({
      desktop: {
        layoutInfo: { pageType: 'add' },
        layoutList: {
          LayoutMain: {
            rows: [{
              cols: [{
                components: [{
                  type: 'CardHook',
                  property: { layoutId: 'form-layout-1' },
                }],
              }],
            }],
          },
          'form-layout-1': {
            rows: [{
              cols: [{
                components: [
                  { property: { id: 'f1' } },
                  { property: { id: 'f2' } },
                ],
              }],
            }],
          },
        },
        components: {
          f1: {
            type: 'TextHook',
            property: {
              id: 'f1',
              filed: 'code',
              label: '编码',
              placeholder: '请输入编码',
              wrapperSpan: 12,
              labelSpan: 12,
              ruleField: 'code',
              customStyle: '{color:"red"}',
            },
          },
          f2: {
            type: 'DatePickerHook',
            property: {
              id: 'f2',
              filed: 'createDate',
              label: '创建日期',
              pickerType: 'date',
              showTime: true,
              format: 'YYYY-MM-DD HH:mm:ss',
            },
          },
        },
      },
    }),
  };
  const { config: customConfig } = designerToConfig(customLayout);
  const f1 = customConfig.fields.find(f => f.field === 'code');
  assert.ok(f1);
  assert.strictEqual(f1.options.placeholder, '请输入编码');
  assert.strictEqual(f1.options.wrapperSpan, 12);
  assert.strictEqual(f1.options.ruleField, 'code');
  const f2 = customConfig.fields.find(f => f.field === 'createDate');
  assert.ok(f2);
  assert.strictEqual(f2.options.pickerType, 'date');
  assert.strictEqual(f2.options.showTime, true);
  console.log('✅ 字段属性被提取');

  console.log('\n🎉 designerToConfig 测试通过！');
}

run();
