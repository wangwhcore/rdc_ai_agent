# 字段组件骨架模板

每种字段类型对应一个组件定义。生成时从下面选择对应类型，填入 `{{FORM_LAYOUT_ID}}.rows[].cols[].components[]` 中，同时在 `components` Map 里以 id 为 key 注册一份。

---

## 通用说明

| 占位符 | 说明 |
|--------|------|
| `{{COMP_ID}}` | 组件唯一 UUID，同时作为 components Map 的 key |
| `{{FIELD_NAME}}` | 绑定的数据字段名，如 `vendorCode` |
| `{{FIELD_LABEL}}` | 显示标签，建议用 i18n key `$${label.xxx}` 或直接写中文 |
| `{{FIELD_DESC}}` | description，中文说明，调试用 |
| `{{FRONT_ID}}` | 当前页面 frontId |
| `{{COL_ID}}` | 所在 ColContainer 的 id（colId） |
| `{{COL_SPAN}}` | 栅格宽度，常用值：6（1/4）、8（1/3）、12（1/2）、24（全宽） |

---

## 1. 文本输入 TextHook

```json
{
  "type": "TextHook",
  "isForm": true,
  "colId": "{{COL_ID}}",
  "property": {
    "id": "{{COMP_ID}}",
    "description": "{{FIELD_DESC}}",
    "label": "{{FIELD_LABEL}}",
    "filed": "{{FIELD_NAME}}",
    "propType": "TextHook",
    "enabled": true,
    "visible": true,
    "displayMode": false,
    "placeholder": "$${label.pleaseEnter}",
    "showRequiredStar": false,
    "singleValidate": [],
    "maxWords": 10000,
    "isAddonAfter": false,
    "isScan": false,
    "isSuffix": false,
    "displayLink": false,
    "passWordMode": false,
    "prefix": "",
    "thousandsFormat": "",
    "labelAlign": "",
    "valueAlign": "",
    "displayAuto": "",
    "isDescription": false,
    "sceneStyle": "",
    "componentTypeName": "",
    "anchorTarget": false,
    "subscribes": [],
    "columnsType": {},
    "tagStyle": "{}",
    "wrapperSpan": 24,
    "labelSpan": 24,
    "commonProperty": []
  }
}
```

**必填字段**时 `showRequiredStar: true`，`singleValidate: ["required"]`

**只读显示**时 `displayMode: true`，`enabled: false`

---

## 2. 多行文本 TextAreaHook

```json
{
  "type": "TextAreaHook",
  "isForm": true,
  "colId": "{{COL_ID}}",
  "property": {
    "id": "{{COMP_ID}}",
    "description": "{{FIELD_DESC}}",
    "label": "{{FIELD_LABEL}}",
    "filed": "{{FIELD_NAME}}",
    "propType": "TextAreaHook",
    "enabled": true,
    "visible": true,
    "displayMode": false,
    "placeholder": "$${label.pleaseEnter}",
    "showRequiredStar": false,
    "singleValidate": "",
    "maxWords": 2000,
    "minRows": 2,
    "maxRows": 4,
    "isDescription": false,
    "displayAuto": "",
    "componentTypeName": "",
    "anchorTarget": false,
    "subscribes": [],
    "columnsType": {},
    "tagStyle": "{}",
    "wrapperSpan": 24,
    "labelSpan": 24
  }
}
```

---

## 3. 下拉选择 SelectHook

```json
{
  "type": "SelectHook",
  "isForm": true,
  "colId": "{{COL_ID}}",
  "property": {
    "id": "{{COMP_ID}}",
    "description": "{{FIELD_DESC}}",
    "label": "{{FIELD_LABEL}}",
    "filed": "{{FIELD_NAME}}",
    "propType": "SelectHook",
    "enabled": true,
    "visible": true,
    "displayMode": false,
    "placeholder": "",
    "showRequiredStar": false,
    "singleValidate": "",
    "mode": "single",
    "valueField": "itemCode",
    "showFiled": "itemName",
    "displayField": "itemName",
    "onLoadData": true,
    "remoteSearch": true,
    "multiCols": true,
    "multiColsConfig": [
      { "id": "{{MULTI_COL_ID}}", "title": "名称", "displayField": "itemName", "search": true, "width": 12 }
    ],
    "showAdd": false,
    "defaultOption": false,
    "multiPagination": false,
    "multipleColor": "",
    "wordColor": "",
    "dataSource": {
      "type": "api",
      "method": "post",
      "serverName": "mdgeneric",
      "url": "/md/datadict/getall",
      "bodyExpression": "callback({ groupCode: '{{DICT_GROUP_CODE}}' })"
    },
    "pagination": {
      "pageNoField": "page",
      "pageSizeField": "pageSize",
      "filterField": "filter",
      "totalField": "pager.totalRecords",
      "disabled": false,
      "hideOnSinglePage": false,
      "simple": false,
      "small": true
    },
    "isMapRequest": false,
    "displayAuto": "",
    "isDescription": false,
    "sceneStyle": "",
    "componentTypeName": "",
    "anchorTarget": false,
    "subscribes": [],
    "columnsType": {},
    "tagStyle": "{}",
    "wrapperSpan": 24,
    "labelSpan": 24,
    "showRefresh": true,
    "commonProperty": []
  }
}
```

