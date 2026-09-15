/**
 * 标识类规则：id 唯一性、完整性、还原度
 *
 * 低代码页面的 id 是全页引用图谱的锚点。id 一旦重复或缺失，
 * 引擎不会报错，只会静默丢掉一半内容——所以这类检查优先级最高。
 */

const HEX32 = /^[0-9a-f]{32}$/i;
/**
 * 设计器的约定命名：<父组件id>-cancelBtn / -okBtn / -title / -icon ...
 * 这类 id 是父组件按后缀约定去取用的，不走显式引用，
 * 因此既不算「非法 id」，也不算「孤儿组件」。语料中此类共 1182+1339 处。
 */
const CONVENTION_ID = /^[0-9a-f]{32}-[\w-]+$/i;

const { componentSubscribes, EVENT_TARGET_RE } = require('../subscribeScan');

function check(ctx, report) {
  const { ir } = ctx;
  const components = ir.components || {};

  // ID001 layoutList 内部 id 重复（含容器与组件）
  const seen = new Map(); // id -> 首次出现的 path
  ctx.walkContainers(({ node, path }) => {
    const id = node.property && node.property.id;
    if (!id) {
      // ID002 节点缺少 property.id
      report({
        code: 'ID002', severity: 'error', path,
        message: `节点 ${node.type || '(未知类型)'} 缺少 property.id`,
        hint: '没有 id 的节点无法被引用，也无法参与事件绑定',
      });
      return;
    }
    if (seen.has(id)) {
      report({
        code: 'ID001', severity: 'error', path: `${path}.property.id`,
        message: `id 重复: ${id}`,
        hint: `该 id 已在 ${seen.get(id)} 出现过，重复会让引擎只渲染其中一个`,
        extra: { id, firstSeenAt: seen.get(id) },
      });
    } else {
      seen.set(id, path);
    }
  });

  // 容器 id 与 components 映射的 key 不能冲突
  for (const id of seen.keys()) {
    if (components[id]) {
      report({
        code: 'ID003', severity: 'error', path: `$.value.desktop.components.${id}`,
        message: `components 的 key 与容器 id 冲突: ${id}`,
        hint: '容器只存在于 layoutList，此处不应再出现同名条目',
        extra: { id, containerAt: seen.get(id), componentType: components[id].type },
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // ID004 孤儿组件：定义在 components 中，但没有任何位置或引用指向它
  //
  // ── 「被引用」的判据（四条路径，全部来自 401 份语料实测）────────────────
  //   ① 容器挂载点   rows[*].cols[*].components[] 里的字符串 id      ← 主路径
  //   ② 引用规格表   ir.references（列 / 区域 / 工具栏 / 行操作按钮…）
  //   ③ 事件寻址     `<本组件id>.事件名` 出现在**别人**的 event 字段里
  //   ④ 约定命名     <父组件id>-okBtn 由父组件按后缀取用，不显式引用
  //
  // ── 实测：1104 个候选中，370 个是误报（修前）────────────────────────────
  //   365  被 TableHook.rowOperationItem[].id 引用 ← 行操作按钮不走容器挂载，
  //        该字段曾漏在规格表外，导致 364 个 ButtonHook 被误报为孤儿
  //     5  手写 id（如 operationLeft）被引，但规格表的 HEX32 过滤把它滤掉了
  //   其余 4 条在 draftComponents 草稿区被引用 —— 已知边界，不覆盖（见下）
  //
  // ── ★ 为什么「自我订阅」不算被引用 ───────────────────────────────────────
  // 语料里订阅条目的 event 恒为 `<组件id>.<事件名>`（3433/3433，100% 可解析），
  // 但指向孤儿的 416 次**全部是组件订阅自己**（他人订阅 0 例）。
  // 一个未挂载的按钮留下「有 click handler 却没有挂载点」，恰恰是它成为
  // 编辑残留的证据 —— 不能拿它当作「被使用」。
  // ③ 的判定因此必须排除自我寻址，否则 67 个真孤儿会被静默放过。
  //
  // ── 已知边界 ────────────────────────────────────────────────────────────
  //   draftComponents（草稿区）不在 lift 的扫描范围内 —— 实测它只影响 4 个组件。
  //   同理 phone / pad 移动端镜像树也不扫。
  // ────────────────────────────────────────────────────────────────────────
  const referenced = new Set();
  ctx.walkContainers(({ node }) => {
    for (const c of (node.components || [])) {
      if (typeof c === 'string') referenced.add(c);
    }
  });
  // ② 把区域形态的引用（CardHook.layoutId 等）算进「被使用」
  for (const ref of ir.references || []) {
    if (ref.target === 'component') referenced.add(ref.to);
  }

  /** ③ 事件寻址：收集所有被**别人**寻址到的组件 id；同时统计自我订阅条数 */
  const addressedByOthers = new Set();
  const selfSubs = new Map(); // 组件 id -> 自己订阅自己的条数
  const scanAddressing = (list, hostId) => {
    /** @returns {boolean} 该 event 是否指向宿主自己 */
    const visit = (ev) => {
      if (typeof ev !== 'string') return false;
      const m = EVENT_TARGET_RE.exec(ev);
      if (!m) return false;
      const target = m[1];
      if (target === hostId) return true;      // 自我寻址（订阅自己 / 发给自己）
      if (!components[target]) return false;   // 跨页广播，或本就非本页组件
      addressedByOthers.add(target);
      return false;
    };
    for (const sub of (list || [])) {
      if (!sub || typeof sub !== 'object') continue;
      // 「自我订阅」只认 sub.event —— pubs 是发布，不是订阅
      const self = visit(sub.event);
      for (const e of (sub.pubs || [])) if (e && typeof e === 'object') visit(e.event);
      for (const b of (sub.behaviors || [])) {
        if (!b || typeof b !== 'object') continue;
        for (const e of [...(b.successPubs || []), ...(b.errorPubs || [])]) {
          if (e && typeof e === 'object') visit(e.event);
        }
      }
      if (self && hostId) selfSubs.set(hostId, (selfSubs.get(hostId) || 0) + 1);
    }
  };
  scanAddressing(ir.subscribes, null);
  for (const { list, hostId } of componentSubscribes(components)) scanAddressing(list, hostId);
  for (const id of addressedByOthers) referenced.add(id);

  for (const [id, comp] of Object.entries(components)) {
    // 缺 type 优先判定：这类条目连类型都没有，讨论「是否被引用」没有意义
    if (!comp || !comp.type) {
      report({
        code: 'ID006', severity: 'error', path: `$.value.desktop.components.${id}`,
        message: `components 条目 ${id} 缺少 type`,
        hint: '无法识别的组件条目通常是保存过程被中断产生的残留',
      });
      continue;
    }
    if (referenced.has(id)) continue;
    if (CONVENTION_ID.test(id)) continue; // 约定命名，由父组件按后缀取用
    const selfN = selfSubs.get(id) || 0;
    report({
      code: 'ID004', severity: 'info', path: `$.value.desktop.components.${id}`,
      message: selfN
        ? `孤儿组件 ${comp.type}(${id}) 未被任何挂载点或引用使用，但自带 ${selfN} 条事件订阅`
        : `孤儿组件 ${comp.type}(${id}) 未被任何挂载点或引用使用`,
      hint: selfN
        ? '有事件处理逻辑却没有挂载点 —— 通常是「逻辑写完忘了把组件放进布局」，'
          + '而不是纯残留；确认页面确实不需要它再删'
        : '多为历史编辑残留；但若期望它显示，说明布局漏了挂载点',
      extra: { id, type: comp.type, selfSubscribes: selfN },
    });
  }

  // ID007 内联挂载但未登记到 components 映射
  // 语料实测：401 个真实布局中的 3951 个挂载组件全部同时登记在映射里。
  // 未登记的组件不参与按 id 查表（事件绑定、动态显隐都走查表），
  // 因此这条规则用于发现「生成器与设计器约定不一致」。
  for (const id of ir.inlineOnly || []) {
    const comp = components[id];
    report({
      code: 'ID007', severity: 'warning', path: `$.value.desktop.components.${id}`,
      message: `组件 ${comp ? comp.type + '(' + id + ')' : id} 只内联在 layoutList 中，未登记到 components 映射`,
      hint: '设计器保存的布局中两者始终同步；只内联会让引擎按 id 查表时找不到该组件',
      extra: { id, type: comp ? comp.type : null },
    });
  }

  // ID005 id 形态：设计器统一使用 32 位 hex（约定命名 <hex>-xxx 除外）
  const allIds = new Set([...seen.keys(), ...Object.keys(components)]);
  for (const id of allIds) {
    if (HEX32.test(id) || CONVENTION_ID.test(id)) continue;
    report({
      code: 'ID005', severity: 'info', path: `$.value.desktop.components.${id}`,
      message: `id 不符合设计器规范（32 位 hex）: ${id}`,
      hint: '手写 id 便于调试，但跨环境复制时容易撞号',
      extra: { id },
    });
  }
}

module.exports = {
  group: 'identity',
  rules: ['ID001', 'ID002', 'ID003', 'ID004', 'ID005', 'ID006', 'ID007'],
  check,
};
