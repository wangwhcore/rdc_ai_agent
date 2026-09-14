/**
 * JSON 格式检查与强制修订测试
 *
 * 覆盖三层：
 *   1. ir/jsonFormat —— 文本层体检与修订（含恒安全手段、宽松语法、截断、重复键）
 *   2. check 规则组 format —— JSON001 / JSON002 / JSON003 正反例 + 语料零误报
 *   3. ir/jsonGate —— 「可解析 ≠ 正确」：修好文本但结构错位必须拒绝写入
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fmt = require('../ir/jsonFormat');
const { enforce, checkInvariants } = require('../ir/jsonGate');
const { run } = require('../check');
const { buildListPage, validate, column } = require('../index');

const ADD_EDIT_FRONT_ID = '11111111111111111111111111111111';
const CONFIRM_FRONT_ID = '22222222222222222222222222222222';

/** 生成一份 check 零 error 的合法 Layout JSON，作为门禁测试的基准 */
function goodLayout() {
  const layout = buildListPage({
    pageName: '格式测试列表',
    serverName: 'demo',
    listUrl: '/demo/list',
    functionGid: 'ffffffffffffffffffffffffffffffff',
    addEditPageFrontId: ADD_EDIT_FRONT_ID,
    confirmModalFrontId: CONFIRM_FRONT_ID,
    rowOperations: ['edit'],
    columns: [column('code', '编码', { fieldType: 'text' })],
  });
  const v = validate(layout);
  assert.ok(v.ok, `测试夹具本身应当合法: ${JSON.stringify(v.errors)}`);
  return layout;
}

/** 把 value 文本改成「指定变体」后的 Layout JSON */
function withValue(layout, value) {
  return { ...layout, value };
}

function testInspect() {
  const ok = fmt.inspectText('{"a":1,"b":[1,2]}');
  assert.strictEqual(ok.ok, true, '合法文本应判为 ok');
  assert.strictEqual(ok.parseable, true);
  assert.deepStrictEqual(ok.value, { a: 1, b: [1, 2] });

  const reasons = {
    尾随逗号: ['{"a":1,"b":[1,2,],}', 'trailing-comma'],
    单引号: ["{'a':'x'}", 'single-quote'],
    注释: ['{"a":1 /*c*/}', 'comment'],
    未引号键: ['{a:1}', 'unquoted-key'],
    BOM: ['\uFEFF{"a":1}', 'bom'],
    裸换行: ['{"a":"l1\nl2"}', 'raw-control-char'],
    键缺值: ['{"a":}', 'missing-value'],
    截断: ['{"a":1,"b":[1,2', 'truncated'],
    undefined: ['{"a":undefined}', 'undefined-literal'],
    重复键: ['{"a":1,"a":2}', 'duplicate-key'],
  };
  for (const [name, [src, reason]] of Object.entries(reasons)) {
    const r = fmt.inspectText(src);
    assert.strictEqual(r.ok, false, `${name} 不应判为合法`);
    assert.ok(r.problems.some(p => p.reason === reason),
      `${name} 应报出 ${reason}，实际: ${r.problems.map(p => p.reason).join(',')}`);
  }

  // 字符串里的 // 与 /* 不能被当成注释（曾把 URL 误判）
  const url = fmt.inspectText('{"url":"http://x.com//y"}');
  assert.strictEqual(url.ok, true, 'URL 里的 // 不应被当成注释');

  // 不同层级的同名键不是重复键
  const nested = fmt.inspectText('{"o":{"x":1},"p":{"x":2}}');
  assert.strictEqual(nested.ok, true, '不同对象的同名键不是重复键');

  // 不可修订：彻底语法错误
  const bad = fmt.inspectText('{"a": 1 "b": 2}');
  assert.strictEqual(bad.ok, false);
  console.log('✅ inspectText：缺陷分类 / URL 误判 / 分层同名键');
}

