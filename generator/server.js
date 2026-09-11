const express = require('express');
const {
  buildListPage,
  buildAddEditPage,
  validate,
  column,
  queryField,
  text,
  select,
  date,
  textarea,
} = require('./index');

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

const FIELD_BUILDERS = {
  text,
  TextHook: text,
  select,
  SelectHook: select,
  date,
  DatePickerHook: date,
  textarea,
  TextAreaHook: textarea,
};

/**
 * 把用户传来的普通 JSON config 转换为 DSL 实例
 */
function normalizeListConfig(config) {
  const normalized = { ...config };

  if (Array.isArray(config.columns)) {
    normalized.columns = config.columns.map(c =>
      c && typeof c === 'object' && c.field
        ? column(c.field, c.headerName, {
            width: c.width,
            sort: c.sort,
            fuzzyQuery: c.fuzzyQuery,
            tag: c.tag,
            link: c.link,
            fieldType: c.fieldType,
            columnsType: c.columnsType,
          })
        : c
    );
  }

  if (Array.isArray(config.queryFields)) {
    normalized.queryFields = config.queryFields.map(f =>
      f && typeof f === 'object' && f.field
        ? queryField(f.field, f.fieldType, f.queryType, {
            label: f.label,
            placeholder: f.placeholder,
            colSpan: f.colSpan,
            dict: f.dict,
          })
        : f
    );
  }

  return normalized;
}

function normalizeAddEditConfig(config) {
  const normalized = { ...config };

  if (Array.isArray(config.fields)) {
    normalized.fields = config.fields.map(f => {
      if (!f || typeof f !== 'object' || !f.type || !f.field) {
        return f;
      }
      const builder = FIELD_BUILDERS[f.type];
      if (!builder) {
        throw new Error(`不支持的字段类型: ${f.type}`);
      }
      let inst = builder(f.field, f.label, f.options || {});
      if (f.required) inst = inst.required();
      if (f.readonly) inst = inst.readonly();
      return inst;
    });
  }

  return normalized;
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
      default:
        return res.status(400).json({
          success: false,
          error: `不支持的 type: ${type}，目前支持 list / addEdit`,
        });
    }

    const validation = validate(layoutJson);
    if (!validation.ok) {
      return res.status(422).json({
        success: false,
        error: '生成结果校验失败',
        details: validation.errors,
      });
    }

    return res.json({ success: true, data: layoutJson });
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
 *   "type": "list" | "addEdit",
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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`RDC Layout Generator API 已启动: http://localhost:${PORT}`);
  console.log(`接口: POST /api/generate`);
});
