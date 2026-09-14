# 动作编排收敛映射：4 种写法 → 1 套结构

> 依据：`docs/meta-model-audit.md` §3.0 / §4 / §4.4，以及三个只读探针
> （`_probeActionWiring.js` / `_probeActionSemantics.js` / `_probePublishEntry.js`）
> 在 401 份真实产物上的实测结果。
>
> **核心约束：产物格式不改。** 收敛发生在 **DSL / 生成器 / check** 三层，
> 编译出来的 `MdFrontLayout/*.json` 保持逐字节可复现。

---

## 1. 现状：4 种写法，但只有 3 种语义

### 1.1 事实表（实测）

| 写法 | 值类型 | 位置 | 条目 | 实测总量 |
|---|---|---|---|---|
| `subscribes[].pubs` | array | 页面级 544 / 组件级 3358（含 layoutList 内） | 发布条目 | **3729** |
| `subscribes[].behaviors` | array | 同上 | 动作条目 | **1189** |
| `behaviors[].successPubs` | array | 动作条目内 | 发布条目 | **1930** |
| `behaviors[].errorPubs` | array | 动作条目内 | 发布条目 | **663** |

`subscribes` 本身：**4600 条**（页面级 842 / 组件级 3758）。

### 1.2 结构关系

```jsonc
subscribes: [{
  "event": "<触发时机>",
  "behaviors": [                               // ← 写法 ②：动作列表
    {
      "type": "request",                       //    实测 100% 是 request
      "dataSource": { ... },                   //    = Resource 引用
      "successPubs": [ 发布条目 ],              // ← 写法 ③
      "errorPubs":   [ 发布条目 ]               // ← 写法 ④
    }
  ],
  "pubs": [ 发布条目 ]                          // ← 写法 ①：无条件发布
}]
```

**写法 ①③④ 是同一套结构，只是时机不同。** 证据：

| 时机 | 字段 | 语义 |
|---|---|---|
| 订阅触发后**无条件** | `pubs` | 先广播，不等动作 |
| 动作**成功后** | `behaviors[].successPubs` | 成功回调 |
| 动作**失败后** | `behaviors[].errorPubs` | 失败回调 |

三者条目 shape 完全一致（见 §2.1）。

### 1.3 不属于本组的两个键（§4.4 语义验证的结论）

| 键 | 键存在率 | 真实语义 | 实测形态 |
|---|---|---|---|
| `component.property.action` | 395/401（98.5%） | **组件语义事件名**（`vendor_vendorin_submit`，形如 `<server>_<entity>_<op>`） | 空串 1762 / 非空串 817 / 空对象 124 → **真实值只有 22%** |
| `component.property.actionConfig` | 394/401（98.3%） | **启用开关**（与"动作配置"无关） | **仅 `{enabled:false}` 2515 / 2516（99.96%）** |

**这两个不属于「动作编排」组，处理方式也不同**（见 §5）。

---

## 2. 发布条目：需要先统一的那一份 schema

### 2.1 键全集（6322 条发布条目的完全枚举）

| 键 | 次数 | 类型 | 语义 | 是否必填 |
|---|---|---|---|---|
| `event` | **6322（100%）** | string | 发布目标 | **是（唯一必填）** |
| `eventPayloadExpression` | 5020 | string | 载荷（**裸 JS 表达式**） | 否 |
| `pageId` | 1585 | string | 目标作用域：`global` / 组件 gid / `""` | 否 |
| `name` | 673 | string | 可读名（"提示成功" / "关闭弹窗" / "页面跳转"） | 否 |
| `payload` | 656 | string | **静态**载荷（`$${message.delete.success}` / "删除失败"） | 否 |
| `outside` | 630 | **boolean** | 是否跨当前页面发出（**实测全为 `true`**） | 否 |

### 2.2 `event` 的三种形态

| 形态 | 条数 | 含义 |
|---|---|---|
| **空字符串** | **3091** | 只执行 `eventPayloadExpression` 的副作用，不广播 |
| `<组件id>.<事件名>` | 1939 | 定向投递给某个组件 |
| `@@` 内置系统事件 | 1292 | 平台内置（`@@message.success` / `@@form.init` / `@@message.delete.success`…） |

> ⚠️ **空 `event` 占 49%（3091/6322）** —— 近一半的"发布"其实只是"跑一段 JS"。
> 这说明：**这一组字段的真实角色是「副作用挂载点」，不只是事件广播。**

### 2.3 顺带发现的第 5 个收敛项：`payload` vs `eventPayloadExpression`

