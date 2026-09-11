# 列表页字段定义表

## 使用方法

将以下 JSON 作为**输入配置**，填充字段列表后用于生成列表页的表格列和操作按钮。

```json
{
  "pageName": "供应商信息",
  "serverName": "vendor",
  "listUrl": "/vendor/list",
  "cardTitle": "供应商信息管理",
  "tableTitle": "供应商信息列表",
  "functionGid": "xxxxxxxx",
  "addButtonId": "{{uuid}}",
  "columns": [
    { "field": "vendorName", "headerName": "$${label.vendorName}", "width": 150, "sort": "none", "fuzzyQuery": true },
    { "field": "vendorCode", "headerName": "$${label.vendorCode}", "width": 120, "sort": "none", "fuzzyQuery": true },
    { "field": "status", "headerName": "$${label.status}", "width": 100, "sort": "none", "fuzzyQuery": false }
  ],
  "operations": ["edit", "delete"]
}
```

---

## 操作按钮类型

| 操作 | `rowOperationItem` 配置 | 按钮事件 |
|------|------------------------|---------|
| 编辑 | `{id, title:"$${button.edit}"}` | `@@navigator.push(url, type:'modify', data:rowData)` |
| 删除 | `{id, title:"$${button.delete}"}` | `openM(id, title, width, msg, type:'delete', data:rowData)` |
| 复制 | `{id, title:"$${button.copy}"}` | `@@navigator.push(url, type:'copy', data:rowData)` |
| 查看 | `{id, title:"$${button.view}"}` | `@@navigator.push(url, type:'view', data:rowData)` |
| 审核 | `{id, title:"$${button.approve}"}` | 自定义 |
| 导出 | `{id, title:"$${button.export}"}` | `@@exportExcel` |

---

## 表格列字段类型

| fieldType | 渲染方式 | 说明 |
|-----------|---------|------|
| `text`（默认） | 普通文本 | `columnsType: {}` |
| `date` | 日期格式 | `columnsType: {"type":"date"}` |
| `link` | 可点击跳转 | `columnsType: {"type":"link", "eventPayloadExpression":"pubsub.publish('@@navigator.push',{...})"}` |
| `tag` | 状态标签 | `columnsType: {"type":"tag", "tagType":"xxx"}` |
| `currency` | 货币金额 | `columnsType: {"type":"currency"}` |
| `file` | 文件下载 | `columnsType: {"type":"file"}` |

---

## 操作按钮 UUID 分配示例

以 `供应商模板配置-列表` 为参考：

| 按钮 | UUID | 用途 |
|------|------|------|
| 新建按钮 | `2a2fc549416d4bc88e6ca669bf7f05b1` | 工具栏（CardHook.toolButtons 引用） |
| 编辑按钮 | `e80568800e844a2fbe9dd664f5554cae` | 表格行内操作（rowOperationItem + 列头 ColumnHook） |
| 删除按钮 | `7d1a3bbd5ae3439aac79711a232f3772` | 表格行内操作 |
| 复制按钮 | `b498fc98c780493594edca433b3dd7cd` | 表格行内操作 |

---

## 操作按钮 `components` 段模板

### 新建按钮（CardHook.toolButtons 引用）
```json
"{{addButtonId}}": {
  "property": {
    "size": "default",
    "enabled": true,
    "shape": "default",
    "componentTypeName": "",
    "$mode": ["create", "modify", "query"],
    "subscribes": [{
      "pubs": [{
        "event": "",
        "eventPayloadExpression": "pubsub.publish('@@navigator.push',{\n    url:'{{addEditPageId}}',\n    type:'add'\n});"
      }],
      "event": "{{addButtonId}}.click"
    }],
    "theme": "",
    "border": "all",
    "block": false,
    "hiddenTitle": false,
    "ghost": false,
    "style": "{}",
    "visible": true,
    "isConfirm": false,
    "action": "{{serverName}}_{{module}}_{{entity}}_save",
    "tagStyle": "{display:'inline-block',marginLeft:'4px'}",
    "actionConfig": {"enabled": false},
    "title": "$${button.new}",
    "icon": "",
    "type": "primary",
    "id": "{{addButtonId}}",
    "loading": false,
    "description": "新建",
    "propType": "ButtonHook"
  },
  "type": "ButtonHook"
}
```

