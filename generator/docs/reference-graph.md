# 引用图谱与孤儿组件判据

> 这份文档回答一个问题：**一个组件注册在 `components` 里，怎么判断它到底有没有被用到？**
>
> 判错的代价不是「多报一个警告」—— 而是用户开始整条规则都不看。本轮修复前，
> 401 份语料里有 **1104 个**组件被判为孤儿，其中 **370 个是误报**（33.5%）。

---

## 1. 为什么这个判据值得单独成文

`components` 映射是低代码页面的组件注册表。设计器保存时会把**曾经创建过、后来从布局里删掉**
的组件留在表里 —— 它们不显示、不生效，但占着 id 和体积，还会让人误以为页面有这个功能。

ID004 就是用来找这些编辑残留的。但它有个天然难点：

> **「没被用到」不是一个字段，而是四条互不相干的路径的并集。**
> 漏掉任何一条，那条路径上的组件就全变成假孤儿。

而且这四条路径**没有任何文档**。它们是从 401 份语料里反推出来的。

---

## 2. 四条路径（全部来自语料实测）

| # | 路径 | 判据 | 语料量级 |
|---|---|---|---|
| ① | **容器挂载点** | `layoutList.<区域>.rows[*].cols[*].components[]` 里的字符串 id | 覆盖绝大多数组件 |
| ② | **引用规格表** | `ir.references`（`referenceSpec.js` 的 21+1 条规则） | 7435 处 |
| ③ | **事件寻址** | `<本组件id>.<事件名>` 出现在**别人**的 `event` 字段里 | 当前 0 例 |
| ④ | **约定命名** | `<父组件id>-okBtn` 由父组件按后缀取用，不显式引用 | 1182+1339 处 |

③ 的「当前 0 例」需要解释 —— 见 §4.3。

---

## 3. 实测：1104 个候选的构成

修前（`ID004` 命中 1104 条），按「它到底出现在哪些位置」拆分：

| 位置组合 | 条数 | 判定 |
|---|---:|---|
| 只有自身定义（`property.id`） | **649** | ✅ 真孤儿 |
| `rowOperationItem[].id` + 自我订阅 | **349** | ❌ 误报 —— 行操作按钮 |
| 只有自我订阅 | 47 | ✅ 真孤儿（有 handler 无挂载） |
| 表达式 + 自我订阅 | 20 | ✅ 真孤儿（多在注释里） |
| `rowOperationItem[].id` | **16** | ❌ 误报 |
| 只有表达式 | 13 | ✅ 真孤儿 |
| `columns[].colId` + 其它 | **5** | ❌ 误报 —— 手写 id 被过滤 |
| `columns[].colId` + 表达式 | **4** | ❌ 误报 —— 草稿区引用（见 §6） |
| 其它 | 1 | — |

**合计 370 条误报。** 按组件类型看：`ButtonHook` 364、`EditTableColumnHook` 9、`BtnOperationDetails` 1。

修后：1104 → **734**（`calibrate` 建议数 3499 → 3129）。

---

## 4. 修了什么

### 4.1 `TableHook.rowOperationItem[].id` 漏在规格表外（364 条误报）

**这是最大的一处。** 编辑表格的行操作按钮（编辑 / 删除 / 复制 / 自定义）由表格组件
**按行动态渲染**，天然**不经过容器挂载** —— 它们只被 `rowOperationItem[].id` 引用。

实测画像：

```
宿主        TableHook            367 条
取值形态    100% 是 32 位 hex
resolve     命中 365 / 悬空 2   (99.45%)
```

而 `referenceSpec.js` 的**注释里写了这条**（`rowOperationItem[].id -> componentId 1440 / 0`），
**但规则表里没有对应的条目** —— 注释与实现脱节，是最容易骗过 review 的一类缺陷。

> **教训**：规格表里的行数不等于覆盖的字段数。注释里提到的统计数字必须能在表里找到对应条目。

