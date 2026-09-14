/**
 * 高级查询（漏斗）契约
 *
 * 这一组规则守的是「高级查询组件 ⇄ 表格 ⇄ 漏斗容器」三者的对应关系。
 * 全部数字来自 401 份语料（225 个 AdvanceQueryHook / 390 条条件 / 159 个 *_filterId 键），
 * 标定表在 `ir/querySpec.js`，与生成器共用同一份。
 *
 * 结构：
 *   layoutList['<AdvanceQueryHook.id>_filterId'] = { rows: [...] }
 *     每个 ColContainer 里放**一个**表单组件，property.filed === advancedQuery[].field
 *   AdvanceQueryHook.property.associateId === TableHook.id
 *
 * 语料基线（决定每条规则的级别）：
 *   associateId 指向 TableHook 218/225，7 例空串        -> 空串只能算 warning
 *   advancedQuery 非空的 63 例全部有容器                -> 缺容器是 error
 *   容器组件数与条件数不一致的 1 例（脏页面）            -> error，属真缺陷
 *   operation 与组件类型不符 7/390（1.8%）              -> 只能算 info
 */

const {
  ADVANCED_QUERY_KEYS,
  COMPONENT_OPERATION,
  DEFAULT_QUERY_VALUE_TYPE,
  filterContainerKey,
  isFilterContainerKey,
} = require('../../ir/querySpec');

const rules = ['AQ001', 'AQ002', 'AQ003', 'AQ004', 'AQ005', 'AQ006', 'AQ007', 'AQ008'];

/**
 * 把每个区域里**实际挂载**的组件收出来，带可定位的 path。
 *
 * 注意 IR 会把挂载点规范化成 id 字符串（完整定义在 ir.components 里做去重），
 * 所以这里两种形态都要吃：string id / 内联对象。
 * entry 解析不到定义时为 undefined —— 那正是「只内联未登记」的情形，交给 AQ005 报。
 */
function collectMounted(ctx) {
  const components = ctx.components || {};
  const out = {};
  for (const regionId of ctx.regionOrder) {
    const region = ctx.regions[regionId] || {};
    const list = [];
    (region.rows || []).forEach((rowNode, ri) => {
      (rowNode.cols || []).forEach((colNode, ci) => {
        const base = `$.value.desktop.layoutList.${regionId}.rows[${ri}].cols[${ci}]`;
        (colNode.components || []).forEach((entry, xi) => {
          let id;
          let inline;
          if (typeof entry === 'string') {
            id = entry;
          } else if (entry && typeof entry === 'object') {
            inline = entry;
            id = (entry.property && entry.property.id) || entry.id || null;
          }
          list.push({
            id,
            type: (inline && inline.type) || (id && components[id] && components[id].type) || null,
            entry: inline || (id ? components[id] : null),
            registered: !!(id && components[id]),
            path: `${base}.components[${xi}]`,
          });
        });
      });
    });
    out[regionId] = list;
  }
  return out;
}

