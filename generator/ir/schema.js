/**
 * 组件 schema：由 scripts/surveyCorpus.js 从真实语料反向挖掘得到
 *
 * 为什么要有这一层：
 *   「未知组件类型」「未知 property key」这类规则如果靠手写白名单，
 *   必然与真实引擎脱节。这里的数据全部来自 401 个生产布局的实测统计，
 *   并且会随语料更新而更新，规则只消费数据、不硬编码。
 */

const fs = require('fs');
const path = require('path');

const GENERATED_PATH = path.join(__dirname, 'schema.generated.json');

let cached = null;

/** 读取生成的 schema，缺失时返回空骨架（规则会退化为不检查属性） */
function loadSchema() {
  if (cached) return cached;
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(GENERATED_PATH, 'utf8'));
  } catch (e) {
    raw = null;
  }
  cached = normalize(raw);
  return cached;
}

/**
 * 计算「通用属性」：在足够多的组件类型上都出现过的键。
 * 这类键不需要逐类型登记，否则属性检查会大量误报。
 */
function computeUniversalKeys(types, options = {}) {
  const ratio = options.ratio !== undefined ? options.ratio : 0.6;
  const minTypes = options.minTypes !== undefined ? options.minTypes : 5;
  const typeNames = Object.keys(types);
  if (typeNames.length < minTypes) return [];
  const counter = {};
  for (const t of typeNames) {
    for (const k of types[t].propertyKeys || []) counter[k] = (counter[k] || 0) + 1;
  }
  return Object.entries(counter)
    .filter(([, c]) => c / typeNames.length >= ratio)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

function normalize(raw) {
  if (!raw || !raw.componentTypes) {
    const api = {
      available: false,
      source: null,
      sampleSize: 0,
      componentTypes: {},
      universalKeys: [],
      universalSet: new Set(),
      knownTypes: new Set(),
      keyIndex: {},
      typeIndex: {},
    };
    // schema 不可用时一律放行，避免因为缺数据而误报
    api.isKnownType = () => true;
    api.isKnownKey = () => true;
    api.typesUsingKey = () => [];
    return api;
  }
  const componentTypes = raw.componentTypes;
  const universalKeys = computeUniversalKeys(componentTypes);
  const universalSet = new Set(universalKeys);

  const keyIndex = {};   // type -> Set(keys)
  const typeIndex = {};  // key -> Set(types) 便于报错时说「这个键别的组件在用」
  for (const [t, entry] of Object.entries(componentTypes)) {
    keyIndex[t] = new Set(entry.propertyKeys || []);
    for (const k of entry.propertyKeys || []) {
      if (!typeIndex[k]) typeIndex[k] = new Set();
      typeIndex[k].add(t);
    }
  }

  const api = {
    available: true,
    source: raw.source,
    sampleSize: raw.sampleSize || 0,
    componentTypes,
    universalKeys,
    universalSet,
    knownTypes: new Set(Object.keys(componentTypes)),
    keyIndex,
    typeIndex,
  };

  // 把查询方法挂到 schema 对象上，规则里可以直接 schema.isKnownKey(type, key)
  api.isKnownType = type => isKnownType(api, type);
  api.isKnownKey = (type, key) => isKnownKey(api, type, key);
  api.typesUsingKey = (key, excludeType) => typesUsingKey(api, key, excludeType);
  return api;
}

/** 该组件类型是否在语料中出现过 */
function isKnownType(schema, type) {
  return !!schema.knownTypes && schema.knownTypes.has(type);
}

/** 该键是否对该组件类型合法（自身登记过，或属于通用键） */
function isKnownKey(schema, type, key) {
  if (!schema.available) return true;
  if (schema.universalSet.has(key)) return true;
  const set = schema.keyIndex[type];
  if (!set) return true;
  return set.has(key);
}

/** 哪些其他组件类型在用这个键——用于给出「是不是敲错了」的提示 */
function typesUsingKey(schema, key, excludeType) {
  const set = schema.typeIndex[key];
  if (!set) return [];
  return Array.from(set).filter(t => t !== excludeType);
}

/** 仅供测试：替换缓存 */
function __setSchema(schema) {
  cached = schema;
}

module.exports = {
  loadSchema,
  computeUniversalKeys,
  isKnownType,
  isKnownKey,
  typesUsingKey,
  __setSchema,
  GENERATED_PATH,
};
