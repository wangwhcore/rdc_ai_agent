const OpenAI = require('openai');

const DEFAULT_SYSTEM_PROMPT = `你是一个低代码平台 JSON 配置生成助手。
请把用户的自然语言需求转换为标准的 JSON 配置对象，用于生成 MdFrontLayout 页面。

可生成的页面类型：
- simpleForm：最简表单页（自由布局，字段垂直排列）
- list：列表页（Card + Table + 查询区）
- addEdit：新增/编辑页（带返回/保存按钮的详情页）

输出格式必须是纯 JSON，不要任何解释文字，格式如下：

{
  "type": "simpleForm",
  "config": {
    "pageName": "页面名称",
    "functionGid": "...",
    "frontId": "...",
    "productGid": "181A7E84452003",
    "projectGid": "PJ181A490E5D4001",
    "appGid": "181A7E84452003",
    "branch": "test",
    "createBy": "sysadmin",
    "createTime": "2022-09-14 02:02:39",
    "lastModifiedBy": "sysadmin",
    "lastModifyTime": "2022-09-14 02:02:39",
    "state": 1,
    "fields": [
      { "type": "text", "field": "code", "label": "编码", "required": true },
      { "type": "select", "field": "status", "label": "状态", "options": { "dict": "statusDict" } },
      { "type": "number", "field": "qty", "label": "数量", "options": { "precision": 2 } },
      { "type": "date", "field": "createDate", "label": "创建日期" },
      { "type": "textarea", "field": "remark", "label": "备注" }
    ]
  }
}

字段类型映射：
- 文本/输入框/单行文本 -> text
- 多行文本 -> textarea
- 下拉选择/下拉 -> select，需要 dict 时放在 options.dict
- 数字/金额/数量 -> number，可配 options.precision
- 日期/日期选择 -> date
- 单选 -> radio，可配 options.dict
- 多选/复选 -> checkbox，可配 options.dict
- 开关/是否 -> switchField
- 附件/上传 -> upload
- 参照/弹窗选择 -> findback，可配 options.tableInfo

对于 list 类型，config 需要：
- serverName, listUrl, rowKey
- columns: [{"field", "headerName", "width", "fuzzyQuery"}]
- queryFields: [{"field", "fieldType", "queryType", "dict"}]
- rowOperations: ["edit", "delete", "copy"]
- addEditPageId, confirmModalId

请根据用户描述推断最合适的页面类型和字段。如果用户没有提供 functionGid/frontId 等元数据，使用占位符或合理默认值。
`;

/**
 * 从自然语言 prompt 生成 config
 * @param {string} prompt 用户输入
 * @param {object} options
 * @param {string} options.apiKey LLM API Key
 * @param {string} options.baseURL LLM Base URL（可选）
 * @param {string} options.model 模型名（默认 gpt-3.5-turbo）
 * @param {string} options.systemPrompt 自定义 system prompt（可选）
 */
async function generateConfigFromPrompt(prompt, options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 LLM API Key，请传入 options.apiKey 或设置 OPENAI_API_KEY 环境变量');
  }

  const client = new OpenAI({
    apiKey,
    baseURL: options.baseURL || process.env.OPENAI_BASE_URL,
  });

  const completion = await client.chat.completions.create({
    model: options.model || process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: options.systemPrompt || DEFAULT_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
  });

  const content = completion.choices[0]?.message?.content || '';

  // 尝试提取 JSON
  let jsonStr = content.trim();

  // 如果 LLM 用 markdown 代码块包裹，提取中间 JSON
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`LLM 返回内容无法解析为 JSON: ${err.message}\n原始内容:\n${content}`);
  }

  if (!parsed.type || !parsed.config) {
    throw new Error('LLM 返回的 JSON 缺少 type 或 config 字段');
  }

  return parsed;
}

/**
 * 简单的规则匹配 fallback，用于没有 LLM API Key 时做基础演示
 * 仅支持识别常见字段关键词
 */
function mockGenerateConfigFromPrompt(prompt) {
  const p = prompt.toLowerCase();

  // 默认字段
  const fields = [];

  if (p.includes('编码') || p.includes('code')) {
    fields.push({ type: 'text', field: 'code', label: '编码', required: true });
  }
  if (p.includes('名称') || p.includes('name')) {
    fields.push({ type: 'text', field: 'name', label: '名称', required: true });
  }
  if (p.includes('类型') || p.includes('type')) {
    fields.push({ type: 'select', field: 'type', label: '类型', options: { dict: 'typeDict' } });
  }
  if (p.includes('状态') || p.includes('status')) {
    fields.push({ type: 'select', field: 'status', label: '状态', options: { dict: 'statusDict' } });
  }
  if (p.includes('日期') || p.includes('date')) {
    fields.push({ type: 'date', field: 'createDate', label: '日期' });
  }
  if (p.includes('数量') || p.includes('qty')) {
    fields.push({ type: 'number', field: 'quantity', label: '数量', options: { precision: 0 } });
  }
  if (p.includes('金额') || p.includes('price') || p.includes('amount')) {
    fields.push({ type: 'number', field: 'amount', label: '金额', options: { precision: 2 } });
  }
  if (p.includes('备注') || p.includes('remark')) {
    fields.push({ type: 'textarea', field: 'remark', label: '备注' });
  }
  if (p.includes('附件') || p.includes('upload')) {
    fields.push({ type: 'upload', field: 'attachments', label: '附件' });
  }

  if (fields.length === 0) {
    fields.push({ type: 'text', field: 'name', label: '名称' });
  }

  // 如果包含列表、表格、查询等词，生成列表页
  const isList = p.includes('列表') || p.includes('表格') || p.includes('查询') || p.includes('list');

  if (isList) {
    return {
      type: 'list',
      config: {
        pageName: '示例列表页',
        serverName: 'example',
        listUrl: '/example/list',
        functionGid: '00000000000000000000000000000000',
        addEditPageId: '00000000000000000000000000000000',
        confirmModalId: '00000000000000000000000000000000',
        rowKey: 'gid',
        columns: fields.map(f => ({
          field: f.field,
          headerName: `\$\${label.${f.field}}`,
          width: 120,
          fuzzyQuery: f.type === 'text',
        })),
        queryFields: fields
          .filter(f => f.type === 'text' || f.type === 'select' || f.type === 'date')
          .map(f => ({
            field: f.field,
            fieldType: f.type === 'select' ? '下拉' : (f.type === 'date' ? '日期' : '文本'),
            queryType: f.type === 'select' ? 'eq' : 'like',
            ...(f.options && f.options.dict ? { dict: f.options.dict } : {}),
          })),
        rowOperations: ['edit', 'delete'],
      },
    };
  }

  return {
    type: 'simpleForm',
    config: {
      pageName: '示例表单页',
      functionGid: '00000000000000000000000000000000',
      productGid: '181A7E84452003',
      projectGid: 'PJ181A490E5D4001',
      appGid: '181A7E84452003',
      branch: 'test',
      createBy: 'sysadmin',
      createTime: '2022-09-14 02:02:39',
      lastModifiedBy: 'sysadmin',
      lastModifyTime: '2022-09-14 02:02:39',
      state: 1,
      fields,
    },
  };
}

module.exports = { generateConfigFromPrompt, mockGenerateConfigFromPrompt, DEFAULT_SYSTEM_PROMPT };
