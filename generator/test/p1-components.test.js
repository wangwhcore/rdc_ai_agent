/**
 * P1 新增组件单元测试
 * 运行：node test/p1-components.test.js
 */
const assert = require('assert');
const {
  neuTag,
  image,
  reUpload,
  dropdownButton,
  proCard,
  neuCascader,
  tree,
  neuTransfer,
  tabs,
  drawerContainer,
  time,
  gridFieldTable,
  gridColumn,
  text,
  number,
} = require('../index');
const { collectComponents } = require('../builder/utils');

function run() {
  console.log('开始测试 P1 新增组件...\n');

  const tag = neuTag('status', '状态', {
    customValue: "[{code:'NEW',text:'新建',type:'normal'}]",
  });
  assert.strictEqual(tag.toJSON().type, 'NeuTag');
  assert.strictEqual(tag.toJSON().property.filed, 'status');
  console.log('✅ NeuTag');

  const img = image('avatar', '头像', { source: 'https://example.com/a.png' });
  assert.strictEqual(img.toJSON().type, 'ImageHook');
  console.log('✅ ImageHook');

  const uploadImg = reUpload('files', '附件');
  assert.strictEqual(uploadImg.toJSON().type, 'ReUpload');
  assert.strictEqual(uploadImg.toJSON().property.uploadMode, 'Dragger');
  console.log('✅ ReUpload');

  const dd = dropdownButton('更多操作', {
    dataSource: [{ key: '1', val: '启用', enabled: true }],
  });
  assert.strictEqual(dd.toJSON().type, 'DropdownButtonHook');
  console.log('✅ DropdownButtonHook');

  const pc = proCard('高级卡片');
  assert.strictEqual(pc.toJSON().type, 'ProCardHook');
  assert.ok(pc.toJSON().property.layoutId);
  console.log('✅ ProCardHook');

  const cascader = neuCascader('area', '地区', {
    dataSource: { type: 'api', url: '/address/tree' },
  });
  assert.strictEqual(cascader.toJSON().type, 'NeuCascader');
  assert.strictEqual(cascader.toJSON().property.children, 'children');
  console.log('✅ NeuCascader');

  const treeField = tree('category', '分类', { checkable: true });
  assert.strictEqual(treeField.toJSON().type, 'TreeHook');
  assert.strictEqual(treeField.toJSON().property.checkable, true);
  console.log('✅ TreeHook');

  const transfer = neuTransfer('selected', '已选', { rowKey: 'id' });
  assert.strictEqual(transfer.toJSON().type, 'NeuTransfer');
  assert.strictEqual(transfer.toJSON().property.rowKey, 'id');
  console.log('✅ NeuTransfer');

  const tab = tabs('标签页').addTab('全部', 'layout-all').addTab('待办', 'layout-todo');
  const tabJson = tab.toJSON();
  assert.strictEqual(tabJson.type, 'TabsHook');
  assert.strictEqual(tabJson.property.tabPanels.length, 2);
  console.log('✅ TabsHook');

  const drawer = drawerContainer('抽屉');
  assert.strictEqual(drawer.toJSON().type, 'DrawerContainerHook');
  assert.strictEqual(drawer.toJSON().property.drawerPlacement, 'right');
  console.log('✅ DrawerContainerHook');

  const timeField = time('startTime', '开始时间', { format: 'HH:mm' });
  assert.strictEqual(timeField.toJSON().type, 'TimePickerHook');
  console.log('✅ TimePickerHook');

  const grid = gridFieldTable('lines', '明细', {
    rowKey: 'lineId',
    columns: [
      gridColumn('name', '名称', { cellType: text('name', '名称') }),
      gridColumn('qty', '数量', { cellType: number('qty', '数量') }),
    ],
  });
  const gridJson = grid.toJSON();
  assert.strictEqual(gridJson.type, 'GridFieldTable');

  // 语料约定：GridFieldTable 恒定前置一列序号列（21/21，与 showSerial 取值无关）
  const cols = gridJson.property.columns;
  assert.strictEqual(cols.length, 3, '应为 1 列序号列 + 2 列数据列');
  assert.strictEqual(cols[0].field, 'rowSerialNum_EditTable');
  assert.strictEqual(cols[0].colId, 'rowSerialNum_EditTable', '序号列使用字面量哨兵 colId');

  // 数据列以内联描述 + colId 指向注册条目
  const [nameCol, qtyCol] = cols.slice(1);
  assert.strictEqual(nameCol.field, 'name');
  assert.strictEqual(nameCol.index, 1, '数据列序号从 1 开始且不含序号列');
  assert.strictEqual(qtyCol.index, 2);
  assert.ok(/^[0-9a-f]{32}$/.test(nameCol.colId), 'colId 应为 32 位十六进制');
  assert.strictEqual(nameCol.cellType.type, 'TextHook', 'cellType 应扁平化并带 type');

  // 注册形态：{ type: 'EditTableColumnHook', property: { id: colId } }（语料 117/117）
  const registries = collectComponents([grid]);
  for (const col of [nameCol, qtyCol]) {
    const registered = registries[col.colId];
    assert.ok(registered, `列 ${col.field} 的 colId 应在 components 中注册`);
    assert.strictEqual(registered.type, 'EditTableColumnHook');
    assert.strictEqual(registered.property.id, col.colId);
    assert.strictEqual(registered.property.field, col.field);
  }
  assert.ok(!Object.prototype.hasOwnProperty.call(registries, 'rowSerialNum_EditTable'),
    '序号列是哨兵，不应注册进 components');

  // 序列化幂等：同一实例多次 toJSON 必须完全一致（colId / uuid 不得漂移）
  assert.strictEqual(JSON.stringify(grid.toJSON()), JSON.stringify(gridJson),
    'GridFieldTable.toJSON 必须幂等');

  console.log('✅ GridFieldTable / GridFieldTableColumn');

  console.log('\n🎉 P1 新增组件测试通过！');
}

run();
