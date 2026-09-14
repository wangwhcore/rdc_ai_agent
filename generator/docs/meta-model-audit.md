# 元模型反推审计

> 用 401 份真实 Layout JSON 反推「现有 JSON 到底能表达什么」，把「V1 该新增哪些概念」
> 从**想象力问题**变成**统计问题**。
>
> 生成方式：`npm run audit:meta`（脚本 `scripts/auditMetaModel.js`，只读，不落盘业务文件）
> 原始统计：`ir/metaModelAudit.generated.json`
> 语料：`MdFrontLayout/` 401 个文件，成功解析 401，失败 0

---

## 0. 这份报告在回答什么

外部提议的 V1 DSL 规范列了 **16 个并列 DSL**（Page / List / Form / Detail / Component /
DataSource / Data / Context / Event / Condition / Action / Flow / Permission /
Page Dependency / Extension / JSON Schema）。

在采纳之前必须先回答一个问题：**现有 JSON 是不是真的「表达不了」**？

本报告用三条判据来证伪或证实：

| 判据 | 含义 | 对应结论 |
|---|---|---|
| 同一语义有 ≥2 种在用写法 | 不是表达不了，是**没统一** | 收敛项 —— 不该新增概念 |
| 字段 100% 存在但从未承载语义 | 该字段对应的概念**不是真实需求** | 不新增，甚至该删字段 |
| 裸 JS 逃生舱里的高频模式 | 这才是**真正表达不了**的地方 | 新增候选 |

---

## 1. 结构层面：11 个「必填」键里 6 个从未承载语义（54.5%）

`value.desktop` 下有 11 个键在 **401/401** 文件里都存在。但把「存在」「浅层非空」
「递归非空」三档分开看，结论完全变了：

| 键 | 存在 | 浅层非空 | 递归非空 | 判定 |
|---|---|---|---|---|
| `components` | 100% | 100% | **100%** | ✅ 真载体 |
| `layoutInfo` | 100% | 100% | **100%** | ✅ 真载体 |
| `layoutList` | 100% | 100% | **100%** | ✅ 真载体 |
| `subscribes` | 100% | 85.3% | **85.3%** | ✅ 真载体 |
| `validates` | 100% | 7.0% | **7.0%** | ⚠️ 少数在用 |
| `canvas` | 100% | 99.8% | **0%** | ✗ 占位空壳 |
| `graphic` | 100% | 100% | **0%** | ✗ 占位空壳 |
| `reference` | 100% | 0% | **0%** | ✗ 恒为空串 `""` |
| `flows` | 100% | 0% | **0%** | ✗ 恒为 `[]` |
| `validateList` | 100% | 0.2% | **0%** | ✗ 实际不可用 |
| `defaultDataSource` | 100% | 0% | **0%** | ✗ 声明但从未赋值 |

**「浅层非空」会骗人。** `canvas` 形如 `{ containers: {}, components: {} }` —— 有两个键，
所以浅层判定为「非空」，但递归下去一个叶子都没有。这正是生成器最容易写错的地方：
**字段存在 ≠ 字段有用。**

**结论：必须维护的结构里，一半以上是空壳。** 继续在这份 JSON 上打补丁，意味着
一半的补丁工作量花在维护从不承载语义的字段上。

---

## 2. 页面类型是「模板维度」，不是 list / form / detail

`layoutInfo.field` 是真实的页面原型名，分布极不均衡：

| field | 文件数 | 占比 |
|---|---|---|
| `LayoutSimpleModal` | 268 | 66.8% |
| `v18.Info` | 85 | 21.2% |
| `v50.Base` | 35 | 8.7% |
| `LeftFreeRightFreeModel` | 9 | 2.2% |
| `FreeLayoutNoToolBarModel` / `v18.List` / `v18.Result` / `v50.Info` | 各 1 | 各 0.2% |

**8 个模板，其中一个占 67%。** 而且注意：`v18.List` 全语料只有 **1 个** ——
所谓「List DSL」在真实产物里几乎不存在。

页面差异体现在**模板名**上，与 `list / form / detail` 这套语义维度**正交**。
`layoutInfo.type` 另有一套取值（`layout` 等），是第二个维度。

