/**
 * 动作编排收敛层测试
 *
 * 收敛的不变式（见 builder/events.js 的注释与 docs/action-wiring-convergence.md）：
 *   ① slot → 产物字段名 的映射**只有一处**（PUBLISH_SLOT_TO_FIELD）
 *   ② 映射是双射，且两侧都可用
 *   ③ readHandler ∘ buildHandler 在真实语料上**语义无损**
 *   ④ 产物格式一个字节都不改 —— 因此构造器对 items 必须是恒等的
 *
 * 判据说明（重要）：
 *   这里**不**用「逐字节一致」衡量 read↔build 往返。
 *   实测语料里键序毫无一致性（订阅条目 44 种键序指纹、发布条目 8+ 种、动作条目 8+ 种），
 *   键序不是契约。逐字节判据会把 2887 条纯键序差异误判成失败。
 *   逐字节一致只适用于 IR 层（lift ↔ emit 搬运 value 字符串），那条链路由 roundtrip 测试守。
 *   本层的正确判据是「语义无损 + 不凭空造数据 + DSL 幂等」。
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  PUBLISH_SLOT_TO_FIELD,
  PUBLISH_FIELD_TO_SLOT,
  publishField,
  buildPublish,
  publishEntry,
  readPublishEntry,
  readHandler,
  buildHandler,
  buildBehavior,
  readBehavior,
} = require('../builder/events');

const CORPUS_DIR = path.join(__dirname, '..', '..', '..', 'MdFrontLayout');

// ---------------------------------------------------------------------------
// 语义比对工具
// ---------------------------------------------------------------------------

/** 递归判定「是否全空」 */
function deepEmpty(v) {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.every(deepEmpty);
  if (typeof v === 'object') return Object.values(v).every(deepEmpty);
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

/**
 * 语义无损：x 里所有**非空**的键，重建后必须逐层还在且值相同。
 * 返回 null 表示无损，否则返回第一个反例路径。
 *
 * 允许的差异：重建多出**空容器**（如补出 `pubs: []`）。
 * 理由：`subscribe()` 一直恒写 `pubs`，这是已存在的生成器契约，
 * 且「缺键」与「空数组」在运行时等价（更细的取舍属于「省略占位载荷」议题）。
 */
function findLoss(x, y, p = '$') {
  if (deepEmpty(x)) return null;
  if (Array.isArray(x)) {
    if (!Array.isArray(y)) return `${p}: 产物是数组，重建不是`;
    if (y.length !== x.length) return `${p}: 长度 ${x.length} -> ${y.length}`;
    for (let i = 0; i < x.length; i++) {
      const r = findLoss(x[i], y[i], `${p}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  if (typeof x === 'object') {
    if (!y || typeof y !== 'object' || Array.isArray(y)) return `${p}: 产物是对象，重建不是`;
    for (const k of Object.keys(x)) {
      if (deepEmpty(x[k])) continue;
      if (!(k in y)) return `${p}.${k}: 丢失（产物值非空）`;
      const r = findLoss(x[k], y[k], `${p}.${k}`);
      if (r) return r;
    }
    return null;
  }
  return x === y ? null : `${p}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`;
}

/** 重建里新增的键必须都是空容器，否则算凭空造数据 */
function findJunk(x, y, p = '$') {
  if (!y || typeof y !== 'object' || Array.isArray(y)) return null;
  const xo = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  for (const k of Object.keys(y)) {
    if (!(k in xo) && !deepEmpty(y[k])) return `${p}.${k}: 新增且非空`;
  }
  return null;
}

/** 收集语料里所有订阅条目 */
function collectSubscribes(dir) {
  const out = [];
  const files = [];
  const walkDir = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walkDir(full);
      else if (e.name.endsWith('.json')) files.push(full);
    }
  };
  walkDir(dir);

  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (Array.isArray(node.subscribes)) {
      for (const s of node.subscribes) if (s && typeof s === 'object') out.push(s);
    }
    for (const [k, v] of Object.entries(node)) if (k !== 'subscribes') walk(v);
  };

  let parsed = 0;
  for (const f of files) {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    let value = raw.value;
    if (typeof value === 'string') { try { value = JSON.parse(value); } catch { continue; } }
    if (!value || !value.desktop) continue;
    parsed++;
    walk(value);
  }
  return { subscribes: out, files: parsed };
}

// ---------------------------------------------------------------------------

function run() {
  console.log('开始测试动作编排收敛层...\n');

  // ---------- ① 映射表是双射 ----------
  {
    assert.deepStrictEqual(
      Object.keys(PUBLISH_SLOT_TO_FIELD).sort(),
      ['emit', 'fail', 'then'],
      'slot 集合必须恰为 emit / then / fail'
    );
    assert.deepStrictEqual(PUBLISH_SLOT_TO_FIELD, {
      emit: 'pubs', then: 'successPubs', fail: 'errorPubs',
    });
    for (const [slot, field] of Object.entries(PUBLISH_SLOT_TO_FIELD)) {
      assert.strictEqual(PUBLISH_FIELD_TO_SLOT[field], slot, `${field} 应反向映射回 ${slot}`);
    }
    assert.strictEqual(Object.keys(PUBLISH_FIELD_TO_SLOT).length, 3, '反向映射不得多出条目');
    console.log('✅ 映射表双侧一致（emit→pubs / then→successPubs / fail→errorPubs）');
  }

  // ---------- ② 非法 slot 必须抛错，不静默写错字段 ----------
  {
    assert.throws(() => publishField('success'), /未知的发布时机/,
      '非法 slot 必须抛错 —— 静默写错字段比报错危险得多');
    assert.throws(() => buildPublish('pubs', []), /未知的发布时机/,
      'DSL 层只认 slot（emit/then/fail），不认产物字段名');
    assert.strictEqual(publishField('emit'), 'pubs');
    console.log('✅ 非法 slot 抛错，不会静默写出错误字段名');
  }

  // ---------- ③ buildPublish 产出单键片段，且对 items 恒等 ----------
  {
    const items = [{ event: 'x' }];
    const frag = buildPublish('then', items);
    assert.deepStrictEqual(Object.keys(frag), ['successPubs'], '只能产出一个键');
    assert.strictEqual(frag.successPubs, items,
      '必须恒等传递 items（不重建对象）—— 否则无法保证产物字节不变');
    assert.deepStrictEqual(buildPublish('fail'), { errorPubs: [] }, '默认空数组');
    assert.deepStrictEqual(
      { ...{ a: 1 }, ...buildPublish('emit', []), ...buildPublish('then', []), ...buildPublish('fail', []) },
      { a: 1, pubs: [], successPubs: [], errorPubs: [] },
      '三个时机可同时展开，键名互不冲突'
    );
    console.log('✅ buildPublish 产出单键片段，items 恒等传递');
  }

  // ---------- ④ publishEntry：字段顺序 + 两者并存不丢 ----------
  {
    assert.deepStrictEqual(
      publishEntry({ to: '@@message.success', run: 'callback(1)', label: '成功', scope: 'global', crossPage: true }),
      { event: '@@message.success', eventPayloadExpression: 'callback(1)', name: '成功', pageId: 'global', outside: true }
    );
    assert.deepStrictEqual(
      publishEntry({ to: 'x.closeM', data: '$${message.ok}' }),
      { event: 'x.closeM', payload: '$${message.ok}' }
    );
    assert.deepStrictEqual(publishEntry(), { event: '' }, '空调用也要产出必填的 event');
    // 语料 239 条历史遗留：两者并存时**两个都要写回**
    assert.deepStrictEqual(
      publishEntry({ to: '@@message.error', run: 'callback(2)', data: '删除失败' }),
      { event: '@@message.error', eventPayloadExpression: 'callback(2)', payload: '删除失败' },
      '两者并存时必须都保留 —— 构造端做取舍会静默改数据'
    );
    console.log('✅ publishEntry 字段顺序固定，payload 与表达式并存时不丢');
  }

  // ---------- ⑤ readPublishEntry 往返，全部可选键都要带回 ----------
  {
    const cases = [
      { event: '' },
      { event: '@@form.init', eventPayloadExpression: 'callback(1)' },
      { event: 'x.closeM', payload: '$${a}' },
      { event: 'y.openM', eventPayloadExpression: 'e', name: '标签', pageId: 'global', outside: true },
      { event: '@@message.error', eventPayloadExpression: 'e', payload: '遗留值' },
    ];
    for (const c of cases) {
      assert.deepStrictEqual(publishEntry(readPublishEntry(c)), c,
        `发布条目往返应等价: ${JSON.stringify(c)}`);
    }
    // 非对象（语料里不存在，但读取端不应崩）
    assert.deepStrictEqual(readPublishEntry('raw'), { to: 'raw' });
    assert.deepStrictEqual(readPublishEntry(null), { to: null });
    console.log('✅ 发布条目 read→build 往返等价（含 pageId / name / outside / 并存形态）');
  }

  // ---------- ⑥ buildBehavior：空数组不写出 ----------
  {
    assert.deepStrictEqual(
      buildBehavior({
        type: 'request',
        resource: { type: 'api', serverName: 's', url: '/u' },
        label: '获取详情',
        then: [{ to: '@@form.init', run: 'callback(1)' }],
      }),
      {
        type: 'request',
        dataSource: { type: 'api', serverName: 's', url: '/u' },
        name: '获取详情',
        successPubs: [{ event: '@@form.init', eventPayloadExpression: 'callback(1)' }],
      }
    );
    // 空的 then / fail 不产生空键（语料 1189 个动作里 95%+ 非空）
    assert.deepStrictEqual(
      buildBehavior({ type: 'request', then: [], fail: [] }),
      { type: 'request' }
    );
    assert.deepStrictEqual(readBehavior({ type: 'request', successPubs: [], errorPubs: [] }),
      { type: 'request', then: [], fail: [] });
    console.log('✅ buildBehavior 空 successPubs / errorPubs 不写出');
  }

  // ---------- ⑦ buildHandler：订阅条目可选键全程保真 ----------
  {
    const sub = {
      event: 'btn.click',
      name: '保存',
      index: 1,
      type: 'custom',
      rules: [{ id: 'r1' }],
      pubs: [{ event: '', eventPayloadExpression: 'callback(1)' }],
      behaviors: [{ type: 'request', dataSource: { type: 'api' }, successPubs: [{ event: '@@ok' }] }],
    };
    const rebuilt = buildHandler(readHandler(sub));
    assert.strictEqual(findLoss(sub, rebuilt), null,
      `订阅条目往返语义无损，实际: ${findLoss(sub, rebuilt)}`);
    assert.strictEqual(findJunk(sub, rebuilt), null);
    assert.deepStrictEqual(rebuilt.index, 1);
    assert.deepStrictEqual(rebuilt.rules, [{ id: 'r1' }]);
    assert.deepStrictEqual(rebuilt.type, 'custom');
    assert.deepStrictEqual(rebuilt.name, '保存');
    console.log('✅ 订阅条目可选键保真（name / index / type / rules / behaviors）');
  }

  // ---------- ⑧ DSL 幂等：read(build(read(x))) ≡ read(x) ----------
  {
    const sub = {
      event: 'btn.click',
      name: '保存',
      index: 2,
      pubs: [
        { event: '@@a', eventPayloadExpression: 'x', payload: '遗留' },
        { event: '' },
      ],
      behaviors: [
        { type: 'request', dataSource: { type: 'api' }, errorPubs: [{ event: '@@err' }] },
      ],
    };
    const dsl1 = readHandler(sub);
    const dsl2 = readHandler(buildHandler(dsl1));
    assert.deepStrictEqual(dsl2, dsl1, 'DSL 必须幂等');
    console.log('✅ readHandler ∘ buildHandler 幂等');
  }

  // ---------- ⑨ 真实语料：语义无损 ----------
  if (!fs.existsSync(CORPUS_DIR)) {
    console.log('⚠ 语料目录不存在（仓库外），跳过全量回归');
  } else {
    const { subscribes, files } = collectSubscribes(CORPUS_DIR);
    assert.ok(subscribes.length > 4000,
      `语料应能抽出 4000+ 条订阅，实际 ${subscribes.length}（采集逻辑可能失效）`);

    let lossy = 0, junk = 0, notIdempotent = 0;
    let firstLoss = '', firstJunk = '';
    for (const sub of subscribes) {
      const dsl = readHandler(sub);
      const rebuilt = buildHandler(dsl);

      const loss = findLoss(sub, rebuilt);
      if (loss) { lossy++; if (!firstLoss) firstLoss = loss; }
      const j = findJunk(sub, rebuilt);
      if (j) { junk++; if (!firstJunk) firstJunk = j; }
      if (JSON.stringify(readHandler(rebuilt)) !== JSON.stringify(dsl)) notIdempotent++;
    }

    assert.strictEqual(lossy, 0,
      `${lossy}/${subscribes.length} 条订阅往返丢失语义，首个: ${firstLoss}`);
    assert.strictEqual(junk, 0,
      `${junk}/${subscribes.length} 条订阅被凭空造出非空字段，首个: ${firstJunk}`);
    assert.strictEqual(notIdempotent, 0, `${notIdempotent} 条订阅 DSL 不幂等`);

    console.log(`✅ 全量语料回归：${files} 个文件 / ${subscribes.length} 条订阅全部语义无损（丢失 0 / 造数据 0 / 不幂等 0）`);
  }

  console.log('\n🎉 动作编排收敛层测试通过！');
}

run();
