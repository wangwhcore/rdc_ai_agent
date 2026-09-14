/**
 * 跨布局引用（frontId）契约测试
 * 运行：node test/layoutRef.test.js
 *
 * 背景：这是一次真实线上崩溃的直接产物。
 * 运行时报 `TypeError: Cannot read properties of undefined (reading 'field')`
 * （front_web / neusoft_web 的 RenderLayout 分发器），
 * 根因是 openM / @@navigator.push 的目标填了「随机 uuid 或占位符」，
 * 运行时按 frontId 查不到目标布局，于是把空节点交给了 RenderLayout。
 *
 * 语料实证（401 份 MdFrontLayout）：
 *   @@navigator.push 的 url -> layoutFrontId 716 次 / 其他命名空间 0 次
 *   .openM 载荷的 id        -> layoutFrontId 358 次 / layoutGid 0 次
 * 注意 MdFrontLayout 的**文件名是 gid**，和 frontId 不通用 —— 这是最容易踩的坑。
 */
const assert = require('assert');
const {
  buildListPage,
  buildAddEditPage,
  buildViewPage,
  buildModal,
  text,
} = require('../index');
const {
  assertLayoutFrontId,
  isPlaceholderFrontId,
  navigate,
  openModal,
} = require('../builder/events');

const HEX_A = '1'.repeat(32);
const HEX_B = '2'.repeat(32);
const HEX_C = '3'.repeat(32);

function baseListConfig(extra = {}) {
  return {
    pageName: '测试列表',
    serverName: 'demo',
    listUrl: '/demo/list',
    functionGid: '0'.repeat(32),
    columns: [],
    ...extra,
  };
}

