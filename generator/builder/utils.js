/**
 * 递归收集字段组件及其子组件（如 EditTableHook 的 columns）
 * 生成 components Map
 */
function collectComponents(fields = [], acc = {}) {
  for (const field of fields) {
    if (!field || !field.toJSON) continue;

    const json = field.toJSON();
    if (json.property && json.property.id) {
      acc[json.property.id] = json;
    }

    // EditTableHook 的 columns
    if (field.columns && Array.isArray(field.columns)) {
      for (const col of field.columns) {
        if (col && col.toJSON) {
          const colJson = col.toJSON();
          if (colJson.property && colJson.property.id) {
            acc[colJson.property.id] = colJson;
          }
          // cellType 内嵌组件
          if (col.cellType && col.cellType.toJSON) {
            const cellJson = col.cellType.toJSON();
            if (cellJson.property && cellJson.property.id) {
              acc[cellJson.property.id] = cellJson;
            }
          }
        }
      }
    }
  }
  return acc;
}

module.exports = { collectComponents };
