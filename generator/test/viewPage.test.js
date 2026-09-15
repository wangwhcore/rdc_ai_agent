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
  // 用卡片的 layoutId 定位表单区域，不要用「第一个非具名 key」——
  // 卡片私有容器（toolContainerId 等）也是非具名 key，顺序一变就会取错。
  const card = Object.values(desktop.components).find(c => c.type === 'CardHook');
  const formLayoutId = card.property.layoutId;
  const formRows = desktop.layoutList[formLayoutId].rows;
  assert.strictEqual(formRows.length, 2); // 6 个字段，每行 3 列
  assert.strictEqual(formRows[0].cols.length, 3);
  console.log('✅ 字段按 3 列分组');

  // 4b. 卡片容器必须是卡片私有容器：可解析、hex、且不登记进 componentIds
  // 指到 TitleTools 这类页面级区域会让同一区域渲染两遍（页面标题栏 + 卡片标题栏），
  // 表现为「保存 / 提交」成对重复。语料判据：0/1320 指向页面级区域。
  const regionKeys = Object.keys(desktop.layoutList);
  const pageLevel = new Set(desktop.layoutInfo.componentIds);
  for (const slot of ['toolContainerId', 'extraContainerId', 'ltContainerId']) {
    const v = card.property[slot];
    assert.ok(/^[0-9a-f]{32}$/.test(v), `卡片 ${slot} 必须是 hex 私有容器，实际: ${v}`);
    assert.ok(regionKeys.includes(v), `卡片 ${slot} 必须能在 layoutList 解析到: ${v}`);
    assert.ok(!pageLevel.has(v), `卡片 ${slot} 不得指向页面级区域: ${v}`);
  }
  console.log('✅ 卡片容器为私有容器且未登记进 componentIds');

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