`{{DICT_GROUP_CODE}}` 填数据字典分组码。

---

## 4. 弹窗选择 FindbackHook

```json
{
  "type": "FindbackHook",
  "isForm": true,
  "colId": "{{COL_ID}}",
  "property": {
    "id": "{{COMP_ID}}",
    "description": "{{FIELD_DESC}}",
    "label": "{{FIELD_LABEL}}",
    "filed": "{{FIELD_NAME}}",
    "propType": "FindbackHook",
    "enabled": true,
    "visible": true,
    "displayMode": false,
    "placeholder": "$${label.pleaseEnter}",
    "showRequiredStar": false,
    "singleValidate": "",
    "modalType": "modal",
    "modalTitle": "",
    "modalWidth": "middle",
    "showDropdown": true,
    "showAdd": false,
    "clearOther": false,
    "valueAdd": false,
    "setKeywords": false,
    "getReference": false,
    "defaultOption": false,
    "filterFields": "",
    "showRefresh": true,
    "showType": "",
    "isMapRequest": false,
    "associatedFields": [
      { "id": "{{ASSOC_ID_1}}", "from": "{{FROM_FIELD_1}}", "to": "{{TO_FIELD_1}}" }
    ],
    "tableInfo": {
      "id": "{{FINDBACK_TABLE_ID}}",
      "rowKey": "{{ROW_KEY_FIELD}}",
      "isSelectable": true,
      "rowSelection": "single",
      "isTreeData": false,
      "dynamicCol": true,
      "simplePage": false,
      "searchVisible": true,
      "queryVisible": false,
      "filterVisible": false,
      "showOperation": false,
      "showPage": true,
      "onLoadData": true,
      "showSerial": true,
      "isAutoSize": true,
      "tableHeight": "367",
      "tableHeightOffset": "",
      "searchTips": "",
      "isShowPagerTools": true,
      "operationWidth": 130,
      "dataSource": {},
      "columns": [
        { "colId": "{{FINDBACK_COL_ID_1}}", "field": "{{FROM_FIELD_1}}", "headerName": "编码" },
        { "colId": "{{FINDBACK_COL_ID_2}}", "field": "{{FROM_FIELD_2}}", "headerName": "名称" }
      ],
      "subscribes": []
    },
    "pagination": {
      "pageNoField": "variables.page.page",
      "pageSizeField": "variables.page.pageSize",
      "disabled": false,
      "hideOnSinglePage": false,
      "simple": false,
      "small": true
    },
    "multiColsConfig": [],
    "labelAlign": "",
    "valueAlign": "",
    "displayAuto": "",
    "isDescription": false,
    "componentTypeName": "",
    "anchorTarget": false,
    "subscribes": [],
    "tagStyle": "{}",
    "wrapperSpan": 24,
    "labelSpan": 24
  }
}
```

---

## 5. 日期选择 DatePickerHook

```json
{
  "type": "DatePickerHook",
  "isForm": true,
  "colId": "{{COL_ID}}",
  "property": {
    "id": "{{COMP_ID}}",
    "description": "{{FIELD_DESC}}",
    "label": "{{FIELD_LABEL}}",
    "filed": "{{FIELD_NAME}}",
    "propType": "DatePickerHook",
    "enabled": true,
    "visible": true,
    "displayMode": false,
    "placeholder": "$${label.pleaseSelect}",
    "showRequiredStar": false,
    "singleValidate": "",
    "pickerType": "date",
    "format": "YYYY-MM-DD",
    "showTime": false,
    "isDescription": false,
    "componentTypeName": "",
    "anchorTarget": false,
    "subscribes": [],
    "columnsType": {},
    "tagStyle": "{}",
    "wrapperSpan": 24,
    "labelSpan": 24
  }
}
```

