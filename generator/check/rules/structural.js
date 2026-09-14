/**
 * 结构类规则：外层信封、desktop 骨架、区域容器形态
 */

const REQUIRED_OUTER = ['gid', 'frontId', 'name'];
const OPTIONAL_OUTER = ['functionGid', 'pid', 'appGid', 'projectGid', 'branch'];
const REQUIRED_DESKTOP = ['layoutInfo', 'layoutList', 'components', 'subscribes'];
const MAX_SPAN = 24;

function check(ctx, report) {
  const { ir, raw, rawProvided } = ctx;

  // STRUCT001 外层必填字段
  // 语料实测：gid/frontId/name/value 401/401 齐全，functionGid 有 3 个缺失
  for (const f of REQUIRED_OUTER) {
    if (ir.meta[f] === undefined || ir.meta[f] === '') {
      report({
        code: 'STRUCT001', severity: 'error', path: `$.${f}`,
        message: `缺少外层必填字段 ${f}`,
        hint: `设计器保存时该字段恒存在，缺失会导致页面无法被平台索引`,
      });
    }
  }
  if (rawProvided && raw.value === undefined) {
    report({
      code: 'STRUCT001', severity: 'error', path: '$.value',
      message: '缺少外层必填字段 value',
      hint: 'value 承载页面全部结构，缺失等同空页面',
    });
  }
  for (const f of OPTIONAL_OUTER) {
    if (ir.meta[f] === undefined) {
      report({
        code: 'STRUCT002', severity: 'info', path: `$.${f}`,
        message: `外层可选字段 ${f} 缺失`,
        hint: '不影响渲染，但跨环境迁移时可能缺少归属信息',
      });
    }
  }

  // STRUCT003 desktop 骨架
  const desktopRest = (ir.envelope && ir.envelope.desktopRest) || {};
  for (const f of REQUIRED_DESKTOP) {
    let present = true;
    if (f === 'layoutInfo') present = ir.page && Object.keys(ir.page).length > 0;
    else if (f === 'layoutList') present = Object.keys(ir.regions || {}).length > 0;
    else if (f === 'components') present = ir.components !== undefined && ir.components !== null;
    else if (f === 'subscribes') present = Array.isArray(ir.subscribes);
    if (!present) {
      report({
        code: 'STRUCT003', severity: 'error', path: `$.value.desktop.${f}`,
        message: `desktop 缺少字段 ${f}`,
        hint: '四件套 layoutInfo / layoutList / components / subscribes 缺一不可',
      });
    }
  }

  // STRUCT004 layoutList 至少有一个区域
  const regionIds = Object.keys(ir.regions || {});
  if (regionIds.length === 0) {
    report({
      code: 'STRUCT004', severity: 'error', path: '$.value.desktop.layoutList',
      message: 'layoutList 为空，页面没有任何区域',
      hint: '至少需要一个 LayoutMain 区域承载内容',
    });
  }
  if (regionIds.length && !regionIds.includes('LayoutMain')) {
    report({
      code: 'STRUCT005', severity: 'info', path: '$.value.desktop.layoutList',
      message: '缺少 LayoutMain 区域',
      hint: `当前区域: ${regionIds.join(', ')}；LayoutMain 是主内容区的约定名，弹窗页等无主内容区的页面可忽略`,
    });
  }

  // STRUCT006 layoutInfo.componentIds 引用不存在的区域
  // 语料实测 297 处：设计器会预置 BottomLeft/BottomRight 等标准插槽名但未必落地区域，
  // 引擎会跳过，因此判为告警而非错误
  const componentIds = (ir.page && ir.page.componentIds) || [];
  const regionSet = new Set(regionIds);
  for (const id of componentIds) {
    if (!regionSet.has(id)) {
      report({
        code: 'STRUCT006', severity: 'warning', path: '$.value.desktop.layoutInfo.componentIds',
        message: `layoutInfo.componentIds 引用的区域不存在: ${id}`,
        hint: '若该区域本应显示内容，说明区域被删但登记未清理；纯占位插槽可忽略',
        extra: { missingRegion: id },
      });
    }
  }

  // STRUCT007 有内容的区域未登记在 componentIds 中
  // 语料实测大量空占位区域未登记属正常，因此只在区域内确实挂载了组件时才提示
  ctx.walkContainers(({ node }) => {});
  for (const id of regionIds) {
    if (componentIds.includes(id)) continue;
    const mounted = ctx.countMountedComponents(id);
    if (mounted === 0) continue;
    report({
      code: 'STRUCT007', severity: 'info', path: '$.value.desktop.layoutList',
      message: `区域 ${id} 挂载了 ${mounted} 个组件，但未登记在 layoutInfo.componentIds 中`,
      hint: '未登记的区域不会被渲染，若这些组件本应显示则属漏登记',
      extra: { region: id, mounted },
    });
  }

  // STRUCT008 pageType 缺失
  // 语料实测 401 个布局中有 329 个没有 pageType，属于历史遗留，不阻断
  if (!ir.page || !ir.page.pageType) {
    report({
      code: 'STRUCT008', severity: 'info', path: '$.value.desktop.layoutInfo.pageType',
      message: 'layoutInfo.pageType 缺失，页面类型只能靠结构推断',
      hint: `已推断为 ${ir.kind}；建议补上以便平台侧筛选与路由`,
    });
  }

  // STRUCT009 行/列栅格约束
  ctx.walkContainers(({ node, kind, path }) => {
    const style = (node.property && node.property.style) || {};
    if (kind === 'col') {
      const raw = style.span;
      // 语料里 span 有时被存成字符串 "6"，先归一化再判范围
      const span = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
      if (!Number.isFinite(span) || span < 1 || span > MAX_SPAN) {
        report({
          code: 'STRUCT009', severity: 'error', path: `${path}.property.style.span`,
          message: `列栅格 span 非法: ${JSON.stringify(raw)}`,
          hint: `合法范围 1-${MAX_SPAN}`,
        });
      }
    }
  });
}

module.exports = {
  group: 'structural',
  rules: ['STRUCT001', 'STRUCT002', 'STRUCT003', 'STRUCT004', 'STRUCT005', 'STRUCT006', 'STRUCT007', 'STRUCT008', 'STRUCT009'],
  check,
};