function check(ctx, report) {
  const components = ctx.components || {};
  const hooks = Object.entries(components).filter(([, c]) => c && c.type === 'AdvanceQueryHook');
  if (!hooks.length) return;

  const mounted = collectMounted(ctx);

  // 归属某个 AdvanceQueryHook 的漏斗容器（其他 *_filterId 是孤儿，不属于本组管辖）
  const ownedContainers = {};
  for (const regionId of ctx.regionOrder) {
    if (!isFilterContainerKey(regionId)) continue;
    const owner = regionId.slice(0, -'_filterId'.length);
    if (components[owner] && components[owner].type === 'AdvanceQueryHook') {
      ownedContainers[regionId] = mounted[regionId] || [];
    }
  }

  for (const [hid, hook] of hooks) {
    const p = hook.property || {};
    const basePath = `$.value.desktop.components.${hid}.property`;
    const aq = Array.isArray(p.advancedQuery) ? p.advancedQuery : [];

    // ── AQ001：高级查询与表格必然是成对出现的 ──────────────────────────
    const assoc = p.associateId;
    if (!assoc) {
      report({
        code: 'AQ001', severity: 'warning', path: `${basePath}.associateId`,
        message: '高级查询未关联任何表格（associateId 为空）',
        hint: '高级查询与表格是成对的：把 associateId 设为同页 TableHook 的 id。语料里 7/225 为空串，属可容忍状态。',
      });
    } else if (!components[assoc] || components[assoc].type !== 'TableHook') {
      report({
        code: 'AQ001', severity: 'error', path: `${basePath}.associateId`,
        message: `associateId ${JSON.stringify(assoc)} 不指向同页的 TableHook`,
        hint: 'associateId 必须是本页 TableHook 的 componentId（不是布局 frontId/gid，也不是别的组件）。',
      });
    }

    // ── AQ002：条件非空就必须有漏斗容器 ────────────────────────────────
    const containerKey = filterContainerKey(hid);
    const hasContainer = Object.prototype.hasOwnProperty.call(ownedContainers, containerKey)
      || Object.prototype.hasOwnProperty.call(ctx.regions, containerKey);
    const inner = ownedContainers[containerKey] || [];

    if (aq.length > 0 && !hasContainer) {
      report({
        code: 'AQ002', severity: 'error',
        path: `$.value.desktop.layoutList.${containerKey}`,
        message: `高级查询有 ${aq.length} 个条件，但缺少漏斗容器 layoutList['${containerKey}']`,
        hint: '语料里 advancedQuery 非空的 63 例全部带容器，容器键固定为 \'<AdvanceQueryHook.id>_filterId\'。'
          + ' 容器内容由表格字段推导，见 builder/components/AdvanceQueryHook.js 的 buildFilterRegion()。',
      });
    }

    // ── AQ003：容器内组件数 == 条件数 ──────────────────────────────────
    if (hasContainer && aq.length !== inner.length) {
      report({
        code: 'AQ003', severity: 'error',
        path: `$.value.desktop.layoutList.${containerKey}.rows`,
        message: `漏斗容器内有 ${inner.length} 个条件组件，但 advancedQuery 有 ${aq.length} 条`,
        hint: '两条列表一一对应，条数必须相等；不一致说明条件被增删时只改了一边。',
      });
    }

    // ── AQ004：filed 与 field 按序一致 ────────────────────────────────
    const n = Math.min(aq.length, inner.length);
    for (let i = 0; i < n; i++) {
      const filed = inner[i].entry && inner[i].entry.property && inner[i].entry.property.filed;
      if (filed !== aq[i].field) {
        report({
          code: 'AQ004', severity: 'error', path: inner[i].path,
          message: `第 ${i} 个条件组件的 filed ${JSON.stringify(filed)} 与 advancedQuery[${i}].field ${JSON.stringify(aq[i].field)} 不一致`,
          hint: '语料里两条列表是严格按序对齐的（224/225），运行时会按序取字段，错位会查错列。',
        });
      }
    }

    // ── AQ005：容器内组件必须全部登记到 components ────────────────────
    for (const m of inner) {
      if (!m.id) {
        report({
          code: 'AQ005', severity: 'error', path: m.path,
          message: '漏斗容器内的条件组件缺少 property.id',
          hint: '没有 id 就没法登记到 desktop.components，运行时找不到组件定义。',
        });
      } else if (!m.registered) {
        report({
          code: 'AQ005', severity: 'error', path: m.path,
          message: `条件组件 ${m.id}（${m.type || '未知类型'}）只内联挂载，未登记到 desktop.components`,
          hint: '语料里容器内的 389 个组件全部已登记；只内联会让运行时拿不到组件定义。',
        });
      }
    }

    // ── AQ006：advancedQuery 条目的形状 ───────────────────────────────
    aq.forEach((q, i) => {
      if (!q || typeof q !== 'object') {
        report({
          code: 'AQ006', severity: 'error', path: `${basePath}.advancedQuery[${i}]`,
          message: 'advancedQuery 条目不是对象',
          hint: `条目形状固定为 { ${ADVANCED_QUERY_KEYS.join(', ')} }。`,
        });
        return;
      }
      const missing = ADVANCED_QUERY_KEYS.filter(k => !(k in q));
      if (missing.length) {
        report({
          code: 'AQ006', severity: 'error', path: `${basePath}.advancedQuery[${i}]`,
          message: `advancedQuery 条目缺少键 ${missing.join(', ')}`,
          hint: `语料 390/390 条恰好只有 ${ADVANCED_QUERY_KEYS.join('/')} 四个键。`,
        });
      }
      const extra = Object.keys(q).filter(k => !ADVANCED_QUERY_KEYS.includes(k));
      if (extra.length) {
        report({
          code: 'AQ006', severity: 'info', path: `${basePath}.advancedQuery[${i}]`,
          message: `advancedQuery 条目含语料中没有的键 ${extra.join(', ')}`,
          hint: `设计器只认 ${ADVANCED_QUERY_KEYS.join('/')}；多余键在真实产物里从不出现（旧版生成器曾输出 label/colSpan/queryType 等）。`,
        });
      }
    });

    // ── AQ007：type / value 取默认值 ──────────────────────────────────
    aq.forEach((q, i) => {
      if (!q || typeof q !== 'object') return;
      if (q.type !== undefined && q.type !== DEFAULT_QUERY_VALUE_TYPE) {
        report({
          code: 'AQ007', severity: 'warning', path: `${basePath}.advancedQuery[${i}].type`,
          message: `条目 type 为 ${JSON.stringify(q.type)}，语料里恒为 ${JSON.stringify(DEFAULT_QUERY_VALUE_TYPE)}`,
          hint: '查询值类型固定是字面量 val。',
        });
      }
      if (q.value !== undefined && q.value !== '') {
        report({
          code: 'AQ007', severity: 'warning', path: `${basePath}.advancedQuery[${i}].value`,
          message: `条目 value 非空（${JSON.stringify(q.value)}），语料里恒为空串`,
          hint: '默认查询值应为空，由用户在界面上填写。',
        });
      }
    });

    // ── AQ008：operation 应与条件组件类型一致 ─────────────────────────
    for (let i = 0; i < n; i++) {
      const type = inner[i].type;
      const op = aq[i] && aq[i].operation;
      const expect = COMPONENT_OPERATION[type];
      if (expect && op && op !== expect) {
        report({
          code: 'AQ008', severity: 'info', path: inner[i].path,
          message: `${type} 的 operation 为 ${JSON.stringify(op)}，常见写法是 ${JSON.stringify(expect)}`,
          hint: '语料里 operation 是组件类型的函数（少数派写法占 7/390 ≈ 1.8%），不一致时确认是否刻意为之。',
        });
      }
    }
  }
}

module.exports = { group: 'aquery', rules, check };
