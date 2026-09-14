# 低代码 Layout JSON 生成器

基于 DSL 语义描述，生成 `MdFrontLayout/*.json` 文件，支持列表页、新增/编辑页等常见页面类型。

## 目录结构

```
generator/
├── cli.js                          # 命令行入口
├── index.js                        # 统一导出 DSL API（含 ir / check）
├── server.js                       # HTTP API 服务
├── ir/                             # ★ Page IR：Layout JSON ⇄ 语义中间表示
│   ├── index.js                    # 公共门面（lift / emit / roundTrip ...）
│   ├── lift.js                     # Layout JSON -> Page IR
│   ├── emit.js                     # Page IR -> Layout JSON
│   ├── referenceSpec.js            # 跨组件引用表（语料挖掘，20 条）
│   ├── schema.js                   # 组件类型 / 属性白名单（语料挖掘）
│   └── schema.generated.json       # 由 surveyCorpus --json 生成并固化
├── check/                          # ★ 契约校验引擎（45 条规则 / 6 组）
│   ├── index.js                    # 公共门面（run / formatText / ALL_CODES）
│   ├── engine.js                   # 规则调度、context、runBatch
│   ├── diagnostics.js              # 诊断结构、排序、去重、汇总
│   ├── report.js                   # text / json / summary 渲染
│   └── rules/
│       ├── index.js                # 规则组注册表
│       ├── structural.js           # STRUCT001-009
│       ├── identity.js             # ID001-007
│       ├── references.js           # REF001-006（含跨布局 frontId 引用）
│       ├── properties.js           # PROP001-008
│       ├── datasource.js           # DS001-007
│       └── semantics.js            # SEM001-008
├── builder/
│   ├── uuid.js                     # UUID 生成
│   ├── events.js                   # 事件表达式工厂（含跨布局 frontId 守门）
│   ├── regions.js                  # 容器/行/列构建
│   ├── validator.js                # 兼容层，内部转发到 check（返回 { ok, errors }）
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
│   ├── batchGenerateWithRetry.js   # 批量生成与限流重试
│   ├── surveyCorpus.js             # 语料统计 -> schema.generated.json
│   ├── roundtrip.js                # 全量语料 IR 往返回归
│   └── calibrate.js                # 规则在真实语料上的标定矩阵
├── test/                           # 单元测试
└── examples/                       # DSL 示例
    ├── inquiry-list.js
    ├── inquiry-add-edit.js
    ├── purchase-order-with-lines.js
    ├── delete-confirm-modal.js
    └── product-detail-with-p1.js
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

支持通过关键词生成复杂组件：
- 子表/明细：`"生成采购订单，包含订单明细子表"`
- 查看页：`"生成供应商详情查看页"`
- 标签页：`"生成商品详情，带标签页"`
- 时间/级联/树/穿梭框/标签/图片上传等 P1 组件

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

#### POST `/api/check`

对任意 Layout JSON 跑契约校验，返回结构化诊断（不生成、不落盘）。可直接传 Layout JSON，
也可用 `{ "layout": ... }` 包裹并附带 `ignore` / `only` / `severity` / `strict` 选项。

```bash
curl -X POST http://localhost:3000/api/check \
  -H "Content-Type: application/json" \
  -d '{
    "layout": { ... Layout JSON ... },
    "ignore": ["ID004"],
    "strict": false
  }'
