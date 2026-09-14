/**
 * 元模型反推审计的判据测试
 *
 * 重点锁住四件容易写错的事：
 *  1) 「浅层非空」与「递归非空」必须分开 —— canvas 形如 {containers:{},components:{}}，
 *     有两个键但没有叶子，是占位空壳，不能被当成真载体。
 *  2) flows 恒为 [] 时必须报 0 文件，而不是因为「键存在」就当成在用。
 *  3) 组件真属性在 components[].property 里，外层只有 type/property 两个壳键。
 *  4) 同义分组的「在用写法」阈值是 ≥5 个文件，夹具规模必须够大才测得出来。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const { loadCorpus, audit } = require('../scripts/auditMetaModel');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log(`✅ ${name}`); pass++; }
  catch (err) { console.log(`❌ ${name}\n   ${err.message}`); fail++; }
}

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-audit-'));
const FILES = 6;                 // ≥5，才能触发「在用写法」阈值
const WITH_VALIDATE = 2;         // 只有 2 份带裸 JS 校验

const EXPRESSION = [
  'var d = eventPayload',
  'if (d && d.length > 0) {',
  '  console.log(d)',
  "  callback({ id: 'x', data: d })",
  '}',
].join('\r\n');

function makeLayout({ withValidate }) {
  const doc = {
    pad: {}, phone: {}, draftComponents: {},
    desktop: {
      reference: '',
      layoutInfo: { field: 'LayoutSimpleModal', type: 'layout', title: '简单模态框' },
      layoutList: { Layout1: { id: 'Layout1' } },
      subscribes: [{
        event: 'c1.componentDidMount',
        name: '初始化',
        behaviors: [{
          type: 'request',
          dataSource: { type: 'api', serverName: 'vendor', method: 'get', url: '/a/list' },
          successPubs: [{ event: '', eventPayloadExpression: EXPRESSION }],
          errorPubs: [],
        }],
        pubs: [{ event: '', eventPayloadExpression: EXPRESSION }],
      }],
      components: {
        c1: {
          type: 'ButtonHook',
          property: {
            id: 'c1', title: '保存', visible: true, tagStyle: 'primary',
            subscribes: [{ event: 'c1.onClick' }], action: 'save', actionConfig: { type: 'save' },
          },
        },
      },
      canvas: { containers: {}, components: {} },
      graphic: { components: {}, containers: {} },
      flows: [],
      validates: withValidate ? "if (values.get('x')) { errors.x = '必填' }" : '',
      validateList: {},
      defaultDataSource: {},
    },
  };
  return JSON.stringify(doc);
}

for (let i = 0; i < FILES; i++) {
  const outer = {
    gid: `gid-${i}`, frontId: `fid-${i}`, layoutRef: '',
    value: makeLayout({ withValidate: i < WITH_VALIDATE }),
  };
  fs.writeFileSync(path.join(DIR, `f${i}.json`), JSON.stringify(outer));
}

const corpus = loadCorpus(DIR);
const stats = audit(corpus, 30);

check(`loadCorpus 解析出 ${FILES} 份产物，0 失败`, () => {
  assert.strictEqual(corpus.total, FILES);
  assert.strictEqual(corpus.ok.length, FILES);
  assert.strictEqual(corpus.failed.length, 0);
});

check('死字段识别：canvas / graphic / reference / flows / validateList / defaultDataSource', () => {
  const dead = stats.overview.deadFields;
  for (const k of ['canvas', 'graphic', 'reference', 'flows', 'validateList', 'defaultDataSource']) {
    assert.ok(dead.includes(k), `期望 ${k} 被判为死字段，实际: ${JSON.stringify(dead)}`);
  }
});

check('真载体不被误判：components / layoutInfo / layoutList 都不在死字段里', () => {
  for (const k of ['components', 'layoutInfo', 'layoutList']) {
    assert.ok(!stats.overview.deadFields.includes(k), `${k} 被误判为死字段`);
  }
});

check('占位空壳与真载体分开：canvas 浅层非空、递归全空', () => {
  const canvas = stats.overview.desktopKeys.find(r => r.key === 'canvas');
  assert.strictEqual(canvas.nonEmptyRate, 1, 'canvas 浅层应为非空');
  assert.strictEqual(canvas.deepNonEmptyRate, 0, 'canvas 递归应为全空');
  assert.ok(canvas.shell, 'canvas 应被标记为占位空壳');
});

check('graphic 同为占位空壳，两者都不算真载体', () => {
  const g = stats.overview.desktopKeys.find(r => r.key === 'graphic');
  assert.strictEqual(g.deepNonEmptyRate, 0);
  assert.ok(g.shell);
});

check('flows 恒为 [] → flowsFiles 计 0（不能因键存在就算在用）', () => {
  assert.strictEqual(stats.eventMechanism.flowsFiles, 0);
  assert.strictEqual(stats.eventMechanism.pageSubscribesFiles, FILES);
});

check('必填键统计以「存在率 100%」为准', () => {
  assert.strictEqual(stats.overview.requiredKeys, 11);
});

check('validates 是字符串，非空才算在用', () => {
  assert.strictEqual(stats.eventMechanism.validatesFiles, WITH_VALIDATE);
});

check('组件属性统计取自 components[].property（不是外层壳键）', () => {
  const keys = stats.components.propKeys.map(r => r.key);
  assert.ok(keys.includes('visible'), 'visible 应被统计到');
  assert.ok(keys.includes('tagStyle'), 'tagStyle 应被统计到');
  assert.ok(!keys.includes('property'), '外层壳键 property 不应被当成属性');
});

check('组件级事件表达被识别（与页面级分开统计）', () => {
  const cl = stats.eventMechanism.componentLevel;
  assert.strictEqual(cl.filesWithComponentSubscribes, FILES);
  assert.strictEqual(cl.filesWithComponentAction, FILES);
  assert.strictEqual(cl.filesWithComponentVisible, FILES);
});

check('动作类型只统计到 request', () => {
  const types = stats.eventMechanism.behaviorTypes.map(r => r.type);
  assert.deepStrictEqual(types, ['request']);
});

check('逃生舱模式命中 console / callback / if / 声明', () => {
  const byName = Object.fromEntries(stats.escapeHatch.patterns.map(p => [p.name, p]));
  for (const n of ['console 调试输出', 'callback 回调', 'if 条件分支', '基本声明 var/let/const']) {
    assert.ok(byName[n], `应命中「${n}」，实际: ${Object.keys(byName).join(', ')}`);
  }
});

check('多语句表达式被识别为含换行', () => {
  // 每份 2 条表达式（successPubs + pubs），全部含 CRLF
  assert.strictEqual(stats.escapeHatch.expressionCount, FILES * 2);
  assert.strictEqual(stats.escapeHatch.multiline, FILES * 2);
});

check('数据源形态：无占位符 → 根相对路径', () => {
  assert.strictEqual(stats.dataSource.totalOccurrences, FILES);
  const shapes = stats.dataSource.urlShapes.map(([k]) => k);
  assert.deepStrictEqual(shapes, ['根相对路径'], `实际: ${JSON.stringify(shapes)}`);
});

check('同义分组：动作/编排被标为多写法（≥2 个在用写法）', () => {
  const g = stats.synonyms.groups.find(x => x.semantic === '动作 / 编排');
  assert.ok(g, '应存在「动作 / 编排」组');
  assert.ok(g.writers >= 2, `期望 ≥2 个在用写法，实际 ${g.writers}`);
  assert.ok(/多写法/.test(g.verdict));
});

check('同义分组：权限在语料零命中 → 无在用写法、无行', () => {
  const g = stats.synonyms.groups.find(x => x.semantic === '权限');
  assert.strictEqual(g.writers, 0);
  assert.strictEqual(g.rows.length, 0);
});

check('冗余位置：canvas.components / canvas.containers 恒空', () => {
  assert.strictEqual(stats.redundancy.canvasComponentsNonEmpty, 0);
  assert.strictEqual(stats.redundancy.canvasContainersNonEmpty, 0);
  assert.strictEqual(stats.redundancy.emptyTwinOfComponents, FILES);
  assert.strictEqual(stats.redundancy.emptyTwinOfContainers, FILES);
});

fs.rmSync(DIR, { recursive: true, force: true });

console.log('');
if (fail) {
  console.log(`❌ 元模型审计测试失败：${fail} 个`);
  process.exit(1);
}
console.log(`🎉 元模型审计测试通过！（${pass} 项）`);
