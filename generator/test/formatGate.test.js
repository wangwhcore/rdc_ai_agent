/**
 * 格式门禁的「落盘路径集成」测试
 *
 * 单测 ir/jsonFormat 与 ir/jsonGate 只证明引擎本身对；这个文件证明**接线对**：
 *   - `POST /api/repair` 的服务端逻辑（services/repairService.js）
 *   - `scripts/deploy.js` 的读入 / 写入都会过门禁（deployLayout / readJson / writeJson）
 *
 * 之所以单独成文件：这些是「别人调用我」的边界，最容易在重构时被悄悄绕过
 * —— 又变成直接 fs.writeFileSync，把格式问题重新放回运行时。
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { repairFromRequest } = require('../services/repairService');
const { deployLayout, readJson, writeJson } = require('../scripts/deploy');
const { buildListPage, column, validate } = require('../index');

const ADD_EDIT_FRONT_ID = '11111111111111111111111111111111';
const CONFIRM_FRONT_ID = '22222222222222222222222222222222';

function goodLayout() {
  const layout = buildListPage({
    pageName: '门禁集成测试',
    serverName: 'demo',
    listUrl: '/demo/list',
    functionGid: 'ffffffffffffffffffffffffffffffff',
    addEditPageFrontId: ADD_EDIT_FRONT_ID,
    confirmModalFrontId: CONFIRM_FRONT_ID,
    rowOperations: ['edit'],
    columns: [column('code', '编码', { fieldType: 'text' })],
  });
  assert.ok(validate(layout).ok, '测试夹具本身应当合法');
  return layout;
}

/** 让 value 文本带一个尾随逗号（最常见的格式缺陷） */
const withTrailingComma = layout => ({ ...layout, value: `${layout.value.slice(0, -1)},}` });

function testRepairService() {
  const good = goodLayout();

  // 1) 干净对象：无需修订
  const clean = repairFromRequest({ layout: good });
  assert.strictEqual(clean.ok, true);
  assert.strictEqual(clean.repaired, false);
  assert.strictEqual(clean.isLayoutJson, true);

  // 2) 直接传 Layout JSON（不套 layout 壳）
  const direct = repairFromRequest(good);
  assert.strictEqual(direct.ok, true);

  // 3) 值层带尾随逗号：应当被修好，并回传可落盘的 layout
  const fixed = repairFromRequest({ layout: withTrailingComma(good) });
  assert.strictEqual(fixed.ok, true, `应可修订: ${JSON.stringify(fixed.blocked)}`);
  assert.strictEqual(fixed.repaired, true);
  assert.ok(fixed.repairMethods.length);
  assert.ok(fixed.layout, 'ok 时必须回传修订后的 layout');
  assert.deepStrictEqual(JSON.parse(fixed.layout.value), JSON.parse(good.value), '修订不得改变内容');

  // 4) text 形态：能顺带修外层信封的尾随逗号
  const brokenText = JSON.stringify(good, null, 2).replace(/\n\}$/, ',\n}');
  const viaText = repairFromRequest({ text: brokenText });
  assert.strictEqual(viaText.ok, true, `text 形态应可修订: ${JSON.stringify(viaText.blocked)}`);
  assert.strictEqual(viaText.repaired, true);

  // 5) 结构真坏了（不只是格式）：拒绝，且 layout 必须为 null（防止残缺对象被误用）
  const doc = JSON.parse(good.value);
  delete doc.desktop.subscribes;
  const broken = repairFromRequest({ layout: { ...good, value: `${JSON.stringify(doc).slice(0, -1)},}` } });
  assert.strictEqual(broken.ok, false);
  assert.strictEqual(broken.blocked.stage, 'structure');
  assert.strictEqual(broken.layout, null, '拒绝时不得返回 layout');

  // 6) 非法入参：抛 400 语义的错误
  for (const bad of [null, undefined, 42, [], { text: 123 }]) {
    assert.throws(() => repairFromRequest(bad), err => err.status === 400, `入参 ${JSON.stringify(bad)} 应报 400`);
  }

  console.log('✅ repairService：对象 / text / 直传三种入参，可修则修、结构错位拒绝、非法入参 400');
}

function testDeployGate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdc-gate-deploy-'));
  const layoutDir = path.join(dir, 'MdFrontLayout');
  const functionDir = path.join(dir, 'MdFunction');
  const good = goodLayout();

  // 1) deployLayout：给一个 value 带尾随逗号的 layout，应当被修订后落盘
  const file = deployLayout(withTrailingComma(good), layoutDir);
  const written = JSON.parse(fs.readFileSync(file, 'utf-8'));
  assert.deepStrictEqual(JSON.parse(written.value), JSON.parse(good.value), '落盘的应是修订后的内容');
  console.log('✅ deployLayout：坏 value 被修订后落盘');

  // 2) readJson：文件文本带尾随逗号 → 自动修订
  const commaFile = path.join(dir, 'comma.json');
  fs.writeFileSync(commaFile, JSON.stringify(good, null, 2).replace(/\n\}$/, ',\n}'), 'utf-8');
  const read = readJson(commaFile);
  assert.deepStrictEqual(JSON.parse(read.value), JSON.parse(good.value));
  console.log('✅ readJson：外层尾随逗号自动修订');

  // 3) readJson：结构坏掉 → 必须抛错而不是写出一个错位文件
  const corruptFile = path.join(dir, 'corrupt.json');
  const corruptDoc = JSON.parse(good.value);
  delete corruptDoc.desktop.subscribes;
  fs.writeFileSync(corruptFile, JSON.stringify({ ...good, value: `${JSON.stringify(corruptDoc).slice(0, -1)},}` }), 'utf-8');
  assert.throws(() => readJson(corruptFile), /落盘门禁|拒绝读取/, '结构错位必须拒绝读取');

  // 4) readJson：非 JSON 文本 → 抛错
  const junkFile = path.join(dir, 'junk.json');
  fs.writeFileSync(junkFile, '这不是 JSON，只是一段说明文字', 'utf-8');
  assert.throws(() => readJson(junkFile), /落盘门禁|拒绝读取/);
  console.log('✅ readJson：结构错位 / 非 JSON 文本一律拒绝');

  // 5) writeJson：MdFunction 记录（无 value）不套用页面级门禁，正常写入
  //    （建目录是 ensureDir 的职责，这里直接测 writeJson，所以先建好）
  fs.mkdirSync(functionDir, { recursive: true });
  const fnFile = path.join(functionDir, 'fn.json');
  writeJson(fnFile, { gid: 'fn0000000000000000000000000000', name: '某功能' });
  assert.strictEqual(JSON.parse(fs.readFileSync(fnFile, 'utf-8')).name, '某功能');
  console.log('✅ writeJson：MdFunction 记录不误伤');

  fs.rmSync(dir, { recursive: true, force: true });
}

function run() {
  testRepairService();
  testDeployGate();
  console.log('\n🎉 格式门禁落盘路径集成测试通过！');
}

run();
