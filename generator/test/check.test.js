/**
 * check 引擎测试：规则正反例 + 兼容层 + 选项
 * 运行：node test/check.test.js
 */

const assert = require('assert');
const check = require('../check');
const { validate } = require('../builder/validator');
const buildListPage = require('../examples/inquiry-list');
const buildAddEditPage = require('../examples/inquiry-add-edit');

/** 深拷贝一个干净的列表页样本 */
const sample = () => JSON.parse(JSON.stringify(buildListPage));

/** 深拷贝一个干净的表单页样本（含 TextHook 等字段组件） */
const sampleForm = () => JSON.parse(JSON.stringify(buildAddEditPage));

/**
 * 取出 value 对象，便于直接改结构。
 * 用 WeakMap 缓存，保证「改对象」与「写回 layout.value」操作的是同一份数据，
 * 否则每次 JSON.parse 都会产生新对象，改动会被静默丢弃。
 */
const parsedCache = new WeakMap();
function valueOf(layout) {
  if (!parsedCache.has(layout)) {
    parsedCache.set(
      layout,
      typeof layout.value === 'string' ? JSON.parse(layout.value) : layout.value
    );
  }
  return parsedCache.get(layout);
}

/** 找到第一个指定类型的组件，返回 [id, 组件对象]（可安全改写） */
function findComp(layout, type) {
  const v = valueOf(layout);
  const hit = Object.entries(v.desktop.components || {}).find(([, c]) => c && c.type === type);
  if (hit) return hit;

  // 部分组件（如列表页的 CardHook）只内联在 layoutList 中，未登记到映射
  let found = null;
  const walk = node => {
    if (found || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.type === type && node.property && node.property.id) {
      found = [node.property.id, node];
      return;
    }
    if (node.cols) walk(node.cols);
    if (node.components) walk(node.components);
    if (node.rows) walk(node.rows);
  };
  // layoutList 是「区域 id → { rows }」的映射，先展开各区域的 rows
  for (const region of Object.values(v.desktop.layoutList || {})) walk(region.rows);
  return found;
}

/** 彻底移除某类型组件：components 映射与 layoutList 内联挂载点都要清掉 */
function removeComponentsOfType(layout, type) {
  const v = valueOf(layout);
  const removed = new Set();
  for (const [id, c] of Object.entries(v.desktop.components || {})) {
    if (c && c.type === type) {
      delete v.desktop.components[id];
      removed.add(id);
    }
  }
  for (const region of Object.values(v.desktop.layoutList || {})) {
    for (const row of region.rows || []) {
      for (const col of row.cols || []) {
        col.components = (col.components || []).filter(c =>
          typeof c === 'string' ? !removed.has(c) : !(c && c.type === type)
        );
      }
    }
  }
  return removed;
}

/** 命中某条规则 */
const has = (res, code) => res.diagnostics.some(d => d.code === code);
const only = (res, code) => res.diagnostics.filter(d => d.code === code);

