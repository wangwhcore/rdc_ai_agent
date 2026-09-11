# 低代码 Layout JSON 生成器

基于 DSL 语义描述，生成 `MdFrontLayout/*.json` 文件，支持列表页、新增/编辑页等常见页面类型。

## 目录结构

```
generator/
├── cli.js                          # 命令行入口
├── index.js                        # 统一导出 DSL API
├── builder/
│   ├── uuid.js                     # UUID 生成
│   ├── events.js                   # 事件表达式工厂
│   ├── regions.js                  # 容器/行/列构建
│   ├── validator.js                # JSON 校验
│   ├── listPage.js                 # 列表页 Builder
│   ├── addEditPage.js              # 新增/编辑页 Builder
│   └── components/
│       ├── ButtonHook.js
│       ├── CardHook.js
│       ├── TableHook.js
│       ├── ColumnHook.js
│       ├── AdvanceQueryHook.js
│       ├── TextHook.js
│       ├── SelectHook.js
│       ├── DatePickerHook.js
│       └── TextAreaHook.js
└── examples/
    ├── inquiry-list.js             # 询价单列表页 DSL 示例
    └── inquiry-add-edit.js         # 询价单新增/编辑页 DSL 示例
```

## HTTP API 服务

### 启动服务

```bash
cd generator
npm start
# 默认端口 3000
```

### 接口

#### POST `/api/generate/list`

生成列表页 JSON。

```bash
curl -X POST http://localhost:3000/api/generate/list \
  -H "Content-Type: application/json" \
  -d '{
    "pageName": "供应商信息",
    "serverName": "vendor",
    "listUrl": "/vendor/list",
    "functionGid": "...",
    "addEditPageId": "...",
    "confirmModalId": "...",
    "rowKey": "vendorId",
    "columns": [
      {"field": "vendorCode", "headerName": "$${label.vendorCode}", "width": 120, "fuzzyQuery": true},
      {"field": "vendorName", "headerName": "$${label.vendorName}", "width": 200, "fuzzyQuery": true}
    ],
    "queryFields": [
      {"field": "vendorCode", "fieldType": "文本", "queryType": "like"},
      {"field": "status", "fieldType": "下拉", "queryType": "eq", "dict": "vendorStatus"}
    ],
    "rowOperations": ["edit", "delete", "copy"]
  }'
```

#### POST `/api/generate/addEdit`

生成新增/编辑页 JSON。

```bash
curl -X POST http://localhost:3000/api/generate/addEdit \
  -H "Content-Type: application/json" \
  -d '{
    "pageName": "供应商信息",
    "serverName": "vendor",
    "entityPath": "vendor",
    "entityIdField": "vendorId",
    "functionGid": "...",
    "listPageId": "...",
    "fields": [
      {"type": "text", "field": "vendorCode", "label": "$${label.vendorCode}", "required": true},
      {"type": "select", "field": "status", "label": "$${label.status}", "options": {"dict": "vendorStatus"}},
      {"type": "date", "field": "registerDate", "label": "$${label.registerDate}"}
    ]
  }'
```

#### 通用接口 POST `/api/generate`

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "type": "list",
    "config": { ... }
  }'
```

## CLI 快速开始

### 1. 生成列表页

```bash
cd generator
node cli.js --input examples/inquiry-list.js --out ../generated --name inquiry-list-generated.json
```

### 2. 仅校验不输出

```bash
node cli.js --input examples/inquiry-list.js --check
```

### 3. 生成新增/编辑页

```bash
node cli.js --input examples/inquiry-add-edit.js --out ../generated --name inquiry-add-edit-generated.json
```

## DSL 示例

### 列表页

```js
const { buildListPage, column, queryField } = require('../index');

const columns = [
  column('vendorCode', '$${label.vendorCode}', { width: 120, fuzzyQuery: true }),
  column('vendorName', '$${label.vendorName}', { width: 200, fuzzyQuery: true }),
  column('status', '$${label.status}', { width: 100, tag: 'vendorStatus' }),
];

const queryFields = [
  queryField('vendorCode', '文本', 'like'),
  queryField('status', '下拉', 'eq', { dict: 'vendorStatus' }),
];

module.exports = buildListPage({
  pageName: '供应商信息',
  serverName: 'vendor',
  listUrl: '/vendor/list',
  functionGid: '...',
  addEditPageId: '...',
  confirmModalId: '...',
  rowKey: 'vendorId',
  columns,
  queryFields,
  rowOperations: ['edit', 'delete', 'copy'],
});
```

### 新增/编辑页

```js
const { buildAddEditPage, text, select, date, textarea } = require('../index');

module.exports = buildAddEditPage({
  pageName: '供应商信息',
  serverName: 'vendor',
  entityPath: 'vendor',
  entityIdField: 'vendorId',
  functionGid: '...',
  listPageId: '...',
  fields: [
    text('vendorCode', '$${label.vendorCode}').required(),
    text('vendorName', '$${label.vendorName}').required(),
    select('status', '$${label.status}', { dict: 'vendorStatus' }),
    date('registerDate', '$${label.registerDate}'),
    textarea('remark', '$${label.remark}'),
  ],
});
```

## 支持的字段组件

| DSL 方法 | 组件类型 | 链式方法 |
|----------|----------|----------|
| `text(field, label)` | TextHook | `.required()`, `.readonly()`, `.on(event, expr)` |
| `select(field, label, { dict })` | SelectHook | `.required()`, `.readonly()` |
| `date(field, label)` | DatePickerHook | `.required()`, `.readonly()` |
| `textarea(field, label)` | TextAreaHook | `.required()`, `.readonly()` |
| `number(field, label, { precision })` | InputNumberHook | `.required()`, `.readonly()` |
| `radio(field, label, { dict })` | RadioHook | `.required()`, `.readonly()` |
| `checkbox(field, label, { dict })` | CheckboxHook | `.required()`, `.readonly()` |
| `switchField(field, label)` | SwitchHook | `.required()`, `.readonly()` |
| `upload(field, label)` | UploadHook | `.required()`, `.readonly()` |
| `findback(field, label, { tableInfo })` | FindbackHook | `.required()`, `.readonly()` |

## 校验规则

`validator.js` 会检查：

1. 外层 JSON 字段完整（gid/frontId/functionGid/name/value）
2. `value` 可反序列化为对象
3. `desktop` 包含必要字段
4. 实体组件 id 唯一（layoutList 组件 property.id 与 components key 不重复）
5. 引用完整性（CardHook.layoutId、toolContainerId、toolButtons、TableHook.columns.colId、rowOperationItem.id、AdvanceQueryHook.associateId）
6. 业务规则（列表页必须含 TableHook、新增/编辑页 formUse=true）

## 测试

```bash
cd generator
npm test                 # 组件工厂单元测试
npm run check:all        # 校验所有示例 JSON
```

## 扩展计划

- [ ] 支持查看页 Builder
- [ ] 支持删除确认弹窗 Builder
- [ ] 支持 FindbackHook、UploadHook 等更多字段组件
- [ ] 支持 TabsHook、DrawerContainerHook 等复杂容器
- [ ] 二次修改：基于已有 JSON 生成 DSL 并应用 diff
- [ ] 部署脚本：自动写入 MdFrontLayout 并同步 MdFunction