function run() {
  console.log('开始测试跨布局引用契约...\n');

  // ---------- 1. 形态判定 ----------
  {
    assert.strictEqual(assertLayoutFrontId(HEX_A, 'x'), HEX_A, '合法 32hex frontId 应通过');
    // 语料里有 20 条 url 带尾随制表符（设计器手误），必须容错
    assert.strictEqual(assertLayoutFrontId(`${HEX_A}\t`, 'x'), HEX_A, '尾随空白应被 trim');

    const bad = [
      undefined, null, '', '   ',
      'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', // 非 hex 字符
      'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
      'LAYOUT_SUPPLIER_LIST', // 符号名：语料中不存在这种写法
      '...',                  // LLM 提示词历史遗留的占位符
      'undefined',
      HEX_A.slice(0, 31),     // 长度不足
    ];
    for (const v of bad) {
      assert.throws(
        () => assertLayoutFrontId(v, 'test'),
        e => e.code === 'E_LAYOUT_REF',
        `非法引用应抛 E_LAYOUT_REF: ${JSON.stringify(v)}`
      );
    }
    console.log('✅ 32hex 通过；占位符 / 符号名 / 长度不足全部拒绝');

    assert.ok(isPlaceholderFrontId('0'.repeat(32)), '全 0 应识别为占位符');
    assert.ok(isPlaceholderFrontId('a'.repeat(32)), '全 a 应识别为占位符');
    assert.ok(!isPlaceholderFrontId(HEX_A.replace(/1$/, '2')), '有区分度的 hex 不算占位符');
    console.log('✅ 占位符识别（全同一字符）');
  }

  // ---------- 2. 事件表达式产出 ----------
  {
    const push = navigate(HEX_A, { type: 'add' });
    assert.strictEqual(push, `pubsub.publish('@@navigator.push', { url:'${HEX_A}', type:'add' });`);
    assert.throws(() => navigate('zzz'), e => e.code === 'E_LAYOUT_REF');

    const modal = openModal(HEX_A, HEX_B, { type: 'delete', data: 'rowData' });
    assert.ok(modal.includes(`'${HEX_A}.openM'`), 'openM 命名空间应是本页 frontId');
    assert.ok(modal.includes(`id: "${HEX_B}"`), 'openM 的 id 应是目标弹窗布局 frontId');
    assert.throws(() => openModal(HEX_A, '...'), e => e.code === 'E_LAYOUT_REF');
    console.log('✅ navigate / openModal 产出形态与守门');
  }

  // ---------- 3. Builder 生成期守门 ----------
  {
    assert.throws(
      () => buildListPage(baseListConfig()),
      e => e.code === 'E_LAYOUT_REF' && /addEditPageFrontId/.test(e.message),
      '缺 addEditPageFrontId 应抛错'
    );
    assert.throws(
      () => buildListPage(baseListConfig({ addEditPageFrontId: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz' })),
      e => e.code === 'E_LAYOUT_REF',
      'addEditPageFrontId 填占位符应抛错'
    );
    assert.throws(
      () => buildListPage(baseListConfig({ addEditPageFrontId: HEX_A })),
      e => e.code === 'E_LAYOUT_REF' && /confirmModalFrontId/.test(e.message),
      '有 delete 操作但缺 confirmModalFrontId 应抛错'
    );
    // 不存在 delete 操作时不该强制要求弹窗引用
    const noDelete = buildListPage(baseListConfig({
      addEditPageFrontId: HEX_A,
      rowOperations: ['edit'],
    }));
    const noDeleteDoc = JSON.parse(noDelete.value);
    assert.ok(!/openM/.test(noDelete.value), '无 delete 操作不应产出 openM 事件');
    assert.ok(noDeleteDoc.desktop.layoutList, '仍应生成完整 layoutList');
    console.log('✅ buildListPage 生成期守门（缺引用 / 占位符 / 按需校验）');

    assert.throws(
      () => buildAddEditPage({
        pageName: '编辑页', functionGid: '0'.repeat(32), serverName: 'demo',
        entityPath: 'demo', entityIdField: 'id', fields: [text('a', 'A')],
      }),
      e => e.code === 'E_LAYOUT_REF' && /listPageFrontId/.test(e.message),
      'addEdit 缺 listPageFrontId 应抛错'
    );
    assert.throws(
      () => buildViewPage({
        pageName: '查看页', functionGid: '0'.repeat(32), serverName: 'demo',
        entityPath: 'demo', entityIdField: 'id', fields: [text('a', 'A')],
        listPageFrontId: 'LAYOUT_SUPPLIER_LIST',
      }),
      e => e.code === 'E_LAYOUT_REF',
      'view 的返回跳转用符号名应被拒绝'
    );
    // 弹窗自身也必须是 32hex frontId，否则列表页永远引用不到它
    assert.throws(
      () => buildModal({ pageName: '弹窗', functionGid: '0'.repeat(32), frontId: 'deleteConfirmModal' }),
      e => e.code === 'E_LAYOUT_REF' && /buildModal/.test(e.message),
      'buildModal 传符号名 frontId 应抛错'
    );
    console.log('✅ addEdit / view / modal 的 frontId 同样守门');
  }

  // ---------- 3.5 示例里的列表页与弹窗必须配对 ----------
  {
    const listLayout = require('../examples/inquiry-list');
    const modalLayout = require('../examples/delete-confirm-modal');
    assert.ok(
      listLayout.value.includes(modalLayout.frontId),
      'inquiry-list 的 confirmModalFrontId 应与 delete-confirm-modal 的 frontId 一致'
    );
    console.log('✅ 示例列表页与弹窗 frontId 相互匹配');
  }

  // ---------- 4. 旧字段名兼容 ----------
  {
    const legacy = buildListPage(baseListConfig({
      addEditPageId: HEX_A,
      confirmModalId: HEX_B,
    }));
    assert.ok(legacy.value.includes(`url:'${HEX_A}'`), '旧名 addEditPageId 应仍生效');
    // value 是 JSON 字符串，表达式里的双引号会被转义，这里只校验目标 id 是否出现
    assert.ok(legacy.value.includes(HEX_B), '旧名 confirmModalId 应仍生效');
    assert.ok(/openM/.test(legacy.value), '旧名 confirmModalId 应产出 openM 事件');

    const legacyForm = buildAddEditPage({
      pageName: '编辑页', functionGid: '0'.repeat(32), serverName: 'demo',
      entityPath: 'demo', entityIdField: 'id', fields: [text('a', 'A')],
      listPageId: HEX_C,
    });
    assert.ok(legacyForm.value.includes(`url:'${HEX_C}'`), '旧名 listPageId 应仍生效');
    console.log('✅ 旧字段名向后兼容');
  }

  // ---------- 5. 生成结果必须自洽：check 不应再有 error ----------
  {
    const check = require('../check');
    const layout = buildListPage(baseListConfig({
      addEditPageFrontId: HEX_A,
      confirmModalFrontId: HEX_B,
    }));
    const res = check.run(layout);
    assert.strictEqual(
      res.summary.bySeverity.error, 0,
      `正规生成结果不应有 error 级诊断: ${JSON.stringify(res.diagnostics.filter(d => d.severity === 'error'))}`
    );
    console.log('✅ 填齐 frontId 后 check 零 error');
  }

  console.log('\n🎉 跨布局引用契约测试通过！');
}

run();
