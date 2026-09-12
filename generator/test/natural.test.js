/**
 * 自然语言生成测试（mock 模式）
 * 运行：node test/natural.test.js
 */
const assert = require('assert');
const http = require('http');

const TEST_PORT = 3001;
process.env.PORT = TEST_PORT;

// 加载并启动服务
require('../server');

function request(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: TEST_PORT,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let response = '';
      res.setEncoding('utf8');
      res.on('data', chunk => response += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(response));
        } catch (e) {
          reject(new Error(`响应解析失败: ${response}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  // 等待服务启动
  await new Promise(r => setTimeout(r, 500));

  console.log('测试自然语言生成（mock 模式）...\n');

  const res1 = await request('/api/generate/natural', {
    prompt: '生成一个采购申请表单，包含采购组织、申请人、申请日期、金额、备注',
    mock: true,
  });

  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.data.name, '新增编辑页-新增编辑');
  const value1 = JSON.parse(res1.data.value);
  assert.strictEqual(value1.desktop.layoutInfo.formUse, true);
  const fields1 = value1.desktop.layoutList.LayoutMain.rows.map(r => r.cols[0].components[0].property.filed);
  console.log('✅ 表单页字段:', fields1.join(', '));

  const res2 = await request('/api/generate/natural', {
    prompt: '生成一个供应商列表页，包含供应商编码、名称、状态',
    mock: true,
  });

  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.data.name, '示例列表页-列表');
  const value2 = JSON.parse(res2.data.value);
  assert.strictEqual(value2.desktop.layoutInfo.pageType, 'list');
  const table = Object.values(value2.desktop.components).find(c => c.type === 'TableHook');
  assert.ok(table, '应包含 TableHook');
  console.log('✅ 列表页表格列:', table.property.columns.map(c => c.field).filter(f => f !== 'serialNum' && f !== 'operation').join(', '));

  // 查看页
  const res3 = await request('/api/generate/natural', {
    prompt: '生成一个供应商详情查看页，包含供应商编码、名称、状态、备注',
    mock: true,
  });
  assert.strictEqual(res3.success, true);
  assert.strictEqual(res3.data.name, '查看页-查看');
  const value3 = JSON.parse(res3.data.value);
  assert.strictEqual(value3.desktop.layoutInfo.pageType, 'view');
  console.log('✅ 查看页生成成功');

  // 带子表的表单
  const res4 = await request('/api/generate/natural', {
    prompt: '生成一个采购订单新增编辑页，包含订单编码、供应商、订单日期和订单明细子表',
    mock: true,
  });
  assert.strictEqual(res4.success, true);
  const value4 = JSON.parse(res4.data.value);
  const hasEditTable = Object.values(value4.desktop.components).some(c => c.type === 'EditTableHook');
  assert.ok(hasEditTable, '应包含 EditTableHook');
  console.log('✅ 子表生成成功');

  console.log('\n🎉 自然语言生成测试通过！');
  process.exit(0);
}

run().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
