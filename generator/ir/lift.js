/**
 * lift：Layout JSON → Page IR
 *
 * 设计原则（很重要）：
 *   Page IR 不是「另一种中间格式」，而是「无损信封 + 语义提取」。
 *   - 无损信封：envelope / meta / page / regions 保留全部信息，emit 可逐字节还原
 *     value 字符串，因此 IR 可以安全作为唯一真源。
 *   - 语义提取：kind / references / queries 是把散落在结构里的语义抽成显式数据，
 *     供 check、formatter、language-server 复用，避免各自重写遍历逻辑。
 *
 * 为什么把 layoutList 里内联的组件对象「打桩」成 id 字符串：
 *   经 401 个真实布局验证，内联副本与 components 映射中的同 id 条目逐字节相同
 *   （3951/3951，0 处差异），容器 id 则只存在于 layoutList。因此在 IR 中按 id 引用、
 *   emit 时回填，是无损的，同时让 IR 可读、可 diff。
 */

const { REFERENCES, HEX32, parsePath, collectAtPath } = require('./referenceSpec');

const IR_VERSION = '1.0.0';

const PAGE_KINDS = ['list', 'add', 'edit', 'view', 'simple', 'modal', 'unknown'];

/** 深拷贝，仅处理 JSON 可序列化数据 */
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** 键顺序无关的 JSON 等价判断 */
function sameJson(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return stableJson(a) === stableJson(b);
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
}

function parseValue(layoutJson) {
  if (!layoutJson || typeof layoutJson !== 'object') {
    throw new Error('Layout JSON 必须是一个对象');
  }
  const raw = layoutJson.value;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(`value 反序列化失败: ${e.message}`);
    }
  }
  if (raw && typeof raw === 'object') return raw;
  throw new Error('value 缺失，或既不是 JSON 字符串也不是对象');
}

/** 按组件特征推断页面语义类型（语料中 82% 的布局没有 pageType） */
function inferKind(desktop) {
  const declared = desktop.layoutInfo && desktop.layoutInfo.pageType;
  if (declared && PAGE_KINDS.includes(declared)) return declared;

  const field = desktop.layoutInfo && desktop.layoutInfo.field;
  if (field === 'modal') return 'modal';

  const comps = Object.values(desktop.components || {});
  if (comps.some(c => c && c.type === 'TableHook')) return 'list';

  const hasSave = comps.some(
    c =>
      c && c.type === 'ButtonHook' && c.property &&
      (c.property.action || '').toString().includes('_save')
  );

  const layoutMain = (desktop.layoutList || {}).LayoutMain;
  const hasFormCard = !!(layoutMain && (layoutMain.rows || []).some(r =>
    (r.cols || []).some(c => (c.components || []).some(
      comp => comp && comp.type === 'CardHook' && comp.property && comp.property.layoutId
    ))
  ));

  if (hasFormCard && hasSave) return 'add';
  if (hasFormCard) return 'view';
  return declared || 'unknown';
}

/**
 * 抽出所有跨引用
 * @param {object} components 组件注册表（必须包含仅内联的组件，否则会漏检其引用）
 * @param {Set<string>} regionIds layoutList 中存在的区域 id
 * @param {object} [options] { references: 自定义规格表 }
 * @returns {Array} 引用记录，含 resolves 标记
 */
function extractReferences(components, regionIds, options = {}) {
  const spec = options.references || REFERENCES;
  const refs = [];
  for (const [id, comp] of Object.entries(components)) {
    if (!comp || !comp.type) continue;
    for (const rule of spec) {
      if (rule.ownerType !== comp.type) continue;
      const segments = parsePath(rule.path);
      const hits = collectAtPath(comp.property || {}, segments, 'property');
      for (const hit of hits) {
        const isArr = Array.isArray(hit.value);
        const values = isArr ? hit.value : [hit.value];
        values.forEach((v, i) => {
          if (typeof v !== 'string' || !HEX32.test(v)) return;
          const at = isArr ? `${hit.at}[${i}]` : hit.at;
          const resolves = rule.target === 'region' ? regionIds.has(v) : !!components[v];
          refs.push({
            from: id,
            fromType: comp.type,
            via: rule.path,
            at: `components.${id}.${at}`,
            to: v,
            target: rule.target,
            expectType: rule.expectType || null,
            severity: rule.severity || 'error',
            required: !!rule.required,
            resolves,
            actualType: resolves && rule.target === 'component' ? components[v].type : null,
          });
        });
      }
    }
  }
  return refs;
}

