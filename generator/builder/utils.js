/**
 * 递归收集字段组件及其子组件（如 EditTableHook / GridFieldTable 的 columns）
 * 生成 components Map
 *
 * 约定：注册进 components 的条目一律是 `{ type, property: { id } }` 形态。
 * 列的内联描述（如 GridFieldTable.property.columns[]）不是注册条目，只通过 colId 引用，
 * 不能混进 components，否则会出现「缺少 type」的脏条目。
 */
function collectComponents(fields = [], acc = {}) {
  for (const field of fields) {
    if (!field || !field.toJSON) continue;

    const json = field.toJSON();
    if (json.property && json.property.id) {
      acc[json.property.id] = json;
    }

    // EditTableHook / GridFieldTable / TableHook 的 columns
    if (Array.isArray(field.columns)) {
      for (const col of field.columns) {
        if (!col || !col.toJSON) continue;

        // 列的注册条目
        const colJson = col.toJSON();
        if (colJson.type && colJson.property && colJson.property.id) {
          acc[colJson.property.id] = colJson;
        }

        // cellType 内嵌组件
        const cellType = col.cellType;
        if (cellType && cellType.toJSON) {
          const cellJson = cellType.toJSON();
          if (cellJson.property && cellJson.property.id) {
            acc[cellJson.property.id] = cellJson;
          }
        }
      }
    }
  }
  return acc;
}

module.exports = { collectComponents };
