/**
 * 高级查询（漏斗）契约测试
 *
 * 覆盖：条件从表格字段推导、容器结构、四条列表的按序对齐、注册完整性，
 * 以及 check 侧 AQ001–AQ008 的正反例。
 */

const assert = require('assert');
const check = require('../check');
const {
  buildListPage,
  column,
  queryField,
  addQuery,
  deriveQueryFields,
  normalizeCondition,
} = require('../index');

const ADD_EDIT_FRONT_ID = '11111111111111111111111111111111';
const CONFIRM_FRONT_ID = '22222222222222222222222222222222';

function baseConfig(over = {}) {
  return {
    pageName: '测试列表',
    serverName: 'demo',
    listUrl: '/demo/list',
    functionGid: 'ffffffffffffffffffffffffffffffff',
    addEditPageFrontId: ADD_EDIT_FRONT_ID,
    confirmModalFrontId: CONFIRM_FRONT_ID,
    rowOperations: ['edit'],
    columns: [column('code', '编码', { fieldType: 'text' })],
    ...over,
  };
}

/** 取生成结果里的 desktop */
function desktopOf(raw) {
  return JSON.parse(raw.value).desktop;
}

function aqOf(desktop) {
  return Object.entries(desktop.components).find(([, e]) => e.type === 'AdvanceQueryHook') || null;
}

function filterKeyOf(desktop) {
  return Object.keys(desktop.layoutList).find(k => /_filterId$/.test(k)) || null;
}

/** 容器里按序排平的组件 */
function innerOf(desktop, key) {
  const out = [];
  for (const row of desktop.layoutList[key].rows) {
    for (const col of row.cols) {
      for (const c of col.components || []) out.push({ node: c, span: col.property.style.span, row });
    }
  }
  return out;
}

function codesOf(raw) {
  const res = check.run(raw);
  const out = {};
  for (const d of res.diagnostics) out[d.code] = (out[d.code] || 0) + 1;
  return { codes: out, res };
}

