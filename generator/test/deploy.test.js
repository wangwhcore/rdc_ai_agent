/**
 * 部署脚本测试
 * 运行：node test/deploy.test.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { deployLayout, createFunctionRecord } = require('../scripts/deploy');

function run() {
  console.log('开始测试 deploy 脚本...\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdc-deploy-'));
  const layoutDir = path.join(tmpDir, 'MdFrontLayout');
  const functionDir = path.join(tmpDir, 'MdFunction');

  const layoutJson = {
    gid: 'testlayout0000000000000000000001',
    frontId: 'testfront000000000000000000001',
    functionGid: 'testfunc000000000000000000001',
    appGid: 'APP0000000001',
    productGid: 'PROD000000001',
    projectGid: 'PROJ000000001',
    branch: 'master',
    name: '测试部署页面',
    value: '{}',
  };

  // 1. 部署 Layout
  const layoutFile = deployLayout(layoutJson, layoutDir);
  assert.strictEqual(fs.existsSync(layoutFile), true);
  const savedLayout = JSON.parse(fs.readFileSync(layoutFile, 'utf-8'));
  assert.strictEqual(savedLayout.gid, layoutJson.gid);
  console.log('✅ Layout 部署成功');

  // 2. 创建 Function
  const functionFile = createFunctionRecord(layoutJson, {
    parentGid: 'parent0000000000000000000001',
    code: 'TestDeployPage',
    sequence: 5,
    functionDir,
  });
  assert.strictEqual(fs.existsSync(functionFile), true);
  const savedFunction = JSON.parse(fs.readFileSync(functionFile, 'utf-8'));
  assert.strictEqual(savedFunction.gid, layoutJson.functionGid);
  assert.strictEqual(savedFunction.parentGid, 'parent0000000000000000000001');
  assert.strictEqual(savedFunction.code, 'TestDeployPage');
  assert.strictEqual(savedFunction.sequence, 5);
  assert.strictEqual(savedFunction.name, '测试部署页面');
  console.log('✅ Function 创建成功');

  // 3. 更新 Function 保留原 createTime
  const originalCreateTime = savedFunction.createTime;
  const functionFile2 = createFunctionRecord(layoutJson, {
    functionDir,
    existingFunction: savedFunction,
  });
  const updatedFunction = JSON.parse(fs.readFileSync(functionFile2, 'utf-8'));
  assert.strictEqual(updatedFunction.createTime, originalCreateTime);
  assert.strictEqual(updatedFunction.name, '测试部署页面');
  console.log('✅ Function 更新保留原 createTime');

  // 清理
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('\n🎉 deploy 脚本测试通过！');
}

run();
