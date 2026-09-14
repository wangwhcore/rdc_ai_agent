/**
 * View Builder 单元测试
 * 运行：node test/viewPage.test.js
 */
const assert = require('assert');
const { buildViewPage, text, select, date, textarea, number, validate } = require('../index');

function run() {
  console.log('开始测试 View Builder...\n');

  const viewJson = buildViewPage({
    pageName: '供应商详情',
    functionGid: 'FUNC_SUPPLIER_VIEW',
    serverName: 'supplier-service',
    entityPath: 'supplier',
    entityIdField: 'gid',
    listPageFrontId: '44444444444444444444444444444444',
    fields: [
      text('code', '编码'),
      text('name', '名称'),
      select('type', '类型', { dict: 'supplierType' }),
      date('createDate', '创建日期'),
      number('amount', '金额', { precision: 2 }),
      textarea('remark', '备注'),
    ],
    colsPerRow: 3,
    colSpan: 8,
  });

  assert.strictEqual(typeof viewJson.value, 'string');
  const desktop = JSON.parse(viewJson.value).desktop;

  // 1. 页面类型
  assert.strictEqual(desktop.layoutInfo.pageType, 'view');
  console.log('✅ pageType = view');

  // 2. 只包含返回/关闭按钮，没有保存按钮
  const componentIds = Object.keys(desktop.components);
  const buttonTypes = componentIds
    .map(id => desktop.components[id].type)
    .filter(t => t === 'ButtonHook');
  assert.strictEqual(buttonTypes.length, 2);
  console.log('✅ 工具栏只包含返回/关闭按钮');

  // 3. 所有表单字段默认只读
  const formComponents = componentIds
    .map(id => desktop.components[id])
    .filter(c => c.isForm);
  const allReadonly = formComponents.every(c => c.property.displayMode === true && c.property.enabled === false);
  assert.strictEqual(allReadonly, true);
  console.log('✅ 表单字段 displayMode=true / enabled=false');

  // 4. 字段已按 colsPerRow=3 分组
  const formLayoutId = Object.keys(desktop.layoutList).find(k => k !== 'LayoutMain' && k !== 'TopMain' && k !== 'RightMain' && k !== 'TitleSiderExtra' && k !== 'TitleSider' && k !== 'TitleTools' && k !== 'BottomLeft' && k !== 'BottomRight');
  const formRows = desktop.layoutList[formLayoutId].rows;
  assert.strictEqual(formRows.length, 2); // 6 个字段，每行 3 列
  assert.strictEqual(formRows[0].cols.length, 3);
  console.log('✅ 字段按 3 列分组');

  // 5. 校验通过
  const validation = validate(viewJson);
  assert.strictEqual(validation.ok, true, validation.errors && validation.errors.join('\n'));
  console.log('✅ 生成结果通过校验');

  // 6. 包含 componentDidMount 拉取详情订阅
  const detailSub = desktop.subscribes.find(s => s.name === '获取详情');
  assert.ok(detailSub);
  assert.ok(detailSub.behaviors[0].dataSource.url.includes('/supplier/get'));
  console.log('✅ 查看页自动拉取详情');

  console.log('\n🎉 View Builder 测试通过！');
}

run();
