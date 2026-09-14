# 项目长期记忆（rdc-develop / 低代码 Layout 生成器）

## 项目本质
`generator/` 是低代码平台的**产物生成器**：把 DSL 语义描述编译成 `MdFrontLayout/*.json`，
由**不受自己控制**的运行时引擎（`front_web` / `neusoft_web`）渲染成 React 页面。
引擎遇到断引用会**静默渲染空白、不报错** —— 这是为什么必须自建契约校验的主要动因。

## 目录职责
| 目录 | 职责 |
|------|------|
| `ir/` | Page IR：`Layout JSON ⇄ 语义中间表示` 双向无损（`lift` / `emit` / `roundTrip`） |
| `check/` | 契约校验引擎，45 条规则 / 6 组，诊断带 `code/severity/path/message/hint` |
| `builder/` | DSL Builder 与组件工厂；`validator.js` 是转发到 `check` 的兼容层 |
| `parser/` | `designerToConfig`：设计器 JSON → DSL config 反解析 |
| `scripts/` | 语料统计、往返回归、规则标定、部署、批量生成 |

## 硬性约定（改动前必读）

### 1. 序列化幂等
**同一实例多次 `toJSON()` 必须逐字节一致。`uuid()` 严禁在 `toJSON()` 里生成**，
必须放在构造函数或 memoize。否则「内联副本」与「注册副本」的 id 会分叉，
往返测试（`value` 逐字节一致）立刻失败。

### 2. 列的两段式注册
表格类组件的列是「内联描述 + `colId` 指向注册条目」。`components` 里**只放注册条目**，
内联描述混进去就会产生「缺少 type」的脏条目（`ID006`）。

| 组合 | components 中注册类型 | 内联描述来源 |
|------|----------------------|--------------|
| `TableHook` + `ColumnHook` | `ColumnHook` | `ColumnHook.toTableColumn()` |
| `EditTableHook` + `EditTableColumnHook` | `EditTableColumnHook` | `EditTableColumnHook.toTableColumn()` |
| `GridFieldTable` + `GridFieldTableColumn` | **`EditTableColumnHook`** | `GridFieldTableColumn.toTableColumn()` |

两类表格均**无条件前置序号列**（`field` / `colId` 都是 `rowSerialNum_EditTable`，与 `showSerial` 无关）：
```js
{ display: true, width: 100, checkboxSelection: true, resizable: false,
  rowDrag: false, headerName: '', pinned: 'left',
  field: 'rowSerialNum_EditTable', colId: 'rowSerialNum_EditTable',
  headerCheckboxSelection: true }
```

### 3. 语料是唯一事实来源
组件类型、属性白名单、引用表**不手写**，一律由 401 份真实 `MdFrontLayout` 挖掘，
再用 `npm run calibrate` 标定级别。**`error` 级别必须在真实语料上零误报**，
宁降级为 `warning` / `info`，也不要制造噪音。

### 4. 字段绑定 key
表单组件用 `filed`（设计器的拼写，不是 `field`）；表格列用 `field`。

### 5. 语料探针的坑
`Layout JSON` 的 `value` 字段是**字符串**不是对象 —— 必须 `JSON.parse(raw.value)` 才能读
`desktop.components`。另外 `span` 在语料里是字符串 `"6"`，比较前先 `Number()`。

### 6. 跨布局引用一律用 frontId（**最容易踩的坑**）
`MdFrontLayout/<gid>.json` 的**文件名是 gid**，而运行时解析跨布局引用用的是 **frontId**，
两者不通用。填错命名空间或留占位符/随机 uuid，运行时查不到目标布局，会把空节点交给
`RenderLayout`，抛：

```
TypeError: Cannot read properties of undefined (reading 'field')   // RenderLayout(e): e.layoutInfo.field
```

语料（401 份）逐字段统计出的命名空间表：

