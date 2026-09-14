/**
 * Page IR 往返测试
 *
 * 核心不变式：
 *   lift(emit(lift(x))) ≡ lift(x)      —— IR 幂等
 *   emit(lift(x)).value === x.value    —— value 字符串逐字节一致
 *
 * 先在构造器产物上做单元验证，再在真实语料（MdFrontLayout）上做全量回归。
 * 语料目录可能不存在（仓库外），此时跳过并给出提示，不算失败。
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { lift, emit, roundTrip, deepEqual, stableStringify } = require('../ir');
const { runRoundTrip } = require('../scripts/roundtrip');
const { validate } = require('../builder/validator');

const buildListPage = require('../examples/inquiry-list');
const buildAddEditPage = require('../examples/inquiry-add-edit');
const purchaseOrder = require('../examples/purchase-order-with-lines');
const deleteModal = require('../examples/delete-confirm-modal');
const productDetail = require('../examples/product-detail-with-p1');

const CORPUS_DIR = path.join(__dirname, '..', '..', '..', 'MdFrontLayout');

// 弹窗只有按钮和文本，不含跨引用，因此单独标注期望
const SAMPLES = {
  '列表页': { layout: buildListPage, expectRefs: true },
  '新增编辑页': { layout: buildAddEditPage, expectRefs: true },
  '采购订单（含子表）': { layout: purchaseOrder, expectRefs: true },
  '删除确认弹窗': { layout: deleteModal, expectRefs: false },
  '商品详情（P1 组件）': { layout: productDetail, expectRefs: true },
};

function run() {
  console.log('开始测试 Page IR 往返...\n');

  // ---------- 单元：构造器产物 ----------
  for (const [name, { layout, expectRefs }] of Object.entries(SAMPLES)) {
    const res = roundTrip(layout);
    assert.ok(res.irStable, `${name}：IR 应满足 lift(emit(lift(x))) ≡ lift(x)`);
    assert.ok(res.byteExact, `${name}：value 字符串应与原始输出逐字节一致`);
    assert.ok(Array.isArray(res.irBefore.references), `${name}：references 应为数组`);
    if (expectRefs) {
      assert.ok(res.irBefore.references.length > 0, `${name}：应抽出跨引用`);
    }
  }
  console.log(`✅ ${Object.keys(SAMPLES).length} 个构造器产物全部通过往返（IR 幂等 + 逐字节一致）`);

  // ---------- 序列化幂等：同一页面重复生成必须一致 ----------
  {
    // SelectHook / FindbackHook 曾在 toJSON() 内生成 uuid，
    // 导致同一实例两次序列化得到不同的嵌套 id
    for (const [name, { layout }] of Object.entries(SAMPLES)) {
      const again = JSON.parse(JSON.stringify(layout));
      const a = require('../ir').lift(layout);
      const b = require('../ir').lift(again);
      assert.ok(deepEqual(a, b), `${name}：同一页面两次 lift 结果应一致（序列化必须幂等）`);
    }
    console.log('✅ 序列化幂等：重复生成同一页面得到完全一致的 IR');
  }

  // ---------- IR 结构 ----------
  {
    const ir = lift(buildListPage);
    assert.strictEqual(ir.irVersion, '1.0.0');
    assert.strictEqual(ir.kind, 'list');
    assert.ok(ir.identity.frontId, '应记录 frontId');
    assert.ok(ir.keyOrder.top.includes('value'), '应记录顶层键顺序');
    assert.ok(ir.keyOrder.desktop.includes('layoutList'), '应记录 desktop 键顺序');
    assert.ok(Array.isArray(ir.keyOrder.region) && ir.keyOrder.region.includes('LayoutMain'));
    console.log('✅ IR 结构：版本 / kind / identity / keyOrder 齐备');
  }
  {
    // layoutList 中的内联组件应被打桩为 id，emit 后回填
    const ir = lift(buildListPage);
    const layoutMain = ir.regions.LayoutMain;
    const ids = layoutMain.rows[0].cols[0].components;
    assert.ok(ids.every(c => typeof c === 'string'), 'region 内应只存组件 id');
    assert.ok(ids.every(id => ir.components[id]), '被引用的 id 应存在于 components 注册表');
    console.log('✅ region 打桩 / 回填一致');
  }
  {
    // 引用表应包含区域与组件两类目标
    const ir = lift(buildListPage);
    const targets = new Set(ir.references.map(r => r.target));
    assert.ok(targets.has('region'), '应包含指向区域的引用');
    assert.ok(targets.has('component'), '应包含指向组件的引用');
    assert.ok(ir.references.every(r => r.resolves), '干净样本不应有断链');
    console.log(`✅ 引用表：${ir.references.length} 条，区域/组件两类目标齐全`);
  }
  {
    // 数据源契约
    const ir = lift(buildListPage);
    const tableDs = ir.queries.find(q => q.ownerType === 'TableHook');
    assert.ok(tableDs, '应抽出表格数据源');
    assert.strictEqual(tableDs.serverName, 'purchase');
    assert.strictEqual(tableDs.url, '/inquiry/list');
    console.log('✅ 数据源契约抽取');
  }

  // ---------- emit 的健壮性 ----------
  {
    const ir = lift(buildListPage);
    const broken = JSON.parse(JSON.stringify(ir));
    // 挑一个真正挂载在区域里的组件删掉，emit 才能察觉到
    const victimId = broken.regions.LayoutMain.rows[0].cols[0].components[0];
    assert.ok(victimId, '样本应存在挂载组件');
    delete broken.components[victimId];
    let threw = false;
    try {
      emit(broken);
    } catch (e) {
      threw = true;
      assert.ok(/不存在/.test(e.message), `应给出可读的报错，实际: ${e.message}`);
      assert.ok(Array.isArray(e.details) && e.details.length > 0, '应带出缺失明细');
    }
    assert.ok(threw, '引用了不存在的组件时 emit 应拒绝生成');
    console.log('✅ emit 对残缺 IR 快速失败（并给出缺失清单）');
  }
  {
    // IR 被手工改写后仍可 emit，且输出能通过校验
    const ir = lift(buildListPage);
    ir.name = '改名后的列表页';
    const out = emit(ir);
    assert.strictEqual(out.name, '改名后的列表页');
    const res = validate(out);
    assert.strictEqual(res.ok, true, `改写后仍应合法: ${JSON.stringify(res.errors)}`);
    console.log('✅ IR 可安全改写并重新 emit');
  }

  // ---------- 全量语料回归 ----------
  if (!fs.existsSync(CORPUS_DIR)) {
    console.log(`\n⚠️  语料目录不存在，跳过全量回归: ${CORPUS_DIR}`);
    console.log('   （该目录位于仓库外，属正常情况）');
    console.log('\n🎉 Page IR 往返测试通过！');
    return;
  }

  const report = runRoundTrip(CORPUS_DIR);
  if (report.failed > 0) {
    console.log('');
    for (const f of report.failures.slice(0, 10)) {
      console.log(`  ${f.file} [${f.stage}] ${f.reason}`);
    }
  }
  assert.strictEqual(report.failed, 0, `语料回归不应有失败，实际 ${report.failed} 例`);
  assert.ok(report.total >= 100, `语料规模异常，仅 ${report.total} 例`);
  console.log(`✅ 全量语料回归：${report.total} 个真实布局全部通过（逐字节一致 ${report.byteExact}，耗时 ${report.elapsed}ms）`);

  console.log('\n🎉 Page IR 往返测试通过！');
}

run();