### 4.2 规格表只认 `hex32`，手写 id 的引用被滤掉（5 条误报）

`extractReferences` 原来的过滤是：

```js
if (typeof v !== 'string' || !HEX32.test(v)) return;   // 只认 32 位 hex
```

语料里存在手写 id 的组件（如 `operationLeft`），被 `columns[].colId` 正常引用，
但因为不是 hex32 形态而被直接滤掉 → 该组件被判孤儿。

改成：

```js
if (!HEX32.test(v) && !resolves) return;   // 既非 id 形态、又命中不了目标 → 才忽略
```

这个放宽是**零风险纯增益**的：

| 情况 | 旧行为 | 新行为 |
|---|---|---|
| 32 位 hex | 记录（可能悬空→报错） | 不变 |
| 非 hex 但能命中目标 | **忽略**（漏掉真引用） | 记为已解析 |
| 非 hex 且命中不了 | 忽略 | **仍然忽略**（不引入虚假悬空） |

第三种是关键 —— 若不设这个条件，`colId: "操作列"` 之类的普通标签会变成大量虚假悬空。

### 4.3 事件寻址必须排除「自我订阅」（67 条不受影响，但判据补全）

订阅条目的 `event` 在语料里**恒为** `<组件id>.<事件名>`，100% 可解析：

```
<hex32>.<事件名>        2673
<hex32>-xxx.<事件名>     704   约定命名 id
<hex32>.                  56   事件名漏写
```

所以「谁被订阅」很容易算出来。**但**实测发现：

> 指向孤儿的 **416 次寻址，全部是组件订阅自己**（`<自己id>.click`），他人订阅 **0 例**。

这决定了修法的方向：

- **自我订阅不能算「被引用」** —— 一个未挂载的按钮留下「有 click handler 却没有挂载点」，
  恰恰是它成为编辑残留的证据。若把自我订阅也算进去，67 个真孤儿会被静默放过。
- **他人订阅必须算「被引用」** —— 当前语料 0 例，但判据不完整就是将来的坑。
  实现上要把「自我寻址」与「他人寻址」分开，前者不计入。

顺带把「孤儿」分成两类，让提示更有用：

```
孤儿组件 ButtonHook(xxx) 未被任何挂载点或引用使用
孤儿组件 ButtonHook(xxx) 未被任何挂载点或引用使用，但自带 1 条事件订阅
                              ↑ 有逻辑却忘了挂载，比纯残留更值得看一眼
```

---

## 5. ★ 什么**不该**收录（反例清单）

这一节比上面更重要 —— 因为「补字段」的诱惑很大，而**泛化的代价是 1000+ 条误报**。

审计脚本（`npm run audit:refs`）会列出所有「未进表但值像引用」的组合。
它们**全部命中 0**，即目标组件根本不在 `components` 里：

| 字段 | 条数 | 真相 |
|---|---:|---|
| `SelectHook.multiColsConfig[].id` | 395 | 多列配置项的**局部标识** |
| `EditTableColumnHook.cellType.multiColsConfig[].id` | 140 | 同 |
| `EditTableHook.columns[].cellType.multiColsConfig[].id` | 120 | 同 |
| `FindbackHook.associatedFields[].id` | 112 | 关联字段的局部 id |
| `TabsHook.tabPanels[].id` | 65 | 面板局部 id ← **同层的 `layoutId` 才是引用，已进表** |
| `FindbackHook.tableInfo.columns[].colId` | 60 | 内嵌表格的局部列定义 |
| `FindbackHook.multiColsConfig[].id` | 41 | 局部标识 |
| `FindbackHook.tableInfo.id` | 30 | 内嵌表格局部 id |
| `EditTableColumnHook.cellType.associatedFields[].id` | 27 | 局部 id |
| `TableHook.columns[].cellType.multiColsConfig[].id` | 20 | 局部 id |
| `GridFieldTable.columns[].cellType.multiColsConfig[].id` | 20 | 局部 id |
| `EditTableColumnHook.cellType.tableInfo.columns[].colId` | 18 | 内嵌表格局部列 |
| `ColumnHook.columnsType.url` | 15 | URL 里内嵌的 id（如 `?id=xxx`），不是组件引用 |
| `EditTableHook.operationSet[].id` | 11 | 操作集局部 id |
| `SwitchCardHook.panes[].id` | 9 | 面板局部 id（`layoutId` 已进表） |
| `GridFieldTable.operationSet[].id` | 8 | 局部 id |
| `DropdownButtonHook.actionList[].id` | 7 | 菜单项局部 id |
| `GridFieldTable.secondaryTable.columns[].colId` | 5 | 内嵌表格局部列 |
| `TableHook.tableInfo.columns[].colId` | 4 | 内嵌表格局部列 |
| `ButtonHook.actionConfig.metaId` / `moduleId` | 1 + 1 | 平台元数据 |

