# 低代码平台「新增/编辑页」生成指南

## 文件说明

| 文件 | 用途 |
|------|------|
| `list-page.template.json` | 列表页骨架（Card容器+工具栏+查询区+表格+操作按钮） |
| `list-page-components.template.md` | 列表页详细组件模板（TableHook/ColumnHook/AdvanceQueryHook/操作按钮/删除弹窗） |

---

## 核心设计规律（从现有代码提炼）

### 1. 新增/编辑合一

平台惯用模式：**一个页面同时承担新增和编辑**，通过路由传参 `type` 区分：

```
跳转进来时携带:
  type = 'add'  → 新建模式，显示「新建-保存」按钮
  type = 'edit' → 编辑模式，显示「编辑-保存」按钮，并自动调接口拉取数据
```

页面初始化逻辑在 `componentDidMount` 的 subscribe 里处理。

### 2. 页面结构

```
layoutInfo.componentIds 定义区域：
  TitleSiderExtra  ← 左上角：「返回」按钮
  TitleSider       ← 标题右侧：状态标签（可选）
  TitleTools       ← 右上角：「保存」按钮
  TopMain          ← 顶部工具栏（通常空）
  LayoutMain       ← 主体：放 CardHook
    └── CardHook
          └── {FORM_LAYOUT_ID}  ← 实际表单字段区域
```

### 3. 表单字段布局

采用 Ant Design Grid 栅格，每行 24 列，常见分配：

| 字段数/行 | span 值 |
|----------|---------|
| 4 字段 | 6 |
| 3 字段 | 8 |
| 2 字段 | 12 |
| 1 字段（大输入框/附件）| 24 |

---

## 生成步骤

### Step 1：准备输入信息

用一句话描述需求时，需要提取以下信息：

```
页面名称：     如「采购申请」
实体路径：     如 purchaseReq（接口 /purchaseReq/save、/purchaseReq/update、/purchaseReq/get）
后端服务名：   如 vendor、system、mdconsole
主键字段：     如 reqId
编码字段：     如 reqCode（显示在标题里）
列表页ID：     如 abc123（返回/保存后跳转目标）
字段列表：     如 reqCode(文本,必填), reqName(文本,必填), type(下拉,字典groupCode=reqType), remark(多行文本)
```

### Step 2：生成所有 UUID

每个组件 id、容器 id 都必须是**唯一 UUID**（32位小写十六进制，不含连字符）。

生成方法（JavaScript）：
```javascript
const uuid = () => crypto.randomUUID().replace(/-/g, '')
```

需要生成的 UUID 清单：
- `PAGE_GID`（文件名）
- `FRONT_ID`（表单主 id，最关键）
- `CARD_ID`
- `FORM_LAYOUT_ID`
- `TOOL_CONTAINER_ID`、`EXTRA_CONTAINER_ID`、`LT_CONTAINER_ID`
- 各容器行列 id（ROW_xxx、COL_xxx）
- 各按钮 id（BTN_BACK_ID、BTN_SAVE_NEW_ID、BTN_SAVE_EDIT_ID）
- 每个字段组件的 id

### Step 3：填写字段行

对每个字段，从 `field-components.template.md` 选对应类型，填入：
- `{{COMP_ID}}`：生成的 UUID
- `{{FIELD_NAME}}`：字段名
- `{{FIELD_LABEL}}`：标签（建议 `$${label.xxx}` 或直接中文）
- `{{FIELD_DESC}}`：中文说明
- 按需设置 `showRequiredStar: true`、`singleValidate: ["required"]`

每 4 个字段组成一个 Row（span=6），多行叠加。

### Step 4：组装最终 JSON

1. 用 `add-edit-page.template.json` 作为骨架
2. 将字段行数组填入 `{{FORM_LAYOUT_ID}}.rows`
3. 将所有组件定义追加到 `components` Map
4. 将文件的 `value` 字段 **整体序列化为 JSON 字符串**（因为平台存储格式是 string）

> ⚠️ 注意：最终写入 MdFrontLayout 目录的文件，`value` 字段必须是 JSON 字符串（转义过的），而不是对象。

---

## 一句话生成 Prompt 模板

可以把以下模板作为 System Prompt，配合 LLM 生成：

```
你是一个低代码平台前端 JSON 生成助手。
用户描述一个页面需求，你需要输出符合以下规范的 MdFrontLayout JSON 文件。

规范说明：
1. 文件结构参考 add-edit-page.template.json
2. 字段组件参考 field-components.template.md
3. 所有 id 必须是 32 位小写十六进制 UUID（不含连字符）
4. 最终 value 字段需序列化为 JSON 字符串
5. 新增和编辑共用一个页面，通过 type 参数区分
6. 接口约定：save（新增）、update（修改）、get（查询单条）

用户输入格式：
  页面名称、实体路径、服务名、主键字段、列表页ID、字段列表（字段名、类型、是否必填）

输出：一个合法的 MdFrontLayout JSON 文件内容
```

---

## 示例：考核指标新增/编辑页

