/**
 * 语义类规则：页面级业务契约
 *
 * 这一组关心的是「这个页面是不是干它该干的事」，
 * 而不是「结构是否合法」。语料里 82% 的布局没有 pageType，
 * 所以这里以 ir.kind（结构推断）为准，而不是盲信声明值。
 */

function check(ctx, report) {
  const { ir } = ctx;
  const components = ir.components || {};
  const comps = Object.entries(components);

  const hasTable = comps.some(([, c]) => c && c.type === 'TableHook');
  const pageType = ir.page && ir.page.pageType;

  // SEM001 列表页必须包含表格
  if (ir.kind === 'list' && !hasTable) {
    report({
      code: 'SEM001', severity: 'error', path: '$.value.desktop.components',
      message: '列表页不包含任何 TableHook',
      hint: '列表页的语义就是展示表格，缺少表格说明结构被破坏',
    });
  }

  // SEM002 新增/编辑页必须声明 formUse
  if ((ir.kind === 'add' || ir.kind === 'edit') && !(ir.page && ir.page.formUse)) {
    report({
      code: 'SEM002', severity: 'error', path: '$.value.desktop.layoutInfo.formUse',
      message: '新增/编辑页的 layoutInfo.formUse 不为 true',
      hint: 'formUse 决定引擎是否启用表单数据收集与校验，为 false 时保存拿不到数据',
    });
  }

  // SEM003 查看页字段应全部只读
  // 只在 pageType 显式声明为 view 时检查：推断出的 view 有可能是表单页没放保存按钮，
  // 语料中 329/401 没有 pageType，靠推断去判只读会产生大量误报
  if (pageType === 'view') {
    for (const [id, comp] of comps) {
      if (!comp || !comp.type || !/Hook$/.test(comp.type)) continue;
      const p = comp.property || {};
      const readonly = p.displayMode === true || p.enabled === false;
      if (p.filed && !readonly) {
        report({
          code: 'SEM003', severity: 'warning', path: `$.value.desktop.components.${id}.property`,
          message: `查看页字段 ${comp.type}(${id}) 不是只读状态`,
          hint: '查看页应把 displayMode 设为 true，否则用户可编辑但无法保存',
          extra: { componentId: id, type: comp.type },
        });
      }
    }
  }

  // SEM004 卡片没有内容区
  for (const [id, comp] of comps) {
    if (!comp || comp.type !== 'CardHook') continue;
    const p = comp.property || {};
    if (!p.layoutId) {
      report({
        code: 'SEM004', severity: 'warning', path: `$.value.desktop.components.${id}.property.layoutId`,
        message: `CardHook(${id}) 没有绑定内容区 layoutId`,
        hint: '卡片会渲染出一个空壳；表单页尤其常见，会导致所有字段不显示',
        extra: { componentId: id },
      });
    }
  }

  // SEM005 声明的 pageType 与结构推断结果不一致
  if (pageType && ir.kind && pageType !== ir.kind) {
    const structural = ir.kind;
    report({
      code: 'SEM005', severity: 'warning', path: '$.value.desktop.layoutInfo.pageType',
      message: `pageType 声明为 ${pageType}，但结构特征更像 ${structural}`,
      hint: '平台侧可能按 pageType 做筛选与路由，不一致会导致入口错配',
      extra: { declared: pageType, inferred: structural },
    });
  }

  // SEM006 弹窗缺少确认/取消事件
  if (ir.kind === 'modal') {
    const events = [];
    for (const comp of Object.values(components)) {
      for (const s of (comp && comp.property && comp.property.subscribes) || []) {
        if (s && typeof s.event === 'string') events.push(s.event);
      }
    }
    for (const sub of ir.subscribes || []) {
      if (sub && typeof sub.event === 'string') events.push(sub.event);
    }
    const hasOk = events.some(e => /\.(ok|confirm|submit)$/i.test(e));
    const hasCancel = events.some(e => /\.(cancel|close|closeM)$/i.test(e));
    if (!hasOk || !hasCancel) {
      report({
        code: 'SEM006', severity: 'warning', path: '$.value.desktop',
        message: `弹窗页缺少${!hasOk ? '确认' : ''}${!hasOk && !hasCancel ? '与' : ''}${!hasCancel ? '取消' : ''}事件`,
        hint: '弹窗需要 clostM / ok 之类的订阅，否则打开后无法关闭',
      });
    }
  }

  // SEM007 表格缺少 rowKey
  for (const [id, comp] of comps) {
    if (!comp || comp.type !== 'TableHook') continue;
    const p = comp.property || {};
    if (!p.rowKey) {
      report({
        code: 'SEM007', severity: 'warning', path: `$.value.desktop.components.${id}.property.rowKey`,
        message: `TableHook(${id}) 没有配置 rowKey`,
        hint: '缺少行主键会导致选中态与行内操作定位错乱',
        extra: { componentId: id },
      });
    }
  }

  // SEM008 页面没有任何可交互组件
  const interactiveTypes = new Set([
    'TableHook', 'ButtonHook', 'TextHook', 'TextAreaHook', 'InputNumberHook', 'SelectHook',
    'DatePickerHook', 'RangePickerComponent', 'RadioHook', 'CheckboxHook', 'SwitchHook',
    'UploadHook', 'FindbackHook', 'EditTableHook', 'GridFieldTable', 'NeuCascader',
    'TreeHook', 'NeuTransfer', 'TimePickerHook', 'TabsHook',
  ]);
  const interactiveCount = comps.filter(([, c]) => c && interactiveTypes.has(c.type)).length;
  if (interactiveCount === 0 && comps.length > 0) {
    report({
      code: 'SEM008', severity: 'info', path: '$.value.desktop.components',
      message: '页面没有任何可交互组件，疑似纯静态占位页',
      hint: '确认是刻意为之（如说明页），否则可能是组件被误删',
      extra: { componentCount: comps.length },
    });
  }
}

module.exports = {
  group: 'semantics',
  rules: ['SEM001', 'SEM002', 'SEM003', 'SEM004', 'SEM005', 'SEM006', 'SEM007', 'SEM008'],
  check,
};