**结论：`id` 命名 ≠ 引用。**

平台自己就在大量使用 `*.id` 作为**容器内的局部键**（配置项、面板、字段、内嵌表格）。
唯一「以 id 命名却确属组件引用」的字段是 `rowOperationItem[].id` —— 因为它是
**由宿主组件按行动态渲染的另一个组件**，语义上等同于 `columns[].colId`。

**不要**因为看到 `id` 里有 32 位 hex 就收录。判据只能是「**目标是否真的存在于 `components`**」。

---

## 6. 已知边界

| 边界 | 影响 | 为什么不覆盖 |
|---|---|---|
| `draftComponents`（草稿区） | 4 个组件 | 未应用的草稿，不是运行时主路径；为此引入一层扫描不划算 |
| `phone` / `pad` 移动端镜像树 | — | 同上 |
| `layoutList` 内联组件副本 | 不影响 | 实测 3916 个副本 100% 与注册表逐字节相同，扫了只会重复报 |
| 表达式里的 id（含注释） | 50 条仍报孤儿 | 表达式是裸 JS，**注释掉的代码里的 id 无法与在用代码静态区分**，宁漏不误 |

---

## 7. 怎么复核

```bash
cd generator

# ① 规则表完整性：列出所有「未进表但值像引用」的组合，并标出命中 > 0 的真引用
npm run audit:refs

# ② 孤儿判据的端到端效果
npm run calibrate        # 看 ID004 命中数（当前 734）
npm test                 # check.test.js 里有 7 项 ID004 判据的锁定测试
```

`test/check.test.js` 里锁定的 7 个场景：

1. 被 `rowOperationItem[].id` 引用的行操作按钮**不报**孤儿（列表页夹具天然带 4 个）
2. 完全无引用的组件**报**孤儿，且 `selfSubscribes` 不为 0
3. **自我订阅不算被引用**，但在提示里区分出来
4. **他人事件寻址算被引用**（语料 0 例，判据仍需完整）
5. 手写 id（非 hex32）的引用**被抽出**
6. 普通字符串**不被**当成引用（防泛化）
7. `rowOperationItem[].id` 悬空可被检出（`REF002`）

---

## 8. 这次修法的两个设计决策

**① 把「订阅写在哪里」抽成共享模块 `check/subscribeScan.js`**

`action` 组（校验发布条目）与 `identity` 组（判断孤儿）都需要「遍历全部订阅」这一能力。
两套实现必然分叉 —— 而分叉点正是过去踩过的坑（只扫页面级漏 3758 条 / 枚举嵌套位置漏新形态）。
共享模块里写清了三条铁律与覆盖范围（3433/4622 = 74.3%）。

**② 规格表与实现的脱节要能被工具发现**

`rowOperationItem` 那条注释骗过了 review（注释里有，表里没有）。
`auditReferences.js` 的价值就是让这类脱节**每次都能被自动查出来**，
而不是等某个组件被误报成孤儿才暴露。