| 项目 | 值 |
|------|-----|
| 页面名 | 考核指标 |
| 实体路径 | smcperformanceindex |
| 服务名 | vendor |
| 主键 | indexId |
| 编码字段 | indexCode |
| 列表页 ID | d52af1abcd85448a9663fd66b566312d |
| 字段 | indexCode（文本，必填）、indexName（文本，必填）、valueType（下拉，字典=valueType）、scoreRule（多行文本）、remark（多行文本）、fileInfoList（附件） |

对应已生成文件：`MdFrontLayout/6d7729d854dd45628dd9359644e4afc6.json`（考核指标-新增）

---

## 列表页生成指南

> 核心结构：`CardHook(工具栏新建按钮 + 表格容器) → TableHook(表格主体) + AdvanceQueryHook(查询区)`

### 关键规律

| 规律 | 说明 |
|------|------|
| CardHook.toolButtons | 引用工具栏按钮 UUID（新建） |
| CardHook.toolContainerId | 查询区容器 ID |
| CardHook.layoutId | 表格主体容器 ID |
| TableHook.dataSource | 列表接口 `{method:'post', serverName:'{{serverName}}', url:'{{listUrl}}'}` |
| rowOperationItem | 表格行内操作按钮配置（edit/delete/copy） |
| 删除事件 | `openM` 触发弹窗，非直接删除 |

### 生成步骤

**Step 1 — 准备字段定义**

```json
{
  "pageName": "供应商信息",
  "serverName": "vendor",
  "listUrl": "/vendor/list",
  "functionGid": "xxxxxxxx",
  "addEditPageId": "xxxxxxxx",    // 新增/编辑页 Layout gid
  "columns": [
    { "field": "vendorName", "headerName": "$${label.vendorName}", "width": 150, "sort": "none", "fuzzyQuery": true },
    { "field": "vendorCode", "headerName": "$${label.vendorCode}", "width": 120, "sort": "none", "fuzzyQuery": true }
  ],
  "operations": ["edit", "delete", "copy"]
}
```

**Step 2 — 生成 UUID（每个组件独立 UUID）**

| 组件 | UUID 用途 |
|------|---------|
| `{{addButtonId}}` | 工具栏新建按钮 |
| `{{editButtonId}}` | 行内编辑按钮 |
| `{{deleteButtonId}}` | 行内删除按钮 |
| `{{copyButtonId}}` | 行内复制按钮 |
| `{{colHookId}}` | 每个列字段的 ColumnHook（与 TableHook.columns 互为引用） |
| `{{queryId}}` | AdvanceQueryHook |
| `{{tableId}}` | TableHook 主 ID |

**Step 3 — 组装 TableHook.columns**

序号列（固定）+ N 个数据列（循环）+ 操作列（固定）：

```json
// 序号列
{"width":94,"checkboxSelection":true,"headerClass":"serialNum","headerName":"序号",
 "pinned":"left","field":"serialNum","colId":"operationLeft","headerCheckboxSelection":true}

// 数据列（按字段循环）
{"level":"","width":120,"resizable":true,"headerName":"$${label.vendorName}",
 "field":"vendorName","colId":"{{colHookId}}","description":"供应商名称","sort":"none"}

// 操作列（固定，最右侧 pinned:right）
{"cellRenderer":"renderOperation","width":200,"headerName":"操作",
 "pinned":"right","field":"operation","colId":"operationRight"}
```

**Step 4 — 按钮事件**

- **新建按钮**：pubsub.publish('@@navigator.push', url={{addEditPageId}}, type='add')
- **编辑按钮**：pubsub.publish('@@navigator.push', url={{addEditPageId}}, type='modify', data=eventPayload.rowData)
- **删除按钮**：pubsub.publish('{{listFrontId}}.openM', id={{confirmModalId}}, type='delete', data=eventPayload.rowData)
- **复制按钮**：pubsub.publish('@@navigator.push', url={{addEditPageId}}, type='copy', data=eventPayload.rowData)

### 列表页 LLM Prompt 模板

```
你是一个低代码平台前端 JSON 生成助手。
请根据以下信息生成一个列表页的 MdFrontLayout JSON 文件：

页面名称：{{pageName}}
功能 gid：{{functionGid}}
服务名：{{serverName}}
列表接口：POST {{listUrl}}
关联的新增/编辑页 Layout ID：{{addEditPageId}}
表格列（field/headerName/width/sort/fuzzyQuery）：{{columns}}
行内操作：{{operations}}

生成规则：
1. 使用 v50.Base 自由布局，layoutInfo.componentIds = ["LayoutMain"]
2. 最外层 CardHook 包含 toolButtons（新建按钮）和表格
3. TableHook.rowOperationItem 对应行内操作按钮
4. 按钮事件：新建/编辑/复制用 @@navigator.push，删除用 openM 弹窗
5. 表格 dataSource: {method:'post', serverName:'{{serverName}}', url:'{{listUrl}}'}
6. 所有 label/button 用 $${label.xxx} / $${button.xxx} 占位
7. 最终 value 字段需序列化为 JSON 字符串
```

### 典型页面参考

- 简单列表：`MdFrontLayout/2db8a4a31d7f4765a05184117ca3f562.json`（供应商模板配置-列表）
- 复杂列表（含高级查询+行内操作）：`MdFrontLayout/c86ac7f6704f494790f391a4c06df9e6.json`（供应商池-列表）