| 引用字段 | 命名空间 | 命中 |
|---|---|---|
| `.openM` 载荷的 `id` | **目标布局 frontId** | frontId 358 / gid 0 |
| `@@navigator.push` 的 `url` | **目标布局 frontId** | frontId 716(+20 带尾随 tab) / gid 0 |
| `.openM` 的事件命名空间 | 本页 frontId | 323/335 |
| `CardHook.layoutId` / `toolContainerId` | regionId | 1942 / 1862，零悬空 |
| `CardHook.ltContainerId` / `extraContainerId` | regionId（可空） | 147 / 154，语料本身大量悬空 |
| `AdvanceQueryHook.associateId` | componentId | 884 |
| `rowOperationItem[].id` / `toolButtons[]` | componentId | 1440 / 640 |
| `layoutInfo.componentIds[]` | regionId 或预设槽位名 | 837 + 203（如 `BottomLeft`） |

约定与守门：
- 引用参数命名 `addEditPageFrontId` / `confirmModalFrontId` / `listPageFrontId`
  （旧名 `addEditPageId` / `confirmModalId` / `listPageId` 仍兼容）
- **禁止**用 `uuid()` 给布局引用兜底：随机 uuid 会伪装成「看起来合法」的悬空引用，静态检查发现不了
- `builder/events.js: assertLayoutFrontId()` 是唯一守门点，`buildListPage` / `buildAddEditPage` /
  `buildViewPage` / `buildModal` 都走它；形态非法直接抛 `E_LAYOUT_REF`
- 「全同一字符」（`0000…` / `2222…`）视为**未替换的占位符**：允许生成，由 `REF004`/`REF006`
  以 warning 指出 —— 示例里故意这么写，好处是「显眼」而不是伪装
- 弹窗自身 frontId 也必须是 32hex，否则列表页永远引用不到它

### 7. `.openM` 有两种出现方式（区分不清会大面积误报）
- **带载荷的发布**（`...openM', { id: ... }`）335 处 → 才是「打开弹窗」，要校验目标
- **纯事件名**（`"<uuid>.openM"`）441 处 → 订阅侧引用，没有 id 可言，必须跳过

早期没区分，`REF006` 在语料上炸出 312 条 error 误报。

### 8. 「可解析 ≠ 正确」
只补 JSON 闭合符能让文件变得可解析，但补错位置会把 `phone`/`pad` 塞进 `desktop`、
把 `layoutInfo` 吞掉 —— 结构错位后运行时照样抛上面那个 TypeError。
`scripts/repairValueJson.js` 因此设了两道门（结构不变量 + check 零 error），
不过就拒绝写入、只输出诊断。

## 回归门禁（每次改动后必跑）
```bash
cd generator
npm test              # 12 个测试文件，含 401 语料往返 + 45 条规则正反例 + frontId 契约
npm run check:all     # examples/ 下全部示例
npm run roundtrip     # 必须保持「value 逐字节一致: 401」
npm run calibrate     # error 级别必须仍为零误报
```

## 当前基线
- 语料：`MdFrontLayout` 401 个 / `MdFunction` 44 个 / `parsed-dsl` 反解析 401 个（100%）
- 往返：401/401 `value` 逐字节一致
- 校验：语料上仅 15 条 error（`REF002` 2 / `DS001` 7 / `DS002` 3 / `DS003` 3），已人工确认为真实缺陷
- 生成产物（`generated/*-generated.json`）内层 JSON 全部合法、check 零 error
- **例外的两个坏文件**：`generated/inquiry-list-page.json`、`generated/inquiry-delete-modal.json`
  （5/13 手写参照样例，非生成器产物）结构上**缺整块内容**，补括号无法安全修复，
  只能人工补或重新生成；`scripts/deploy.js` 会拦住它们

## 待办
- 把 `check` 的诊断接入设计器前端，做实时契约提示
- `rdc-ai-agent-backup.bundle` 落后于 HEAD，需要重新 `git bundle create`
- deploy 脚本仅在测试临时目录验证过，**尚未对真实项目目录执行过部署**
- 本轮改动量较大（`ir/`+`check/`+frontId 守门），**尚未 git commit**
