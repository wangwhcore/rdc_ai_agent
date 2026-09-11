# 低代码 Layout JSON 生成器

基于 DSL 语义描述，生成 `MdFrontLayout/*.json` 文件，支持列表页、新增/编辑页等常见页面类型。

## 目录结构

```
generator/
├── cli.js                          # 命令行入口
├── index.js                        # 统一导出 DSL API
├── server.js                       # HTTP API 服务
├── builder/
│   ├── uuid.js                     # UUID 生成
│   ├── events.js                   # 事件表达式工厂
│   ├── regions.js                  # 容器/行/列构建
│   ├── validator.js                # JSON 校验
│   ├── listPage.js                 # 列表页 Builder
│   ├── addEditPage.js              # 新增/编辑页 Builder
│   ├── viewPage.js                 # 查看页 Builder
│   ├── simpleForm.js               # 最简表单 Builder
│   ├── modal.js                    # 弹窗 Builder
│   ├── utils.js                    # 组件收集工具
│   └── components/                 # 组件 DSL 工厂
│       ├── ButtonHook.js
│       ├── CardHook.js
│       ├── TableHook.js
│       ├── ColumnHook.js
│       ├── AdvanceQueryHook.js
│       ├── TextHook.js
│       ├── SelectHook.js
│       ├── DatePickerHook.js
│       ├── TextAreaHook.js
│       ├── InputNumberHook.js
│       ├── RadioHook.js
│       ├── CheckboxHook.js
│       ├── SwitchHook.js
│       ├── UploadHook.js
│       ├── FindbackHook.js
│       ├── SpanHook.js
│       ├── RangePickerComponent.js
│       ├── EditTableHook.js
│       ├── EditTableColumnHook.js
│       ├── NeuTag.js
│       ├── ImageHook.js
│       ├── ReUpload.js
│       ├── DropdownButtonHook.js
│       ├── ProCardHook.js
│       ├── NeuCascader.js
│       ├── TreeHook.js
│       ├── NeuTransfer.js
│       ├── TabsHook.js
│       ├── DrawerContainerHook.js
│       ├── TimePickerHook.js
│       └── GridFieldTable.js
├── parser/
│   └── designerToConfig.js         # 设计器 JSON -> DSL config 反解析
├── services/
│   └── naturalLanguageService.js   # LLM 自然语言生成
├── scripts/
│   └── batchGenerateWithRetry.js   # 批量生成与限流重试
├── test/                           # 单元测试
└── examples/                       # DSL 示例
    ├── inquiry-list.js
    ├── inquiry-add-edit.js
    ├── purchase-order-with-lines.js
    └── delete-confirm-modal.js
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

#### POST `/api/generate/view`

生成查看页 JSON，字段自动只读。

```bash
curl -X POST http://localhost:3000/api/generate/view \
  -H "Content-Type: application/json" \
  -d '{
    "pageName": "供应商信息",
    "serverName": "vendor",
    "entityPath": "vendor",
    "entityIdField": "vendorId",
    "functionGid": "...",
    "listPageId": "...",
    "fields": [
      {"type": "text", "field": "vendorCode", "label": "$${label.vendorCode}"},
      {"type": "select", "field": "status", "label": "$${label.status}", "options": {"dict": "vendorStatus"}}
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

#### 自然语言接口 POST `/api/generate/natural`

无需编写 DSL，用一句话描述需求即可生成 JSON。

**Mock 模式（无需 API Key，用于测试/演示）：**

```bash
curl -X POST http://localhost:3000/api/generate/natural \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "生成一个采购申请表单，包含采购组织、申请人、申请日期、金额、备注",
    "mock": true
  }'
```

**真实 LLM 模式（需要 API Key）：**

```bash
curl -X POST http://localhost:3000/api/generate/natural \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "生成一个供应商列表页",
    "llmConfig": {
      "apiKey": "sk-...",
      "baseURL": "https://api.openai.com/v1",
      "model": "gpt-3.5-turbo"
    }
  }'
```

也支持环境变量配置：`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`。

#### Kimi 专用接口 POST `/api/generate/kimi`

已内置 Kimi (Moonshot) 的 baseURL 和默认模型，只需提供 API Key。

```bash
curl -X POST http://localhost:3000/api/generate/kimi \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "生成一个采购申请表单，包含采购组织、申请人、申请日期、金额、备注",
    "llmConfig": {
      "apiKey": "你的 Kimi API Key",
      "model": "moonshot-v1-8k"
    }
  }'
```

环境变量：`KIMI_API_KEY`（或 `MOONSHOT_API_KEY`）、`KIMI_MODEL`。

> 获取 Kimi API Key：访问 [Moonshot 开放平台](https://platform.moonshot.cn/) 注册并创建 API Key。

#### POST `/api/parse/designer`

把设计器保存的 Layout JSON 反解析为 generator config，实现可视化产物回写到 DSL。

```bash
curl -X POST http://localhost:3000/api/parse/designer \
  -H "Content-Type: application/json" \
  -d @path/to/MdFrontLayout/xxx.json
```

返回示例：

```json
{
  "success": true,
  "data": {
    "pageType": "view",
    "config": {
      "pageName": "供应商淘汰-详情查看",
      "functionGid": "...",
      "fields": [
        {"type": "text", "field": "vendorErpCode", "label": "$${label.vendorCode}", "options": {"readonly": true}}
      ]
    }
  }
}
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
| `span(field, label)` | SpanHook | 只读展示 |
| `dateRange(field, label)` | RangePickerComponent | 日期范围选择 |
| `editTable(field, label, { columns })` | EditTableHook | 子表/行内编辑表格 |
| `editColumn(field, headerName, { cellType })` | EditTableColumnHook | 子表列 |
| `neuTag(field, label, { customValue })` | NeuTag | 状态标签 |
| `image(field, label, { source })` | ImageHook | 图片展示 |
| `reUpload(field, label, { uploadMode })` | ReUpload | 附件/图片上传 |
| `dropdownButton(label, { dataSource })` | DropdownButtonHook | 下拉按钮 |
| `proCard(label, { layoutId })` | ProCardHook | 高级卡片容器 |
| `neuCascader(field, label, { dataSource })` | NeuCascader | 级联选择 |
| `tree(field, label, { checkable })` | TreeHook | 树形选择 |
| `neuTransfer(field, label, { rowKey })` | NeuTransfer | 穿梭框 |
| `tabs(label)` | TabsHook | 标签页容器 |
| `drawerContainer(label, { drawerWidth })` | DrawerContainerHook | 抽屉容器 |
| `time(field, label, { format })` | TimePickerHook | 时间选择器 |
| `gridFieldTable(field, label, { columns })` | GridFieldTable | 编辑表格（Grid 模式） |
| `gridColumn(field, headerName, { cellType })` | GridFieldTableColumn | GridFieldTable 列 |

## 子表示例

```js
const { buildAddEditPage, text, number, editTable, editColumn } = require('../index');

module.exports = buildAddEditPage({
  pageName: '采购订单',
  serverName: 'purchase',
  entityPath: 'purchaseOrder',
  entityIdField: 'orderId',
  functionGid: '...',
  listPageId: '...',
  fields: [
    text('orderCode', '订单编码').required(),
    editTable('orderLines', '订单明细', {
      rowKey: 'lineId',
      columns: [
        editColumn('lineNo', '行号', { cellType: text('lineNo', '行号') }),
        editColumn('qty', '数量', { cellType: number('qty', '数量') }),
      ],
    }),
  ],
});
```

## 弹窗 Builder

```js
const { buildModal, span } = require('../index');

module.exports = buildModal({
  pageName: '删除确认弹窗',
  frontId: 'deleteConfirmModal',
  functionGid: '...',
  content: span('msg', '$${message.delete.reminder}'),
  okEvent: "pubsub.publish('deleteConfirmModal.ok', eventPayload);",
  cancelEvent: "pubsub.publish('deleteConfirmModal.closeM');",
});
```

API 接口：

```bash
curl -X POST http://localhost:3000/api/generate/modal \
  -H "Content-Type: application/json" \
  -d '{
    "pageName": "删除确认弹窗",
    "frontId": "deleteConfirmModal",
    "functionGid": "...",
    "content": { "type": "span", "field": "msg", "label": "确认删除吗？" },
    "okEvent": "pubsub.publish('deleteConfirmModal.ok', eventPayload);",
    "cancelEvent": "pubsub.publish('deleteConfirmModal.closeM');"
  }'
```

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

## 批量生成与限流重试

`generator/scripts/batchGenerateWithRetry.js` 支持批量读取任务、调用 LLM 生成 JSON，遇到 429 限流时退出并提示 3 小时后重试。

```bash
cd generator
# 准备 tasks.json（参考 scripts/tasks.example.json）
node scripts/batchGenerateWithRetry.js --input scripts/tasks.json --out ../../generated
```

已配置 cron 任务：每 3 小时自动运行一次，实现限流后自动恢复。

## 扩展计划

- [x] 支持删除确认弹窗 Builder
- [x] 支持查看页 Builder
- [x] 支持 EditTableHook / EditTableColumnHook 子表
- [x] 支持 TabsHook、DrawerContainerHook、TreeHook、GridFieldTable、NeuTag 等复杂容器
- [x] 二次修改：基于已有 JSON 生成 DSL（designerToConfig）
- [ ] 部署脚本：自动写入 MdFrontLayout 并同步 MdFunction
