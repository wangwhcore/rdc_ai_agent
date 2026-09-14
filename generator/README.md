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
│   ├── jsonIntegrity.js            # 双层 JSON 的「裸控制字符」专项诊断
│   ├── jsonFormat.js               # ★ 文本层 JSON 格式检查 + 强制修订
│   ├── jsonGate.js                 # ★ 落盘门禁：修订后必须过两道门
│   ├── referenceSpec.js            # 跨组件引用表（语料挖掘，20 条）
│   ├── schema.js                   # 组件类型 / 属性白名单（语料挖掘）
│   └── schema.generated.json       # 由 surveyCorpus --json 生成并固化
├── check/                          # ★ 契约校验引擎（58 条规则 / 8 组）
│   ├── index.js                    # 公共门面（run / formatText / ALL_CODES）
│   ├── engine.js                   # 规则调度、context、runBatch
│   ├── diagnostics.js              # 诊断结构、排序、去重、汇总
│   ├── report.js                   # text / json / summary 渲染
│   └── rules/
│       ├── index.js                # 规则组注册表
│       ├── format.js               # JSON001-003（值层文本形态与合法性）
│       ├── structural.js           # STRUCT001-009
│       ├── identity.js             # ID001-007
│       ├── references.js           # REF001-006（含跨布局 frontId 引用）
│       ├── properties.js           # PROP001-010
│       ├── datasource.js           # DS001-007
│       ├── semantics.js            # SEM001-008
│       └── aquery.js               # AQ001-008（高级查询 ⇄ 表格 ⇄ 漏斗容器）
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
│   ├── repairValueJson.js          # ★ 双层 JSON 格式体检 + 强制修订 CLI
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
    "addEditPageFrontId": "<目标布局 frontId>",
    "confirmModalFrontId": "<弹窗布局 frontId>",
    "rowKey": "vendorId",
    "columns": [
      {"field": "vendorCode", "headerName": "$${label.vendorCode}", "width": 120, "fuzzyQuery": true},
      {"field": "vendorName", "headerName": "$${label.vendorName}", "width": 200, "fuzzyQuery": true},
      {"field": "status", "headerName": "$${label.status}", "width": 100, "tag": "vendorStatus"},
      {"field": "createTime", "headerName": "$${label.createTime}", "width": 150, "fieldType": "date"}
    ],
    "queryFields": ["vendorCode", "vendorName", "status", "createTime"],
    "rowOperations": ["edit", "delete", "copy"]
  }'
```

> `queryFields` 只写字段名即可 —— 查询组件与 operation 由 `columns` 上的类型推导。
> 省略 `queryFields` 表示「全部可查询列」；写 `false` 表示不生成高级查询。

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

#### POST `/api/repair`

**JSON 格式检查 + 强制修订**：把「打不开 / 搭不上」的 JSON 修回来（纯计算，不落盘）。

尾随逗号、单引号、JSON 注释、未加引号的键、少一个闭合括号、BOM、
字符串里塞了真实换行、键名重复……这些问题改一个字符就能好，却会让平台直接崩，
所以默认**修掉**而不是报错了事。

```bash
# 文件文本形态（能顺带修外层信封）
curl -X POST http://localhost:3000/api/repair \
  -H "Content-Type: application/json" \
  -d '{ "text": "{\"gid\":\"x\", \"value\":\"{...}\",}" }'

# 对象形态
curl -X POST http://localhost:3000/api/repair \
  -H "Content-Type: application/json" \
  -d '{ "layout": { ... Layout JSON ... } }'