function testRepair() {
  const cases = [
    ['尾随逗号', '{"a":1,"b":[1,2,],}', { a: 1, b: [1, 2] }],
    ['单引号', "{'a':'x','b':[1,2]}", { a: 'x', b: [1, 2] }],
    ['注释', '{"a":1 /*c*/}', { a: 1 }],
    ['未引号键', '{a:1, b:"x"}', { a: 1, b: 'x' }],
    ['BOM', '\uFEFF{"a":1}', { a: 1 }],
    ['裸换行', '{"a":"l1\nl2"}', { a: 'l1\nl2' }],
    ['截断', '{"a":1,"b":[1,2', { a: 1, b: [1, 2] }],
  ];
  for (const [name, src, expect] of cases) {
    const r = fmt.repairText(src);
    assert.ok(r.ok, `${name} 应可强制修订，实际: ${r.error}`);
    assert.deepStrictEqual(r.value, expect, `${name} 修订后内容不符`);
    // 幂等：修订结果本身必须是严格合法的
    assert.strictEqual(fmt.inspectText(r.text).ok, true, `${name} 修订结果应严格合法`);
  }

  // 内容保真：中文、转义引号、URL 都不能被改坏
  const tricky = '{"名称":"大豆","备注":"含\\"引号\\"","url":"http://a.com//b"}';
  const t = fmt.repairText(tricky);
  assert.ok(t.ok);
  assert.deepStrictEqual(t.value, { 名称: '大豆', 备注: '含"引号"', url: 'http://a.com//b' });

  // 语义改动必须被警告，不能静默
  const undef = fmt.repairText('{"a":undefined}');
  assert.ok(undef.ok);
  assert.deepStrictEqual(undef.value, { a: null });
  assert.ok(undef.warnings.some(w => w.includes('undefined')), 'undefined→null 必须告警');

  const missing = fmt.repairText('{"a":}');
  assert.ok(missing.ok);
  assert.ok(missing.warnings.some(w => w.includes('null')), '键缺值补 null 必须告警');

  // 重复键只报不修（自动修会替人做语义取舍）
  const dup = fmt.diagnose('{"a":1,"a":2}');
  assert.strictEqual(dup.ok, false);
  assert.strictEqual(dup.repairable, false, '重复键不得被判为可自动修订');
  assert.ok(dup.problems.some(p => p.reason === 'duplicate-key'));

  // 不可修订：根本不是 JSON 形态的文本必须直接拒绝
  // （jsonrepair 非常宽容，会把 '这不是 JSON' 揉成 '"这不是 JSON"'，
  //   那样只会把问题推到更难排查的下游结构错误）
  for (const garbage of ['这不是 JSON', 'gid=abc', '<<<<', '', '   ']) {
    const g = fmt.repairText(garbage);
    assert.strictEqual(g.ok, false, `${JSON.stringify(garbage)} 不应被判为可修订`);
  }
  assert.strictEqual(fmt.looksLikeJson('这不是 JSON'), false);
  assert.strictEqual(fmt.looksLikeJson('  {"a":1}'), true);
  assert.strictEqual(fmt.looksLikeJson('"scalar"'), true);
  console.log('✅ repairText：七类缺陷可修 / 内容保真 / 语义改动告警 / 重复键不自动修 / 非 JSON 直接拒绝');
}

function testGate() {
  const good = goodLayout();

  // 1) 合法产物：无需修订
  const clean = enforce(good);
  assert.strictEqual(clean.ok, true);
  assert.strictEqual(clean.repaired, false);
  assert.strictEqual(clean.blocked, null);

  // 2) value 尾随逗号 → 强制修订后通过
  const fixed = enforce(withValue(good, `${good.value.slice(0, -1)},}`));
  assert.strictEqual(fixed.ok, true, `应可强制修订: ${JSON.stringify(fixed.blocked)}`);
  assert.strictEqual(fixed.repaired, true);
  assert.ok(fixed.repairMethods.length, '应记录修订手段');
  assert.strictEqual(fmt.inspectText(fixed.layout.value).ok, true);
  assert.deepStrictEqual(JSON.parse(fixed.layout.value), JSON.parse(good.value),
    '修订不得改变内容');

  // 3) 「可解析 ≠ 正确」：文本能修好，但 desktop 四件套残缺 → 门 A 拒绝
  const doc = JSON.parse(good.value);
  delete doc.desktop.subscribes;
  const brokenStructure = withValue(good, `${JSON.stringify(doc).slice(0, -1)},}`);
  const inv = checkInvariants(brokenStructure);
  assert.strictEqual(inv.ok, false);
  const g3 = enforce(brokenStructure);
  assert.strictEqual(g3.ok, false);
  assert.strictEqual(g3.blocked.stage, 'structure', `应被结构不变量拦下，实际: ${g3.blocked.stage}`);
  assert.ok(g3.blocked.details.some(d => d.includes('subscribes')));

  // 4) 外层文件文本带尾随逗号 → 强制修订
  const fileText = `${JSON.stringify(good, null, 2).replace(/\n\}$/, ',\n}')}`;
  const g4 = enforce(fileText);
  assert.strictEqual(g4.ok, true, `文件文本应可修订: ${JSON.stringify(g4.blocked)}`);
  assert.strictEqual(g4.repaired, true);

  // 5) 根本不是 JSON 的文件文本 → 拒绝
  const g5 = enforce('这不是 JSON，只是一段说明文字');
  assert.strictEqual(g5.ok, false);
  assert.strictEqual(g5.blocked.stage, 'file-format');

  // 6) 非 Layout JSON（MdFunction 记录）不套用页面级门禁
  const g6 = enforce('{"gid":"a","name":"某个功能"}');
  assert.strictEqual(g6.ok, true);
  assert.strictEqual(g6.repaired, false);

  // 7) 非法输入类型
  assert.strictEqual(enforce(42).ok, false);
  assert.strictEqual(enforce(null).ok, false);

  console.log('✅ jsonGate：合法放行 / 可修则修 / 结构错位拒绝 / 非 Layout 不误伤');
}