| 键 | 条数 | 载荷类型 |
|---|---|---|
| `payload` | 656 | **静态**字符串（含 `$${多语言key}` 占位） |
| `eventPayloadExpression` | 5020 | **动态** JS 表达式 |

**同一语义（"发给目标什么"）的两种写法**，只差"静态 / 动态"。
建议收敛为 `data`（静态）+ `dataExpr`（动态）两个语义清晰的字段名，
或在 DSL 层统一成一个 `data` 字段由生成器按类型分派。

**本条是审计脚本首版未发现的** —— 因为 `payload` 和 `eventPayloadExpression`
在任何键名分组里都不相邻。它是由「把 6322 条条目**逐个枚举键**」这一步暴露的。

### 2.4 `outside` 是第三个恒定值字段

630 次，**全部是 `true`**，零个 `false`。与 `componentTypeName`（100% 空串）、
`actionConfig`（99.96% 恒 false）同类：**占位载荷**。

---

## 3. 收敛方案：产物零改动，三层各自收敛

### 3.1 原则

```
产物格式（MdFrontLayout/*.json）  ← 不动。由不受控的运行时消费，改它 = 改运行时 + 401 份迁移
        ↑ emit
DSL 层（builder/）                ← 收敛点 ①：对外只暴露一种写法
        ↑
check 层（check/rules/）          ← 收敛点 ②：三条发布路径共用一套校验
        ↑
生成器（builder/events.js 等）    ← 收敛点 ③：一种写法 → 按时机分派到三个字段
```

**收敛的目的是「减少人的选择」，不是「减少产物的字段」。**

### 3.2 DSL 层：统一为 `emit` 声明

对外只暴露一种写法，`when` 区分时机：

```js
// 之前：调用方要自己知道该塞 pubs 还是 successPubs 还是 errorPubs
{
  subscribes: [{
    event: 'saveBtn.onClick',
    behaviors: [{
      type: 'request',
      dataSource: { type: 'api', serverName: 'vendor', method: 'post', url: '/vendor/save' },
      successPubs: [ { event: '@@message.success', payload: '$${message.save.success}' } ],
      errorPubs:   [ { event: '@@message.error',   payload: '保存失败' } ],
    }],
    pubs: [ { event: '', eventPayloadExpression: 'console.log("clicked")' } ],
  }],
}

// 之后：只有一种写法，时机由 when 表达
{
  handler: {
    on: 'saveBtn.onClick',
    // 无条件：订阅触发即发
    emit:   [ { to: '',        run: 'console.log("clicked")' } ],
    action: {
      type: 'request',
      resource: { type: 'api', serverName: 'vendor', method: 'post', url: '/vendor/save' },
      then: [ { to: '@@message.success', data: '$${message.save.success}' } ],
      fail: [ { to: '@@message.error',   data: '保存失败' } ],
    },
  },
}
```

映射关系（**纯机械，无歧义**）：

| DSL（新） | 产物（旧，不变） |
|---|---|
| `handler.on` | `subscribes[].event` |
| `handler.emit[]` | `subscribes[].pubs[]` |
| `handler.action` | `subscribes[].behaviors[0]` |
| `handler.action.resource` | `behaviors[].dataSource` |
| `handler.action.then[]` | `behaviors[].successPubs[]` |
| `handler.action.fail[]` | `behaviors[].errorPubs[]` |
| 条目 `.to` | 条目 `event` |
| 条目 `.run` | 条目 `eventPayloadExpression` |
| 条目 `.data` | 条目 `payload` 或 `eventPayloadExpression`（按有无 `$${` 判） |
| 条目 `.label` | 条目 `name` |
| 条目 `.scope` | 条目 `pageId` |
| 条目 `.crossPage` | 条目 `outside` |

### 3.3 check 层：一套校验覆盖三个字段

当前三条发布路径各自校验（或在 `check/rules/` 里散落）。收敛后：

```js
// check/rules/action.js —— 只写一遍
const PUBLISH_PATH = /(pubs|successPubs|errorPubs)$/;

function checkPublishEntries(entries, path, ctx) {
  entries.forEach((e, i) => {
    const p = [...path, i];
    if (typeof e.event !== 'string') {
      ctx.error('ACT001', p, '发布条目的 event 必须是字符串（可为空串，表示只跑表达式）');
    }
    if (e.payload !== undefined && e.eventPayloadExpression !== undefined) {
      ctx.warn('ACT002', p, '静态 payload 与动态 eventPayloadExpression 同时存在，动态优先');
    }
    if (e.event === '' && !e.eventPayloadExpression) {
      ctx.warn('ACT003', p, 'event 为空且无 eventPayloadExpression —— 该条目不产生任何效果');
    }
    if (e.outside !== undefined && typeof e.outside !== 'boolean') {
      ctx.error('ACT004', p, 'outside 必须是布尔值');
    }
  });
}
```

