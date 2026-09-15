/**
 * 成套页面生成（pageSuite）测试
 * 运行：node test/pageSuite.test.js
 *
 * 这个测试锁的是一条**不变量**，不是几个字段：
 *
 *   list.addEditPageFrontId  === addEdit 的顶层 frontId
 *   list.confirmModalFrontId === modal  的顶层 frontId
 *   addEdit.listPageFrontId  === list   的顶层 frontId
 *   modal 的 ok/closeM 命名空间 === modal 的顶层 frontId
 *
 * 为什么值得单独测：这三个页面互相引用，谁少接一根线都不会报错 ——
 * 生成照样成功、check 单文件也照样过，只有运行时按 frontId 查不到布局时
 * 才在 RenderLayout 抛 `reading 'field'`（线上崩过一次的老毛病）。
 * 也就是「错误在生成期不可见」，只能靠不变量守住。
 */
const assert = require('assert');
const { buildPageSuite, allocateIds } = require('../services/pageSuite');
const { check } = require('../check');

const HEX_LIST = '1'.repeat(32);
const HEX_EDIT = '2'.repeat(32);
const HEX_MODAL = '3'.repeat(32);

function valueOf(layout) {
  return typeof layout.value === 'string' ? JSON.parse(layout.value) : layout.value;
}

/**
 * 收集对象里所有字符串值。
 * ⚠️ 不要在 JSON.stringify 的结果上做正则：里面双引号被转义成 \"，
 * 直接匹配 `id: "x"` 会一个都匹配不到（本测试第一版就踩了）。
 * 逐层取出原始字符串再匹配，才是稳定做法。
 */
function stringsOf(node, out = []) {
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { for (const n of node) stringsOf(n, out); return out; }
  if (node && typeof node === 'object') {
    for (const v of Object.values(node)) stringsOf(v, out);
  }
  return out;
}

