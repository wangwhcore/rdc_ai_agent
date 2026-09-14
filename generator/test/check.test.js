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

    // value 可解析但结构不是 Layout：走 INPUT002 兜底
    const res2 = check.run({ value: '123' });
    assert.strictEqual(res2.ok, false);
    assert.ok(has(res2, 'INPUT002'), 'value 可解析但结构非法应报 INPUT002');
    console.log('✅ INPUT002 / INPUT003 非法输入被优雅捕获（都不抛异常）');
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

  // ---------- 规则清单 ----------
  assert.ok(check.ALL_CODES.length >= 30, `规则数应不少于 30，实际 ${check.ALL_CODES.length}`);
  const groups = check.GROUPS.map(g => g.group);
  assert.deepStrictEqual(groups, ['structural', 'identity', 'references', 'properties', 'datasource', 'semantics']);
  console.log(`✅ 规则清单：${check.ALL_CODES.length} 条，分 ${groups.length} 组`);

  console.log('\n🎉 check 引擎测试通过！');
}

run();