调用点只需在遍历到 `pubs` / `successPubs` / `errorPubs` 时统一走这一个函数。

**新增规则候选（建议在语料上标定后再定级）：**

| 码 | 判据 | 预期命中 | 级别建议 |
|---|---|---|---|
| `ACT001` | `event` 非字符串 | 0（6322/6322 都是 string） | error |
| `ACT002` | `payload` 与 `eventPayloadExpression` 同时存在 | 待测 | warning |
| `ACT003` | `event` 为空且无表达式 → 空转条目 | 需测 | warning |
| `ACT004` | `outside` 非布尔 | 0 | error |
| `ACT005` | `actionConfig` 非 `{enabled}` 形态 | 1 / 2516 | info（仅提示） |

### 3.4 生成器层：`buildPublish()` 单点分派

```js
// builder/events.js
/**
 * 唯一的发布条目构造入口。
 * @param {'emit'|'then'|'fail'} slot 时机
 */
function buildPublish(slot, items) {
  const target = { emit: 'pubs', then: 'successPubs', fail: 'errorPubs' }[slot];
  if (!target) throw new Error(`未知发布时机: ${slot}`);
  return { [target]: items.map(normalizePublishEntry) };
}

function normalizePublishEntry(item) {
  const out = { event: item.to ?? '' };
  if (item.run) out.eventPayloadExpression = item.run;
  else if (item.data !== undefined) {
    // 含 $${ 多语言占位 → 静态 payload；否则也走静态
    out.payload = item.data;
  }
  if (item.label) out.name = item.label;
  if (item.scope) out.pageId = item.scope;
  if (item.crossPage) out.outside = true;
  return out;
}
```

**关键：`buildPublish` 是唯一的构造入口**，任何直接写 `pubs:` / `successPubs:` 的地方
都要改成调用它。这把「该塞哪个字段」的判断从每个调用点收进一个函数。

---

## 4. 兼容层读写映射（双向，可测）

```js
/* ---------- 读：产物 → DSL（供 parser/designerToConfig 或反解析用） ---------- */
const SLOT_BY_FIELD = { pubs: 'emit', successPubs: 'then', errorPubs: 'fail' };

function readHandler(sub) {
  const out = { on: sub.event, emit: [], action: null };
  for (const [field, slot] of Object.entries(SLOT_BY_FIELD)) {
    if (Array.isArray(sub[field])) out[slot] = sub[field].map(readPublishEntry);
  }
  const beh = Array.isArray(sub.behaviors) ? sub.behaviors[0] : null;
  if (beh) {
    out.action = {
      type: beh.type,
      resource: beh.dataSource,
      then: (beh.successPubs || []).map(readPublishEntry),
      fail: (beh.errorPubs || []).map(readPublishEntry),
    };
  }
  return out;
}

function readPublishEntry(e) {
  const item = { to: e.event ?? '' };
  if (e.eventPayloadExpression) item.run = e.eventPayloadExpression;
  else if (e.payload !== undefined) item.data = e.payload;
  if (e.name !== undefined) item.label = e.name;
  if (e.pageId !== undefined) item.scope = e.pageId;
  if (e.outside !== undefined) item.crossPage = e.outside;
  // pageId 与 outside 这类"有时有有时没有"的键，必须原样带回，否则往返会丢字段
  return item;
}
```

**往返要求：`readHandler` ∘ `buildPublish` 必须在 401 份语料上逐字节一致。**
这条直接复用现有的 `test/roundtrip.test.js` 基建 —— 401 份语料已经是现成的回归集。

---

## 5. 三个「占位载荷」的处理（与收敛分开）

这三个不是"多写法"，是"根本不该输出"。处理方式和收敛不同：

| 字段 | 实测 | 建议 | 风险 |
|---|---|---|---|
| `componentTypeName` | 10847/10847 = `""` | 产物里**省略**；设计器里移除 | 先确认运行时是否读它（若读，省略会改变行为） |
| `actionConfig` | 2515/2516 = `{enabled:false}` | 并入 `enabled`；产物里只在 `true` 时输出 | 需确认 `enabled:false` 与"字段缺失"是否等价 |
| `outside` | 630/630 = `true` | 只在 `false` 时输出（即几乎总是省略） | 需确认缺省值语义 |

⚠️ **三项都有一句「需确认运行时行为」** —— 这正是「产物由不受控的运行时消费」
这条约束的直接后果：**省字段比改字段更危险**，因为"缺失"的语义只能靠实测确认，
不能靠推断。

