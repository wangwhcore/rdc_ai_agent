/**
 * 引用类规则：跨节点引用完整性
 *
 * 这是整套 check 的核心。原因很具体：
 * 目标运行时引擎（front_web / neusoft_web）不归我们控制，
 * 引用一旦断链，引擎不会抛错，只会静默渲染空白或丢按钮。
 *
 * 引用清单来自 ir/referenceSpec.js，该表由 401 个真实布局反向挖掘得到，
 * 每条引用的严重级都按语料中的真实命中率标定：
 *   - 解析率 100% 的引用（如 CardHook.layoutId）判定为 error
 *   - 语料中本身就大量悬空的引用（如 CardHook.ltContainerId 283/430）判定为 warning
 * 这样规则不会因为「设计器习惯」而误报。
 */

const { HEX32, isPlaceholderRef } = require('../../ir/referenceSpec');

const EMPTY_TARGETS = new Set(['', 'undefined', 'null', 'none', 'undefined-gid']);

// ── 跨布局引用的命名空间（语料实证）───────────────────────────────────
// @@navigator.push 的 url 与 .openM 载荷的 id 都指向**目标布局的 frontId**，
// 不是 MdFrontLayout 的文件名 gid。
//   语料统计：push url -> frontId 563 / gid 0；openM id -> frontId 358 / gid 0
// 填错命名空间（或留占位符）时，运行时按 frontId 查不到布局，
// 会把空节点交给 RenderLayout，抛
//   TypeError: Cannot read properties of undefined (reading 'field')
//
// 本项目 builder/events.js 的 navigate() 产出形态：
//   pubsub.publish('@@navigator.push', { url:'<目标布局 frontId>', type:'add' });
// 因此目标是 payload 里的 url 键，而不是位置参数
const PUSH_PUBLISH_RE = /@@navigator\.push'[\s\S]{0,300}?\burl\s*:\s*(['"])([^'"]*)\1/;
// 兼容位置参数写法 navigator.push('xxx')
const PUSH_CALL_RE = /(?:@@)?navigator\.push\(\s*(['"]?)([^'",)]*)\1/;
const PUSH_PRESENT_RE = /@@navigator\.push|navigator\.push\(/;

// openModal() 产出形态：
//   pubsub.publish('<本页 frontId>.openM', { id: "<目标弹窗布局 frontId>", ... });
//
// 注意区分两种出现方式（语料实证，401 份布局）：
//   带载荷的发布 335 处  -> 这里才是「打开某个弹窗」，id 必须指向真实布局 frontId
//   纯事件名      441 处  -> 如 subscribes 里的 "<uuid>.openM"，只是事件名，没有 id 可言
// 如果不去区分，会对那 441 处事件名误报 312 条 error。
const OPEN_MODAL_PUBLISH_RE = /(['"])([^'"]+)\.openM\1\s*,\s*\{/g;
const OPEN_MODAL_ID_RE = /\bid\s*:\s*(['"])([^'"]*)\1/;

function collectStrings(value, path, out, depth = 0) {
  if (depth > 8) return;
  if (typeof value === 'string') {
    out.push({ value, path });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out, depth + 1));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collectStrings(v, `${path}.${k}`, out, depth + 1);
  }
}

function check(ctx, report) {
  const { ir, options } = ctx;
  const references = ir.references || [];

  const missingRequired = [];

  for (const ref of references) {
    if (ref.resolves) {
      // REF003 引用目标类型不符
      if (ref.expectType && ref.actualType && ref.actualType !== ref.expectType) {
        report({
          code: 'REF003', severity: 'error', path: ref.at,
          message: `${ref.fromType}.${ref.via} 应指向 ${ref.expectType}，实际指向 ${ref.actualType}(${ref.to})`,
          hint: `引用目标为 ${ref.to}，请改为 ${ref.expectType} 的 id`,
          extra: { from: ref.from, to: ref.to, expectType: ref.expectType, actualType: ref.actualType },
        });
      }
      continue;
    }

    const isRegion = ref.target === 'region';
    report({
      code: isRegion ? 'REF001' : 'REF002',
      severity: ref.severity || 'error',
      path: ref.at,
      message: isRegion
        ? `${ref.fromType}.${ref.via} 引用的区域不存在: ${ref.to}`
        : `${ref.fromType}.${ref.via} 引用的组件不存在: ${ref.to}`,
      hint: isRegion
        ? '该区域应在 layoutList 中定义，且 id 需登记到 layoutInfo.componentIds'
        : '该组件应在 components 中定义；若为历史残留引用可清空该属性',
      extra: { from: ref.from, fromType: ref.fromType, via: ref.via, to: ref.to },
    });
    if (ref.required && ref.severity === 'error') missingRequired.push(ref);
  }

  // REF004 事件表达式里的跳转目标为空或非法
  // 常量与表达式变量无法在这里判定，只拦「明确为空」与「形态可疑」两种情况
  for (const [id, comp] of Object.entries(ir.components || {})) {
    if (!comp || !comp.property) continue;
    const strings = [];
    collectStrings(comp.property, `$.value.desktop.components.${id}.property`, strings);
    for (const s of strings) {
      if (!PUSH_PRESENT_RE.test(s.value)) continue;

      const pub = s.value.match(PUSH_PUBLISH_RE);
      const call = pub ? null : s.value.match(PUSH_CALL_RE);
      if (!pub && !call) {
        report({
          code: 'REF004', severity: 'info', path: s.path,
          message: `${comp.type}(${id}) 的跳转表达式未包含 url 目标`,
          hint: "navigate() 约定为 pubsub.publish('@@navigator.push', { url:'<Layout GID>' })，请确认目标写在哪",
          extra: { componentId: id, expression: s.value.slice(0, 160) },
        });
        continue;
      }

      const target = ((pub ? pub[2] : call[2]) || '').trim();
      if (EMPTY_TARGETS.has(target)) {
        report({
          code: 'REF004', severity: 'warning', path: s.path,
          message: `${comp.type}(${id}) 的跳转目标为空`,
          hint: '跳转目标需要填入目标布局的 frontId，为空时点击无反应且不会报错',
          extra: { componentId: id, expression: s.value.slice(0, 160) },
        });
      } else if (isPlaceholderRef(target)) {
        report({
          code: 'REF004', severity: 'warning', path: s.path,
          message: `${comp.type}(${id}) 的跳转目标疑似未替换的占位符: ${target}`,
          hint: '请替换为目标布局的 frontId；未替换时运行时查不到布局，会在 vendor chunk 抛 TypeError',
          extra: { componentId: id, target, kind: 'placeholder' },
        });
      } else if (!HEX32.test(target) && !/^[A-Za-z_$]/.test(target)) {
        report({
          code: 'REF004', severity: 'info', path: s.path,
          message: `${comp.type}(${id}) 的跳转目标形态可疑: ${target}`,
          hint: '跨布局引用统一用目标布局的 frontId（32 位 hex）；注意 MdFrontLayout 的文件名是 gid，两者不通用',
          extra: { componentId: id, target },
        });
      }
    }
  }

  // REF006 弹窗事件 .openM 的目标布局引用
  // 与 REF004 同源：id 指的是目标「弹窗布局的 frontId」。
  // 生成器曾经用 uuid() 兜底（见 listPage 历史实现），产出的 id 必然悬空，
  // 运行时解析不到弹窗布局 -> RenderLayout 收到空节点 -> reading 'field' 崩溃。
  // 只检查「带载荷的发布」，跳过纯事件名（见上面 OPEN_MODAL_PUBLISH_RE 的注释）。
  for (const [id, comp] of Object.entries(ir.components || {})) {
    if (!comp || !comp.property) continue;
    const strings = [];
    collectStrings(comp.property, `$.value.desktop.components.${id}.property`, strings);
    for (const s of strings) {
      if (!s.value.includes('.openM')) continue;

      OPEN_MODAL_PUBLISH_RE.lastIndex = 0;
      let m;
      while ((m = OPEN_MODAL_PUBLISH_RE.exec(s.value))) {
        const owner = (m[2] || '').trim();
        // 载荷在 match 之后，向后开一个窗口找 id
        const payload = s.value.slice(m.index + m[0].length, m.index + m[0].length + 500);
        const idm = payload.match(OPEN_MODAL_ID_RE);
        const target = idm ? idm[2].trim() : '';

        if (!target || EMPTY_TARGETS.has(target) || !HEX32.test(target)) {
          report({
            code: 'REF006', severity: 'error', path: s.path,
            message: `${comp.type}(${id}) 的弹窗目标不是合法布局引用: ${JSON.stringify(target)}`,
            hint: '弹窗目标必须是目标弹窗布局的 frontId（32 位 hex）；填 gid / 占位符都会让运行时抛 TypeError',
            extra: { componentId: id, target, owner, index: m.index },
          });
        } else if (isPlaceholderRef(target)) {
          report({
            code: 'REF006', severity: 'warning', path: s.path,
            message: `${comp.type}(${id}) 的弹窗目标疑似未替换的占位符: ${target}`,
            hint: '请替换为删除确认弹窗布局的 frontId，否则点删除时运行时会崩',
            extra: { componentId: id, target, owner, kind: 'placeholder' },
          });
        }

        // 事件命名空间应为「本页 frontId」——语料 323/335 如此
        const ownIds = new Set([ir.identity && ir.identity.frontId, ir.identity && ir.identity.gid].filter(Boolean));
        if (owner && ownIds.size && !ownIds.has(owner)) {
          report({
            code: 'REF006', severity: 'info', path: s.path,
            message: `${comp.type}(${id}) 的 openM 命名空间不是本页 frontId: ${owner}`,
            hint: '语料中 96% 的 openM 用本页 frontId 作命名空间，跨页发布弹窗事件时请确认订阅方能收到',
            extra: { componentId: id, owner, frontId: ir.identity && ir.identity.frontId },
          });
        }
      }
    }
  }

  // REF005 页面级事件订阅的 owner 不存在
  // 注意：事件前缀不一定是组件 id——生成器把页面级事件挂在 frontId 上，
  // 因此 page frontId / gid / 区域 id 都算合法 owner，否则会大面积误报。
  const validOwners = new Set([
    ...Object.keys(ir.components || {}),
    ...ctx.regionOrder,
  ]);
  if (ir.identity) {
    if (ir.identity.frontId) validOwners.add(ir.identity.frontId);
    if (ir.identity.gid) validOwners.add(ir.identity.gid);
  }
  (ir.subscribes || []).forEach((sub, i) => {
    const event = sub && sub.event;
    if (typeof event !== 'string') return;
    const m = event.match(/^([0-9a-zA-Z_-]{8,})\./);
    if (!m) return;
    if (!validOwners.has(m[1])) {
      report({
        code: 'REF005', severity: 'warning',
        path: `$.value.desktop.subscribes[${i}].event`,
        message: `事件订阅的前缀无法解析到任何组件或页面标识: ${m[1]}（${event}）`,
        hint: '组件或页面被删除后订阅未同步清理，事件永远不会触发',
        extra: { event, owner: m[1] },
      });
    }
  });

  // REF007 卡片容器引用指向了页面级区域
  //
  // 为什么 REF001 拦不住这个缺陷：
  //   REF001 只判「能不能解析到区域」。TitleTools 这类具名区域本身确实存在于
  //   layoutList，所以引用**解析得通**，单文件 check 全绿，生成期完全不可见。
  //   但解析得到 ≠ 指对了地方：
  //     TitleTools / TitleSiderExtra / TitleSider 同时登记在 layoutInfo.componentIds，
  //     它们是**页面标题栏的插槽**，自身还装着保存/提交/返回按钮。
  //     卡片一旦把同一个区域认领为自己的 tool/extra/lt 容器，运行时就会渲染两遍
  //     （页面插槽一次 + 卡片自己的标题栏一次），页面上出现两组一模一样的按钮。
  //
  // 语料判据（add/view 72 页 347 张卡；全语料 459 张卡）：
  //   卡片容器引用共 1320 条（按页去重），出现在 componentIds 内的 **0 条**。
  //   且 toolContainerId 100% 是 32 位 hex 的私有容器（指向空 Row+Col）。
  // 因此这条判成 error：语料里从没有过，撞上必然是「指错了渲染路径」。
  const CARD_CONTAINER_SLOTS = new Set(['toolContainerId', 'extraContainerId', 'ltContainerId']);
  const pageLevelRegions = new Set((ir.page && ir.page.componentIds) || []);
  for (const ref of references) {
    if (ref.fromType !== 'CardHook') continue;
    if (!CARD_CONTAINER_SLOTS.has(ref.via)) continue;
    if (!ref.resolves) continue;                 // 悬空由 REF001 负责报
    if (!pageLevelRegions.has(ref.to)) continue; // 私有容器不登记，正常不触发
    report({
      code: 'REF007', severity: 'error', path: ref.at,
      message: `${ref.fromType}.${ref.via} 指向了页面级区域 ${ref.to}，该区域会被渲染两次`,
      hint: '卡片容器必须是卡片私有的独立容器（语料 0/1320 指向页面级区域）：'
        + '在 layoutList 里另建一个空 Row+Col 区域承接，且不要登记进 layoutInfo.componentIds，'
        + '否则页面插槽与卡片标题栏会各渲染一遍，表现为按钮成对重复',
      extra: { from: ref.from, via: ref.via, to: ref.to, renderTwice: true },
    });
  }

  if (options && options.summaryOnly) return { missingRequired };
  return { missingRequired };
}

module.exports = {
  group: 'references',
  rules: ['REF001', 'REF002', 'REF003', 'REF004', 'REF005', 'REF006', 'REF007'],
  check,
};
