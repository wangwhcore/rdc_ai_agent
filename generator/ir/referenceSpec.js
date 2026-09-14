/**
 * 跨引用规格表
 *
 * 这张表不是拍脑袋写的，而是从 401 个真实 MdFrontLayout 语料里反向挖出来的：
 * 扫描每个组件 property 中形如 32 位 hex 的字符串值，统计其能否在
 * layoutList（region）或 components（component）中命中。
 *
 * 每条记录的含义：
 *   ownerType   持有该引用的组件类型
 *   path        属性路径，'[]' 表示遍历数组元素，如 'columns[].colId'
 *   target      引用目标类型：'region' | 'component'
 *   expectType  目标组件必须具备的类型（可选）
 *   severity    断链时的诊断级别；按语料中的真实命中率标定
 *   required    该引用是否必须存在
 *   corpus      语料统计 { resolve, dangling }，用于复核严重级是否合理
 */

const HEX32 = /^[0-9a-f]{32}$/i;

/**
 * ── 布局引用的命名空间（决定「32 位 hex 该往哪儿找」）──────────────────
 * 同样是 32 位 hex 的字符串，在不同字段里属于完全不同的命名空间。
 * 这张表由 401 份语料逐个字段统计得出（见 scripts 里的探针结论）：
 *
 *   openM 载荷 id                 -> layoutFrontId 358 / layoutGid 0
 *   @@navigator.push 的 url        -> layoutFrontId 563 / layoutGid 0
 *   CardHook.layoutId             -> regionId      1942 / 0
 *   CardHook.toolContainerId      -> regionId      1862 / 0
 *   AdvanceQueryHook.associateId  -> componentId    884 / 0
 *   rowOperationItem[].id         -> componentId   1440 / 0
 *   toolButtons[]                 -> componentId    640 / 0
 *   layoutInfo.componentIds[]     -> regionId       837 + 203 个预设槽位名（非 hex）
 *
 * 最容易踩的坑：MdFrontLayout 的**文件名是 gid**，而运行时引用用的是 frontId。
 * 把 gid 填进 openM.url / push.url，运行时解析不到目标布局，会把空节点交给
 * RenderLayout，从而抛出 `Cannot read properties of undefined (reading 'field')`。
 */

/** 32 位但全为同一字符（0000… / aaaa…），几乎一定是未替换的占位符 */
const PLACEHOLDER_REF = /^(.)\1{31}$/;

/** 判断一个字符串是否像「未替换的占位符」 */
function isPlaceholderRef(value) {
  return typeof value === 'string' && PLACEHOLDER_REF.test(value);
}