```

响应：

```json
{
  "success": true,
  "ok": true,
  "repaired": true,
  "repairMethods": ["jsonrepair"],
  "steps": ["value 文本强制修订: 尾随逗号 1 处（手段 jsonrepair）"],
  "warnings": [],
  "formatProblems": [{ "reason": "trailing-comma", "label": "尾随逗号", "line": 1, "column": 38496 }],
  "structural": { "ok": true, "problems": [] },
  "blocked": null,
  "check": { "ok": true, "errorCount": 0, "total": 16 },
  "report": ["...", "  🔧 value 文本强制修订: ...", "  ✅ 已强制修订，并通过两道门（jsonrepair）"],
  "layout": { "... 修订后的对象，可直接落盘 ..." },
  "engine": { "jsonrepairAvailable": true }
}
```

> ⚠️ **可解析 ≠ 正确**：只补闭合符能让文件变得可解析，但补错位置会把 `phone`/`pad`
> 塞进 `desktop`、把 `layoutInfo` 吞掉 —— 结构已经错位，运行时照样抛
> `TypeError: Cannot read properties of undefined (reading 'field')`。
> 所以修订后必须过两道门（结构不变量 + check 零 error），任何一道不过就返回
> `ok: false` 与 `blocked`，**拒绝写入**，让人工补缺失的内容。

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

### 4. JSON 格式体检 / 强制修订

落盘前 `cli.js` 会自动跑格式门禁（`ir/jsonGate`）：格式有缺陷就**强制修订**，
修订后再复核两道门。想单独对一批文件做体检或修复：

```bash
npm run json:check                       # 体检 ../generated（dry-run，只报告）
npm run json:repair                      # 强制修订并落盘（自动 .bak 备份）
node scripts/repairValueJson.js ../../MdFrontLayout --json   # 机器可读输出
```

也可以直接对任意路径：

```bash
node scripts/repairValueJson.js path/to/dir --write --backup
```

## DSL 示例

### 列表页

```js
const { buildListPage, column } = require('../index');

const columns = [
  column('vendorCode', '$${label.vendorCode}', { width: 120, fuzzyQuery: true }),
  column('vendorName', '$${label.vendorName}', { width: 200, fuzzyQuery: true }),
  // tag = 字典枚举列 -> 查询条件自动变成「下拉单选」
  column('status', '$${label.status}', { width: 100, tag: 'vendorStatus' }),
  // fieldType = date -> 查询条件自动变成「日期范围」
  column('createTime', '$${label.createTime}', { width: 150, fieldType: 'date' }),
];

// 高级查询条件**来自表格字段（含类型）**：只写字段名，组件与 operation 自动推导
const queryFields = ['vendorCode', 'vendorName', 'status', 'createTime'];

module.exports = buildListPage({
  pageName: '供应商信息',
  serverName: 'vendor',
  listUrl: '/vendor/list',
  functionGid: '...',
  addEditPageFrontId: '...',   // 目标布局的 frontId，不是 gid
  confirmModalFrontId: '...',
  rowKey: 'vendorId',
  columns,
  queryFields,
  rowOperations: ['edit', 'delete', 'copy'],
});
```

`queryFields` 的四种写法：

| 写法 | 行为 |
|---|---|
| 省略 / `'auto'` | 取全部可查询列（自动排除 `serialNum`/`operation`、`link` 列、`query: false` 的列） |
| `['status', 'createTime']` | 按给定顺序取这些列，**类型从表格列上读** |
| `[{ field: 'status', component: 'CheckboxHook' }]` | 同上，并可覆盖组件 / operation / span / dict |
| `false` | 不生成高级查询，页面只有**一个单独的表格** |

### 高级查询（漏斗）的产物结构

生成器会写出两份互相咬合的数据（由 401 份语料标定）：

```js
desktop.components['<hookId>'].property.advancedQuery
// = [{ field:'status', operation:'eq', type:'val', value:'' }, ...]   ← 固定这四个键

