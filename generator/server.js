const express = require('express');
const {
  buildListPage,
  buildAddEditPage,
  buildViewPage,
  buildSimpleForm,
  buildModal,
  validate,
  check,
} = require('./index');
const {
  normalizeListConfig,
  normalizeAddEditConfig,
  normalizeSimpleFormConfig,
  normalizeViewConfig,
  FIELD_BUILDERS,
} = require('./services/configNormalizer');
const {
  generateConfigFromPrompt,
  generateConfigFromPromptKimi,
  mockGenerateConfigFromPrompt,
} = require('./services/naturalLanguageService');
const { buildPageSuite, allocateIds } = require('./services/pageSuite');
const { designerToConfig } = require('./parser/designerToConfig');
const { deployFromRequest } = require('./services/deployService');
const { repairFromRequest } = require('./services/repairService');

const app = express();
app.use(express.json({ limit: '10mb' }));

// 简单跨域支持
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

/**
 * 用 check 引擎跑一遍契约校验，整理成可直接返回给前端的结构。
 *
 * - 保留 `errors` / `warnings`（字符串数组）供历史调用方使用；
 * - 追加 `diagnostics`（{ code, severity, path, message, hint, extra }）、
 *   `summary`（按级别/规则计数）和 `report`（tsc 风格文本，便于直接贴日志）。
 *
 * @param {object} layoutJson 设计器 Layout JSON（也接受已 lift 的 Page IR）
 * @param {object} [options] 透传给 check.run，如 { strict, ignore, only, severity }
 */
function describeLayout(layoutJson, options = {}) {
  const validation = validate(layoutJson, options);
  return {
    ok: validation.ok,
    errors: validation.errors,
    warnings: validation.warnings,
    diagnostics: validation.diagnostics,
    summary: validation.summary,
    report: check.formatText(validation.diagnostics, {
      name: (layoutJson && layoutJson.name) || (layoutJson && layoutJson.gid),
    }),
  };
}

function generateHandler(req, res) {
  try {
    const { type, config } = req.body || {};

    if (!type) {
      return res.status(400).json({ success: false, error: '缺少 type 字段' });
    }
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ success: false, error: '缺少 config 字段或格式错误' });
    }

    let layoutJson;
    switch (type) {
      case 'list':
        layoutJson = buildListPage(normalizeListConfig(config));
        break;
      case 'addEdit':
        layoutJson = buildAddEditPage(normalizeAddEditConfig(config));
        break;
      case 'simpleForm':
        layoutJson = buildSimpleForm(normalizeSimpleFormConfig(config));
        break;
      case 'view':
        layoutJson = buildViewPage(normalizeAddEditConfig(config));
        break;
      default:
        return res.status(400).json({
          success: false,
          error: `不支持的 type: ${type}，目前支持 list / addEdit / view / simpleForm`,
        });
    }

    const validation = describeLayout(layoutJson);
    if (!validation.ok) {
      return res.status(422).json({
        success: false,
        error: '生成结果校验失败',
        details: validation.errors,
        warnings: validation.warnings,
        diagnostics: validation.diagnostics,
        summary: validation.summary,
        report: validation.report,
      });
    }

    const payload = { success: true, data: layoutJson };
    if (validation.diagnostics.length) {
      payload.warnings = validation.warnings;
      payload.diagnostics = validation.diagnostics;
      payload.summary = validation.summary;
    }
    return res.json(payload);
  } catch (err) {
    console.error('生成失败:', err);
    return res.status(500).json({
      success: false,
      error: err.message || '服务器内部错误',
    });
  }
}

/**
 * POST /api/generate
 * 根据类型生成 MdFrontLayout JSON
 *
 * 请求体：
 * {
 *   "type": "list" | "addEdit" | "view" | "simpleForm",
 *   "config": { ... }
 * }
 */
app.post('/api/generate', generateHandler);

/**
 * POST /api/generate/list
 * 列表页快捷接口
 */
app.post('/api/generate/list', (req, res) => {
  req.body = { type: 'list', config: req.body };
  return generateHandler(req, res);
});

/**
 * POST /api/generate/addEdit
 * 新增/编辑页快捷接口
 */
app.post('/api/generate/addEdit', (req, res) => {
  req.body = { type: 'addEdit', config: req.body };
  return generateHandler(req, res);
});

/**
 * POST /api/generate/simpleForm
 * 最简表单页快捷接口
 */
app.post('/api/generate/simpleForm', (req, res) => {
  req.body = { type: 'simpleForm', config: req.body };
  return generateHandler(req, res);
});

/**
 * POST /api/generate/view
 * 查看页快捷接口
 */
app.post('/api/generate/view', (req, res) => {
  req.body = { type: 'view', config: req.body };
  return generateHandler(req, res);
});