/** 收集某布局里所有 @@navigator.push 的目标 url */
function pushTargets(layout) {
  return stringsOf(valueOf(layout))
    .flatMap(s => Array.from(s.matchAll(/navigator\.push',\s*\{\s*url:'([^']*)'/g), m => m[1]));
}

/** 收集某布局里所有 openM 的命名空间 owner 与目标 id */
function openMCalls(layout) {
  return stringsOf(valueOf(layout))
    .flatMap(s => Array.from(
      s.matchAll(/publish\('([^']*)\.openM',\s*\{\s*id:\s*"([^"]*)"/g),
      m => ({ owner: m[1], target: m[2] })
    ));
}

/** 布局里出现过的全部字符串（用于断言事件命名空间） */
function stringsText(layout) {
  return stringsOf(valueOf(layout)).join('\n');
}

const BASE = {
  pageName: '供货商',
  functionGid: '0'.repeat(32),
  serverName: 'mdgeneric',
  entityPath: 'vendor',
  listUrl: '/md/vendor/list',
  columns: [{ field: 'code', headerName: '编码' }, { field: 'name', headerName: '名称' }],
  fields: [{ type: 'text', field: 'code', label: '编码' }, { type: 'number', field: 'qty', label: '数量' }],
};

function run() {
  // ---------- 1. 接线不变量（预分配 id 时必须原样接线）----------
  {
    const suite = buildPageSuite({
      ...BASE,
      ids: { listFrontId: HEX_LIST, addEditPageFrontId: HEX_EDIT, confirmModalFrontId: HEX_MODAL },
    });
    const { list, addEdit, modal } = suite.layouts;

    assert.strictEqual(list.frontId, HEX_LIST, '列表页应使用预分配的 frontId');
    assert.strictEqual(addEdit.frontId, HEX_EDIT, '编辑页应使用预分配的 frontId');
    assert.strictEqual(modal.frontId, HEX_MODAL, '弹窗应使用预分配的 frontId');

    // ① 列表页 → 编辑页（新建按钮 + 编辑/复制行操作）
    assert.ok(
      pushTargets(list).includes(HEX_EDIT),
      `列表页应有指向编辑页 frontId 的跳转，实际 ${JSON.stringify(pushTargets(list))}`
    );
    // ③ 编辑页 → 列表页（返回按钮）
    assert.ok(
      pushTargets(addEdit).includes(HEX_LIST),
      `编辑页返回按钮应指向列表页 frontId，实际 ${JSON.stringify(pushTargets(addEdit))}`
    );
    // ② 列表页 → 弹窗（删除行操作）
    const calls = openMCalls(list);
    assert.strictEqual(calls.length >= 1, true, '列表页应有 openM 调用（删除行操作）');
    for (const c of calls) {
      assert.strictEqual(c.owner, HEX_LIST, 'openM 的命名空间应是**本页**（列表页）frontId');
      assert.strictEqual(c.target, HEX_MODAL, 'openM 的 id 应是目标弹窗布局 frontId');
    }
    // ④ 弹窗自身事件命名空间
    const modalText = stringsText(modal);
    assert.ok(modalText.includes(`${HEX_MODAL}.ok`), '弹窗 ok 事件应挂在自身 frontId 上');
    assert.ok(modalText.includes(`${HEX_MODAL}.closeM`), '弹窗 closeM 事件应挂在自身 frontId 上');

    console.log('✅ 成套接线不变量：list ↔ addEdit、list → modal、modal 自命名，四根线全接对');
  }

  // ---------- 2. 省略 id 时统一分配，且分配结果回传 ----------
  {
    const suite = buildPageSuite(BASE);
    const { list, addEdit, modal } = suite.layouts;
    const HEX32 = /^[0-9a-f]{32}$/i;

    for (const [k, v] of Object.entries(suite.ids)) {
      assert.ok(HEX32.test(v), `${k} 应是 32 位 hex，实际 ${v}`);
    }
    // 三个 id 必须互不相同 —— 撞了就是同一页面自己引用自己
    assert.strictEqual(new Set(Object.values(suite.ids)).size, 3, '三个 frontId 不应重复');

    assert.strictEqual(list.frontId, suite.ids.listFrontId);
    assert.strictEqual(addEdit.frontId, suite.ids.addEditPageFrontId);
    assert.strictEqual(modal.frontId, suite.ids.confirmModalFrontId);
    assert.ok(pushTargets(list).includes(suite.ids.addEditPageFrontId), '分配出的 id 必须真的接上线');
    assert.ok(pushTargets(addEdit).includes(suite.ids.listFrontId), '分配出的 id 必须真的接上线');
    console.log('✅ 省略 id 时统一分配，并把分配结果回传给调用方（可持久化复用）');
  }

  // ---------- 3. 显式传入非法 id 必须抛，不许静默 uuid 兜底 ----------
  {
    // 静默兜底是「死循环」的真正来源：兜底值与另一端永远对不上，
    // 而产物看起来完全正常 —— 只能等运行时崩。
    for (const bad of ['...', 'myListPage', 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz']) {
      assert.throws(
        () => buildPageSuite({ ...BASE, ids: { listFrontId: bad } }),
        e => e && e.code === 'E_LAYOUT_REF',
        `非法 listFrontId ${JSON.stringify(bad)} 应抛 E_LAYOUT_REF`
      );
    }
    // 空串按「未提供」处理（可省略语义），但符号名不行
    const ok = buildPageSuite({ ...BASE, ids: { listFrontId: '' } });
    assert.ok(/^[0-9a-f]{32}$/i.test(ok.ids.listFrontId), '空串视为未提供并现场分配');
    console.log('✅ 显式非法 frontId 直接抛 E_LAYOUT_REF；空串按未提供处理');
  }

  // ---------- 4. 没有删除行操作时不生成弹窗 ----------
  {
    const suite = buildPageSuite({ ...BASE, rowOperations: ['edit'] });
    assert.strictEqual(suite.layouts.modal, null, '无 delete 行操作时不应生成弹窗');
    assert.strictEqual(suite.ids.confirmModalFrontId, null, '无弹窗时不应分配弹窗 frontId');
    assert.strictEqual(openMCalls(suite.layouts.list).length, 0, '不应有 openM 调用');

    const forced = buildPageSuite({ ...BASE, rowOperations: ['edit'], withConfirmModal: true });
    assert.ok(forced.layouts.modal, 'withConfirmModal: true 应强制生成弹窗');
    console.log('✅ 弹窗按 rowOperations 推导，可用 withConfirmModal 强制覆盖');
  }

  // ---------- 5. 产物必须过 check（零 error）----------
  {
    const suite = buildPageSuite(BASE);
    for (const [name, layout] of Object.entries(suite.layouts)) {
      if (!layout) continue;
      const res = check(layout);
      const errors = res.diagnostics.filter(d => d.severity === 'error');
      assert.strictEqual(errors.length, 0,
        `${name} 不应有 error，实际 ${errors.map(e => `${e.code} ${e.path}`).join('; ')}`);
    }
    console.log('✅ 三份产物均通过 check 零 error');
  }

  // ---------- 6. allocateIds 是「先分配再分别生成」路径的入口 ----------
  {
    const ids = allocateIds();
    const a = buildPageSuite({ ...BASE, ids });
    const b = buildPageSuite({ ...BASE, ids });
    // 同一组 id 两次生成，接线必须稳定（id 不再变化；其余 uuid 允许不同）
    assert.deepStrictEqual(a.ids, b.ids, '同一组 id 两次生成应得到相同的 ids');
    assert.deepStrictEqual(a.ids, ids, 'allocateIds 的结果应被原样采用');
    assert.ok(pushTargets(a.layouts.list).includes(ids.addEditPageFrontId));
    console.log('✅ allocateIds + 单页接口（路径 A）与成套生成（路径 B）共用同一套接线规则');
  }

  console.log('\n🎉 pageSuite 测试通过！');
}

run();
