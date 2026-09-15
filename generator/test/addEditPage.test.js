/**
 * AddEdit / View Builder 修复回归测试
 *
 * 运行：node test/addEditPage.test.js
 *
 * 锁住三类曾经真实存在的问题（都由 61 份 pageType=add 语料实证）：
 *   ① 两个文案完全相同的「保存」按钮（value 里 4 处同名）
 *   ② 标题没有通用机制（页面标题栏无法设置）
 *   ③ 事件只有 1 条，且取数直接塞在 componentDidMount 里（与语料两级编排相反）
 *   ④ 卡片容器认领页面级区域 → 同一区域渲染两遍，按钮成对重复
 * 顺带锁住：卡片未进 components、卡片标题词条用错、componentIds 多登记一项。
 */
const assert = require('assert');
const { buildAddEditPage, buildViewPage, text } = require('../index');

const FID = '1'.repeat(32);
const LIST_FID = '2'.repeat(32);

function makeAddEdit(extra = {}) {
  return buildAddEditPage({
    pageName: '供货商',
    functionGid: '0'.repeat(32),
    serverName: 'mdgeneric',
    entityPath: 'vendor',
    entityIdField: 'id',
    frontId: FID,
    listPageFrontId: LIST_FID,
    fields: [text('code', '编码')],
    ...extra,
  });
}

const desktopOf = layout => JSON.parse(layout.value).desktop;
const countOf = (layout, needle) => layout.value.split(needle).length - 1;
const buttonsOf = d => Object.values(d.components).filter(c => c.type === 'ButtonHook');

