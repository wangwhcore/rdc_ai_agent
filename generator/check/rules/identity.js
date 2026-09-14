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

  // ID004 孤儿组件：定义在 components 中，但没有任何位置或引用指向它
  const referenced = new Set();
  ctx.walkContainers(({ node }) => {
    for (const c of (node.components || [])) {
      if (typeof c === 'string') referenced.add(c);
    }
  });
  // 同时把区域形态的引用（CardHook.layoutId 等）算进「被使用」
  for (const ref of ir.references || []) {
    if (ref.target === 'component') referenced.add(ref.to);
  }
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
    report({
      code: 'ID004', severity: 'info', path: `$.value.desktop.components.${id}`,
      message: `孤儿组件 ${comp.type}(${id}) 未被任何位置或引用使用`,
      hint: '多为历史编辑残留；但若期望它显示，说明布局漏了挂载点',
      extra: { id, type: comp.type },
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
