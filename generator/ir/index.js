/**
 * Page IR：低代码页面的语义中间层
 *
 * 数据流：
 *   Layout JSON ──lift──▶ Page IR ──emit──▶ Layout JSON
 *
 * 不变式（由 test/roundtrip.test.js 在 401 个真实布局上验证）：
 *   lift(emit(lift(x))) 与 lift(x) 等价
 *   即 IR 是 Layout JSON 的无损表示，可以安全作为唯一真源。
 */

const { lift, inferKind, extractReferences, extractQueries, clone, IR_VERSION, PAGE_KINDS } = require('./lift');
const { emit, emitValue, inflateRegions, ordered } = require('./emit');
const { REQUIRED_RULE, KNOWN_RULES, singleValidateOf, isRequired, rulesOf } = require('./validateSpec');
const { REFERENCES, HEX32, PLACEHOLDER_REF, isPlaceholderRef, parsePath, collectAtPath } = require('./referenceSpec');
const querySpec = require('./querySpec');
const {
  findRawControlChars,
  escapeRawControlChars,
  describeFailure,
  validateLayoutJson,
  stringifyLayout,
} = require('./jsonIntegrity');
// 注意：jsonGate 不在这里导出 —— 它懒 require('../check')，
// 导出会让 ir ⇄ check 的依赖方向变得含糊。需要门禁请直接 require('./ir/jsonGate')。
const jsonFormat = require('./jsonFormat');

/** 键顺序无关的稳定序列化，用于等价性比较 */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/** 键顺序无关的深比较 */
function deepEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

/**
 * 一次完整往返，返回过程产物便于诊断
 * @param {object} layoutJson
 * @param {object} [options] 透传给 emit
 */
function roundTrip(layoutJson, options) {
  const irBefore = lift(layoutJson);
  const emitted = emit(irBefore, options);
  const irAfter = lift(emitted);
  return {
    irBefore,
    emitted,
    irAfter,
    irStable: deepEqual(irBefore, irAfter),
    valueStable: irBefore.keyOrder && irAfter.keyOrder
      ? JSON.stringify(emitValue(irBefore)) === JSON.stringify(emitValue(irAfter))
      : false,
    byteExact: typeof layoutJson.value === 'string' && emitted.value === layoutJson.value,
  };
}

module.exports = {
  // 版本与常量
  IR_VERSION,
  PAGE_KINDS,
  REFERENCES,

  // 双向转换
  lift,
  emit,
  emitValue,
  inflateRegions,

  // 语义提取
  inferKind,
  extractReferences,
  extractQueries,

  // 工具
  ordered,
  clone,
  deepEqual,
  stableStringify,
  roundTrip,

  // 引用规格
  HEX32,
  PLACEHOLDER_REF,
  isPlaceholderRef,
  parsePath,
  collectAtPath,

  // 高级查询（漏斗）契约规格
  querySpec,

  // JSON 双层完整性（外层对象 + 字符串里的第二层 JSON）
  findRawControlChars,
  escapeRawControlChars,
  describeFailure,
  validateLayoutJson,
  stringifyLayout,

  // JSON 文本格式检查与强制修订（尾随逗号/单引号/注释/缺闭合符/键名重复 …）
  jsonFormat,
};