> 这与 `ir/lift.js` 里 `PAGE_KINDS = ['list','add','edit','view','simple','modal','unknown']`
> 是**推断出来的 kind**，与语料里的 `field`（模板名）不是一回事。两者都需要保留，
> 但「7 种 kind = 7 个 DSL」的推论不成立 —— 它们本来就是同一个 `View` 的判别式。

同原型内部的键一致性也要看：

| 原型 | 文件数 | desktop 键数 | 不稳定键 |
|---|---|---|---|
| `LayoutSimpleModal` | 268 | 13 | 1（`updateTime` 34.7%） |
| `v18.Info` | 85 | 20 | 6（`updateTime` 75.3%、`$formDataSource` 17.6%、`customStyle` 8.2%…） |
| `v50.Base` | 35 | 16 | 5（`formCache` 71.4%、`updateTime` 71.4%…） |

同模板下键集合不稳定，说明**「必填」这件事在现有产物里没有真正被约束住**。

---

## 3. 同义键名收敛表：9 组里 8 组是「多写法」

这是最关键的一张表。按语义分组统计「有 ≥5 个文件在用的写法」数量：

| 语义 | 在用写法数 | 具体写法（文件数） | 判定 |
|---|---|---|---|
| **动作 / 编排** | **6** | `pubs`(399) `action`(395) `actionConfig`(394) `behaviors`(324) `successPubs`(287) `errorPubs`(258) | ⚠️ 最严重 |
| **表单校验** | **7** | `validates`(401→28 有值) `validateList`(401→1) `singleValidate`(195) `validate`(56) `max`(18) `min`(18) `rules`(16) | ⚠️ |
| **跨页引用** | **5** | `reference`(401→恒空) `url`(362) `anchorTarget`(318) `pageId`(271) `link`(192) | ⚠️ |
| **样式** | **5** | `style`(401) `tagStyle`(401) `theme`(395) `customStyle`(269) `className`(7) | ⚠️ |
| **布局容器** | **5** | `layoutInfo`(401) `layoutList`(401) `canvas`(401→空) `graphic`(401→空) `containers`(401→空) | ⚠️ |
| **条件显示** | **3** | `visible`(401) `disabled`(125) `display`(56) | ⚠️ |
| **数据源** | **2** | `defaultDataSource`(401→空) `dataSource`(366) | ⚠️ |
| **事件订阅** | **2** | `subscribes`(401→342 有值) `event`(399) | ⚠️ |
| **权限** | **0** | — | ✓ 但这意味着**零需求** |
| **流程编排** | **1** | `flows`(401→恒空) | ✓ 但字段是死的 |

同时记录了**提议里但语料从未出现**的键名：

```
dataSources, dataSourceList, service, api, subscribe, events, listeners, listener,
actions, callback, hidden, condition, conditions, showWhen, show, dependOn, linkage,
required, regexp, pattern, layoutRef, targetId, href, styles, css, class, inlineStyle,
permission, permissions, auth, roles, role, guard, acl, privilege,
flow, workflow, steps, sequence, pipeline, regions
```

**这些全是凭想象设计的名字。** 真实运行时认的是另一套。

### 3.1 权限：401 份语料零命中

`permission` / `permissions` / `auth` / `roles` / `role` / `guard` / `acl` / `privilege`
在 **401 份真实产物里一次都没出现过**。

结论：**Permission 不是页面 JSON 层的需求**，权限在平台侧（菜单/接口鉴权）完成。
把它设计成 V1 的一个顶层概念，是在解决一个不存在的问题。

---

## 4. 事件 / 动作 / 编排的真实机制

### 4.1 `flows` 是死的，编排靠事件链

| 机制 | 覆盖 |
|---|---|
| 页面级 `desktop.subscribes` | **342 / 401（85.3%）** |
| `desktop.flows` | **0 / 401** —— 401/401 全是 `[]` |

`flows` 字段在每一份产物里都存在、且**每一份都是空数组**。

真实的「编排」靠 `subscribes` 的条目结构完成：