desktop.layoutList['<hookId>_filterId'].rows
// = 装着一一对应的条件组件（TextHook / SelectHook / RangePickerComponent / CheckboxHook）
//   property.filed === advancedQuery[i].field（严格按序）
```

三条硬性不变量：

1. `AdvanceQueryHook.property.associateId` === 同页 `TableHook` 的 componentId —— 高级查询与表格成对出现。
2. `advancedQuery` 非空 ⟹ 必须有 `<hookId>_filterId` 容器，且容器内组件数与之相等。
3. 容器内的条件组件必须**全部**登记到 `desktop.components`（语料 389/389）。

组件类型 → operation 是固定函数（语料 390 条条件统计）：

| 条件组件 | operation | 由什么触发 |
|---|---|---|
| `TextHook` | `like` | `text` / `string` / `code` / 空 |
| `SelectHook` | `eq` | `enum` / `columnsType.type = 'tag'` 或 `'enumerate'` |
| `RangePickerComponent` | `range` | `date` / `datetime` |
| `CheckboxHook` | `in` | 显式 `query: { component: 'CheckboxHook' }` |

> `enum` 列的二义性无法从列推导：语料里 `CheckboxHook|in` 33 例、`SelectHook|eq` 32 例，
> 且**同一个字典 code 在两组里都出现过**（纯属设计器偏好）。生成器默认取
> `SelectHook|eq`（单选、只占 1/3 行），要改成多选请显式指定。

栅格排布与语料一致：条件默认 `span: 8`（3 个一行），`CheckboxHook` 为 `span: 24`（独占整行），
按「填满 24 换行」贪心分组。语料实测的行内列数分布（`3,3` / `3,3,1` / `3,3,1,1`）与之一一吻合。

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

`check/` 取代了早期 `validator.js` 的 6 条硬编码检查，改为 **58 条规则 / 8 组**，
每条诊断都带 `{ code, severity, path, message, hint, extra }`。
另有 4 条引擎级输入诊断：`INPUT001`（入参不是对象）、`INPUT002`（无法 lift 成 IR）、
`INPUT003`（`value` 这一层不是合法 JSON，带精确 `line`/`column`/`position` **以及可修订性**）、
`JSON002`（`value` 解出的不是对象，典型是双重编码）。

```js
const { check } = require('./index');