**建议顺序：先做①（收敛，零产物改动），再做②（省字段，需运行时实测）。**

---

## 6. 落地清单（按依赖顺序）

| # | 动作 | 产物影响 | 依赖 | 状态 |
|---|---|---|---|---|
| 1 | `builder/events.js` 加 `buildPublish()` / `publishEntry()` 双向映射 | 无 | — | ✅ |
| 2 | 把所有直接写 `pubs:` / `successPubs:` / `errorPubs:` 的调用点改为调 `buildPublish()` | 无（应逐字节一致） | 1 | ✅ 5 文件 8 处 |
| 3 | `check/rules/action.js` 加统一发布条目校验（`ACT001`~`ACT005`）+ 注册 | 无 | — | ✅ |
| 4 | 新增 `test/actionWiring.test.js`：映射表双侧 + 可选键保真 + 语料回归 | 无 | 1, 2 | ✅ |
| 5 | 在 401 份语料上跑 `readHandler ∘ buildHandler` 往返 | 无 | 1, 2, 4 | ✅ 语义无损 4622/4622 |
| 6 | `calibrate` 标定 `ACT001`~`ACT005` 真实命中率，再定级别 | 无 | 3 | ✅ 见 §7.2 |
| 7 | （独立）运行时实测三个占位载荷能否省略 | **有** | 6 之后 | ⏳ 未开始 |

第 1–6 步**全部不动产物**。第 7 步才涉及产物，必须单独评估。

### 6.1 第 2 步实际改了哪 8 处

| 文件 | 原写法 | 新写法 |
|---|---|---|
| `builder/addEditPage.js` | `successPubs: [...]` / `errorPubs: [...]` | `...buildPublish('then', [...])` / `...buildPublish('fail', [...])` |
| `builder/viewPage.js` | 同上 | 同上 |
| `builder/modal.js` | `pubs: [...]` ×2 | `...buildPublish('emit', [...])` ×2 |
| `builder/components/DropdownButtonHook.js` | `pubs: [...]` | `...buildPublish('emit', [...])` |
| `builder/components/TextHook.js` | `pubs: [...]` | `...buildPublish('emit', [...])` |

**改完 `builder/` 下已无任何直接写这三个字段名的位置**（`grep -rn '^\s*\(pubs\|successPubs\|errorPubs\)\s*:' builder/` 无输出）。
字段名现在只出现在 `PUBLISH_SLOT_TO_FIELD` 一处 —— 这就是收敛的验收标准。

### 6.2 第 1 步实际踩到的两个真 bug

写双向映射时，我最初按「键名一一对应」实现，结果在 401 份语料上跑出 1213 条差异。
逐条定位后是两处**真实的数据丢失**（不是键序问题）：

| 缺陷 | 命中 | 根因 | 修法 |
|---|---|---|---|
| `payload` 被丢 | **239** | `readPublishEntry` 用 `if (事件表达式) … else if (payload)`，两者并存时 `payload` 被静默丢弃 | 读取端两者**都保留**；构造端「给什么写什么」，不做取舍 |
| 订阅级 `type` / `rules` 被丢 | **20 + 19** | 映射表只覆盖了主干键，这两个键名没进映射 | 补进 `readHandler` / `buildHandler` |

`payload` 那 239 条全部是历史遗留：作者先写了静态 payload，后来改用 JS 表达式，旧值没清。
**运行时以表达式为准，但这不代表可以替用户删掉它** —— 静默改数据比留一个无用字段危险得多。

---

## 7. 验证方式

```bash
cd generator

npm run roundtrip          # 期望：通过 401 / value 逐字节一致 401   ← 守的是 IR 层
npm test                   # 期望：全绿（17 个测试文件，含 actionWiring.test.js）
npm run check:all          # 期望：5/5 通过
npm run calibrate          # 期望：error 总数不增加（当前 21）
```

### 7.1 判据分层（这里曾写错，特此更正）

原始版本把「`readHandler ∘ buildHandler` 往返要求逐字节一致」写成了硬判据。**这是错的。**

实测语料里键序毫无一致性：

| 对象 | 键序指纹数 | 最多的一种占比 |
|---|---|---|
| 订阅条目 | 44 种 | `pubs,event` 2471/4622 = 53% |
| 发布条目 | 8+ 种 | `event,eventPayloadExpression` 3378/6344 = 53% |
| 动作条目 | 8+ 种 | `type,successPubs,errorPubs,dataSource` 444/1189 = 37% |