/**
 * POST /api/ids
 * 预分配一组 frontId —— 「先拿 id，再分别生成单页」路径的入口。
 *
 * ── 为什么需要这个接口 ────────────────────────────────────────────────────
 * `/api/generate/list` 要 `addEditPageFrontId`，`/api/generate/addEdit` 又要
 * `listPageFrontId`，顺序调用时看起来是死循环。
 *
 * 它不是死循环：**frontId 是页面的主键（保存时分配的 id），不是生成器的输出**。
 * 必须「先有页面 id、后有引用」，而不是「生成完才知道」。
 * 真正的坑是让各生成接口各自 `uuid()` 兜底 —— 兜底值永远和另一端对不上，
 * 产物看起来完全正常，运行时按 frontId 查不到布局才抛 `reading 'field'`。
 *
 * 所以正确顺序是：**先要 id（或从设计器拿），再带着 id 调各单页接口。**
 *
 * 请求体（三个都可省；给了就校验合法性并原样采用）：
 * { "listFrontId": "...", "addEditPageFrontId": "...", "confirmModalFrontId": "..." }
 *
 * 想一步到位（id 统一分配并接线）请用 POST /api/generate/suite。
 */
app.post('/api/ids', (req, res) => {
  try {
    return res.json({ success: true, data: allocateIds(req.body || {}) });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/generate/suite
 * 一次生成「列表页 + 新增编辑页 + 删除确认弹窗」整套，并自动接好互引。
 *
 * 这是从结构上消除循环依赖的入口：三份产物互相引用的 frontId 在同一次调用里
 * 统一分配（或由调用方预分配）并接线，不存在「先调哪个」的问题。
 *
 * 请求体：见 services/pageSuite.js 的 buildPageSuite 注解。最小示例：
 * {
 *   "pageName": "供货商",
 *   "functionGid": "92bc6124ae5a475dad12cfd1ebc286fa",
 *   "serverName": "mdgeneric",
 *   "entityPath": "vendor",
 *   "listUrl": "/md/vendor/list",
 *   "columns": [{ "field": "code", "headerName": "编码" }],
 *   "fields":  [{ "type": "text", "field": "code", "label": "编码" }],
 *   "ids": { "listFrontId": "...", "addEditPageFrontId": "...", "confirmModalFrontId": "..." }
 * }
 *
 * 响应：{ success, data: { ids, layouts: { list, addEdit, modal } }, diagnostics, report }
 * `ids` 必须持久化 —— 它是这三份布局在平台上的主键。
 */
app.post('/api/generate/suite', (req, res) => {
  try {
    const config = req.body || {};
    if (!config.functionGid) {
      return res.status(400).json({ success: false, error: '缺少 functionGid 字段' });
    }

    const suite = buildPageSuite(config);

    // 逐个页面跑 check，并给诊断补上「属于哪一页」
    const diagnostics = [];
    const errors = [];
    const warnings = [];
    let ok = true;
    let total = 0;
    const bySeverity = { error: 0, warning: 0, info: 0 };
    const byCode = {};
    const byLayout = {};

    for (const [name, layout] of Object.entries(suite.layouts)) {
      if (!layout) continue;
      const validation = describeLayout(layout);
      if (!validation.ok) ok = false;
      errors.push(...validation.errors.map(e => `[${name}] ${e}`));
      warnings.push(...validation.warnings.map(w => `[${name}] ${w}`));
      for (const d of validation.diagnostics) {
        diagnostics.push({ ...d, layout: name, path: `[${name}] ${d.path}` });
      }
      const s = validation.summary || {};
      const sev = s.bySeverity || {};
      total += s.total || 0;
      bySeverity.error += sev.error || 0;
      bySeverity.warning += sev.warning || 0;
      bySeverity.info += sev.info || 0;
      byLayout[name] = s.total || 0;
      for (const [code, n] of Object.entries(s.byCode || {})) {
        byCode[code] = (byCode[code] || 0) + n;
      }
    }
    const summary = { total, bySeverity, byCode, byLayout };

    if (!ok) {
      return res.status(422).json({
        success: false,
        error: '生成结果校验失败',
        data: { ids: suite.ids, layouts: suite.layouts },
        details: errors,
        warnings,
        diagnostics,
        summary,
      });
    }

    const payload = { success: true, data: { ids: suite.ids, layouts: suite.layouts } };
    if (diagnostics.length) {
      payload.warnings = warnings;
      payload.diagnostics = diagnostics;
      payload.summary = summary;
    }
    return res.json(payload);
  } catch (err) {
    console.error('成套生成失败:', err);
    const badRef = err && err.code === 'E_LAYOUT_REF';
    return res.status(badRef ? 400 : 500).json({
      success: false,
      error: err.message || '服务器内部错误',
    });
  }
});

/**
 * POST /api/generate/natural
 * 自然语言生成 JSON
 *
 * 请求体：
 * {
 *   "prompt": "生成一个采购申请表单，包含采购组织、申请人、申请日期、金额、备注",
 *   "llmConfig": {
 *     "apiKey": "sk-...",
 *     "baseURL": "https://api.openai.com/v1",
 *     "model": "gpt-3.5-turbo"
 *   }
 * }
 */
app.post('/api/generate/natural', async (req, res) => {
  try {
    const { prompt, llmConfig, mock } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ success: false, error: '缺少 prompt 字段' });
    }

    let type, config;

    const hasApiKey = (llmConfig && llmConfig.apiKey) || process.env.OPENAI_API_KEY;
    if (mock || !hasApiKey) {
      ({ type, config } = mockGenerateConfigFromPrompt(prompt));
    } else {
      ({ type, config } = await generateConfigFromPrompt(prompt, llmConfig || {}));
    }

    req.body = { type, config };
    return generateHandler(req, res);
  } catch (err) {
    console.error('自然语言生成失败:', err);
    return res.status(500).json({
      success: false,
      error: err.message || '自然语言生成失败',
    });
  }
});