```

响应：

```json
{
  "success": true,
  "ok": false,
  "errors": ["[ID006] $.value.desktop.components.xxx components 条目 xxx 缺少 type"],
  "warnings": [],
  "diagnostics": [
    {
      "code": "ID006",
      "severity": "error",
      "path": "$.value.desktop.components.xxx",
      "message": "components 条目 xxx 缺少 type",
      "hint": "无法识别的组件条目通常是保存过程被中断产生的残留",
      "extra": null
    }
  ],
  "summary": { "total": 1, "bySeverity": { "error": 1 }, "byCode": { "ID006": 1 } },
  "report": "页面名: x [错误] ID006 ...\n    建议: ..."
}
```

`/api/generate/*` 在 422 时同样返回 `diagnostics` / `summary` / `report`；
成功但存在告警时也会附带这三个字段（无诊断则保持精简响应）。

#### POST `/api/roundtrip`

把 Layout JSON 走一遍 Page IR 往返（`lift` → `emit`），确认可无损改写。

```bash
curl -X POST http://localhost:3000/api/roundtrip \
  -H "Content-Type: application/json" \
  -d '{ "layout": { ... Layout JSON ... } }'
```

响应 `{ success, irStable, valueStable, byteExact, stats, emitted }`。

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

#### POST `/api/deploy`

通过 HTTP 接口把 Layout JSON 部署到项目目录。

```bash
curl -X POST http://localhost:3000/api/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "layout": { ... Layout JSON ... },
    "layoutDir": "../../MdFrontLayout",
    "functionDir": "../../MdFunction",
    "createFunction": true,
    "parentGid": "...",
    "code": "...",
    "sequence": 0
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

### 列的注册约定（重要）

表格类组件的列遵循**「内联描述 + colId 指向注册条目」**两段式，`components` 里
只放注册条目，内联描述**不能**混进 `components`（否则会出现「缺少 type」的脏条目）：

| 组合 | 注册条目类型 | 内联描述来源 |
|------|--------------|--------------|
| `TableHook` + `ColumnHook` | `ColumnHook` | `ColumnHook.toTableColumn()` |
| `EditTableHook` + `EditTableColumnHook` | `EditTableColumnHook` | `EditTableColumnHook.toTableColumn()` |
| `GridFieldTable` + `GridFieldTableColumn` | **`EditTableColumnHook`** | `GridFieldTableColumn.toTableColumn()` |

也就是说 `GridFieldTable` 的列在 `components` 中同样以 `EditTableColumnHook` 形态注册
（语料 117/117 一致），而不是自成一类。另外两类表格都会**无条件前置一列序号列**
（`field` / `colId` 均为 `rowSerialNum_EditTable`，与 `showSerial` 取值无关）：

```js
// 序号列固定形态，语料 21/21（GridFieldTable）与 141/141（EditTableHook）一致
{
  display: true, width: 100, checkboxSelection: true, resizable: false,
  rowDrag: false, headerName: '', pinned: 'left',
  field: 'rowSerialNum_EditTable', colId: 'rowSerialNum_EditTable',
  headerCheckboxSelection: true,
}
```

### 跨布局引用的命名空间约定（最容易踩的坑）

同样是 32 位 hex 的字符串，在不同字段里属于**不同的命名空间**。填错最常见的结果不是报错，
而是运行时静默渲染空白，或者直接崩在 vendor chunk 里：

```
TypeError: Cannot read properties of undefined (reading 'field')
```

（来自 `RenderLayout(e)` 的 `e.layoutInfo.field`；`e` 是按引用查布局失败后得到的空节点。）

由 401 份真实 MdFrontLayout 逐字段统计得出：

| 引用字段 | 命名空间 | 语料命中 |
|----------|----------|----------|
| `.openM` 载荷的 `id` | **目标布局 frontId** | frontId 358 / gid 0 |
| `@@navigator.push` 的 `url` | **目标布局 frontId** | frontId 716（+20 条带尾随制表符）/ gid 0 |
| `.openM` 的**事件命名空间** | 本页 frontId | 323/335 |
| `CardHook.layoutId` / `toolContainerId` | regionId | 1942 / 1862，0 悬空 |
| `CardHook.ltContainerId` / `extraContainerId` | regionId（可空） | 147 / 154，语料本身大量悬空 |
| `AdvanceQueryHook.associateId` | componentId | 884 |
| `rowOperationItem[].id` / `toolButtons[]` | componentId | 1440 / 640 |
| `layoutInfo.componentIds[]` | regionId 或**预设槽位名** | 837 + 203（如 `BottomLeft`） |

**关键区别**：`MdFrontLayout/<gid>.json` 的**文件名是 gid**，而运行时解析跨布局引用用的是
**frontId**，两者不通用。所以「删掉确认弹窗 GID」这种注释是错的，照它填必然找不到布局。

因此生成器做了**生成期守门**（`builder/events.js`）：

```js
assertLayoutFrontId(value, field)   // 非 32 位 hex / 缺失 / 占位符 -> 抛 E_LAYOUT_REF
isPlaceholderFrontId(value)         // 全同一字符（0000… / aaaa…）-> 交给 check 告警
```

`buildListPage` / `buildAddEditPage` / `buildViewPage` 在缺失或形态非法时**直接抛错**，
不再像早期版本那样用 `uuid()` 兜底 —— 随机 uuid 会伪装成一个「看起来合法」的悬空引用，
任何静态检查都发现不了，只能等运行时崩。

对应的引用参数（旧名仍兼容）：

| 新名（语义正确） | 旧名 | 说明 |
|---|---|---|
| `addEditPageFrontId` | `addEditPageId` | 新增/编辑页布局 frontId |
| `confirmModalFrontId` | `confirmModalId` | 删除确认弹窗布局 frontId（有 `delete` 操作时必填） |
| `listPageFrontId` | `listPageId` | addEdit / view 页返回按钮的目标 frontId |

`parser/designerToConfig.js` 会从事件表达式里把这三个引用**反解析回来**，
所以「反解析 → 重新生成」这一圈不会丢引用。

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

## Page IR（语义中间表示）

`ir/` 在 DSL 与 Layout JSON 之间加了一层**无损语义模型**。它不是编译器式 IR，而是
「无损外壳 + 显式推断」：`value` 里的每个字节都原样保留，同时把原本隐含的结构
（区域、引用、数据源、推断出的页面类型）提升为可读字段。

```js
const { ir } = require('./index');

const page = ir.lift(layoutJson);   // Layout JSON -> Page IR
page.regions;      // 区域 -> 已挂载组件 id 列表（内联组件已打桩）
page.components;   // 组件注册表（含只内联未注册的 inlineOnly）
page.references;   // 跨组件引用：{ ownerId, path, value, target, resolved }
page.queries;      // 数据源契约：{ ownerId, serverName, url, isEmpty }
page.stats;        // regionCount / componentCount / danglingCount ...

const back = ir.emit(page);         // Page IR -> Layout JSON（逐字节还原）
```

`ir.roundTrip(layoutJson)` 一次性给出三个结论：

| 字段 | 含义 |
|------|------|
| `irStable` | `lift(emit(lift(x)))` 与 `lift(x)` 深度相等（IR 幂等） |
| `valueStable` | 两次 lift 的 IR 语义一致 |
| `byteExact` | 重新 emit 出的 `value` 与原始字符串**逐字节相同** |

**当前基线：401 份真实 `MdFrontLayout` 全部通过，`value` 逐字节一致 401/401。**

引用表与组件 schema 都不是手写的，而是由 `scripts/surveyCorpus.js` 扫语料挖出来、
再用 `scripts/calibrate.js` 在真实数据上标定级别：

- `ir/referenceSpec.js`：20 条跨组件引用（如 `CardHook.layoutId` 459 命中 / 0 悬空，
  定为 `error`；`CardHook.ltContainerId` 147 / 283 悬空，降级为 `warning`）。
- `ir/schema.generated.json`：组件类型清单 + 属性 key 白名单。

## 契约校验引擎（check）

`check/` 取代了早期 `validator.js` 的 6 条硬编码检查，改为 **45 条规则 / 6 组**，
每条诊断都带 `{ code, severity, path, message, hint, extra }`。
另有 3 条引擎级输入诊断：`INPUT001`（入参不是对象）、`INPUT002`（无法 lift 成 IR）、
`INPUT003`（`value` 这一层不是合法 JSON，带精确 `line`/`column`/`position`）。

```js
const { check } = require('./index');

const res = check.run(layoutJson);          // 也接受已 lift 的 Page IR
console.log(res.ok, res.summary);           // summary: { total, bySeverity, byCode }
console.log(check.formatText(res.diagnostics, { name: '供应商列表' }));
```

选项：`{ strict, ignore: ['ID005'], only: ['REF001'], severity: { STRUCT005: 'error' } }`。

| 组 | 规则 | 关注点 |
|----|------|--------|
| `structural` | STRUCT001-009 | 外层四件套、region 栅格、componentIds 指向 |
| `identity` | ID001-007 | id 唯一性、类型可识别、只内联未登记 |
| `references` | REF001-006 | 跨组件引用悬空、类型不符、跳转/弹窗目标为空或非 frontId |
| `properties` | PROP001-008 | 属性白名单、字段绑定、只读/必填冲突 |
| `datasource` | DS001-007 | 数据源必填项、url 形态、未替换占位符 |
| `semantics` | SEM001-008 | 列表页必须有表格、新增页 formUse、查看页只读 |

**标定原则**：`error` 级别必须在 401 份真实语料上做到零误报。目前语料上仅剩
15 条 error（`REF002` 2 / `DS001` 7 / `DS002` 3 / `DS003` 3），已逐条人工确认为真实缺陷。

`builder/validator.js` 保留为兼容层，内部转发到 `check`，仍返回 `{ ok, errors: string[] }`。

### 常用脚本

```bash
npm run survey        # 扫语料，人工查看组件类型 / 属性分布
npm run survey:schema # 重新生成 ir/schema.generated.json
npm run roundtrip     # 401 份语料 IR 往返回归，要求 value 逐字节一致
npm run calibrate     # 规则 × 级别矩阵，打印 error 级样本，有 error 时退出码 1
npm run check:corpus  # 语料批量校验 + 抽样展示
npm run check:all     # 校验 examples/ 下全部示例
```

## 测试

```bash
cd generator
npm test                 # 全部单元测试（含 401 语料往返 + check 规则正反例）
npm run check:all        # 校验 examples/ 下全部示例
npm run roundtrip        # 401 份语料 IR 往返回归（要求 value 逐字节一致）
npm run calibrate        # 规则在真实语料上的标定矩阵
npm run check:corpus     # 语料批量校验 + 抽样
```

`npm test` 串起 11 个测试文件，其中两个是新增的核心回归：

- `test/roundtrip.test.js`：5 个构造器产物 + 序列化幂等 + 401 份语料全量回归
- `test/check.test.js`：45 条规则的正例/反例，含 `ignore` / `severity` / IR 直入 / 兼容层契约
- `test/layoutRef.test.js`：跨布局 frontId 契约（生成期守门、占位符识别、旧字段名兼容）

## 批量生成与限流重试

`generator/scripts/batchGenerateWithRetry.js` 支持批量读取任务、调用 LLM 生成 JSON，遇到 429 限流时退出并提示 3 小时后重试。

```bash
cd generator
# 准备 tasks.json（参考 scripts/tasks.example.json）
node scripts/batchGenerateWithRetry.js --input scripts/tasks.json --out ../../generated
```

- 如果环境变量中存在 `OPENAI_API_KEY` / `KIMI_API_KEY` / `MOONSHOT_API_KEY`，则调用真实 LLM
- 如果没有配置任何 Key，会自动降级为 `mockGenerateConfigFromPrompt`，生成示例 JSON 并继续完成后续链路验证
- 遇到 429 限流时退出并返回 exit code 429，调用方（如 cron）可等待 3 小时后重试

已配置 cron 任务：每 3 小时自动运行一次，实现限流后自动恢复。

## 批量反解析历史 Layout

`generator/scripts/batchParseDesigner.js` 把已有的 `MdFrontLayout` JSON 批量反解析为 DSL 脚本，方便迁移到 generator 维护。

```bash
cd generator
node scripts/batchParseDesigner.js --input ../../MdFrontLayout --out ../../parsed-dsl
```

输出目录中每个 `.json` 对应一个 `.js` DSL 脚本。对于 `layoutInfo.pageType` 缺失的文件，脚本会根据组件特征自动推断为 `list` / `add` / `view` / `unknown`。

## 交互式 DSL 生成向导

`generator/scripts/interactiveGenerate.js` 提供命令行问答，无需手写 DSL 即可生成脚本。

```bash
cd generator
node scripts/interactiveGenerate.js --out ./generated/dsl
```

按提示选择页面类型、输入页面名称、逐个添加字段，最后自动生成 DSL 脚本到 `--out` 目录。

## 部署脚本

`generator/scripts/deploy.js` 把生成/校验后的 Layout JSON 写入项目 `MdFrontLayout`，并可选同步 `MdFunction`。

```bash
cd generator

# 仅写入 MdFrontLayout
node scripts/deploy.js --layout ../generated/inquiry-list-generated.json --layoutDir ../../MdFrontLayout

# 同时创建/更新 MdFunction
node scripts/deploy.js --layout ../generated/inquiry-list-generated.json \
  --layoutDir ../../MdFrontLayout \
  --functionDir ../../MdFunction \
  --createFunction \
  --parentGid <parent-function-gid> \
  --code inquiryList \
  --sequence 0
```

参数说明：
- `--layout`：生成后的 Layout JSON 文件路径（必填）
- `--layoutDir`：MdFrontLayout 目录，默认 `../../MdFrontLayout`
- `--functionDir`：MdFunction 目录，默认 `../../MdFunction`
- `--createFunction`：同时创建/更新功能节点
- `--parentGid`：父功能节点 GID
- `--code`：功能编码
- `--sequence`：同级排序，默认 0

## 扩展计划

- [x] 支持删除确认弹窗 Builder
- [x] 支持查看页 Builder
- [x] 支持 EditTableHook / EditTableColumnHook 子表
- [x] 支持 TabsHook、DrawerContainerHook、TreeHook、GridFieldTable、NeuTag 等复杂容器
- [x] 二次修改：基于已有 JSON 生成 DSL（designerToConfig）
- [x] 部署脚本：自动写入 MdFrontLayout 并同步 MdFunction
- [x] Page IR：Layout JSON ⇄ 无损语义中间表示（401/401 逐字节往返）
- [x] 契约校验引擎：45 条规则 / 6 组，带 code / severity / path / hint
- [x] 语料挖掘：组件 schema 与引用表由真实数据生成并标定级别
- [ ] 把 `check` 的诊断接入设计器前端，做实时契约提示
- [ ] 低代码平台 AI 演进：模板参数化 → 自然语言 → 直接生成 Layout JSON
