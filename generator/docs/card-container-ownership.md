# 卡片容器归属：为什么「解析得通」不等于「指对了地方」

> 事故现象：新增/编辑页生成后，页面上出现了**两组一模一样**的「保存 / 提交」按钮。
>
> 结论：`CardHook.toolContainerId / extraContainerId / ltContainerId` 指向了
> `TitleTools / TitleSiderExtra / TitleSider` —— 这三个是**页面级插槽**，不是卡片私有容器。
>
> 复核命令：`npm run analyze:addedit`（第 ⑥ 节）

---

## 1. 一句话根因

`layoutList` 里的「区域」有两种互不相干的角色，它们长得完全一样（都是 `layoutList` 的 key），
但渲染路径不同：

| 角色 | 特征 | 谁渲染它 |
| --- | --- | --- |
| **页面级插槽** | 同时登记在 `layoutInfo.componentIds` | 页面骨架（标题栏 / 内容区 / 底栏） |
| **卡片私有容器** | 只在 `layoutList` 里，`componentIds` 里没有 | 认领它的那个组件（卡片标题栏 / 内容区） |

把页面级插槽填进卡片的容器字段，等于让**同一个对象**被两条渲染路径各取一次：
页面标题栏渲染一遍、卡片自己的标题栏再渲染一遍 —— 按钮就成对出现了。

## 2. 语料判据（401 份 / 459 张卡）

| 指标 | 结果 |
| --- | --- |
| `toolContainerId` 取值形态 | **100% 是 32 位 hex**，0 个具名区域 |
| `toolContainerId` 指向的区域内容 | `{RowContainer:1, ColContainer:1}`（空 Row+Col），288/347 |
| 三个容器字段的引用 `/` | 卡片容器引用共 **1320 条**（按页去重） |
| ★ 其中登记在 `componentIds` 内的 | **0 条** |
| `TitleTools` 的角色 | `key=72  componentIds=72  ★被卡片认领=0  含按钮页=70` |
| `TitleSiderExtra` 的角色 | `key=72  componentIds=72  ★被卡片认领=0  含按钮页=72` |

两条互补的结论：

- 卡片容器**从不**复用页面级插槽（0/1320）；
- 页面级插槽**从不**被卡片认领（`TitleTools` / `TitleSiderExtra` / `TitleSider` 认领数恒为 0）。

按钮的正确归属是**页面级**的：`$${button.save} ×37`、`$${button.submit} ×23` 在 `TitleTools`，
`$${button.back} ×72` 在 `TitleSiderExtra`。卡片自己的 `toolButtons` 只放卡片私有按钮，
而且这些按钮**只注册在 `components` 里**，不内联进容器（语料 175/175）。

## 3. 为什么原有规则拦不住

`REF001` 判的只有一件事：**这个引用能不能解析到一个区域**。
而 `TitleTools` 确实是 `layoutList` 的 key —— 引用解析得通，单文件 check 全绿，
生成期完全不可见。**把「解析得到」当成唯一目标是错的**，还要问一句：
解析到的是不是同一条渲染路径。

新增的 `REF007` 补的就是这一问：

```
CardHook.toolContainerId 指向了页面级区域 TitleTools，该区域会被渲染两次   [error]
```

## 4. 改法

`builder/addEditPage.js` / `builder/viewPage.js`：

```js
// ❌ 旧：指向页面级插槽，会被渲染两遍
const toolContainerId = 'TitleTools';
const extraContainerId = 'TitleSiderExtra';
const ltContainerId = 'TitleSider';

// ✅ 新：自建私有容器 —— 既满足「必须解析得到」，又不与页面插槽撞车
const toolContainerId = uuid();
const extraContainerId = uuid();
const ltContainerId = uuid();
```

并在 `layoutList` 里为三者各建一个空 Row+Col 区域，**刻意不登记**进 `componentIds`：

```js
region(toolContainerId, [row([col({ span: 24, components: [] })])]),
region(extraContainerId, [row([col({ span: 24, components: [] })])]),
region(ltContainerId, [row([col({ span: 24, components: [] })])]),
```

`builder/listPage.js` 一直就是正确的（`toolContainerId = uuid()` + 自建区域），
本次只是把两个表单页对齐到它。

## 5. 不变量（已锁进测试）

`test/addEditPage.test.js` 第 ⑨ 节 / `test/viewPage.test.js` 第 4b 节：

1. 卡片三个容器字段必须是 32 位 hex；
2. 必须能在 `layoutList` 里解析到；
3. **不得**出现在 `layoutInfo.componentIds` 里；
4. 工具容器必须是空的（按钮归页面级 `TitleTools`）；
5. 反向锁：`TitleTools` / `TitleSiderExtra` 仍登记在 `componentIds` 且继续承载按钮。

## 6. 复核

```bash
npm run analyze:addedit    # 第 ⑥ 节：卡片容器归属的语料统计
npm test                   # 不变量 + REF007 正反例
npm run calibrate          # REF007 在 401 份语料上应为 0 命中（error 基线 23 不变）
```