### 编辑按钮（行内操作）
```json
"{{editButtonId}}": {
  "property": {
    "size": "default",
    "enabled": true,
    "shape": "default",
    "componentTypeName": "",
    "$mode": ["create", "modify", "query"],
    "subscribes": [{
      "pubs": [{
        "outside": true,
        "event": "",
        "eventPayloadExpression": "pubsub.publish('@@navigator.push', {\n    url: '{{addEditPageId}}',\n    type: 'modify',\n    data: eventPayload.rowData\n});"
      }],
      "event": "{{editButtonId}}.click"
    }],
    "theme": "",
    "border": "none",
    "block": false,
    "hiddenTitle": false,
    "ghost": true,
    "style": "{}",
    "visible": true,
    "isConfirm": false,
    "action": "",
    "tagStyle": "{display:'inline-block',marginLeft:'4px'}",
    "actionConfig": {"enabled": false},
    "title": "$${button.edit}",
    "icon": "",
    "type": "primary",
    "id": "{{editButtonId}}",
    "loading": false,
    "description": "编辑",
    "propType": "ButtonHook"
  },
  "type": "ButtonHook"
}
```

### 删除按钮（行内操作）
```json
"{{deleteButtonId}}": {
  "property": {
    "size": "default",
    "enabled": true,
    "shape": "default",
    "componentTypeName": "",
    "$mode": ["create", "modify", "query"],
    "subscribes": [{
      "pubs": [{
        "pageId": "",
        "event": "",
        "eventPayloadExpression": "\npubsub.publish('{{listFrontId}}.openM',\n    {\n        id: \"{{confirmModalId}}\",\n        title: \"$${button.delete}\",\n        width: \"small\",\n        msg: \"$${message.delete.reminder}\",\n        type: \"delete\",\n        data: eventPayload.rowData\n    }\n);"
      }],
      "behaviors": [],
      "event": "{{deleteButtonId}}.click",
      "index": 0
    }],
    "theme": "",
    "border": "none",
    "block": false,
    "hiddenTitle": false,
    "ghost": true,
    "style": "{}",
    "visible": true,
    "isConfirm": false,
    "action": "{{serverName}}_{{module}}_{{entity}}_delete",
    "tagStyle": "{display:'inline-block',marginLeft:'4px'}",
    "actionConfig": {"enabled": false},
    "title": "$${button.delete}",
    "icon": "",
    "type": "primary",
    "id": "{{deleteButtonId}}",
    "loading": false,
    "description": "删除",
    "propType": "ButtonHook"
  },
  "type": "ButtonHook"
}
```

### 复制按钮（行内操作）
```json
"{{copyButtonId}}": {
  "property": {
    "size": "default",
    "enabled": true,
    "shape": "default",
    "componentTypeName": "",
    "$mode": ["create", "modify", "query"],
    "subscribes": [{
      "pubs": [{
        "outside": true,
        "event": "",
        "eventPayloadExpression": "pubsub.publish('@@navigator.push',{\n    url:'{{addEditPageId}}',\n    type:'copy',\n    data: eventPayload.rowData\n});"
      }],
      "event": "{{copyButtonId}}.click"
    }],
    "theme": "",
    "border": "none",
    "block": false,
    "hiddenTitle": false,
    "ghost": true,
    "style": "{}",
    "visible": true,
    "isConfirm": false,
    "action": "{{serverName}}_{{module}}_{{entity}}_save",
    "tagStyle": "{display:'inline-block',marginLeft:'4px'}",
    "actionConfig": {"enabled": false},
    "title": "$${button.copy}",
    "icon": "",
    "type": "primary",
    "id": "{{copyButtonId}}",
    "loading": false,
    "description": "复制",
    "propType": "ButtonHook"
  },
  "type": "ButtonHook"
}
```

---

## TableHook columns 列定义模板

### 序号列（固定）
```json
{
  "width": 94,
  "checkboxSelection": true,
  "headerClass": "serialNum",
  "rowDrag": false,
  "minWidth": 100,
  "cellClass": "multiple",
  "headerName": "序号",
  "filter": false,
  "pinned": "left",
  "sortable": false,
  "suppressMovable": true,
  "field": "serialNum",
  "colId": "operationLeft",
  "headerCheckboxSelection": true
}
```

### 数据列模板（按字段循环生成）
```json
{
  "level": "",
  "width": {{width}},
  "resizable": true,
  "cellEditor": "cellComponents",
  "minWidth": 100,
  "headerName": "$${label.{{fieldName}}}",
  "filter": false,
  "field": "{{fieldName}}",
  "colId": "{{colHookId}}",
  "description": "{{label}}",
  "sort": "{{sort}}"
}
```