function run() {
  console.log('开始测试 AddEdit Builder 修复项...\n');

  const layout = makeAddEdit();
  const d = desktopOf(layout);

  // ── ① 按钮不再重复 ────────────────────────────────────────────────────
  const titleTools = d.layoutList.TitleTools.rows[0].cols[0].components;
  assert.strictEqual(titleTools.length, 2, 'TitleTools 应恰好 2 个按钮');
  const ttTitles = titleTools.map(c => c.property.title);
  assert.deepStrictEqual(ttTitles, ['$${button.save}', '$${button.submit}'],
    'TitleTools 应是「保存 + 提交」，不是两个「保存」');
  console.log('✅ TitleTools 是「保存 + 提交」两个语义按钮（此前是两个同名「保存」）');

  // 每个按钮在产物里恰好出现 2 次：layoutList 内联 1 次 + components 注册 1 次
  // （语料 add 页 61/61 都是「内联 + 注册」两份，这是标准形态）
  assert.strictEqual(countOf(layout, '$${button.save}'), 2, '保存按钮应恰好 2 处（内联 + 注册）');
  assert.strictEqual(countOf(layout, '$${button.submit}'), 2, '提交按钮应恰好 2 处（内联 + 注册）');
  console.log('✅ 每个按钮恰好 2 处（内联 + 注册），同名重复已消除');

  const saveBtn = buttonsOf(d).find(b => b.property.title === '$${button.save}');
  const submitBtn = buttonsOf(d).find(b => b.property.title === '$${button.submit}');
  assert.ok(saveBtn.property.action.endsWith('_save'), '保存按钮 action 应走 _save');
  assert.ok(submitBtn.property.action.endsWith('_submit'), '提交按钮 action 应走 _submit');
  assert.strictEqual(submitBtn.property.type, 'primary', '语料里 submit 恒为 primary');
  console.log('✅ 两个按钮 action 各自独立（_save / _submit）');

  // ── ② 标题通用机制 ────────────────────────────────────────────────────
  assert.ok(layout.value.includes(`${FID}-title.setLabel`),
    '应通过 <frontId>-title.setLabel 设置页面标题（语料 97 处，主语 100% === 本页 frontId）');
  assert.strictEqual(layout.value.includes('$${label.baseInformation}'), false,
    '不应再使用语料仅出现 2 次的 label.baseInformation');
  console.log('✅ 标题走 <frontId>-title.setLabel 通用机制');

  const titled = makeAddEdit({ pageTitle: '编辑供货商' });
  assert.ok(titled.value.includes("'编辑供货商'"), 'pageTitle 应生效');
  console.log('✅ pageTitle 参数生效');

  // ── ③ 事件骨架：两级编排 ──────────────────────────────────────────────
  const subs = d.subscribes;
  assert.strictEqual(subs.length, 4, '应有 4 条页面级订阅');
  const names = subs.map(s => s.event.split('.').slice(1).join('.'));
  assert.deepStrictEqual(names, ['componentDidMount', 'getMainInfo', 'save', 'submit']);
  console.log('✅ 页面级订阅 4 条：mount / getMainInfo / save / submit');

  const mount = subs.find(s => s.event.endsWith('.componentDidMount'));
  assert.ok(Array.isArray(mount.pubs) && mount.pubs.length === 1, 'mount 应是 pubs 型');
  assert.strictEqual(mount.behaviors, undefined,
    'mount 不应直接持有请求（语料 48/61 是 pubs 型，请求在具名下取数事件里）');
  console.log('✅ componentDidMount 是 pubs 型，不直接持有请求（对齐语料 48/61）');

  const fetchSub = subs.find(s => s.event.endsWith('.getMainInfo'));
  assert.strictEqual(fetchSub.behaviors.length, 1, 'getMainInfo 应持有请求');
  assert.ok(fetchSub.behaviors[0].dataSource.url.includes('/vendor/get'));
  console.log('✅ getMainInfo 持有取数请求（对齐语料 38 次 behaviors=1 形态）');

  // ── ④ 保存/提交链路闭合 ───────────────────────────────────────────────
  // 按钮发布的 <frontId>.save / <frontId>.submit 必须有订阅者，否则点击无反应，
  // 而这类断链「生成成功 + check 也过」，只能在运行时暴露。
  for (const [btn, evName] of [[saveBtn, 'save'], [submitBtn, 'submit']]) {
    const expr = btn.property.subscribes[0].pubs[0].eventPayloadExpression;
    assert.ok(expr.includes(`${FID}.${evName}`), `${evName} 按钮应发布 <frontId>.${evName}`);
    assert.ok(subs.some(s => s.event === `${FID}.${evName}`),
      `必须存在 ${FID}.${evName} 的订阅者，否则按钮点击无反应`);
  }
  console.log('✅ 按钮发布事件都有对应订阅者（链路闭合）');

  const saveSub = subs.find(s => s.event.endsWith('.save'));
  const thenEvents = saveSub.behaviors[0].successPubs.map(p => p.event);
  assert.ok(thenEvents.includes('@@message.success'), '保存成功应提示');
  assert.ok(thenEvents.includes('@@navigator.push'), '保存成功应回到列表页');
  const succMsg = saveSub.behaviors[0].successPubs.find(p => p.event === '@@message.success');
  assert.strictEqual(succMsg.payload, '$${message.save.success}',
    '语料里 @@message.success 主流用 payload 传词条（423/573）');
  console.log('✅ 保存成功 → 提示(payload 词条) + 回列表');

  // ── ⑤ 卡片：注册 + 标题词条 ─────────────────────────────────────────
  const cardComp = Object.values(d.components).find(c => c.type === 'CardHook');
  assert.ok(cardComp, '卡片必须登记进 components（语料里卡片 100% 已注册）');
  assert.strictEqual(cardComp.property.title, '$${label.baseInfo}',
    '语料 add 页最常用的卡片标题是 label.baseInfo（45 次）');
  console.log('✅ 卡片已注册且标题词条正确');

  // ── ⑥ componentIds 只登记具名区域 ────────────────────────────────────
  assert.strictEqual(d.layoutInfo.componentIds.length, 8, 'componentIds 应恰好 8 个具名区域');
  assert.strictEqual(d.layoutInfo.componentIds.includes(cardComp.property.layoutId), false,
    '卡片 layoutId 不应进 componentIds（语料 303 个里 0 个登记）');
  for (const id of d.layoutInfo.componentIds) {
    assert.ok(Object.keys(d.layoutList).includes(id), `componentIds 引用的区域必须存在: ${id}`);
  }
  console.log('✅ componentIds 只登记 8 个具名区域，且全部真实存在');

  // ── ⑦ withSubmit=false ────────────────────────────────────────────────
  const noSubmit = makeAddEdit({ withSubmit: false });
  const nd = desktopOf(noSubmit);
  assert.strictEqual(nd.subscribes.length, 3, '关闭提交后应只剩 3 条订阅');
  assert.strictEqual(nd.subscribes.some(s => s.event.endsWith('.submit')), false);
  assert.strictEqual(Object.values(nd.components).filter(c => c.type === 'ButtonHook')
    .some(b => b.property.title === '$${button.submit}'), false);
  console.log('✅ withSubmit=false 时不生成提交按钮与订阅');

  // ── ⑧ viewPage 同构修复 ──────────────────────────────────────────────
  const view = buildViewPage({
    pageName: '供货商详情',
    functionGid: '0'.repeat(32),
    serverName: 'mdgeneric',
    entityPath: 'vendor',
    entityIdField: 'id',
    frontId: FID,
    listPageFrontId: LIST_FID,
    fields: [text('code', '编码')],
  });
  const vd = desktopOf(view);
  assert.ok(Object.values(vd.components).some(c => c.type === 'CardHook'),
    'viewPage 的卡片也要注册（同 addEdit）');
  assert.ok(view.value.includes(`${FID}-title.setLabel`), 'viewPage 也应设置标题');
  const vMount = vd.subscribes.find(s => s.event.endsWith('.componentDidMount'));
  assert.ok(Array.isArray(vMount.pubs), 'viewPage 的 mount 也应是 pubs 型');
  assert.strictEqual(vMount.behaviors, undefined);
  for (const id of vd.layoutInfo.componentIds) {
    assert.ok(Object.keys(vd.layoutList).includes(id),
      `viewPage: componentIds 引用的区域必须存在: ${id}`);
  }
  console.log('✅ viewPage 同构修复（卡片注册 / 标题 / 两级编排 / 区域登记）');

  // ── ⑨ 卡片容器必须是「卡片私有」容器，不能认领页面级区域 ──────────────
  //
  // 事故形态：卡片把 toolContainerId 指到 TitleTools（页面级标题栏插槽），
  // 于是同一区域被渲染两遍 —— 页面右上角一次、卡片自己的标题栏一次，
  // 页面上出现两组一模一样的「保存 / 提交」。
  // 语料判据（add/view 72 页 347 张卡 / 全语料 459 张卡）：
  //   卡片容器引用 1320 条，出现在 componentIds 内的 0 条；
  //   toolContainerId 100% 是 hex 私有容器，指向空 Row+Col。
  const HEX32 = /^[0-9a-f]{32}$/;
  for (const [label, dd] of [['addEdit', d], ['view', vd]]) {
    const card = Object.values(dd.components).find(c => c.type === 'CardHook');
    const pageLevel = new Set(dd.layoutInfo.componentIds);
    const regionKeys = Object.keys(dd.layoutList);
    for (const slot of ['toolContainerId', 'extraContainerId', 'ltContainerId']) {
      const v = card.property[slot];
      assert.ok(HEX32.test(v), `${label}: 卡片 ${slot} 必须是 hex 私有容器，实际 ${v}`);
      assert.ok(regionKeys.includes(v), `${label}: 卡片 ${slot} 必须可解析到区域，实际 ${v}`);
      assert.ok(!pageLevel.has(v), `${label}: 卡片 ${slot} 不得指向页面级区域 ${v}`);
    }
    // 私有容器必须是空 Row+Col（语料 288/347 就是这个形态）
    const toolRegion = dd.layoutList[card.property.toolContainerId];
    assert.strictEqual(toolRegion.rows.length, 1, `${label}: 卡片工具容器应是 1 行`);
    assert.strictEqual(toolRegion.rows[0].cols[0].components.length, 0,
      `${label}: 卡片工具容器应是空的（卡片自身无工具按钮，按钮归页面级 TitleTools）`);
  }
  console.log('✅ 卡片三个容器均为私有 hex 容器，且未认领页面级区域');

  // 反向锁：页面级 TitleTools / TitleSiderExtra 仍然是按钮的宿主，且登记在 componentIds
  for (const [label, dd] of [['addEdit', d], ['view', vd]]) {
    assert.ok(dd.layoutInfo.componentIds.includes('TitleTools'), `${label}: TitleTools 应是页面级区域`);
    assert.ok(dd.layoutInfo.componentIds.includes('TitleSiderExtra'), `${label}: TitleSiderExtra 应是页面级区域`);
    const tools = dd.layoutList.TitleTools.rows[0].cols[0].components;
    assert.ok(tools.length > 0, `${label}: TitleTools 应承载工具栏按钮`);
  }
  console.log('✅ 工具栏按钮仍归页面级 TitleTools / TitleSiderExtra');

  console.log('\n🎉 AddEdit Builder 修复项测试通过！');
}

run();