```jsonc
{
  "event": "<组件id>.<触发时机>",       // 触发
  "name": "可读名",
  "behaviors": [                        // 动作
    {
      "type": "request",                // 动作类型：语料里 100% 是 request
      "dataSource": { "type":"api", "serverName":"vendor", "method":"get", "url":"/..." },
      "successPubs": [ { "event": "...", "eventPayloadExpression": "<裸JS>" } ],
      "errorPubs":   [ { "event": "...", "eventPayloadExpression": "<裸JS>" } ]
    }
  ],
  "pubs": [ { "event": "...", "eventPayloadExpression": "<裸JS>" } ]
}
```

`successPubs` / `errorPubs` 就是「上一步成功后做什么」—— **这就是 Flow**。
它不是独立字段，是事件发布链。

**结论：Flow 不构成独立概念，应并入 Behavior。**

### 4.2 触发时机：绝大多数是「挂载时」

`subscribe.event` 后缀分布：

| 触发时机 | 次数 | 性质 |
|---|---|---|
| `componentDidMount` | **334** | 标准生命周期 |
| `file` | 45 | 自定义事件名 |
| `getMainInfo` | 38 | 自定义 |
| `reload` | 25 | 自定义 |
| `getDraft` | 19 | 自定义 |
| `log` | 16 | 自定义 |
| `getTabNums` | 14 | 自定义 |
| `getNum` | 12 | 自定义 |

唯一的**标准**触发时机是 `componentDidMount`（334 次）。其余都是设计器里手填的名字。

**这意味着：现有语料里几乎没有「交互式联动」，全是「页面挂载 → 拉数据 → 处理后置数据」。**
用户举例的那种「选供应商 → 拉联系人 → 选联系人 → 拉地址」的交互链，
在这 401 份真实产物里**没有对应实例**。

### 4.3 组件级才是主表达位置

| 位置 | 覆盖 |
|---|---|
| 组件 `property.visible` | **401 / 401（100%）** |
| 组件 `property.subscribes` | **397 / 401（99.0%）** |
| 组件 `property.action` / `actionConfig` | **395 / 401（98.5%）** |
| 页面级 `desktop.subscribes` | 342 / 401（85.3%） |

（真属性在 `components[].property` 里；`components[]` 外层只有 `type` + `property` 两个键。）

组件级 `visible` 用量 top：`ButtonHook`×2037、`TextHook`×1307、`EditTableColumnHook`×907、
`CardHook`×459、`SelectHook`×370。

**结论：事件 / 动作 / 条件的表达重心在组件上，不在页面上。** 生成器的第一优先级
是把组件 `property` 写对，页面级机制是辅助。

---

## 5. Resource（数据源）形态

- 出现次数：**3310**
- `type`：`api` 3090、`customValue` 151、无 69
- `method`：`post` 2365、`get` 723、无 222
- `serverName`：`mdgeneric` 1329、`vendor` 1306、无 220、`mdconsole` 167、`mdorg` 143、`system` 93、
  `appServer` 19、`consoleServer` 9、`qsc` 8、`inquiry` 7、`contract` 3……
- `defaultDataSource`：401/401 文件声明，**非空 0** ← 死字段

### 5.1 关键发现：零参数化 URL

| url 形态 | 数量 |
|---|---|
| 根相对路径 | 3083 |
| 非字符串 | 223 |
| 相对路径 | 4 |
| **含 `{}` / `${}` 占位符** | **0** |

**3310 个数据源里，没有一个 URL 是参数化的。** 所有参数传递都发生在
`eventPayloadExpression` 的裸 JS 里。

这解释了为什么「接口联动」在现有 JSON 上做不出来 —— **声明式的参数通道根本不存在**。

---

## 6. 组件与属性契约面

- 组件类型：**47 种**
- 类型分布 top：`ButtonHook` 2041、`ColumnHook` 2016、`TextHook` 1307、
  `EditTableColumnHook` 909、`CardHook` 459、`SelectHook` 370、`TextAreaHook` 328、
  `TableHook` 326、`SpanHook` 285、`AdvanceQueryHook` 225、`EditTableHook` 141
- 属性键 top：`id` 9251、`description` 9228、`visible` 7217、`componentTypeName` 7155、
  `subscribes` 6269、`enabled` 5960、`tagStyle` 5805、`propType` 4721、`anchorTarget` 4083、
  `title` 3671

**长尾属性键**（仅 1 个文件使用）是契约风险区，例如：