### 操作列（固定，尾部）
```json
{
  "cellRenderer": "renderOperation",
  "width": {{operationWidth}},
  "minWidth": 100,
  "headerName": "操作",
  "filter": false,
  "pinned": "right",
  "sortable": false,
  "suppressMovable": true,
  "field": "operation",
  "colId": "operationRight"
}
```

---

## ColumnHook 列配置模板（用于列头字段配置）

```json
"{{colHookId}}": {
  "property": {
    "tipsField": "",
    "componentTypeName": "",
    "hide": true,
    "align": "left",
    "width": {{width}},
    "summary": false,
    "columnsSorter": false,
    "schedulingBtns": "",
    "advFilter": false,
    "openValueEqualMerge": false,
    "iconShowSet": "",
    "thousandsFormat": "",
    "serverName": "appServer",
    "colMapping": [],
    "extendedColumn": false,
    "titleTips": "",
    "findBackProps": {},
    "tipsIconSet": "",
    "supportAccumulation": false,
    "cardColumnTag": "",
    "fieldType": "{{fieldType}}",
    "fixed": false,
    "columnsType": {{columnsType}},
    "headerHidden": true,
    "authorityField": "",
    "merge": false,
    "headerName": "$${label.{{fieldName}}}",
    "mergeCheckcolAndOperationBasedOnCurrentCol": false,
    "field": "{{fieldName}}",
    "id": "{{colHookId}}",
    "groupField": "",
    "description": "{{label}}",
    "fuzzyQuery": {{fuzzyQuery}},
    "tipsRemote": false,
    "colgroup": false
  },
  "type": "ColumnHook"
}
```

### columnsType 按字段类型映射

| 字段类型 | columnsType JSON |
|---------|-----------------|
| text | `{}` |
| date | `{"type":"date"}` |
| link（跳详情） | `{"type":"link","eventPayloadExpression":"pubsub.publish('@@navigator.push',{url:'{{detailPageId}}',query:'?{{pk}}='+eventPayload.{{pk}},data:eventPayload});"}` |
| currency | `{"type":"currency","precision":2}` |
| tag | `{"type":"tag","tagType":"{{tagType}}"}` |

---

## AdvanceQueryHook 查询区模板

```json
"{{queryId}}": {
  "property": {
    "size": "",
    "enabled": true,
    "filterField": "[]",
    "componentTypeName": "",
    "isSimpleQueryValidate": false,
    "mode": "default",
    "isFormValidate": false,
    "advancedQuery": [
      {
        "label": "$${label.{{fieldName}}}",
        "field": "{{fieldName}}",
        "fieldType": "{{fieldType}}",
        "colSpan": 8,
        "queryType": "{{queryType}}",
        "placeholder": "$${label.{{fieldName}}}",
        "componentType": "TextHook"
      }
    ],
    "dataSetting": "",
    "subscribes": [],
    "searchVisible": true,
    "brifShow": false,
    "queryVisible": false,
    "isSearchControl": false,
    "isMerage": true,
    "searchField": "",
    "visible": true,
    "placeholder": "$${label.{{firstField}}}",
    "tagStyle": "{display:'inline-block',float:'left'}",
    "title": "高级查询",
    "isIndependentQuery": false,
    "brifWidth": 400,
    "associateId": "{{tableId}}",
    "filterVisible": false,
    "id": "{{queryId}}",
    "description": "查询区",
    "isMapRequest": false
  },
  "type": "AdvanceQueryHook"
}
```

### queryType 类型
- `eq`：精确查询
- `like`：模糊查询
- `between`：范围查询（日期/数字）
- `in`：多选

---

## 删除确认弹窗模板（独立 Layout JSON）

弹窗不是一个独立页面，而是通过 `{{listFrontId}}.openM` 触发渲染。

确认弹窗组件通常放在 `components` 里（layoutInfo 的 `layoutInfo.componentIds` 可能不引用它，但它被 openM 动态加载）。