/**
 * POST /api/generate/modal
 * 简单模态框快捷接口
 *
 * 请求体：
 * {
 *   "pageName": "删除确认弹窗",
 *   "frontId": "...",
 *   "functionGid": "...",
 *   "content": { "type": "span", "field": "msg", "label": "确认删除吗？" },
 *   "okEvent": "pubsub.publish('xxx.ok', eventPayload);",
 *   "cancelEvent": "pubsub.publish('xxx.closeM');"
 * }
 */
app.post('/api/generate/modal', (req, res) => {
  try {
    const config = req.body || {};

    if (config.content && config.content.type) {
      const builder = FIELD_BUILDERS[config.content.type];
      if (builder) {
        const { type, ...rest } = config.content;
        config.content = builder(rest.field, rest.label, rest.options || {});
      }
    }

    const layoutJson = buildModal(config);
    const validation = describeLayout(layoutJson);
    if (!validation.ok) {
      return res.status(422).json({
        success: false,
        error: '生成结果校验失败',
        details: validation.errors,
        warnings: validation.warnings,
        diagnostics: validation.diagnostics,
        summary: validation.summary,
        report: validation.report,
      });
    }

    const payload = { success: true, data: layoutJson };
    if (validation.diagnostics.length) {
      payload.warnings = validation.warnings;
      payload.diagnostics = validation.diagnostics;
      payload.summary = validation.summary;
    }
    return res.json(payload);
  } catch (err) {
    console.error('生成弹窗失败:', err);
    return res.status(500).json({
      success: false,
      error: err.message || '服务器内部错误',
    });
  }
});

/**
 * POST /api/generate/kimi
 * 通过 Kimi (Moonshot) 自然语言生成 JSON
 *
 * 请求体：
 * {
 *   "prompt": "生成一个采购申请表单，包含采购组织、申请人、申请日期、金额、备注",
 *   "llmConfig": {
 *     "apiKey": "sk-...",
 *     "model": "moonshot-v1-8k"
 *   },
 *   "mock": false
 * }
 */
app.post('/api/generate/kimi', async (req, res) => {
  try {
    const { prompt, llmConfig, mock } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ success: false, error: '缺少 prompt 字段' });
    }

    let type, config;

    const hasApiKey = (llmConfig && llmConfig.apiKey) || process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
    if (mock || !hasApiKey) {
      ({ type, config } = mockGenerateConfigFromPrompt(prompt));
    } else {
      ({ type, config } = await generateConfigFromPromptKimi(prompt, llmConfig || {}));
    }

    req.body = { type, config };
    return generateHandler(req, res);
  } catch (err) {
    console.error('Kimi 自然语言生成失败:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Kimi 自然语言生成失败',
    });
  }
});

/**
 * POST /api/parse/designer
 * 把设计器保存的 Layout JSON 反解析为 generator config
 *
 * 请求体：设计器保存的完整 Layout JSON（包含 value 字符串或已解析对象）
 */
app.post('/api/parse/designer', (req, res) => {
  try {
    const layoutJson = req.body;
    if (!layoutJson || typeof layoutJson !== 'object') {
      return res.status(400).json({ success: false, error: '请求体必须是 Layout JSON 对象' });
    }

    const result = designerToConfig(layoutJson);
    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('反解析失败:', err);
    return res.status(500).json({
      success: false,
      error: err.message || '反解析失败',
    });
  }
});

