/**
 * singleValidate 契约 —— 全部结论来自 401 份真实语料（2293 处）。
 *
 * 语料取值分布：
 *   ""                                    1516
 *   []                                     353
 *   ["required"]                           339
 *   ["positiveInteger"]                     63
 *   ["required","email"]                    23
 *   ["required","phoneNumber"]              20
 *   ...（其余均为数组）
 *
 * ⚠️ 非空值 **100% 是字符串数组**，裸字符串 0 处。
 * 该字段与 tagStyle 同属「运行时会当成 JS 值来用」的字段：写成裸标识符（如 `'required'`）
 * 在运行时求值会 ReferenceError，轻则校验规则静默失效，重则整个属性被原样当成对象用。
 * 所以这里统一产出数组形态。
 */

/** 单条规则的名称（语料中唯一出现的必填规则名） */
const REQUIRED_RULE = 'required';

/** 语料中出现过的全部规则名，用于校验提示 */
const KNOWN_RULES = new Set([
  'required', 'email', 'phoneNumber', 'positiveInteger',
]);

/**
 * 产出 singleValidate 的值。
 * @param {boolean} required 是否必填
 * @param {string[]} [extra] 附加规则名
 * @returns {string|string[]} 未必填且无附加规则时恒为空串（与语料一致）
 */
function singleValidateOf(required, extra = []) {
  const rules = [];
  if (required) rules.push(REQUIRED_RULE);
  for (const r of extra) if (r && !rules.includes(r)) rules.push(r);
  return rules.length ? rules : '';
}

/**
 * 判断一个 singleValidate 值是否表示「必填」。
 * 兼容两种写法：语料的数组形态，以及旧的裸字符串形态（生成器曾输出过）。
 * @param {*} value
 */
function isRequired(value) {
  if (Array.isArray(value)) return value.includes(REQUIRED_RULE);
  if (typeof value === 'string') return value.split(',').map(s => s.trim()).includes(REQUIRED_RULE);
  return false;
}

/** 取该字段声明的规则名列表（用于诊断展示） */
function rulesOf(value) {
  if (Array.isArray(value)) return value.slice();
  if (typeof value === 'string') return value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  return [];
}

module.exports = { REQUIRED_RULE, KNOWN_RULES, singleValidateOf, isRequired, rulesOf };