function run() {
  console.log('开始测试 check 引擎...\n');

  // ---------- 正例 ----------
  const clean = check.run(sample());
  assert.strictEqual(clean.ok, true, `干净样本不应有错误: ${JSON.stringify(clean.diagnostics.filter(d => d.severity === 'error'))}`);
  assert.ok(clean.ir, '应返回 lift 后的 IR');
  console.log('✅ 干净样本通过校验（0 错误）');

  assert.ok(clean.ir.references.length > 0, '应抽出跨引用');
  assert.ok(clean.ir.queries.length > 0, '应抽出数据源契约');
  console.log(`✅ IR 语义提取：引用 ${clean.ir.references.length} 条，数据源 ${clean.ir.queries.length} 条`);

  // ---------- 结构类 ----------
  {
    const l = sample();
    delete l.gid;
    const res = check.run(l);
    assert.ok(has(res, 'STRUCT001'), '删掉 gid 应报 STRUCT001');
    assert.strictEqual(res.ok, false);
    console.log('✅ STRUCT001 外层必填字段缺失');
  }
  {
    const l = sample();
    const v = valueOf(l);
    v.desktop.layoutList.LayoutMain.rows[0].cols[0].property.style.span = 40;
    l.value = JSON.stringify(v);
    assert.ok(has(check.run(l), 'STRUCT009'), 'span=40 应报 STRUCT009');
    const l2 = sample();
    const v2 = valueOf(l2);
    v2.desktop.layoutList.LayoutMain.rows[0].cols[0].property.style.span = '12';
    l2.value = JSON.stringify(v2);
    assert.ok(!has(check.run(l2), 'STRUCT009'), 'span="12" 是语料中的真实形态，不应报错');
    console.log('✅ STRUCT009 栅格约束（含字符串 span 归一化）');
  }
  {
    const l = sample();
    const v = valueOf(l);
    v.desktop.layoutInfo.componentIds.push('NotExistRegion');
    l.value = JSON.stringify(v);
    assert.ok(has(check.run(l), 'STRUCT006'), '登记不存在的区域应报 STRUCT006');
    console.log('✅ STRUCT006 componentIds 指向不存在的区域');
  }

  // ---------- 标识类 ----------
  {
    const l = sample();
    const v = valueOf(l);
    const row = v.desktop.layoutList.LayoutMain.rows[0];
    row.property.id = row.cols[0].property.id; // 行与列撞号
    l.value = JSON.stringify(v);
    assert.ok(has(check.run(l), 'ID001'), 'id 重复应报 ID001');
    console.log('✅ ID001 id 重复');
  }
  {
    const l = sample();
    const v = valueOf(l);
    const [colId] = findComp(l, 'ColumnHook');
    v.desktop.layoutList.LayoutMain.rows[0].cols[0].property.id = colId;
    l.value = JSON.stringify(v);
    assert.ok(has(check.run(l), 'ID003'), '容器 id 与 components key 撞号应报 ID003');
    console.log('✅ ID003 容器 id 与 components key 冲突');
  }
  {
    const l = sample();
    const v = valueOf(l);
    const [id] = findComp(l, 'ColumnHook');
    delete v.desktop.components[id].type;
    l.value = JSON.stringify(v);
    assert.ok(has(check.run(l), 'ID006'), '缺 type 的条目应报 ID006');
    console.log('✅ ID006 components 条目缺少 type');
  }

  // ---------- ID004 孤儿组件：「被引用」的判据 ----------
  // 夹具（列表页）天然带 rowOperations: ['edit','delete','copy',{label:'调整时间'}]，
  // 会生成 4 个行操作 ButtonHook —— 它们**不走容器挂载**，只被
  // TableHook.rowOperationItem[].id 引用。修复前这里会报 4 个假孤儿。
  {
    const res = check.run(sample());
    const rowOpRefs = res.ir.references.filter(r => r.via === 'rowOperationItem[].id');
    assert.strictEqual(rowOpRefs.length, 4, `应抽出 4 条行操作按钮引用，实际 ${rowOpRefs.length}`);
    assert.ok(rowOpRefs.every(r => r.resolves && r.actualType === 'ButtonHook'),
      '行操作按钮引用应全部命中 ButtonHook');
    assert.strictEqual(only(res, 'ID004').length, 0,
      '被 rowOperationItem[].id 引用的按钮不得报孤儿（这正是修前的误报来源）');
    console.log('✅ ID004 行操作按钮经 rowOperationItem[].id 被引用，不报孤儿');
  }
  {
    const l = sample();
    const v = valueOf(l);
    const id = 'a'.repeat(32);
    v.desktop.components[id] = { type: 'TextHook', property: { id, label: '没人用我' } };
    l.value = JSON.stringify(v);
    const orphans = only(check.run(l), 'ID004');
    assert.strictEqual(orphans.length, 1, `应报 1 个孤儿，实际 ${orphans.length}`);
    assert.ok(orphans[0].message.includes('未被任何挂载点或引用使用'));
    assert.strictEqual(orphans[0].extra.selfSubscribes, 0, '不该无中生有地报自我订阅数');
    console.log('✅ ID004 真孤儿仍被报出');
  }
  {
    // ★ 自我订阅不是「被引用」的证据：语料里指向孤儿的 416 次寻址全是组件订阅自己，
    //   他人订阅 0 例。若把自我订阅也算被引用，67 个真孤儿会被静默放过。
    const l = sample();
    const v = valueOf(l);
    const id = 'b'.repeat(32);
    v.desktop.components[id] = {
      type: 'ButtonHook',
      property: {
        id, text: '有 handler 但没挂载',
        subscribes: [{ event: `${id}.click`, pubs: [{ event: '', eventPayloadExpression: 'console.log(1)' }] }],
      },
    };
    l.value = JSON.stringify(v);
    const orphans = only(check.run(l), 'ID004');
    assert.strictEqual(orphans.length, 1, '自我订阅不能让它免于孤儿判定');
    assert.strictEqual(orphans[0].extra.selfSubscribes, 1, '应识别出自带 1 条自我订阅');
    assert.ok(orphans[0].message.includes('自带 1 条事件订阅'),
      `提示应区分「有逻辑却没挂载」，实际: ${orphans[0].message}`);
    console.log('✅ ID004 自我订阅不算被引用，但在提示里区分出来');
  }
  {
    // 他人寻址在当前语料里 0 例，但判据必须完整 —— 否则将来会误报
    const l = sample();
    const v = valueOf(l);
    const target = 'c'.repeat(32);
    v.desktop.components[target] = { type: 'ButtonHook', property: { id: target, text: '别人监听我' } };
    const [hostId, host] = findComp(l, 'TableHook');
    assert.ok(hostId && host, '夹具应有 TableHook');
    host.property.subscribes = host.property.subscribes || [];
    host.property.subscribes.push({
      event: `${target}.click`,
      pubs: [{ event: '', eventPayloadExpression: 'console.log(2)' }],
    });
    l.value = JSON.stringify(v);
    const res = check.run(l);
    assert.ok(!only(res, 'ID004').some(d => d.extra.id === target),
      '被别人订阅寻址的组件不算孤儿');
    console.log('✅ ID004 他人事件寻址算被引用（语料 0 例，判据仍需完整）');
  }
  {
    // 手写 id（非 hex32）被引用时，过去会被 extractReferences 的 HEX32 过滤掉
    const l = sample();
    const v = valueOf(l);
    const [tableId] = findComp(l, 'TableHook');
    v.desktop.components.operationLeft = { type: 'ColumnHook', property: { id: 'operationLeft', title: '操作' } };
    const cols = v.desktop.components[tableId].property.columns;
    cols.push({ colId: 'operationLeft', title: '操作' });
    l.value = JSON.stringify(v);
    const res = check.run(l);
    const ref = res.ir.references.find(r => r.to === 'operationLeft');
    assert.ok(ref, '手写 id 的引用必须被抽出（只认 hex32 会丢掉它）');
    assert.strictEqual(ref.resolves, true, '命中了 components，应标记为已解析');
    assert.ok(!only(res, 'ID004').some(d => d.extra.id === 'operationLeft'),
      '被手写 id 引用的组件不算孤儿');
    console.log('✅ 引用抽取消除了「只认 hex32」的限制');
  }
  {
    // 放宽不得引入误报：既非 id 形态、又命中不了目标 → 一律忽略
    const l = sample();
    const v = valueOf(l);
    const [tableId] = findComp(l, 'TableHook');
    v.desktop.components[tableId].property.columns.push({ colId: '普通标签不是id', title: 'x' });
    l.value = JSON.stringify(v);
    const res = check.run(l);
    assert.strictEqual(res.ir.references.filter(r => r.to === '普通标签不是id').length, 0,
      '普通字符串不得被当成引用，否则会产生大量虚假悬空');
    console.log('✅ 放宽后不引入虚假引用');
  }
  {
    const l = sample();
    const v = valueOf(l);
    const [tableId] = findComp(l, 'TableHook');
    v.desktop.components[tableId].property.rowOperationItem[0].id = 'd'.repeat(32);
    l.value = JSON.stringify(v);
    const res = check.run(l);
    const dangling = res.ir.references.filter(r => r.via === 'rowOperationItem[].id' && !r.resolves);
    assert.strictEqual(dangling.length, 1, '行操作按钮指向不存在的组件应被标记为悬空');
    assert.ok(has(res, 'REF002'), '悬空的组件引用应产出 REF002');
    console.log('✅ rowOperationItem[].id 悬空可被检出');
  }

  // ---------- 引用类 ----------
  {
    const l = sample();
    const v = valueOf(l);
    const [, card] = findComp(l, 'CardHook');
    card.property.layoutId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    l.value = JSON.stringify(v);
    const res = check.run(l);
    assert.ok(has(res, 'REF001'), 'CardHook.layoutId 悬空应报 REF001');
    const d = only(res, 'REF001')[0];
    assert.ok(d.path.includes('property.layoutId'), `路径应精确定位，实际: ${d.path}`);
    assert.ok(!d.path.includes('layoutId.layoutId'), '路径不应重复拼接属性名');
    console.log('✅ REF001 区域引用悬空（路径可精确定位）');
  }
  {
    // 生成器的列表卡片只内联在 layoutList，未登记到 components 映射
    const l = sample();
    const res = check.run(l);
    assert.ok(has(res, 'ID007'), '内联未登记的卡片应报 ID007');
    console.log('✅ ID007 组件只内联未登记到 components 映射');
  }
  {
    const l = sample();
    const v = valueOf(l);
    const [tableId, table] = findComp(l, 'TableHook');
    v.desktop.components[tableId].property.columns[0].colId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    l.value = JSON.stringify(v);
    assert.ok(has(check.run(l), 'REF002'), '列 colId 悬空应报 REF002');
    console.log('✅ REF002 组件引用悬空');
  }
  {
    const l = sample();
    const v = valueOf(l);
    const [qId] = findComp(l, 'AdvanceQueryHook');
    const [btnId] = findComp(l, 'ButtonHook');
    v.desktop.components[qId].property.associateId = btnId;
    l.value = JSON.stringify(v);
    const res = check.run(l);
    assert.ok(has(res, 'REF003'), 'associateId 指向非 TableHook 应报 REF003');
    console.log('✅ REF003 引用目标类型不符');
  }
  {
    // 使用 builder/events.js 中 navigate() 的真实产出形态
    const l = sample();
    const v = valueOf(l);
    const [, comp] = findComp(l, 'ButtonHook');
    comp.property.actionConfig = "pubsub.publish('@@navigator.push', { url:'', type:'add' });";
    l.value = JSON.stringify(v);
    assert.ok(has(check.run(l), 'REF004'), '空跳转目标应报 REF004');
    console.log('✅ REF004 跳转目标为空');
  }
  {
    // 生成器给删除弹窗写的是 '2222…' 这类显眼占位符；
    // 上一版用 uuid() 兜底，产出的悬空引用任何静态检查都发现不了
    const res = check.run(sample());
    const d = res.diagnostics.find(x => x.code === 'REF006');
    assert.ok(d, 'openM 目标为占位符应报 REF006');
    assert.strictEqual(d.severity, 'warning');
    assert.ok(d.message.includes('占位符'), 'REF006 文案应点明占位符');
    console.log('✅ REF006 弹窗目标是未替换占位符（warning）');
  }
  {
    const l = sample();
    const v = valueOf(l);
    const [, comp] = findComp(l, 'ButtonHook');
    comp.property.actionConfig =
      "pubsub.publish('ffffffffffffffffffffffffffffffff.openM', "
      + '{ id: "既不是hex也不是frontId", title: "x", width: "small", type: "delete", data: eventPayload.rowData });';
    l.value = JSON.stringify(v);
    const res = check.run(l);
    assert.ok(
      res.diagnostics.some(x => x.code === 'REF006' && x.severity === 'error'),
      '非 hex 的弹窗目标应报 REF006/error'
    );
    assert.strictEqual(res.ok, false, 'REF006 error 应让 check 整体不通过');
    console.log('✅ REF006 弹窗目标非法（error）');
  }
  {
    // REF007：卡片容器指向页面级区域 → 同一区域被渲染两遍（按钮成对重复）
    // 语料判据：卡片容器引用 1320 条，出现在 componentIds 内的 0 条。
    // 注意 REF001 拦不住它 —— 具名区域确实存在，引用「解析得通」，只有这条能报。
    const l = sampleForm();
    const v = valueOf(l);
    const [, card] = findComp(l, 'CardHook');
    assert.ok(card && card.property.toolContainerId, '样本应带已接好线的卡片');
    assert.strictEqual(has(check.run(l), 'REF007'), false, '生成器产物不应触发 REF007');

    card.property.toolContainerId = v.desktop.layoutInfo.componentIds.includes('TitleTools')
      ? 'TitleTools'
      : v.desktop.layoutInfo.componentIds[0];
    l.value = JSON.stringify(v);
    const res = check.run(l);
    const d = res.diagnostics.find(x => x.code === 'REF007');
    assert.ok(d, '卡片认领页面级区域应报 REF007');
    assert.strictEqual(d.severity, 'error');
    assert.ok(d.message.includes('渲染两次'), 'REF007 文案应点明会被渲染两次');
    assert.strictEqual(res.ok, false, 'REF007 error 应让 check 整体不通过');
    console.log('✅ REF007 卡片容器认领页面级区域（error）');
  }

  // ---------- 属性类 ----------
  {
    const l = sampleForm();
    const v = valueOf(l);
    const [id] = findComp(l, 'TextHook');
    v.desktop.components[id].property.notARealKey = 1;
    l.value = JSON.stringify(v);
    const res = check.run(l);
    assert.ok(has(res, 'PROP002'), '未知属性应报 PROP002');
    console.log('✅ PROP002 未知 property key（白名单来自语料）');
  }
  {
    // 语料是旧设计器产物，逻辑上不可能证明「新设计器新增字段」合法。
    // overlay 就是这份例外的台账：登记过的键不再报 PROP002。
    const l = sampleForm();
    const v = valueOf(l);
    const [id] = findComp(l, 'TextHook');
    v.desktop.components[id].property.ruleField = '';
    l.value = JSON.stringify(v);
    const docs = only(check.run(l), 'PROP002').filter(d => d.extra.key === 'ruleField');
    assert.strictEqual(docs.length, 0,
      `overlay 已登记 TextHook.ruleField，不应再报 PROP002，实际 ${docs.length} 条`);
    console.log('✅ PROP002 增量白名单（overlay）登记过的键不再误报');
  }
  {
    // 但 overlay 是按类型的：登记在 TextHook/ButtonHook 上，不代表 ButtonHook 以外随便用。
    // 这种情况下仍要报，且 hint 要说清「这是新设计器增量 + 已登记在哪些类型」。
    const l = sample();
    const v = valueOf(l);
    const [id, comp] = findComp(l, 'ColumnHook');
    comp.property.ruleField = '';
    l.value = JSON.stringify(v);
    const docs = only(check.run(l), 'PROP002').filter(d => d.extra.key === 'ruleField');
    assert.strictEqual(docs.length, 1,
      `ruleField 未登记在 ColumnHook 上，应报 1 条，实际 ${docs.length}`);
    assert.ok(/新设计器增量/.test(docs[0].hint),
      `hint 应指明这是新设计器增量，实际：${docs[0].hint}`);
    assert.strictEqual(docs[0].extra.overlaySince, 'designer-2.0', 'extra 应带登记出处');
    console.log('✅ PROP002 overlay 越界使用：提示新设计器增量与已登记类型');
  }
  {
    const l = sampleForm();
    const v = valueOf(l);
    const [id] = findComp(l, 'TextHook');
    delete v.desktop.components[id].property.filed;
    l.value = JSON.stringify(v);
    assert.ok(has(check.run(l), 'PROP003'), '输入控件缺 filed 应报 PROP003');
    const doc = only(check.run(l), 'PROP003')[0];
    assert.strictEqual(doc.severity, 'error');
    console.log('✅ PROP003 输入控件缺少字段绑定');
  }
  {
    const l = sample();
    const v = valueOf(l);
    const [id, comp] = findComp(l, 'ColumnHook');
    const p = comp.property;
    p.displayMode = true;
    p.singleValidate = 'required';
    l.value = JSON.stringify(v);
    assert.ok(has(check.run(l), 'PROP006'), '只读+必填应报 PROP006');
    console.log('✅ PROP006 只读与必填冲突');
  }

  // ---------- 数据源类 ----------
  {
    const l = sample();
    const v = valueOf(l);
    const [tableId] = findComp(l, 'TableHook');
    v.desktop.components[tableId].property.dataSource = {};
    l.value = JSON.stringify(v);
    const res = check.run(l);
    const ds = only(res, 'DS001');
    assert.strictEqual(ds.length, 1, '空数据源只应报一条 DS001，不应重复报 DS002/DS003');
    assert.strictEqual(ds[0].severity, 'error');
    console.log('✅ DS001 列表页表格缺少数据源（空对象不重复报错）');
  }
  {
    const l = sample();
    const v = valueOf(l);
    const [tableId, table] = findComp(l, 'TableHook');
    table.property.dataSource.url = 'vendor/list'; // 缺少前导 /
    l.value = JSON.stringify(v);
    assert.ok(has(check.run(l), 'DS004'), 'url 非绝对路径应报 DS004');
    console.log('✅ DS004 数据源 url 形态');
  }
  {
    const l = sample();
    const v = valueOf(l);
    const [, table] = findComp(l, 'TableHook');
    table.property.dataSource.url = '/vendor/${id}/list'; // 未替换的占位符
    l.value = JSON.stringify(v);
    assert.ok(has(check.run(l), 'DS006'), 'url 含占位符应报 DS006');
    console.log('✅ DS006 数据源 url 含未替换占位符');
  }

  // ---------- 语义类 ----------
  {
    const l = sample();
    const v = valueOf(l);
    removeComponentsOfType(l, 'TableHook');
    v.desktop.layoutInfo.pageType = 'list';
    l.value = JSON.stringify(v);
    assert.ok(has(check.run(l), 'SEM001'), '列表页无表格应报 SEM001');
    console.log('✅ SEM001 列表页缺少表格');
  }
  {
    const addEdit = JSON.parse(JSON.stringify(buildAddEditPage));
    const v = valueOf(addEdit);
    v.desktop.layoutInfo.formUse = false;
    addEdit.value = JSON.stringify(v);
    assert.ok(has(check.run(addEdit), 'SEM002'), 'formUse=false 应报 SEM002');
    console.log('✅ SEM002 新增页 formUse 未开启');
  }

  // ---------- 选项 ----------
  {
    const l = sampleForm();
    const v = valueOf(l);
    const [id] = findComp(l, 'TextHook');
    v.desktop.components[id].property.notARealKey = 1;
    l.value = JSON.stringify(v);

    const ignored = check.run(l, { ignore: ['PROP002'] });
    assert.ok(!has(ignored, 'PROP002'), 'ignore 应能压制规则');
    const relaxed = check.run(l, { severity: { PROP002: 'info' } });
    assert.ok(has(relaxed, 'PROP002'), 'severity 覆盖后规则仍应触发');
    assert.ok(!relaxed.diagnostics.find(d => d.code === 'PROP002' && d.severity === 'warning'));
    console.log('✅ ignore / severity 选项');
  }
  {
    // value 层不是合法 JSON：走 INPUT003，且必须带精确出错位置
    const res = check.run({ value: '{ this is not json' });
    assert.strictEqual(res.ok, false);
    assert.ok(has(res, 'INPUT003'), 'value 层 JSON 非法应报 INPUT003');
    const d0 = res.diagnostics.find(d => d.code === 'INPUT003');
    assert.ok(d0 && d0.extra && Number.isFinite(d0.extra.position), 'INPUT003 应带 position');

    // value 可解析但解出的不是对象（标量 / 双重编码）：走更精确的 JSON002
    const res2 = check.run({ value: '123' });
    assert.strictEqual(res2.ok, false);
    assert.ok(has(res2, 'JSON002'), 'value 解出非对象应报 JSON002');
    assert.ok(!has(res2, 'INPUT002'), 'JSON002 应取代笼统的 INPUT002');

    // value 可解析且解出对象，但结构不是 Layout（缺 desktop）：走 INPUT002 兜底
    const res3 = check.run({ value: '{"a":1}' });
    assert.strictEqual(res3.ok, false);
    assert.ok(has(res3, 'INPUT002'), 'value 可解析但结构非法应报 INPUT002');
    console.log('✅ INPUT002 / INPUT003 / JSON002 非法输入被优雅捕获（都不抛异常）');
  }
  {
    // 直接喂 IR 也应能工作
    const irRes = check.run(check.run(sample()).ir);
    assert.strictEqual(irRes.ok, true);
    assert.ok(irRes.ir, 'IR 输入不应被二次 lift');
    console.log('✅ 支持直接传入 Page IR');
  }

  // ---------- 兼容层 ----------
  {
    const okRes = validate(sample());
    assert.strictEqual(okRes.ok, true);
    assert.deepStrictEqual(okRes.errors, []);
    assert.ok(Array.isArray(okRes.warnings));

    const bad = sample();
    delete bad.gid;
    const badRes = validate(bad);
    assert.strictEqual(badRes.ok, false);
    assert.ok(badRes.errors.some(e => e.includes('STRUCT001')), '兼容层错误串应带规则码');
    console.log('✅ validate() 兼容层保持 { ok, errors } 契约');
  }

  // ---------- 运行时会求值的字段（PROP009 / PROP010） ----------
  {
    // 语料标定：AQ 的 tagStyle 225/225 恒为 "{display:'inline-block',float:'left'}"（float 的值带引号）
    const l = sample();
    const v = valueOf(l);
    const [aqId, aq] = findComp(l, 'AdvanceQueryHook');
    assert.strictEqual(
      aq.property.tagStyle,
      "{display:'inline-block',float:'left'}",
      'AQ 的 tagStyle 必须与语料逐字节一致（float 的值必须带引号）'
    );
    assert.ok(!has(check.run(l), 'PROP009'), '合法 tagStyle 不应报 PROP009');

    // 裸标识符 → error：运行时求值失败后会把字符串原样当 style 下发，
    // React 遍历字符串下标即报 “Failed to set an indexed property [0] on 'CSSStyleDeclaration'”
    v.desktop.components[aqId].property.tagStyle = "{display:'inline-block',float:left}";
    l.value = JSON.stringify(v);
    const bad = only(check.run(l), 'PROP009');
    assert.strictEqual(bad.length, 1, '裸标识符应报一条 PROP009');
    assert.strictEqual(bad[0].severity, 'error');
    console.log('✅ PROP009 样式字段不得含裸标识符（float:left → error）');
  }
  {
    const l = sample();
    const v = valueOf(l);
    const [, card] = findComp(l, 'CardHook');

    // 引号内的逗号不能被当成分隔符（语料真实取值 { color: 'rgba(0, 0, 0, 0.65)' }）
    card.property.tagStyle = "{ color: 'rgba(0, 0, 0, 0.65)' }";
    l.value = JSON.stringify(v);
    assert.ok(!has(check.run(l), 'PROP009'), '引号内的逗号不应误报');

    // 语料里常见的「注释行 + 合法对象」写法
    card.property.tagStyle = "// {display:'inline-block'}\n{display:'inline-block',marginLeft: '.5rem'}";
    l.value = JSON.stringify(v);
    assert.ok(!has(check.run(l), 'PROP009'), '注释行 + 合法对象不应误报');

    // 分号等语法问题 → 降级 warning（语料里确实存在这类脏值）
    card.property.tagStyle = "{display:'block', marginRight: 8;}";
    l.value = JSON.stringify(v);
    const warn = only(check.run(l), 'PROP009');
    assert.strictEqual(warn.length, 1, '语法可疑应报一条 PROP009');
    assert.strictEqual(warn[0].severity, 'warning');
    console.log('✅ PROP009 引号内逗号/注释行不误报，语法可疑降级为 warning');
  }
  {
    // PROP010：singleValidate 语料非空值 100% 是字符串数组，裸字符串 0 处
    const l = sampleForm();
    const v = valueOf(l);
    const [formId, comp] = findComp(l, 'TextHook');
    assert.ok(
      Array.isArray(comp.property.singleValidate) || comp.property.singleValidate === '',
      'singleValidate 必须是数组或空串'
    );
    assert.ok(!has(check.run(l), 'PROP010'), '语料形态的 singleValidate 不应报 PROP010');

    v.desktop.components[formId].property.singleValidate = 'required'; // 旧生成器的裸字符串写法
    l.value = JSON.stringify(v);
    const doc = only(check.run(l), 'PROP010');
    assert.strictEqual(doc.length, 1, '裸字符串 singleValidate 应报一条 PROP010');
    assert.strictEqual(doc[0].severity, 'error');
    console.log('✅ PROP010 singleValidate 必须是数组（裸字符串 → error）');
  }

  // ---------- 动作编排（ACT）：发布条目契约 ----------
  {
    // ACT001：event 是唯一必填键（语料 6322/6322 都是 string）
    const l = sample();
    const v = valueOf(l);
    const [bid] = findComp(l, 'ButtonHook');
    v.desktop.components[bid].property.subscribes = [
      { event: `${bid}.click`, pubs: [{ eventPayloadExpression: 'callback(1)' }] },
    ];
    l.value = JSON.stringify(v);
    const doc = only(check.run(l), 'ACT001');
    // ★ 去重验证：该组件同时内联在 layoutList 里，规则不得把同一处报两遍
    assert.strictEqual(doc.length, 1, `内联副本不得重复报，实际 ${doc.length} 条`);
    assert.strictEqual(doc[0].severity, 'error');
    console.log('✅ ACT001 发布条目缺 event → error（且内联副本不重复报）');
  }
  {
    // ACT001：event 非字符串
    const l = sample();
    const v = valueOf(l);
    const [bid] = findComp(l, 'ButtonHook');
    v.desktop.components[bid].property.subscribes = [
      { event: `${bid}.click`, pubs: [{ event: 123, eventPayloadExpression: 'x' }] },
    ];
    l.value = JSON.stringify(v);
    const doc = only(check.run(l), 'ACT001');
    assert.strictEqual(doc.length, 1);
    assert.ok(/不是字符串/.test(doc[0].message));
    console.log('✅ ACT001 发布条目 event 非字符串 → error');
  }
  {
    // ACT003：发布字段放错层 —— 订阅条目上写 successPubs
    const l = sample();
    const v = valueOf(l);
    const [bid] = findComp(l, 'ButtonHook');
    v.desktop.components[bid].property.subscribes = [
      {
        event: `${bid}.click`,
        pubs: [],
        successPubs: [{ event: '', eventPayloadExpression: 'callback(1)' }],
      },
    ];
    l.value = JSON.stringify(v);
    const doc = only(check.run(l), 'ACT003');
    assert.ok(doc.some(d => /successPubs/.test(d.message)), '应报出 successPubs 放错层');
    assert.ok(doc.every(d => d.severity === 'error'));
    console.log('✅ ACT003 订阅条目上出现 successPubs → error（放错层）');
  }
  {
    // ACT003：反向 —— 动作条目上写 pubs
    const l = sample();
    const v = valueOf(l);
    const [bid] = findComp(l, 'ButtonHook');
    v.desktop.components[bid].property.subscribes = [
      {
        event: `${bid}.click`,
        pubs: [],
        behaviors: [{ type: 'request', dataSource: { type: 'api', serverName: 'x', url: '/y' }, pubs: [] }],
      },
    ];
    l.value = JSON.stringify(v);
    const doc = only(check.run(l), 'ACT003');
    assert.ok(doc.some(d => /pubs/.test(d.message)), '应报出 pubs 放错层');
    console.log('✅ ACT003 动作条目上出现 pubs → error（放错层）');
  }
  {
    // ACT002：表达式与载荷并存（语料 239 条历史遗留）→ info，不可自动删
    const l = sample();
    const v = valueOf(l);
    const [bid] = findComp(l, 'ButtonHook');
    v.desktop.components[bid].property.subscribes = [
      {
        event: `${bid}.click`,
        pubs: [{
          event: '@@message.success',
          eventPayloadExpression: 'callback(1)',
          payload: '$${message.ok}',
        }],
      },
    ];
    l.value = JSON.stringify(v);
    const doc = only(check.run(l), 'ACT002');
    assert.strictEqual(doc.length, 1, '应报一条 ACT002');
    assert.strictEqual(doc[0].severity, 'info', 'ACT002 只能是 info —— 运行时以表达式为准，删了会改数据');
    console.log('✅ ACT002 表达式与 payload 并存 → info（不可自动删）');
  }
  {
    // ACT004：什么都不做的空条目 → warning
    const l = sample();
    const v = valueOf(l);
    const [bid] = findComp(l, 'ButtonHook');
    v.desktop.components[bid].property.subscribes = [
      { event: `${bid}.click`, pubs: [{ event: '' }] },
    ];
    l.value = JSON.stringify(v);
    const doc = only(check.run(l), 'ACT004');
    assert.strictEqual(doc.length, 1);
    assert.strictEqual(doc[0].severity, 'warning');
    console.log('✅ ACT004 发布条目为空操作 → warning');
  }
  {
    // ACT005：目标没有事件名（"." 与 "<id>." 两种同义写法）→ info
    const l = sample();
    const v = valueOf(l);
    const [bid] = findComp(l, 'ButtonHook');
    v.desktop.components[bid].property.subscribes = [
      { event: `${bid}.click`, pubs: [{ event: '.', eventPayloadExpression: 'x' }] },
      {
        event: `${bid}.blur`,
        pubs: [{ event: `${'a'.repeat(32)}.`, eventPayloadExpression: 'y' }],
      },
    ];
    l.value = JSON.stringify(v);
    const doc = only(check.run(l), 'ACT005');
    assert.strictEqual(doc.length, 2, `"." 与 "<id>." 都应报出，实际 ${doc.length}`);
    assert.ok(doc.every(d => d.severity === 'info'));
    console.log('✅ ACT005 发布目标无事件名（"." / "<id>." 同义）→ info');
  }
  {
    // ★ 触发位置必须扫全：页面级与组件级都要覆盖
    // （元模型审计 v1 只扫页面级，把结论整个搞反过）
    const l = sample();
    const v = valueOf(l);
    v.desktop.subscribes = [
      { event: 'page.componentDidMount', pubs: [{ eventPayloadExpression: 'x' }] },
    ];
    l.value = JSON.stringify(v);
    const doc = only(check.run(l), 'ACT001');
    assert.strictEqual(doc.length, 1);
    assert.strictEqual(doc[0].path, '$.value.desktop.subscribes[0].pubs[0]',
      '页面级订阅的错误路径必须精确');
    console.log('✅ ACT 扫描覆盖页面级 subscribes（路径精确）');
  }
  {
    // ★ 嵌套位置也要扫：property.cellType.subscribes（语料 20 条）
    const l = sample();
    const v = valueOf(l);
    const [cid, col] = findComp(l, 'ColumnHook');
    col.property.cellType = {
      subscribes: [{ event: 'x.click', pubs: [{ eventPayloadExpression: 'x' }] }],
    };
    l.value = JSON.stringify(v);
    const doc = only(check.run(l), 'ACT001');
    assert.strictEqual(doc.length, 1, `嵌套位置的错误应被扫到，实际 ${doc.length}`);
    assert.ok(/\.cellType\.subscribes\[0\]\.pubs\[0\]$/.test(doc[0].path),
      `路径应指向嵌套位置，实际 ${doc[0].path}`);
    console.log(`✅ ACT 递归扫 property 内嵌套位置（ColumnHook ${cid.slice(0, 8)}… cellType）`);
  }

  // ---------- 规则清单 ----------
  assert.ok(check.ALL_CODES.length >= 30, `规则数应不少于 30，实际 ${check.ALL_CODES.length}`);
  const groups = check.GROUPS.map(g => g.group);
  assert.deepStrictEqual(groups, ['format', 'structural', 'identity', 'references', 'properties', 'datasource', 'semantics', 'aquery', 'action']);
  console.log(`✅ 规则清单：${check.ALL_CODES.length} 条，分 ${groups.length} 组`);

  console.log('\n🎉 check 引擎测试通过！');
}

run();