/**
 * POST /api/check
 * 对任意 Layout JSON 跑契约校验，返回结构化诊断（不生成、不落盘）
 *
 * 请求体（两种都支持）：
 *   1. { "layout": { ...Layout JSON... }, "ignore": ["ID005"], "strict": false }
 *   2. { ...Layout JSON... }            // 直接传 Layout JSON
 *
 * 可用 option：strict / ignore / only / severity
 * 响应：
 *   { success, ok, errors, warnings, diagnostics, summary, report }
 */
app.post('/api/check', (req, res) => {
  try {
    const body = req.body || {};
    const layoutJson = body.layout || body;
    if (!layoutJson || typeof layoutJson !== 'object' || Array.isArray(layoutJson)) {
      return res.status(400).json({ success: false, error: '请求体必须是 Layout JSON 对象' });
    }

    const options = {};
    for (const key of ['strict', 'ignore', 'only', 'severity']) {
      if (body[key] !== undefined) options[key] = body[key];
    }

    const result = describeLayout(layoutJson, options);
    return res.json({
      success: true,
      ok: result.ok,
      errors: result.errors,
      warnings: result.warnings,
      diagnostics: result.diagnostics,
      summary: result.summary,
      report: result.report,
    });
  } catch (err) {
    console.error('校验失败:', err);
    return res.status(500).json({
      success: false,
      error: err.message || '校验失败',
    });
  }
});

/**
 * POST /api/repair
 * 格式检查 + 强制修订：把「打不开 / 搭不上」的 JSON 修回来（纯计算，不落盘）。
 *
 * 请求体（三种都支持）：
 *   1. { "layout": { ...Layout JSON... } }   对象形态
 *   2. { "text": "<文件原始文本>" }          文件文本形态（能顺带修外层信封，含 BOM/尾随逗号）
 *   3. { ...Layout JSON... }                直接传 Layout JSON
 *
 * 响应：
 *   { success, ok, repaired, repairMethods, steps, warnings,
 *     formatProblems, structural, blocked, check, layout }
 *   layout 为修订后的对象（ok 时可直接落盘）；blocked 非空表示两道门没过、拒绝修订。
 */
app.post('/api/repair', (req, res) => {
  try {
    const payload = repairFromRequest(req.body || {});
    return res.json({ success: true, ...payload });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('格式修订失败:', err);
    return res.status(status).json({ success: false, error: err.message || '格式修订失败' });
  }
});

/**
 * POST /api/roundtrip
 * 把 Layout JSON 走一遍 Page IR 往返（lift → emit），确认可无损改写。
 *
 * 请求体：{ "layout": { ...Layout JSON... } } 或直接传 Layout JSON
 * 响应：{ success, irStable, valueStable, byteExact, stats, emitted }
 */
app.post('/api/roundtrip', (req, res) => {
  try {
    const body = req.body || {};
    const layoutJson = body.layout || body;
    if (!layoutJson || typeof layoutJson !== 'object' || Array.isArray(layoutJson)) {
      return res.status(400).json({ success: false, error: '请求体必须是 Layout JSON 对象' });
    }

    const { roundTrip } = require('./ir');
    const result = roundTrip(layoutJson);
    return res.json({
      success: true,
      irStable: result.irStable,
      valueStable: result.valueStable,
      byteExact: result.byteExact,
      stats: result.irAfter.stats,
      emitted: result.emitted,
    });
  } catch (err) {
    console.error('往返失败:', err);
    return res.status(500).json({
      success: false,
      error: err.message || '往返失败',
    });
  }
});

/**
 * POST /api/deploy
 * 把生成/校验后的 Layout JSON 部署到 MdFrontLayout，并可选同步 MdFunction
 *
 * 请求体：
 * {
 *   "layout": { ... Layout JSON ... },
 *   "layoutDir": "../../MdFrontLayout",
 *   "functionDir": "../../MdFunction",
 *   "createFunction": true,
 *   "parentGid": "...",
 *   "code": "...",
 *   "sequence": 0
 * }
 */
app.post('/api/deploy', (req, res) => {
  try {
    const data = deployFromRequest(req.body);
    return res.json({ success: true, data });
  } catch (err) {
    console.error('部署失败:', err);
    const statusCode = err.message && err.message.includes('必须包含 layout') ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      error: err.message || '部署失败',
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`RDC Layout Generator API 已启动: http://localhost:${PORT}`);
  console.log(`接口: POST /api/generate  |  POST /api/check  |  POST /api/repair  |  POST /api/roundtrip  |  POST /api/parse/designer  |  POST /api/deploy`);
  console.log(`成套: POST /api/ids  |  POST /api/generate/suite  （列表+编辑+弹窗一次生成，互引自动接线）`);
});
