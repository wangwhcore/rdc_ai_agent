/**
 * 对生成的 Layout JSON 做基础校验
 * 返回 { ok: boolean, errors: string[] }
 */
function validate(layoutJson) {
  const errors = [];

  // 1. 外层 JSON 结构
  if (!layoutJson || typeof layoutJson !== 'object') {
    errors.push('layoutJson 必须是一个对象');
    return { ok: false, errors };
  }

  const requiredOuterFields = ['gid', 'frontId', 'functionGid', 'name', 'value'];
  for (const f of requiredOuterFields) {
    if (!(f in layoutJson)) {
      errors.push(`缺少外层字段: ${f}`);
    }
  }

  if (typeof layoutJson.value !== 'string') {
    errors.push('value 必须是 JSON 字符串');
    return { ok: false, errors };
  }

  // 2. value 可反序列化
  let value;
  try {
    value = JSON.parse(layoutJson.value);
  } catch (e) {
    errors.push(`value 反序列化失败: ${e.message}`);
    return { ok: false, errors };
  }

  // 3. desktop 结构
  const desktop = value.desktop;
  if (!desktop) {
    errors.push('value.desktop 不存在');
    return { ok: false, errors };
  }

  const requiredDesktopFields = ['layoutInfo', 'layoutList', 'components', 'subscribes'];
  for (const f of requiredDesktopFields) {
    if (!(f in desktop)) {
      errors.push(`desktop 缺少字段: ${f}`);
    }
  }

  // 4. 收集所有「实体组件 id」并检查唯一性
  // 实体 id 指：layoutList 中组件的 property.id 或 components Map 的 key
  // property 内部的引用 id（如 rowOperationItem[].id / columns[].colId / toolButtons[]）不算新实体
  const ids = new Set();

  function walkLayout(node, cb) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(cb);
      return;
    }
    cb(node);
    if (node.cols) walkLayout(node.cols, cb);
    if (node.components) walkLayout(node.components, cb);
    if (node.rows) walkLayout(node.rows, cb);
  }

  walkLayout(desktop.layoutList, node => {
    if (node && node.property && node.property.id) {
      if (ids.has(node.property.id)) {
        errors.push(`layoutList 中组件 id 重复: ${node.property.id}`);
      }
      ids.add(node.property.id);
    }
  });

  for (const key of Object.keys(desktop.components || {})) {
    if (ids.has(key)) {
      errors.push(`components key 与 layoutList 组件 id 重复: ${key}`);
    }
    ids.add(key);
  }

  // 5. 引用完整性
  const layoutList = desktop.layoutList || {};
  const components = desktop.components || {};

  walkLayout(layoutList, node => {
    if (node.type === 'CardHook') {
      const p = node.property || {};
      if (p.layoutId && !layoutList[p.layoutId]) {
        errors.push(`CardHook(${p.id}) 引用的 layoutId 不存在: ${p.layoutId}`);
      }
      if (p.toolContainerId && !layoutList[p.toolContainerId]) {
        errors.push(`CardHook(${p.id}) 引用的 toolContainerId 不存在: ${p.toolContainerId}`);
      }
      if (p.extraContainerId && !layoutList[p.extraContainerId]) {
        errors.push(`CardHook(${p.id}) 引用的 extraContainerId 不存在: ${p.extraContainerId}`);
      }
      if (p.ltContainerId && !layoutList[p.ltContainerId]) {
        errors.push(`CardHook(${p.id}) 引用的 ltContainerId 不存在: ${p.ltContainerId}`);
      }
      if (p.toolButtons) {
        for (const btnId of p.toolButtons) {
          if (!components[btnId]) {
            errors.push(`CardHook(${p.id}) 引用的 toolButton 不存在: ${btnId}`);
          }
        }
      }
    }
  });

  // 5.2 TableHook 引用的 columns colId 必须在 components 中
  Object.values(components).forEach(comp => {
    if (comp.type === 'TableHook') {
      const p = comp.property || {};
      if (p.columns) {
        for (const c of p.columns) {
          if (c.colId && c.colId !== 'operationLeft' && c.colId !== 'operationRight') {
            if (!components[c.colId]) {
              errors.push(`TableHook(${p.id}) 引用的列 colId 不存在: ${c.colId}`);
            }
          }
        }
      }
      if (p.rowOperationItem) {
        for (const op of p.rowOperationItem) {
          if (op.id && !components[op.id]) {
            errors.push(`TableHook(${p.id}) 引用的行操作按钮不存在: ${op.id}`);
          }
        }
      }
    }
  });

  // 5.3 AdvanceQueryHook 引用的 associateId 必须在 layoutList 的 TableHook 中
  Object.values(components).forEach(comp => {
    if (comp.type === 'AdvanceQueryHook') {
      const p = comp.property || {};
      if (p.associateId) {
        const target = components[p.associateId];
        if (!target || target.type !== 'TableHook') {
          errors.push(`AdvanceQueryHook(${p.id}) 引用的 associateId 不是 TableHook: ${p.associateId}`);
        }
      }
    }
  });

  // 6. 业务规则
  const hasTable = Object.values(components).some(c => c.type === 'TableHook');
  const pageType = desktop.layoutInfo && desktop.layoutInfo.pageType;

  if (pageType === 'list' && !hasTable) {
    errors.push('列表页必须包含至少一个 TableHook');
  }

  if (pageType === 'add' && desktop.layoutInfo && !desktop.layoutInfo.formUse) {
    errors.push('新增/编辑页 layoutInfo.formUse 必须为 true');
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

module.exports = { validate };