/**
 * 抽出所有数据源配置，形成可校验的契约清单
 * dataSource 出现在组件 property.dataSource，以及 subscribes[].behaviors[].dataSource
 */
function extractQueries(desktop, components) {
  const out = [];
  const push = (owner, ownerType, ds, from) => {
    if (!ds || typeof ds !== 'object') return;
    out.push({
      owner,
      ownerType,
      from,
      isEmpty: Object.keys(ds).length === 0,
      method: ds.method !== undefined ? ds.method : null,
      serverName: ds.serverName !== undefined ? ds.serverName : null,
      type: ds.type !== undefined ? ds.type : null,
      url: ds.url !== undefined ? ds.url : null,
      bodyExpression: ds.bodyExpression !== undefined ? ds.bodyExpression : null,
      returnDataExpression: ds.returnDataExpression !== undefined ? ds.returnDataExpression : null,
      raw: ds,
    });
  };

  for (const [id, comp] of Object.entries(components)) {
    if (!comp) continue;
    const p = comp.property || {};
    if (p.dataSource) push(id, comp.type, p.dataSource, 'component.dataSource');
  }

  const subscribes = desktop.subscribes || [];
  subscribes.forEach((sub, si) => {
    for (const [bi, beh] of (sub.behaviors || []).entries()) {
      if (beh && beh.dataSource) {
        push(`subscribes[${si}]`, 'Subscribe', beh.dataSource, `subscribes[${si}].behaviors[${bi}].dataSource`);
      }
      for (const [gi, group] of (beh && beh.successPubs ? [beh.successPubs] : []).entries()) {
        for (const [pi, pub] of (group || []).entries()) {
          if (pub && pub.dataSource) {
            push(`subscribes[${si}]`, 'Subscribe', pub.dataSource,
              `subscribes[${si}].behaviors[${bi}].successPubs[${pi}].dataSource`);
          }
        }
      }
    }
  });
  return out;
}

/**
 * 把 layoutList 中内联的组件对象替换为 id 字符串，并记录 region 顺序
 *
 * 挂载级覆盖（mountExtras）：
 *   生成器会在内联副本上追加只属于「挂载点」的键（例如 colId），而 components
 *   映射里的同 id 条目没有这个键。这类键不能写进组件本体，否则会污染共享条目，
 *   因此按 (行,列) 单独记录，emit 时再合并回去。
 *   真实语料中内联副本与映射条目逐字节相同，此表为空，不影响既有行为。
 */
function stubRegions(layoutList, registry) {
  const regions = {};
  const order = Object.keys(layoutList || {});
  const inlineOnly = [];   // 仅内联存在、未登记到 components 映射的组件 id

  for (const regionId of order) {
    const region = layoutList[regionId] || {};
    const extra = {};
    for (const [k, v] of Object.entries(region)) if (k !== 'rows') extra[k] = clone(v);

    const mountExtras = {};
    const rows = (region.rows || []).map((rowNode, rowIndex) => {
      const rowClone = clone(rowNode);
      const cols = (rowClone.cols || []).map((colNode, colIndex) => {
        const ids = [];
        const colExtras = {};

        for (const comp of colNode.components || []) {
          const cid = comp && comp.property && comp.property.id;
          if (!cid) {
            // 没有 property.id 的节点无法按 id 引用，原样保留以避免丢数据。
            // 这类节点由 check 的 ID002 规则报出（语料中未出现，属防御性处理）。
            ids.push(clone(comp));
            continue;
          }
          if (!registry[cid]) {
            registry[cid] = clone(comp);
            inlineOnly.push(cid);
          } else if (!sameJson(comp, registry[cid])) {
            // 内联副本与共享条目不一致：
            //   - 生成器会在挂载副本上追加 colId 这类「挂载级」键；
            //   - 若组件在 toJSON() 里生成 uuid（历史缺陷），值也会不同。
            // 两种都整份保留内联副本，保证 IR 无损、emit 后逐字节还原。
            colExtras[cid] = clone(comp);
          }
          ids.push(cid);
        }

        colNode.components = ids;
        if (Object.keys(colExtras).length) mountExtras[`${rowIndex}.${colIndex}`] = colExtras;
        return colNode;
      });
      rowClone.cols = cols;
      return rowClone;
    });

    const entry = { extra, rows };
    if (Object.keys(mountExtras).length) entry.mountExtras = mountExtras;
    regions[regionId] = entry;
  }
  return { regions, order, inlineOnly };
}