```
source, fillField, minItemWidth, maxItemHeight, placement, fileName,
checkedChildren, checkMode, unCheckedChildren, searchValidate, customMultiLang,
cardColsNumber, winningBid, lineNumberInCard, notWrapInCard ...
```

这些「每个只出现一次」的键，正是**契约漂移**的温床 —— 生成器不知道它们存不存在、
该不该生成，而它们又确实在真实产物里出现过。

---

## 7. 逃生舱规模：这是「真正表达不了」的证据

对全部 `*Expression` / `expression` 字段做静态分析：

| 指标 | 值 |
|---|---|
| 表达式总数 | **11320**（其中空 1378） |
| 含换行（多语句块） | **7632（67.4%）** |
| 长度 p50 / p90 / p99 / max | **122 / 956 / 3497 / 13102** 字符 |

裸 JS 模式频次：

| 模式 | 命中次数 | 涉及表达式数 |
|---|---|---|
| `var` / `let` / `const` 声明 | 7134 | 2535 |
| `if` 条件分支 | 7119 | 2663 |
| **`console.log` 调试输出** | **5327** | **3644** |
| **`callback(` 回调** | **5120** | **4633** |
| `forEach` / `map` / `filter` | 1982 | 946 |
| 长度 / 类型判断 | 1066 | 743 |
| `JSON.parse` / `stringify` | 780 | 690 |
| 接口调用（`ajax`/`fetch`/`.get`…） | 514 | 364 |
| 字符串处理（`replace`/`split`/`join`） | 457 | 314 |
| 三元表达式 | 308 | 204 |
| `for` / `while` 循环 | 269 | 192 |
| `try` / `catch` | 28 | 27 |

### 7.1 `desktop.validates` 是第二处逃生舱

`desktop.validates` 在 401/401 文件里都是**字符串**（不是对象），28 个文件非空，
内容是校验函数的裸 JS：

```js
let formVv = values.toJS();
if (formVv != undefined) {
    if (formVv.registeredCapital != undefined && formVv.registeredCapital != "") {
        if (!/^[+]{0,1}(\d+)$|^[+]{0,1}(\d+\.\d+)$/.test(formVv.registeredCapital)) {
            errors.registeredCapital = "$${Common.tip.mustGreaterZero}"
        }
    }
    ...
}
```

**同一语义（表单校验）有两种位置**：组件级声明式 `singleValidate`（195 文件 / 5817 次）
与页面级裸 JS `validates`（28 文件）。

---

## 8. 冗余位置：同一份数据的多个存放点

| 位置 | 有内容 |
|---|---|
| `desktop.components` | **401 / 401** |
| `desktop.canvas.components` | **0 / 401**（401 份全空） |
| `desktop.layoutList` | **401 / 401** |
| `desktop.canvas.containers` | **0 / 401**（401 份全空） |

`canvas` 是一具**空壳**，里面装着两份永远为空的镜像容器。
**这是生成器最容易误写的地方** —— 写了 `canvas.components` 会静默失效，没有任何报错。

---

# 三张清单

## A. 不新增（被数据否决）

| 提议的概念 | 数据 | 结论 |
|---|---|---|
| **Flow DSL** | `desktop.flows` 401/401 恒为 `[]`；编排实际由 `subscribes` 的 `behaviors` + `successPubs`/`errorPubs` 承担 | **不新增。** 编排并入 Behavior；`flows` 字段删除 |
| **Permission DSL** | `permission`/`auth`/`roles`/`guard`/`acl`… **401 份零命中** | **不新增。** 权限在平台侧，不在页面 JSON |
| **Detail DSL** | 无独立语义；页面差异体现在 `layoutInfo.field` 模板名 | **不新增。** 并入 View 的模板维度 |
| **Data DSL**（独立于 DataSource） | `type` 只有 `api`(3090) / `customValue`(151) 两类 | **不新增。** 并入 Resource |
| **Page Dependency DSL** | 是 5 种在用写法的并集（`reference` 还是空的） | **不新增。** 收敛为 `View` 上的 1 个关系字段 |
| **Context DSL** | 跨页传参无独立表达，全在裸 JS 里 | **暂不新增。** 先按 `Binding.params` 处理，等它有第 2 个真实用例 |
| **Extension DSL** | 逃生舱**已经在用**（11320 条裸 JS） | **暂不新增。** 先回收高频模式，再谈规范化 |