const res = check.run(layoutJson);          // 也接受已 lift 的 Page IR
console.log(res.ok, res.summary);           // summary: { total, bySeverity, byCode }
console.log(check.formatText(res.diagnostics, { name: '供应商列表' }));
```

选项：`{ strict, ignore: ['ID005'], only: ['REF001'], severity: { STRUCT005: 'error' } }`。

| 组 | 规则 | 关注点 |
|----|------|--------|
| `format` | JSON001-003 | 值层 JSON 文本的**形态与合法性**（见下） |
| `structural` | STRUCT001-009 | 外层四件套、region 栅格、componentIds 指向 |
| `identity` | ID001-007 | id 唯一性、类型可识别、只内联未登记 |
| `references` | REF001-006 | 跨组件引用悬空、类型不符、跳转/弹窗目标为空或非 frontId |
| `properties` | PROP001-010 | 属性白名单、字段绑定、只读/必填冲突、样式表达式、singleValidate 形态 |
| `datasource` | DS001-007 | 数据源必填项、url 形态、未替换占位符 |
| `semantics` | SEM001-008 | 列表页必须有表格、新增页 formUse、查看页只读 |
| `aquery` | AQ001-008 | 高级查询 ⇄ 表格 ⇄ 漏斗容器的三方对应关系 |

`format` 组细则：

| 规则 | 级别 | 检查什么 | 怎么修 |
|------|------|----------|--------|
| `JSON001` | warning | `value` 是**对象**而不是 JSON 字符串（设计器恒存字符串） | 改成 `JSON.stringify(desktop)` |
| `JSON002` | error | `value` 解出的不是对象（双重编码 / 标量 / `null` / 数组） | 去掉外层一次转义 |
| `JSON003` | warning | 值层文本能解析，但含**静默丢配置**的缺陷（键名重复 → 后值覆盖先值） | 只报不改，需人工取舍 |
| `INPUT003` | error | 值层文本**根本不可解析**（尾随逗号 / 缺括号 / 裸换行 / BOM …） | 附 `extra.repairable` + `extra.howToFix`，可直接 `npm run json:repair` |

`aquery` 组细则（标定见 `ir/querySpec.js`）：

| 规则 | 级别 | 检查什么 |
|------|------|----------|
| `AQ001` | error / warning | `associateId` 必须指向同页 TableHook（空串降为 warning，语料 7/225） |
| `AQ002` | error | `advancedQuery` 非空却没有 `<hookId>_filterId` 容器 |
| `AQ003` | error | 容器内组件数与 `advancedQuery` 条数不等 |
| `AQ004` | error | 容器内 `filed` 与 `advancedQuery[].field` 按序不一致 |
| `AQ005` | error | 容器内的条件组件未登记到 `desktop.components` |
| `AQ006` | error / info | `advancedQuery` 条目缺键（error）或含语料没有的多余键（info） |
| `AQ007` | warning | 条目的 `type` / `value` 非默认（应为 `'val'` / `''`） |
| `AQ008` | info | `operation` 与条件组件类型的常见映射不符（语料 7/390 属少数派写法） |

**标定原则**：`error` 级别必须在 401 份真实语料上做到零误报。目前语料上有
21 条 error（`REF002` 2 / `DS001` 7 / `DS002` 3 / `DS003` 3 / `AQ001` 1 / `AQ003` 1 / `AQ004` 4），
已逐条人工确认为真实缺陷 —— 其中 AQ 的 6 条全部来自同一个页面
`a448fa17…` 里一个被挂载的坏高级查询组件（`associateId` 指向不存在的表格、5 条条件对 4 个容器组件）。

`builder/validator.js` 保留为兼容层，内部转发到 `check`，仍返回 `{ ok, errors: string[] }`。

## JSON 格式门禁（强制修订）

### 为什么单独做一层

「生成出来的 JSON 格式不对」这类失败，成本极不对称：尾随逗号、少一个闭合括号、
字符串里塞了真实换行 —— 改一个字符就能好，却能让平台运行时直接崩，
排查成本远高于修复成本。所以**格式问题不该直接 fail，而应该修掉**。

但「可解析 ≠ 正确」：只补 JSON 闭合符能让文件变得可解析，补错位置却会把
`phone`/`pad` 塞进 `desktop`、把 `layoutInfo` 吞掉 —— 结构已经错位，运行时照样抛
`TypeError: Cannot read properties of undefined (reading 'field')`。

所以门禁是**两段式**：先强制修订文本，再过两道门复核。

```
原始文本 ──► ① 格式检查 ──► ② 强制修订 ──► ③ 门 A 结构不变量 ──► ④ 门 B check 零 error
                  │              │                    │                     │
             结构化缺陷清单   修订手段 + 每处补丁    desktop 四件套 /      error 必须为 0
                                                 设备节点不互相嵌套
