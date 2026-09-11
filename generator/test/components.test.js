/**
 * 组件工厂单元测试
 * 运行：node test/components.test.js
 */
const assert = require('assert');
const {
  text,
  select,
  date,
  textarea,
  number,
  radio,
  checkbox,
  switchField,
  upload,
  findback,
  span,
  dateRange,
  buildModal,
  editTable,
  editColumn,
  column,
  queryField,
  button,
  card,
  addTable,
  addQuery,
} = require('../index');

function run() {
  console.log('开始测试组件工厂...\n');

  // 1. 字段组件
  const textField = text('code', '编码').required();
  assert.strictEqual(textField.toJSON().type, 'TextHook');
  assert.strictEqual(textField.toJSON().property.showRequiredStar, true);
  console.log('✅ TextHook');

  const selectField = select('type', '类型', { dict: 'xxxType' });
  assert.strictEqual(selectField.toJSON().type, 'SelectHook');
  assert.ok(selectField.toJSON().property.dataSource);
  console.log('✅ SelectHook');

  const dateField = date('startDate', '开始日期');
  assert.strictEqual(dateField.toJSON().type, 'DatePickerHook');
  console.log('✅ DatePickerHook');

  const textareaField = textarea('remark', '备注');
  assert.strictEqual(textareaField.toJSON().type, 'TextAreaHook');
  console.log('✅ TextAreaHook');

  const numberField = number('quantity', '数量', { precision: 2 });
  assert.strictEqual(numberField.toJSON().type, 'InputNumberHook');
  assert.strictEqual(numberField.toJSON().property.precision, 2);
  console.log('✅ InputNumberHook');

  const radioField = radio('status', '状态', { dict: 'xxxStatus' });
  assert.strictEqual(radioField.toJSON().type, 'RadioHook');
  console.log('✅ RadioHook');

  const checkboxField = checkbox('tags', '标签', { dict: 'xxxTags' });
  assert.strictEqual(checkboxField.toJSON().type, 'CheckboxHook');
  console.log('✅ CheckboxHook');

  const switchF = switchField('isActive', '是否启用');
  assert.strictEqual(switchF.toJSON().type, 'SwitchHook');
  console.log('✅ SwitchHook');

  const uploadField = upload('attachments', '附件');
  assert.strictEqual(uploadField.toJSON().type, 'UploadHook');
  console.log('✅ UploadHook');

  const findbackField = findback('refObj', '参照对象', {
    tableInfo: {
      rowKey: 'gid',
      columns: [
        { field: 'code', headerName: '编码' },
        { field: 'name', headerName: '名称' },
      ],
    },
  });
  assert.strictEqual(findbackField.toJSON().type, 'FindbackHook');
  assert.strictEqual(findbackField.toJSON().property.tableInfo.columns.length, 2);
  console.log('✅ FindbackHook');

  const spanField = span('status', '状态');
  assert.strictEqual(spanField.toJSON().type, 'SpanHook');
  console.log('✅ SpanHook');

  const rangeField = dateRange('dateRange', '日期范围');
  assert.strictEqual(rangeField.toJSON().type, 'RangePickerComponent');
  console.log('✅ RangePickerComponent');

  const editTableField = editTable('lines', '子表', {
    rowKey: 'lineId',
    columns: [
      editColumn('itemCode', '物料编码', { cellType: text('itemCode', '物料编码') }),
      editColumn('qty', '数量', { cellType: number('qty', '数量') }),
    ],
  });
  assert.strictEqual(editTableField.toJSON().type, 'EditTableHook');
  assert.strictEqual(editTableField.toJSON().property.columns.length, 3); // 序号 + 2 列
  console.log('✅ EditTableHook / EditTableColumnHook');

  // 2. 列表页组件
  const col = column('code', '$${label.code}', { width: 120 });
  assert.strictEqual(col.toJSON().type, 'ColumnHook');
  console.log('✅ ColumnHook');

  const qf = queryField('code', '文本', 'like');
  assert.strictEqual(qf.componentType, 'TextHook');
  console.log('✅ queryField');

  const btn = button('新建').primary();
  assert.strictEqual(btn.toJSON().type, 'ButtonHook');
  console.log('✅ ButtonHook');

  const c = card({ title: '卡片' });
  assert.strictEqual(c.toJSON().type, 'CardHook');
  console.log('✅ CardHook');

  const table = addTable({
    dataSource: { method: 'post', serverName: 'xxx', url: '/xxx/list' },
    columns: [col],
    rowOperations: ['edit'],
  });
  assert.strictEqual(table.toJSON().type, 'TableHook');
  console.log('✅ TableHook');

  const query = addQuery({ associateId: table.id, fields: [qf] });
  assert.strictEqual(query.toJSON().type, 'AdvanceQueryHook');
  console.log('✅ AdvanceQueryHook');

  // 3. 弹窗
  const modal = buildModal({
    pageName: '删除确认弹窗',
    functionGid: '00000000000000000000000000000000',
    content: span('msg', '$${message.delete.reminder}'),
  });
  assert.strictEqual(JSON.parse(modal.value).desktop.layoutInfo.field, 'LayoutSimpleModal');
  console.log('✅ Modal Builder');

  console.log('\n🎉 所有组件工厂测试通过！');
}

run();
