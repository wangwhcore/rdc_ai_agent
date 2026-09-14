/**
 * emit：Page IR → Layout JSON
 *
 * 与 lift 互为逆运算。按 IR 中记录的 keyOrder 重建对象，使输出的 value 字符串
 * 与原始文件逐字节一致（前提是 IR 未被手工改写）。
 */

const { clone } = require('./lift');

const DEFAULT_TOP_ORDER = [
  'appGid', 'branch', 'createBy', 'createTime', 'entityUpdate', 'frontId',
  'functionGid', 'gid', 'isSystem', 'lastModifiedBy', 'lastModifyTime', 'layoutRef',
  'logicDelete', 'name', 'pid', 'productGid', 'projectGid', 'projectType', 'state', 'value',
];
const DEFAULT_VALUE_ORDER = ['phone', 'pad', 'draftComponents', 'desktop'];
const DEFAULT_DESKTOP_ORDER = [
  'updateTime', 'flows', 'defaultDataSource', 'graphic', 'canvas',
  'layoutInfo', 'validates', 'validateList', 'layoutList', 'subscribes', 'components',
];

/** 按给定顺序重建对象，顺序里没有的键追加到末尾，保证不丢字段 */
function ordered(order, map, fallback) {
  const keys = (Array.isArray(order) && order.length ? order : fallback).slice();
  const rest = Object.keys(map).filter(k => !keys.includes(k));
  const out = {};
  for (const k of keys.concat(rest)) if (k in map) out[k] = map[k];
  return out;
}

/** 把被打桩的 region 结构还原为内联组件对象 */
function inflateRegions(ir) {
  const { regions, keyOrder } = ir;
  const components = ir.components || {};
  const layoutList = {};

  const regionIds = Array.isArray(keyOrder && keyOrder.region) && keyOrder.region.length
    ? keyOrder.region.slice()
    : Object.keys(regions || {});
  for (const id of Object.keys(regions || {})) if (!regionIds.includes(id)) regionIds.push(id);

  const missing = [];
  for (const regionId of regionIds) {
    const region = regions[regionId] || {};
    const out = clone(region.extra || {});
    out.rows = (region.rows || []).map((rowNode, rowIndex) => {
      const rowClone = clone(rowNode);
      rowClone.cols = (rowClone.cols || []).map((colNode, colIndex) => {
        const extras = (region.mountExtras || {})[`${rowIndex}.${colIndex}`] || {};
        colNode.components = (colNode.components || []).map(cid => {
          if (typeof cid !== 'string') return clone(cid);
          if (!components[cid]) {
            missing.push({ regionId, componentId: cid });
            return { type: 'MissingComponent', property: { id: cid } };
          }
          // 回填挂载级键（如 colId），保持与设计器保存形态一致
          return { ...clone(components[cid]), ...clone(extras[cid] || {}) };
        });
        return colNode;
      });
      return rowClone;
    });
    layoutList[regionId] = out;
  }

  if (missing.length) {
    const err = new Error(
      `emit 失败：${missing.length} 个被引用的组件在 IR.components 中不存在，` +
      `例如 ${missing[0].componentId}（位于 region ${missing[0].regionId}）`
    );
    err.details = missing;
    throw err;
  }
  return layoutList;
}

/** 由 IR 重建 value 对象 */
function emitValue(ir) {
  // 仅内联的组件在原始文件中不出现于 components 映射，
  // 这里同步剔除，既保证往返幂等，也保证输出与设计器保存形态一致
  const componentMap = clone(ir.components || {});
  for (const id of ir.inlineOnly || []) delete componentMap[id];

  const desktopMap = {
    ...clone(ir.envelope && ir.envelope.desktopRest ? ir.envelope.desktopRest : {}),
    layoutInfo: clone(ir.page || {}),
    layoutList: inflateRegions(ir),
    subscribes: clone(ir.subscribes || []),
    components: componentMap,
  };

  const env = ir.envelope || {};
  const valueMap = {
    phone: clone(env.phone),
    pad: clone(env.pad),
    draftComponents: clone(env.draftComponents),
    // value 层的额外键（appGid / branch / projectGid / updateTime 等）原样回填
    ...clone(env.valueRest || {}),
    desktop: ordered(
      ir.keyOrder && ir.keyOrder.desktop,
      desktopMap,
      DEFAULT_DESKTOP_ORDER
    ),
  };

  return ordered(ir.keyOrder && ir.keyOrder.value, valueMap, DEFAULT_VALUE_ORDER);
}

/**
 * 由 IR 重建 Layout JSON
 * @param {object} ir Page IR
 * @param {object} [options]
 * @param {number} [options.space] value 字符串的缩进，默认无缩进（与设计器输出一致）
 * @returns {object} Layout JSON
 */
function emit(ir, options = {}) {
  if (!ir || typeof ir !== 'object') throw new Error('emit 需要一个 Page IR 对象');
  if (!ir.meta || !ir.regions) throw new Error('emit 收到的对象不是合法 Page IR（缺少 meta/regions）');

  const value = emitValue(ir);
  const map = { ...clone(ir.meta), value: JSON.stringify(value, null, options.space) };

  // IR 的语义字段是权威来源：meta 只是「未被建模字段」的信封。
  // 若调用方改写了 ir.name / ir.functionGid / ir.identity，必须反映到输出上，
  // 否则会出现「改了 IR 但输出没变」的静默失效。
  //
  // 注意：语义字段在 IR 里用空串表示「无值」，而原始文件可能是「压根没这个键」。
  // 只有当源文件本来就有该键、或调用方确实填了非空值时才写回，
  // 避免凭空补出源文件没有的字段（语料中 3 个布局缺 functionGid）。
  const sync = (key, value) => {
    if (value === undefined || value === null) return;
    if (value === '' && !(key in map)) return;
    map[key] = value;
  };
  sync('name', ir.name);
  sync('functionGid', ir.functionGid);
  if (ir.identity) {
    sync('gid', ir.identity.gid);
    sync('frontId', ir.identity.frontId);
    if (ir.identity.pid !== null && ir.identity.pid !== undefined) map.pid = ir.identity.pid;
  }

  return ordered(ir.keyOrder && ir.keyOrder.top, map, DEFAULT_TOP_ORDER);
}

module.exports = { emit, emitValue, inflateRegions, ordered };