**没有任何一种键序占比过半** → 键序不是契约。
若坚持逐字节一致，2887 条**纯键序差异**会被误判成「映射丢了字段」，从而引导出错误的修法。

正确的判据分层：

| 层 | 判据 | 依据 |
|---|---|---|
| **IR 层**（`lift` ↔ `emit`） | `value` 字符串**逐字节一致** | 它是原样搬运，不重建任何对象 |
| **DSL 层**（`readHandler` ↔ `buildHandler`） | **语义无损 + 不凭空造数据 + DSL 幂等** | 它是规范化重建，键序自由 |

「语义无损」的精确定义（实现见 `test/actionWiring.test.js` 的 `findLoss` / `findJunk`）：

- 产物里所有**非空**的键，重建后必须逐层还在且值相同；
- 重建**允许**多出空容器（如补出 `pubs: []`）—— 这是 `subscribe()` 一直以来的既有契约，且缺键与空数组运行时等价；
- 重建**不得**多出非空字段。

### 7.2 规则级别标定（第 6 步实测结果）

| 规则 | 语料命中 | 覆盖率 | 级别 | 定级依据 |
|---|---|---|---|---|
| `ACT001` 缺 / 非法 `event` | **0** | — | `error` | 预防。`event` 是唯一必填（6322/6322 都是 string，允许空串） |
| `ACT002` 表达式与 `payload` 并存 | **185** | 2.9% | `info` | 历史遗留，运行时以表达式为准；**不可自动删** |
| `ACT003` 发布字段放错层 | **0** | — | `error` | 预防。收敛层让它在结构上不可表达；这条守的是「有人绕过 `buildPublish` 手写」 |
| `ACT004` 空操作条目 | **55** | 0.9% | `warning` | 真实冗余，运行时什么都不做 |
| `ACT005` 目标无事件名 | **291** | 4.6% | `info` | 同义异形（`""` 3111 条 vs `"."` 304 条），不是错误 |

`ACT001` / `ACT003` 在语料上零命中、在生成器产物上也零命中（`check:all` 5/5），
说明收敛确实做到了「让错误写法在结构上不再可表达」，而不是靠事后检查兜。

### 7.3 规则覆盖范围（必须先说清，否则会误以为「全位置都查了」）

语料 4622 条订阅的实际分布：

```
本规则覆盖            3433  (74.3%)
  ├ 页面级 desktop.subscribes                        842
  └ 组件级 components[*].property 下**递归**全部位置  2591

故意跳过              1167
  └ desktop.layoutList 里的内联组件副本
     实测：3916 个内联副本 100% 与 components 注册表里的对应组件**逐字节相同**
          （identicalToRegistry 3916 / differs 0）→ 扫进去只会重复报同一批订阅

不在范围                22
  └ draftComponents 14（未应用的草稿）/ phone 4 / pad 4（移动端镜像树）
```

**组件级必须递归扫、不能枚举位置**：订阅除了 `property.subscribes`，
还出现在 `property.cellType.subscribes`(20) / `property.columns[*].cellType.subscribes`(11)
/ `property.tableInfo.subscribes`(3)。按名字枚举位置会漏掉平台以后新加的嵌套形态。

> 这一条与元模型审计 v1 的错误同源：**只扫页面级会把结论整个搞反**
> （页面级 842 条 vs 组件级 3766 条，组件级才是交互事件的主战场）。
> 详见 `docs/meta-model-audit.md` 的修正记录 v2。

### 7.4 怎么验证「改了 builder 但产物没变」

第 2 步声称「产物零改动」，但**不能直接比 md5**：生成器用 `uuid()` + 生成时刻，
每次产物必然不同，直接比哈希全是噪声。

正确做法是**归一化后比对**：

```js
// 把随机 ID 与时间戳替换成占位符
function normalize(s) {
  return s
    .replace(/[0-9a-f]{32}/g, '<ID>')          // 不用 \b：组件 id 常出现在 xxx_filterId 这类带下划线的键名里，
                                               // 而下划线在 JS 正则里算单词字符，\b 会在 e 与 _ 之间失效
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<TS>')
    .replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g, '<TS>')
    .replace(/\r\n/g, '\n').trim();
}
// 再比 git show HEAD:<file> 的归一化结果 vs 当前文件的归一化结果
```

第 2 步实测：5/5 个 `generated/*.json` 归一化后**逐字节一致**。
（首次跑出现 1 处差异，定位是 `\b` 在 `_filterId` 前失效导致的**归一化漏洞**，不是产物变化 ——
这类「工具自身的假阳性」必须查到底，否则会误伤结论。）