/**
 * 提升为 Page IR
 * @param {object} layoutJson 设计器 Layout JSON
 * @returns {object} Page IR
 */
function lift(layoutJson) {
  const value = parseValue(layoutJson);
  const desktop = value && value.desktop;
  if (!desktop) throw new Error('value.desktop 不存在');

  // 顶层元数据：除 value 外全部原样保留
  const meta = {};
  const topOrder = Object.keys(layoutJson);
  for (const k of topOrder) if (k !== 'value') meta[k] = clone(layoutJson[k]);

  // 组件注册表：以 components 映射为基准，再补齐仅存在于 layoutList 的内联组件
  const components = clone(desktop.components || {});
  const { regions, order: regionOrder, inlineOnly } = stubRegions(desktop.layoutList, components);

  // 信封：desktop 中除语义化字段外的其余字段，原样保留
  const desktopRest = {};
  const desktopOrder = Object.keys(desktop);
  const modeled = new Set(['layoutInfo', 'layoutList', 'components', 'subscribes']);
  for (const k of desktopOrder) if (!modeled.has(k)) desktopRest[k] = clone(desktop[k]);

  // value 层除四个标准键之外的其他键也要保留：
  // 语料实测 185 个布局在 value 顶层带有 appGid/branch/projectGid，22 个带 updateTime
  const valueRest = {};
  const MODELED_VALUE_KEYS = new Set(['phone', 'pad', 'draftComponents', 'desktop']);
  for (const [k, v] of Object.entries(value)) {
    if (!MODELED_VALUE_KEYS.has(k)) valueRest[k] = clone(v);
  }

  const envelope = {
    phone: clone(value.phone),
    pad: clone(value.pad),
    draftComponents: clone(value.draftComponents),
    valueRest,
    desktopRest,
  };

  // 引用必须基于完整注册表（含仅内联的组件）来抽取，
  // 否则「只内联未登记」的组件（如生成器的列表卡片）的引用会被整段漏检
  const references = extractReferences(components, new Set(regionOrder));
  const queries = extractQueries(desktop, components);

  return {
    irVersion: IR_VERSION,
    kind: inferKind(desktop),
    name: layoutJson.name || '',
    functionGid: layoutJson.functionGid || '',
    identity: {
      gid: layoutJson.gid || '',
      frontId: layoutJson.frontId || '',
      pid: layoutJson.pid !== undefined ? layoutJson.pid : null,
    },
    meta,
    page: clone(desktop.layoutInfo || {}),
    envelope,
    regions,
    components,
    /**
     * 仅内联在 layoutList、未登记到 components 映射的组件 id。
     * 语料实测：401 个真实布局中 3951 个挂载组件全部同时登记在映射里，
     * 因此这个列表非空即意味着与设计器约定不一致（由 ID007 规则报出）。
     * emit 会把这些 id 从映射中剔除，从而保证往返幂等。
     */
    inlineOnly,
    subscribes: clone(desktop.subscribes || []),
    references,
    queries,
    keyOrder: {
      top: topOrder,
      value: Object.keys(value),
      desktop: desktopOrder,
      region: regionOrder,
    },
    stats: {
      regionCount: regionOrder.length,
      componentCount: Object.keys(components).length,
      inlineOnlyCount: inlineOnly.length,
      referenceCount: references.length,
      danglingCount: references.filter(r => !r.resolves).length,
      queryCount: queries.length,
    },
  };
}

module.exports = { lift, inferKind, extractReferences, extractQueries, parseValue, clone, sameJson, stableJson, IR_VERSION, PAGE_KINDS };
