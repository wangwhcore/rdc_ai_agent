/**
 * /api/deploy 服务端部署逻辑测试
 * 运行：node test/server-deploy.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { deployFromRequest } = require('../services/deployService');

function run() {
  console.log('开始测试 /api/deploy 服务逻辑...\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdc-server-deploy-'));

  const layout = {
    gid: 'serverdeploy000000000000000001',
    frontId: 'serverfront00000000000000001',
    functionGid: 'serverfunc00000000000000001',
    appGid: 'APP0000000001',
    productGid: 'PROD000000001',
    projectGid: 'PROJ000000001',
    branch: 'master',
    name: 'Server 部署测试页面',
    value: '{}',
  };

  const result = deployFromRequest({
    layout,
    layoutDir: path.join(tmpDir, 'MdFrontLayout'),
    functionDir: path.join(tmpDir, 'MdFunction'),
    createFunction: true,
    parentGid: 'serverparent0000000000000001',
    code: 'ServerDeployTest',
    sequence: 2,
  }, tmpDir);

  assert.strictEqual(fs.existsSync(result.layoutFile), true);
  assert.strictEqual(fs.existsSync(result.functionFile), true);
  console.log('✅ Layout 与 Function 文件均已生成');

  const savedFunction = JSON.parse(fs.readFileSync(result.functionFile, 'utf-8'));
  assert.strictEqual(savedFunction.gid, layout.functionGid);
  assert.strictEqual(savedFunction.parentGid, 'serverparent0000000000000001');
  assert.strictEqual(savedFunction.sequence, 2);
  console.log('✅ Function 元数据正确');

  // 错误输入
  assert.throws(() => deployFromRequest({}), /必须包含 layout/);
  console.log('✅ 缺少 layout 时抛出异常');

  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('\n🎉 /api/deploy 服务逻辑测试通过！');
}

run();