**16 个 → 砍掉 7 个，剩 9 个里又有 5 个是收敛项而非新概念。**

## B. 收敛项（有具体动作）

| 语义 | 在用写法 | 建议收敛到 | 理由 |
|---|---|---|---|
| **动作 / 编排** | 6 种 | 组件级统一 `action`；页面级统一 `behaviors`；成功后 / 失败后统一 `onSuccess` / `onError` | 6 种里 4 种是同一件事的不同名字 |
| **表单校验** | 7 种 | 声明式统一 `singleValidate` + `rules` | `validates` 裸 JS 归入逃生舱统计，不做声明式化 |
| **跨页引用** | 5 种 | 统一 1 个 `relations` | `reference` 恒空，`url`/`anchorTarget`/`pageId`/`link` 语义重叠 |
| **样式** | 5 种 | 保留 `style` + `tagStyle` | `className` 仅 7 文件，可并入 |
| **布局容器** | 5 种 | 只留 `layoutInfo` + `layoutList` | `canvas`/`graphic`/`containers` 三者递归全空 |
| **事件订阅** | 2 层 | 保留 2 层（语义确实不同），但**统一条目结构** | 组件级 99% / 页面级 85.3%，都是真载体 |
| **数据源** | 2 种 | 只留 `dataSource` | `defaultDataSource` 恒空 |
| **死字段** | 6 个 | 删除或标 `@deprecated` | `canvas` `graphic` `reference` `flows` `validateList` `defaultDataSource` |
| **冗余位置** | 2 处 | **删除** `canvas.components` / `canvas.containers` | 401/401 全空，且会静默失效 |

## C. 新增候选（真有缺口，有量化规模）

| 缺口 | 证据 | 建议 |
|---|---|---|
| **声明式参数化请求** | 3310 个 dataSource，**URL 含占位符的 0 个**；参数全靠裸 JS | 新增 `dataSource.params` 声明式映射 —— **这是唯一有硬证据的接口联动缺口** |
| **声明式「取选中行」** | `forEach`/`map`/`filter` 1982 次 / 946 条；`callback(` 5120 次 / 4633 条 | 新增 `action.takeSelection` 之类，这是 `callback` 体量的主要来源 |
| **表达式级条件** | `if` 7119 次 / 2663 条表达式 | **先别加。** 组件级 `visible` 已覆盖 100% 文件，先评估覆盖率缺口再决定 |
| **调试残留清理** | `console.log` 5327 次 / 3644 条表达式（**32% 的表达式带调试输出**） | **不是 DSL 问题** —— 生成器 / 设计器应自动剔除。既是代码质量债，也是信息泄露风险 |

---

## 9. 结论

1. **「表达力不足」这个前提，基本被证伪。** 401 份语料里，99% 的「千奇百怪」都能被
   现有的 `subscribes` + `dataSource` + `property` 三件套表达，代价是 11320 条裸 JS。
   真正缺的只有**参数化请求**这一条通道。

2. **痛点是「没统一」和「有死字段」，不是「不够用」。** 9 组语义里 8 组多种写法；
   11 个必填键里 6 个从未承载语义。这两项都是**减法**工作，不是加法。

3. **不需要先设计 DSL，需要先做减法。** 删死字段、收敛同义写法、消除冗余位置 ——
   这三件事不需要任何新概念，做完之后「元模型」会自己浮出来，因为**它已经是现在能跑的
   那部分了**。

4. **`console.log` 32% 是最该马上处理的一条。** 它不在 DSL 范畴内，但它是真实存在的
   代码质量债和泄露风险，且修起来最便宜（生成器侧过滤 + 存量清理）。

---

## 附：复现

```bash
cd generator
npm run audit:meta                       # 全文报告
node scripts/auditMetaModel.js --input ../../MdFrontLayout --json | jq
node scripts/auditMetaModel.js --input ../../MdFrontLayout --out ir/metaModelAudit.generated.json
```

脚本只读语料，不写任何业务文件；`--out` 写指定的统计 JSON。