---

## 6. 附件上传 ReUpload（自定义组件）

```json
{
  "type": "ReUpload",
  "category": "custom-component",
  "isForm": true,
  "colId": "{{COL_ID}}",
  "customProperty": { "lib": "qzingcomp", "name": "re-upload", "title": "附件上传" },
  "property": {
    "id": "{{COMP_ID}}",
    "description": "附件",
    "title": "附件上传",
    "filed": "fileInfoList",
    "key": "fileCodes",
    "uploadMode": "Dragger",
    "visible": true,
    "onlyDisplay": false,
    "anchorTarget": false,
    "subscribes": [],
    "tagStyle": "{}"
  }
}
```

---

## 行容器模板（含多列）

每行放多个字段时，按下面的结构，`cols` 数组里每个 ColContainer 放一个字段，`span` 之和 = 24。

```json
{
  "type": "RowContainer",
  "property": {
    "id": "{{ROW_ID}}",
    "style": { "gutter": 32, "justify": "start", "align": "top", "type": "flex" }
  },
  "cols": [
    {
      "type": "ColContainer",
      "property": {
        "id": "{{COL_ID_1}}",
        "style": { "pull": 0, "span": 6, "xxl": 6, "order": 0, "offset": 0, "xl": 6, "md": 6, "sm": 6, "push": 0, "lg": 6, "xs": 6 }
      },
      "components": [ /* 字段组件 */ ]
    },
    {
      "type": "ColContainer",
      "property": {
        "id": "{{COL_ID_2}}",
        "style": { "pull": 0, "span": 6, "xxl": 6, "order": 0, "offset": 0, "xl": 6, "md": 6, "sm": 6, "push": 0, "lg": 6, "xs": 6 }
      },
      "components": [ /* 字段组件 */ ]
    },
    {
      "type": "ColContainer",
      "property": {
        "id": "{{COL_ID_3}}",
        "style": { "pull": 0, "span": 6, "xxl": 6, "order": 0, "offset": 0, "xl": 6, "md": 6, "sm": 6, "push": 0, "lg": 6, "xs": 6 }
      },
      "components": [ /* 字段组件 */ ]
    },
    {
      "type": "ColContainer",
      "property": {
        "id": "{{COL_ID_4}}",
        "style": { "pull": 0, "span": 6, "xxl": 6, "order": 0, "offset": 0, "xl": 6, "md": 6, "sm": 6, "push": 0, "lg": 6, "xs": 6 }
      },
      "components": []
    }
  ]
}
```

> 常见布局：4列 span=6，3列 span=8，2列 span=12，1列 span=24

---

## 占位符速查

| 占位符 | 类型 | 说明 |
|--------|------|------|
| `{{APP_GID}}` | string | 应用 GID |
| `{{FRONT_ID}}` | uuid | 页面 frontId，全局唯一，等同于表单 id |
| `{{PAGE_GID}}` | uuid | Layout 文件 gid |
| `{{FUNCTION_GID}}` | uuid | 关联的功能菜单 gid |
| `{{PID}}` | uuid | 父 Layout gid |
| `{{LIST_PAGE_ID}}` | uuid | 列表页 frontId，返回/跳转目标 |
| `{{LIST_TABLE_ID}}` | uuid | 列表页表格组件 id，保存后刷新用 |
| `{{SERVER_NAME}}` | string | 后端服务名，如 `vendor`、`system` |
| `{{ENTITY_PATH}}` | string | 接口路径前缀，如 `smcperformanceindex` |
| `{{ENTITY_CODE}}` | string | 实体编码（权限 action 前缀），如 `performanceindex` |
| `{{ENTITY_ID_FIELD}}` | string | 主键字段名，如 `indexId` |
| `{{ENTITY_CODE_FIELD}}` | string | 编码字段名，如 `indexCode`（标题显示用） |
| `{{PAGE_TITLE}}` | string | 页面中文名，如 `考核指标` |
| `{{CARD_ID}}` | uuid | CardHook 组件 id |
| `{{FORM_LAYOUT_ID}}` | uuid | 表单字段所在 layoutList 容器 id |
| `{{BTN_BACK_ID}}` | uuid | 返回按钮 id |
| `{{BTN_SAVE_NEW_ID}}` | uuid | 新建-保存按钮 id |
| `{{BTN_SAVE_EDIT_ID}}` | uuid | 编辑-保存按钮 id |
| `{{VALIDATES_CODE}}` | string | 字段校验 JS 代码（可为空字符串） |