const REFERENCES = [
  // ---- CardHook：区域引用为主 ----
  {
    ownerType: 'CardHook', path: 'layoutId', target: 'region',
    severity: 'error', required: false, corpus: { resolve: 459, dangling: 0 },
    note: '卡片内容区，指向 layoutList 中的容器',
  },
  {
    ownerType: 'CardHook', path: 'toolContainerId', target: 'region',
    severity: 'error', required: false, corpus: { resolve: 459, dangling: 0 },
    note: '工具栏容器',
  },
  {
    ownerType: 'CardHook', path: 'extraContainerId', target: 'region',
    severity: 'warning', required: false, corpus: { resolve: 154, dangling: 277 },
    note: '语料中近 2/3 悬空，视为可选占位容器，仅告警',
  },
  {
    ownerType: 'CardHook', path: 'ltContainerId', target: 'region',
    severity: 'warning', required: false, corpus: { resolve: 147, dangling: 283 },
    note: '语料中近 2/3 悬空，视为可选占位容器，仅告警',
  },
  {
    ownerType: 'CardHook', path: 'toolButtons', target: 'component',
    severity: 'error', required: false, corpus: { resolve: 308, dangling: 0 },
    note: '工具栏按钮 id 列表',
  },

  // ---- TableHook：列与行操作 ----
  {
    ownerType: 'TableHook', path: 'columns[].colId', target: 'component',
    severity: 'error', required: false, corpus: { resolve: 1803, dangling: 0 },
    note: '列定义指向 ColumnHook',
  },
  {
    ownerType: 'TableHook', path: 'columnsCardTable[].colId', target: 'component',
    severity: 'warning', required: false, corpus: { resolve: 948, dangling: 72 },
    note: '卡片态列，存在少量悬空，降级告警',
  },
  {
    ownerType: 'TableHook', path: 'columnsListTable[].colId', target: 'component',
    severity: 'warning', required: false, corpus: { resolve: 948, dangling: 72 },
    note: '列表态列，存在少量悬空，降级告警',
  },
  {
    ownerType: 'EditTableHook', path: 'columns[].colId', target: 'component',
    severity: 'warning', required: false, corpus: { resolve: 777, dangling: 144 },
    note: '子表列，约 16% 悬空（列内联自描述），降级告警',
  },
  {
    ownerType: 'GridFieldTable', path: 'columns[].colId', target: 'component',
    severity: 'warning', required: false, corpus: { resolve: 117, dangling: 20 },
    note: 'Grid 编辑表格列，存在少量悬空，降级告警',
  },

  // ---- AdvanceQueryHook ----
  {
    ownerType: 'AdvanceQueryHook', path: 'associateId', target: 'component', expectType: 'TableHook',
    severity: 'error', required: false, corpus: { resolve: 218, dangling: 1 },
    note: '关联的主表格，必须是 TableHook',
  },
  {
    ownerType: 'QzingQuickSearch', path: 'associateId', target: 'component',
    severity: 'error', required: false, corpus: { resolve: 1, dangling: 0 },
    note: '快捷搜索关联目标',
  },

  // ---- 容器型组件的区域引用 ----
  {
    ownerType: 'TabsHook', path: 'tabPanels[].layoutId', target: 'region',
    severity: 'error', required: false, corpus: { resolve: 65, dangling: 0 },
    note: '标签面板内容区',
  },
  {
    ownerType: 'SwitchCardHook', path: 'panes[].layoutId', target: 'region',
    severity: 'error', required: false, corpus: { resolve: 9, dangling: 0 },
    note: '切换卡片面板内容区',
  },
  {
    ownerType: 'QzingGroupCard', path: 'layoutId', target: 'region',
    severity: 'error', required: false, corpus: { resolve: 9, dangling: 0 },
    note: '分组卡片内容区',
  },
  {
    ownerType: 'ProCardHook', path: 'layoutId', target: 'region',
    severity: 'error', required: false, corpus: { resolve: 6, dangling: 0 },
    note: '高级卡片内容区',
  },
  {
    ownerType: 'DrawerContainerHook', path: 'layoutId', target: 'region',
    severity: 'error', required: false, corpus: { resolve: 5, dangling: 0 },
    note: '抽屉内容区',
  },
  {
    ownerType: 'DrawerContainerHook', path: 'drawerContainerId', target: 'region',
    severity: 'error', required: false, corpus: { resolve: 5, dangling: 0 },
    note: '抽屉容器本体',
  },
  {
    ownerType: 'TreeHook', path: 'actionBtnContainerId', target: 'region',
    severity: 'error', required: false, corpus: { resolve: 10, dangling: 0 },
    note: '树的按钮容器',
  },

  // ---- 导出与元数据 ----
  {
    ownerType: 'NeuListExport', path: 'tableId', target: 'component',
    severity: 'error', required: false, corpus: { resolve: 61, dangling: 1 },
    note: '导出按钮绑定的表格',
  },
  {
    ownerType: 'MetaHolder', path: 'refId', target: 'component',
    severity: 'warning', required: false, inferred: true,
    corpus: { resolve: 0, dangling: 12 },
    note: '语料中全部悬空，字段语义待确认，仅告警',
  },
];

/** 把 'columns[].colId' 解析为 ['columns', '[]', 'colId'] */
function parsePath(pathExpr) {
  return pathExpr.split('.').flatMap(seg => {
    const parts = [];
    let rest = seg;
    while (rest.includes('[]')) {
      const i = rest.indexOf('[]');
      const head = rest.slice(0, i);
      if (head) parts.push(head);
      parts.push('[]');
      rest = rest.slice(i + 2);
    }
    if (rest) parts.push(rest);
    return parts;
  });
}

/**
 * 按路径取出所有命中值
 * @returns {Array<{value:*, at:string}>} at 为人类可读定位，如 'columns[2].colId'
 */
function collectAtPath(root, segments, atPrefix = '') {
  const out = [];
  const walk = (node, segs, at) => {
    if (!segs.length) {
      out.push({ value: node, at });
      return;
    }
    const [seg, ...rest] = segs;
    if (seg === '[]') {
      if (!Array.isArray(node)) return;
      node.forEach((item, i) => walk(item, rest, `${at}[${i}]`));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    if (!(seg in node)) return;
    walk(node[seg], rest, at ? `${at}.${seg}` : seg);
  };
  walk(root, segments, atPrefix);
  return out;
}

module.exports = { REFERENCES, HEX32, PLACEHOLDER_REF, isPlaceholderRef, parsePath, collectAtPath };