function testFormatRules() {
  const good = goodLayout();

  const jsonHits = layout => run(layout).diagnostics.filter(d => d.code.startsWith('JSON'));

  // 正例：全部合法 → 无格式诊断
  assert.deepStrictEqual(jsonHits(good), [], '合法产物不应有格式类诊断');

  // JSON001：value 是对象
  const j1 = jsonHits(withValue(good, JSON.parse(good.value)));
  assert.deepStrictEqual(j1.map(d => d.code), ['JSON001']);

  // JSON002：双重编码
  const j2 = run(withValue(good, JSON.stringify(good.value)));
  assert.strictEqual(j2.ok, false);
  assert.strictEqual(j2.diagnostics[0].code, 'JSON002');
  assert.match(j2.diagnostics[0].message, /双重编码/);

  // JSON003：键名重复（能解析，但会静默丢配置）
  const dupText = good.value.replace('{"phone"', '{"phone":"__dup__","phone"');
  assert.notStrictEqual(dupText, good.value, '测试夹具应真的注入了重复键');
  const j3 = jsonHits(withValue(good, dupText));
  assert.deepStrictEqual(j3.map(d => d.code), ['JSON003']);
  assert.strictEqual(j3[0].severity, 'warning', '键名重复不应阻断，需人工取舍');

  // INPUT003：不可解析时给出「可修订性 + 手段」
  const j4 = run(withValue(good, `${good.value.slice(0, -1)},}`));
  assert.strictEqual(j4.diagnostics[0].code, 'INPUT003');
  assert.strictEqual(j4.diagnostics[0].extra.repairable, true);
  assert.ok(j4.diagnostics[0].extra.howToFix, '应给出修订手段');
  assert.match(j4.diagnostics[0].hint, /repairValueJson|jsonGate/);
  assert.ok(j4.diagnostics[0].extra.problems.length, '应附带缺陷清单');

  console.log('✅ format 规则：JSON001/002/003 正反例 + INPUT003 可修订性');
}

/** 语料零误报：401 份真实布局的 value 层必须全部严格合法 */
function testCorpusNoFalsePositive() {
  const DIR = path.resolve(__dirname, '../../../MdFrontLayout');
  if (!fs.existsSync(DIR)) {
    console.log('⏭️  语料目录不存在，跳过零误报校验');
    return;
  }
  const files = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.json')) files.push(p);
    }
  })(DIR);

  const dirty = [];
  for (const f of files) {
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(f, 'utf-8'));
    } catch (e) {
      dirty.push([path.basename(f), `外层不可解析: ${e.message}`]);
      continue;
    }
    if (typeof doc.value !== 'string') {
      dirty.push([path.basename(f), 'value 不是字符串']);
      continue;
    }
    const d = fmt.inspectText(doc.value, { label: 'value' });
    if (!d.ok) dirty.push([path.basename(f), d.problems.map(p => p.reason).join(',')]);
  }

  assert.strictEqual(dirty.length, 0,
    `语料上出现格式误报（error/warning 级规则必须零误报）:\n${dirty.slice(0, 10).map(x => `  ${x[0]}: ${x[1]}`).join('\n')}`);
  console.log(`✅ 语料零误报：${files.length} 份布局的 value 层全部严格合法`);
}

function run_() {
  testInspect();
  testRepair();
  testGate();
  testFormatRules();
  testCorpusNoFalsePositive();
  console.log('\n🎉 JSON 格式检查与强制修订测试通过！');
}

run_();
