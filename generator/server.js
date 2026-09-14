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
const { designerToConfig } = require('./parser/designerToConfig');
const { deployFromRequest } = require('./services/deployService');

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
  console.log(`接口: POST /api/generate  |  POST /api/check  |  POST /api/roundtrip  |  POST /api/parse/designer  |  POST /api/deploy`);
});