function run() {
  // ---------- 1. 条件从表格字段推导（含类型） ----------
  {
    const raw = buildListPage(baseConfig({
      columns: [
        column('name', '名称', { fieldType: 'text' }),
        column('status', '状态', { tag: 'orderStatus' }),          // tag -> 字典枚举
        column('kind', '类型', { columnsType: { type: 'enumerate', code: 'orderKind' } }),
        column('createTime', '创建时间', { fieldType: 'date' }),
        column('jump', '跳转', { link: ADD_EDIT_FRONT_ID }),        // link -> 不可查询
      ],
    }));
    const d = desktopOf(raw);
    const aq = aqOf(d)[1].property.advancedQuery;

    assert.deepStrictEqual(
      aq.map(q => q.field + ':' + q.operation),
      ['name:like', 'status:eq', 'kind:eq', 'createTime:range'],
      '条件应按表格列顺序推导，link 列被排除'
    );
    // 条目形状必须是语料里的那四个键，一个不多一个不少
    for (const q of aq) {
      assert.deepStrictEqual(Object.keys(q).sort(), ['field', 'operation', 'type', 'value']);
      assert.strictEqual(q.type, 'val');
      assert.strictEqual(q.value, '');
    }
    console.log('✅ 查询条件从表格字段推导（含类型）：text→like / 字典枚举→eq / date→range，link 列排除');
  }

  // ---------- 2. 容器结构与注册完整性 ----------
  {
    const raw = buildListPage(baseConfig({
      columns: [
        column('t1', 'T1', { fieldType: 'text' }),
        column('t2', 'T2', { fieldType: 'text' }),
        column('t3', 'T3', { fieldType: 'text' }),
        column('t4', 'T4', { fieldType: 'text' }),
        column('t5', 'T5', { fieldType: 'text' }),
        column('flag', '标记', { query: { component: 'CheckboxHook' } }),
      ],
    }));
    const d = desktopOf(raw);
    const [hookId, hook] = aqOf(d);
    const key = filterKeyOf(d);

    assert.strictEqual(key, `${hookId}_filterId`, '容器键必须是 <hookId>_filterId');
    assert.strictEqual(hook.property.associateId, Object.entries(d.components).find(([, e]) => e.type === 'TableHook')[0],
      'associateId 必须指向同页 TableHook');

    const inner = innerOf(d, key);
    const aq = hook.property.advancedQuery;

    assert.strictEqual(inner.length, aq.length, '容器组件数必须等于条件数');
    inner.forEach((m, i) => {
      assert.strictEqual(m.node.property.filed, aq[i].field, `第 ${i} 个组件 filed 必须按序等于 field`);
      assert.ok(d.components[m.node.property.id], `条件组件 ${m.node.property.id} 必须登记到 components`);
    });

    // 栅格：span 8 的条件 3 个占满一行，余下的顺延；CheckboxHook（span 24）必然独占一行
    // 语料实测的行内列数分布（3,3 / 3,3,1 / 3,3,1,1 …）与「贪心填满 24 换行」完全吻合
    const rows = d.layoutList[key].rows;
    assert.deepStrictEqual(rows.map(r => r.cols.length), [3, 2, 1], '贪心填满 24 换行');
    for (const r of rows) {
      const sum = r.cols.reduce((n, c) => n + c.property.style.span, 0);
      assert.ok(sum <= 24, `每行栅格之和不得超过 24，实际 ${sum}`);
    }
    assert.strictEqual(rows[2].cols[0].property.style.span, 24, 'CheckboxHook 独占整行');

    // 断点必须与 span 一致（不是只改 span）
    const firstCol = rows[0].cols[0].property.style;
    for (const bp of ['span', 'xxl', 'xl', 'md', 'sm', 'lg', 'xs']) {
      assert.strictEqual(firstCol[bp], 8, `${bp} 断点必须等于 span`);
    }
    console.log('✅ 漏斗容器：<hookId>_filterId / 按序对齐 / 全部注册 / 3 个一行 / Checkbox 独占整行');
  }

  // ---------- 3. 只有表格：queryFields: false ----------
  {
    const raw = buildListPage(baseConfig({ queryFields: false }));
    const d = desktopOf(raw);
    assert.strictEqual(aqOf(d), null, 'queryFields: false 时不应生成 AdvanceQueryHook');
    assert.strictEqual(filterKeyOf(d), null, 'queryFields: false 时不应生成漏斗容器');
    assert.strictEqual(Object.values(d.components).filter(c => c.type === 'TableHook').length, 1, '表格仍在');
    console.log('✅ queryFields: false → 不生成高级查询，页面只有一个单独的表格');
  }

  // ---------- 4. 只指定字段名，类型从列上读 ----------
  {
    const raw = buildListPage(baseConfig({
      columns: [
        column('name', '名称', { fieldType: 'text' }),
        column('status', '状态', { tag: 'orderStatus' }),
        column('createTime', '创建时间', { fieldType: 'date' }),
      ],
      queryFields: ['createTime', 'status'], // 顺序按这里给的来
    }));
    const d = desktopOf(raw);
    const aq = aqOf(d)[1].property.advancedQuery;
    assert.deepStrictEqual(aq.map(q => q.field + ':' + q.operation), ['createTime:range', 'status:eq']);

    const inner = innerOf(d, filterKeyOf(d));
    assert.deepStrictEqual(inner.map(m => m.node.type), ['RangePickerComponent', 'SelectHook'],
      '只写字段名时组件类型必须从表格列上取');
    // 字典也要从列上带过来
    const dict = inner[1].node.property.dataSource.bodyExpression;
    assert.ok(/orderStatus/.test(dict), `下拉的字典应来自列的 tag，实际 ${dict}`);
    console.log('✅ 只写字段名 → 组件类型与字典都从表格列读取');
  }

  // ---------- 5. 显式覆盖组件 / 不可查询列 ----------
  {
    const raw = buildListPage(baseConfig({
      columns: [
        column('status', '状态', { tag: 'orderStatus' }),
        column('secret', '不查', { fieldType: 'text', query: false }),
      ],
    }));
    const d = desktopOf(raw);
    const aq = aqOf(d)[1].property.advancedQuery;
    assert.deepStrictEqual(aq.map(q => q.field), ['status'], 'query: false 的列不参与查询');

    const over = buildListPage(baseConfig({
      columns: [column('status', '状态', { tag: 'orderStatus' })],
      queryFields: [{ field: 'status', component: 'CheckboxHook' }],
    }));
    const od = desktopOf(over);
    const oaq = aqOf(od)[1].property.advancedQuery;
    assert.strictEqual(oaq[0].operation, 'in', 'CheckboxHook 的 operation 应为 in');
    const oinner = innerOf(od, filterKeyOf(od));
    assert.strictEqual(oinner[0].node.type, 'CheckboxHook');
    assert.strictEqual(oinner[0].span, 24, 'CheckboxHook 的 span 默认 24');
    console.log('✅ query: false 排除 / 显式覆盖组件时 operation 与 span 跟着变');
  }

  // ---------- 6. deriveQueryFields / normalizeCondition 的契约 ----------
  {
    const conds = deriveQueryFields([column('x', 'X', { fieldType: 'date' })]);
    assert.deepStrictEqual(conds, [{
      field: 'x', label: 'X', component: 'RangePickerComponent', operation: 'range',
      span: 8, dict: '', description: 'X', props: {},
    }]);

    assert.throws(() => deriveQueryFields([], { only: ['nope'] }),
      /不在表格列里/, '显式列出但表格里没有的字段应抛错，避免静默生成查不到的字段');

    // 表格列里没有、但显式给了类型 -> 允许（语料里也有 createTime 这类审计字段）
    const extra = deriveQueryFields([], { only: [{ field: 'createTime', fieldType: 'date' }] });
    assert.strictEqual(extra[0].component, 'RangePickerComponent');

    // 旧写法 between 归一到 range（语料里从不出现 between）
    assert.strictEqual(normalizeCondition({ field: 'a', fieldType: '日期范围', queryType: 'between' }).operation, 'range');
    console.log('✅ deriveQueryFields / normalizeCondition 契约（含 between→range、不在列里即抛错）');
  }

  // ---------- 7. queryField 兼容旧签名 ----------
  {
    const qf = queryField('status', '下拉', 'eq', { dict: 's' });
    assert.strictEqual(qf.component, 'SelectHook');
    assert.strictEqual(qf.componentType, 'SelectHook', '旧字段名 componentType 仍返回组件名');
    assert.strictEqual(qf.fieldType, 'SelectHook', '旧字段名 fieldType 仍返回组件名');
    assert.strictEqual(qf.queryType, 'eq', '旧字段名 queryType 仍返回 operation');

    // addQuery 直接用旧形态的 fields 也要能出正确形状
    const table = { id: 'tid' };
    const hook = addQuery({ associateId: table.id, fields: [queryField('code', '文本', 'like')] });
    const json = hook.toJSON();
    assert.strictEqual(json.type, 'AdvanceQueryHook');
    assert.deepStrictEqual(json.property.advancedQuery, [{ field: 'code', operation: 'like', type: 'val', value: '' }]);
    console.log('✅ queryField 旧签名兼容，advancedQuery 输出新形状');
  }

  // ---------- 8. 幂等：同一实例 toJSON 两次必须一致 ----------
  {
    const hook = addQuery({
      associateId: 'tid',
      conditions: deriveQueryFields([
        column('a', 'A', { fieldType: 'text' }),
        column('b', 'B', { fieldType: 'date' }),
      ]),
    });
    assert.deepStrictEqual(hook.toJSON(), hook.toJSON(), 'toJSON 必须幂等（uuid 不能在 toJSON 里生成）');
    assert.deepStrictEqual(hook.buildFilterRegion(), hook.buildFilterRegion(), '容器结构必须幂等');
    assert.deepStrictEqual(hook.buildConditionRegistrations(), hook.buildConditionRegistrations());
    console.log('✅ 幂等：toJSON / buildFilterRegion / buildConditionRegistrations 多次调用一致');
  }

  // ---------- 9. clean 样本零错误 ----------
  {
    const { codes, res } = codesOf(buildListPage(baseConfig({
      columns: [
        column('name', '名称', { fieldType: 'text' }),
        column('status', '状态', { tag: 'orderStatus' }),
        column('createTime', '创建时间', { fieldType: 'date' }),
      ],
    })));
    assert.ok(!Object.keys(codes).some(c => c.startsWith('AQ')), `干净样本不应有 AQ 诊断，实际 ${JSON.stringify(codes)}`);
    assert.strictEqual(res.ok, true);
    console.log('✅ 干净样本：零 AQ 诊断');
  }

  // ---------- 10. AQ001–AQ008 反例 ----------
  {
    const good = buildListPage(baseConfig({
      columns: [
        column('name', '名称', { fieldType: 'text' }),
        column('status', '状态', { tag: 'orderStatus' }),
      ],
    }));

    function tamper(fn) {
      const raw = JSON.parse(JSON.stringify(good));
      const v = JSON.parse(raw.value);
      fn(v.desktop);
      raw.value = JSON.stringify(v);
      return codesOf(raw);
    }
    const hit = (obj, code) => Object.prototype.hasOwnProperty.call(obj.codes, code);

    // AQ001 associateId 指向非表格
    assert.ok(hit(tamper(d => { aqOf(d)[1].property.associateId = aqOf(d)[0]; }), 'AQ001'));
    // AQ001 空串只算 warning
    {
      const r = tamper(d => { aqOf(d)[1].property.associateId = ''; });
      assert.ok(r.res.diagnostics.some(x => x.code === 'AQ001' && x.severity === 'warning'));
      assert.strictEqual(r.res.ok, true, '空 associateId 不应阻断');
    }
    // AQ002 删掉容器
    assert.ok(hit(tamper(d => { delete d.layoutList[filterKeyOf(d)]; }), 'AQ002'));
    // AQ003 条件数 > 组件数
    assert.ok(hit(tamper(d => {
      aqOf(d)[1].property.advancedQuery.push({ field: 'x', operation: 'like', type: 'val', value: '' });
    }), 'AQ003'));
    // AQ004 filed 错位（内联与注册两份都要改，lift 会取注册副本）
    assert.ok(hit(tamper(d => {
      const c = d.layoutList[filterKeyOf(d)].rows[0].cols[0].components[0];
      c.property.filed = 'WRONG';
      d.components[c.property.id].property.filed = 'WRONG';
    }), 'AQ004'));
    // AQ006 条目缺键
    assert.ok(hit(tamper(d => { delete aqOf(d)[1].property.advancedQuery[0].operation; }), 'AQ006'));
    // AQ006 多余键
    assert.ok(hit(tamper(d => { aqOf(d)[1].property.advancedQuery[0].label = 'x'; }), 'AQ006'));
    // AQ007 value 非空
    assert.ok(hit(tamper(d => { aqOf(d)[1].property.advancedQuery[0].value = 'v'; }), 'AQ007'));
    // AQ008 operation 与组件类型不符
    assert.ok(hit(tamper(d => { aqOf(d)[1].property.advancedQuery[0].operation = 'range'; }), 'AQ008'));
    console.log('✅ AQ001–AQ008 反例全部命中');
  }

  // ---------- 11. 三条列表的按序对齐（advancedQuery / 容器 / 注册） ----------
  {
    const raw = buildListPage(baseConfig({
      columns: [
        column('a', 'A', { fieldType: 'text' }),
        column('b', 'B', { tag: 'dictB' }),
        column('c', 'C', { fieldType: 'date' }),
      ],
    }));
    const d = desktopOf(raw);
    const [hookId, hook] = aqOf(d);
    const inner = innerOf(d, filterKeyOf(d));
    hook.property.advancedQuery.forEach((q, i) => {
      assert.strictEqual(inner[i].node.property.filed, q.field);
      assert.strictEqual(d.components[inner[i].node.property.id].property.filed, q.field,
        '注册副本的 filed 也要一致');
      assert.strictEqual(inner[i].node.property.id, d.components[inner[i].node.property.id].property.id);
    });
    assert.ok(hookId);
    console.log('✅ advancedQuery / 容器内联 / components 注册 三处按序一致');
  }

  console.log('\n🎉 高级查询契约测试通过！');
}

run();