```

任何一道门不过 → **拒绝写入**，只输出诊断让人工补缺失的内容。

### 修订手段优先级（前面恒安全，后面越来越宽松）

| 手段 | 覆盖的缺陷 | 安全性 |
|---|---|---|
| `strip-bom` | BOM / 零宽字符 | 恒安全 |
| `escape-control` | 字符串内裸控制字符（真实换行/制表符） | 恒安全（JSON 字符串内 `<0x20` 本就非法） |
| `jsonrepair` | 尾随逗号、单引号、注释、未引号键、键缺值、截断 | 成熟开源库（MIT），首选 |
| `normalize-loose` | 同上（内置兜底，可审计到每处补丁） | 仅在 `jsonrepair` 不可用时启用 |
| `closer-patch` | 缺闭合符 | 最后手段，**最需要人工复核** |

`jsonrepair` 是**可选依赖**（`npm install jsonrepair`）：缺失时自动降级到内置手段，
不影响任何既有能力。另外有一道闸：**看不出 JSON 结构的文本直接拒绝**，
不交给 `jsonrepair` —— 它能把 `'这不是 JSON'` 揉成 `'"这不是 JSON"'`，
那样只会把「根本不是 JSON」推到更难排查的下游。

### 语义改动会告警，不会静默

修订有时无法避免语义取舍，这些情况一定会 `warnings` 出来：

- 字面量 `undefined` → `null`
- 形如 `{"a":}` 的「键缺值」被补出一个 `null`
- 靠 `closer-patch` 补括号才可解析（必须人工确认结构没错位）

**唯一只报不改的是「键名重复」**：`JSON.parse` 不报错，但后出现的值静默覆盖先出现的，
自动修等于替人做语义取舍，所以只报 `JSON003` 让人确认留哪个。

### 接入点

| 位置 | 行为 |
|---|---|
| `cli.js` | 落盘前跑门禁；`--allow-check-errors` 可把 check 环节降级为只报不拦 |
| `scripts/deploy.js` | 读入与写入都过门禁（含目标目录里的历史产物） |
| `scripts/batchGenerateWithRetry.js` | 每个产物落盘前过门禁，不通过则跳过并打印原因 |
| `services/naturalLanguageService.js` | **LLM 直出的 JSON 先修订再解析**，格式问题不再让整次生成失败 |
| `ir/jsonFormat` | 纯文本层能力，可直接 `require` 复用 |

```js
const { enforce } = require('./ir/jsonGate');

const r = enforce(layoutJsonOrFileText);
if (r.ok) {
  fs.writeFileSync(out, JSON.stringify(r.layout, null, 2));  // r.layout 是修订后的对象
  if (r.repaired) console.log('已强制修订:', r.steps);
} else {
  console.error('拒绝写入:', r.blocked.stage, r.blocked.reason, r.blocked.details);
}
```

### 常用脚本

```bash
npm run survey        # 扫语料，人工查看组件类型 / 属性分布
npm run survey:schema # 重新生成 ir/schema.generated.json
npm run roundtrip     # 401 份语料 IR 往返回归，要求 value 逐字节一致
npm run calibrate     # 规则 × 级别矩阵，打印 error 级样本，有 error 时退出码 1
npm run check:corpus  # 语料批量校验 + 抽样展示
npm run check:all     # 校验 examples/ 下全部示例
npm run json:check    # JSON 格式体检（dry-run，不落盘）
npm run json:repair   # JSON 格式强制修订 + 落盘（自动 .bak 备份）
```

## 测试

```bash
cd generator
npm test                 # 全部单元测试（含 401 语料往返 + check 规则正反例）
npm run check:all        # 校验 examples/ 下全部示例
npm run roundtrip        # 401 份语料 IR 往返回归（要求 value 逐字节一致）
npm run calibrate        # 规则在真实语料上的标定矩阵
npm run check:corpus     # 语料批量校验 + 抽样
npm run json:check       # JSON 格式体检
```

`npm test` 串起 14 个测试文件，其中三个是核心回归：

- `test/roundtrip.test.js`：5 个构造器产物 + 序列化幂等 + 401 份语料全量回归
- `test/check.test.js`：58 条规则的正例/反例，含 `ignore` / `severity` / IR 直入 / 兼容层契约
- `test/jsonFormat.test.js`：JSON 格式检查与强制修订（缺陷分类、内容保真、语义改动告警、
  「可解析 ≠ 正确」拒绝场景、401 语料零误报）
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
- [x] 契约校验引擎：58 条规则 / 8 组，带 code / severity / path / hint
- [x] JSON 格式门禁：文本层强制修订 + 两道门复核，接入全部落盘路径与 LLM 输出
- [x] 语料挖掘：组件 schema 与引用表由真实数据生成并标定级别
- [ ] 把 `check` 的诊断接入设计器前端，做实时契约提示
- [ ] 低代码平台 AI 演进：模板参数化 → 自然语言 → 直接生成 Layout JSON