```json
{
  "appGid": "{{appGid}}",
  "branch": "master",
  "createBy": "{{operator}}",
  "createTime": "{{now}}",
  "entityUpdate": false,
  "frontId": "{{confirmModalId}}",
  "functionGid": "{{functionGid}}",
  "gid": "{{confirmModalId}}",
  "isSystem": 1,
  "lastModifiedBy": "{{operator}}",
  "lastModifyTime": "{{now}}",
  "layoutRef": 0,
  "logicDelete": 0,
  "name": "{{pageName}}-删除确认",
  "productGid": "{{appGid}}",
  "projectGid": "{{projectGid}}",
  "projectType": "1",
  "state": -1,
  "value": "{\"desktop\":{\"updateTime\":\"{{now}}\",\"flows\":[],\"defaultDataSource\":[],\"graphic\":{\"containers\":{},\"components\":{}},\"layoutList\":{\"LayoutMain\":{\"rows\":[{\"cols\":[{\"components\":[{\"property\":{\"layoutId\":\"modalBodyContainer\",\"enabledComponentFlag\":false,\"subscribes\":[],\"showType\":\"default\",\"toolButtons\":[],\"toolContainerId\":\"\",\"extraContainerId\":\"\",\"relatedTableId\":\"\",\"bodyStyle\":\"{}\",\"style\":\"{}\",\"headStyle\":\"{}\",\"visible\":true,\"tipsBoxWidth\":\"\",\"hoverable\":false,\"tagStyle\":\"{}\",\"showContent\":true,\"id\":\"confirmCard\",\"description\":\"确认卡片\"},\"type\":\"CardHook\"}],\"type\":\"ColContainer\",\"property\":{\"id\":\"confirmRow\",\"style\":{\"pull\":0,\"span\":24,\"xxl\":24,\"order\":0,\"offset\":0,\"xl\":24,\"md\":24,\"sm\":24,\"push\":0,\"lg\":24,\"xs\":24}}}],\"type\":\"RowContainer\",\"property\":{\"id\":\"confirmRowContainer\",\"style\":{\"gutter\":32,\"justify\":\"start\",\"align\":\"top\",\"type\":\"flex\"}}}},\"modalBodyContainer\":{\"rows\":[{\"cols\":[{\"components\":[{\"property\":{\"size\":\"default\",\"enabled\":true,\"componentTypeName\":\"\",\"subscribes\":[{\"pubs\":[{\"event\":\"\",\"eventPayloadExpression\":\"pubsub.publish('{{confirmModalId}}.closeM');\"}],\"event\":\"confirmCancelBtn.click\"}],\"hiddenTitle\":true,\"style\":\"{}\",\"visible\":true,\"title\":\"$${button.cancel}\",\"type\":\"default\",\"id\":\"confirmCancelBtn\",\"loading\":false,\"description\":\"取消按钮\",\"propType\":\"ButtonHook\"},\"type\":\"ButtonHook\"},{\"property\":{\"size\":\"default\",\"enabled\":true,\"componentTypeName\":\"\",\"subscribes\":[{\"pubs\":[{\"event\":\"\",\"eventPayloadExpression\":\"pubsub.publish('{{listFrontId}}.loadData');\\npubsub.publish('{{confirmModalId}}.closeM');\"}],\"event\":\"confirmOkBtn.click\"}],\"hiddenTitle\":true,\"style\":\"{}\",\"visible\":true,\"title\":\"$${button.confirm}\",\"type\":\"primary\",\"id\":\"confirmOkBtn\",\"loading\":false,\"description\":\"确定按钮\",\"propType\":\"ButtonHook\"}],\"type\":\"ColContainer\",\"property\":{\"id\":\"btnRow\",\"style\":{\"pull\":0,\"span\":24,\"xxl\":24,\"order\":0,\"offset\":0,\"xl\":24,\"md\":24,\"sm\":24,\"push\":0,\"lg\":24,\"xs\":24}}}],\"type\":\"RowContainer\",\"property\":{\"id\":\"btnRowContainer\",\"style\":{\"gutter\":16,\"justify\":\"center\",\"align\":\"top\",\"type\":\"flex\"}}}}},\"subscribes\":[],\"reference\":\"\",\"validateList\":{},\"components\":{},\"canvas\":{\"containers\":{},\"components\":{}},\"layoutInfo\":{\"componentIds\":[\"LayoutMain\"],\"field\":\"modal\",\"type\":\"modal\",\"title\":\"确认弹窗\",\"formUse\":false},\"validates\":\"\"},\"phone\":{\"reference\":\"desktop\"},\"pad\":{\"reference\":\"desktop\"}}"
}
```

> 关键：`layoutInfo.field: "modal"` 标识这是一个弹窗，通过 `openM` 动态加载。
