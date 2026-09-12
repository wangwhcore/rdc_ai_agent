const OpenAI = require('openai');

const DEFAULT_SYSTEM_PROMPT = `你是一个低代码平台 JSON 配置生成助手。
请把用户的自然语言需求转换为标准的 JSON 配置对象，用于生成 MdFrontLayout 页面。

可生成的页面类型：
- simpleForm：最简表单页（自由布局，字段垂直排列）
- list：列表页（Card + Table + 查询区）
- addEdit：新增/编辑页（带返回/保存按钮的详情页）
- view：查看页（只读详情页，字段默认 displayMode=true）

输出格式必须是纯 JSON，不要任何解释文字，格式如下：

{
  "type": "addEdit",
  "config": {
    "pageName": "页面名称",
    "functionGid": "...",
    "frontId": "...",
    "serverName": "purchase",
    "entityPath": "purchaseOrder",
    "entityIdField": "orderId",
    "listPageId": "...",
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
- 日期范围 -> dateRange
- 时间/时间选择 -> time
- 单选 -> radio，可配 options.dict
- 多选/复选 -> checkbox，可配 options.dict
- 开关/是否 -> switchField
- 附件/上传 -> upload
- 图片上传 -> reUpload，可配 options.uploadMode: "Dragger"
- 图片展示 -> image，可配 options.source
- 参照/弹窗选择 -> findback，可配 options.tableInfo
- 级联选择 -> neuCascader，可配 options.dataSource
- 树形选择 -> tree，可配 options.checkable
- 穿梭框 -> neuTransfer，可配 options.rowKey
- 状态标签 -> neuTag，可配 options.customValue
- 子表/明细/行项目 -> editTable 或 gridFieldTable，放在 fields 中作为独立字段
- 标签页 -> tabs，放在 fields 中，options.tabPanels 为 [{ title, layoutId }]

子表字段示例：
{ "type": "editTable", "field": "orderLines", "label": "订单明细", "options": { "rowKey": "lineId", "columns": [
  { "type": "editColumn", "field": "lineNo", "label": "行号", "options": { "cellType": { "type": "text", "field": "lineNo", "label": "行号" } } },
  { "type": "editColumn", "field": "qty", "label": "数量", "options": { "cellType": { "type": "number", "field": "qty", "label": "数量" } } }
] } }

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
 * 规则匹配 fallback，用于没有 LLM API Key 时做基础演示
 * 支持常见字段、子表、标签页、查看页等复杂结构
 */
function mockGenerateConfigFromPrompt(prompt) {
  const p = prompt.toLowerCase();

  const fields = parseFieldsFromPrompt(p);

  // 子表 / 明细
  if (p.includes('明细') || p.includes('子表') || p.includes('行项目') || p.includes('订单行')) {
    fields.push({
      type: 'editTable',
      field: 'lines',
      label: '明细',
      options: {
        rowKey: 'lineId',
        columns: [
          { type: 'editColumn', field: 'lineNo', label: '行号', options: { cellType: { type: 'text', field: 'lineNo', label: '行号' } } },
          { type: 'editColumn', field: 'materialName', label: '物料名称', options: { cellType: { type: 'text', field: 'materialName', label: '物料名称' } } },
          { type: 'editColumn', field: 'qty', label: '数量', options: { cellType: { type: 'number', field: 'qty', label: '数量' } } },
        ],
      },
    });
  }

  // 标签页
  if (p.includes('标签页') || p.includes('tab') || p.includes('tabs')) {
    fields.push({
      type: 'tabs',
      field: 'tabs',
      label: '标签页',
      options: {
        tabPanels: [
          { title: '基本信息', layoutId: 'tab-basic' },
          { title: '扩展信息', layoutId: 'tab-extra' },
        ],
      },
    });
  }

  if (fields.length === 0) {
    fields.push({ type: 'text', field: 'name', label: '名称' });
  }

  const isList = p.includes('列表') || p.includes('表格') || p.includes('查询') || p.includes('list');
  const isView = p.includes('查看') || p.includes('详情查看') || p.includes('只读');

  if (isList) {
    return {
      type: 'list',
      config: buildListConfig(fields),
    };
  }

  if (isView) {
    return {
      type: 'view',
      config: buildFormConfig('查看页', fields, true),
    };
  }

  return {
    type: 'addEdit',
    config: buildFormConfig('新增编辑页', fields, false),
  };
}

function parseFieldsFromPrompt(p) {
  const fields = [];

  const keywordMap = [
    { keys: ['编码', 'code'], field: 'code', type: 'text', label: '编码', required: true },
    { keys: ['名称', 'name'], field: 'name', type: 'text', label: '名称', required: true },
    { keys: ['类型', 'type'], field: 'type', type: 'select', label: '类型', options: { dict: 'typeDict' } },
    { keys: ['状态', 'status'], field: 'status', type: 'select', label: '状态', options: { dict: 'statusDict' } },
    { keys: ['日期范围', 'date range', 'daterange'], field: 'dateRange', type: 'dateRange', label: '日期范围' },
    { keys: ['日期', 'date'], field: 'createDate', type: 'date', label: '日期' },
    { keys: ['时间', 'time'], field: 'createTime', type: 'time', label: '时间' },
    { keys: ['数量', 'qty'], field: 'quantity', type: 'number', label: '数量', options: { precision: 0 } },
    { keys: ['金额', 'price', 'amount'], field: 'amount', type: 'number', label: '金额', options: { precision: 2 } },
    { keys: ['备注', 'remark'], field: 'remark', type: 'textarea', label: '备注' },
    { keys: ['附件', 'upload'], field: 'attachments', type: 'upload', label: '附件' },
    { keys: ['图片上传', 'image upload'], field: 'images', type: 'reUpload', label: '图片上传', options: { uploadMode: 'Dragger' } },
    { keys: ['图片', 'image'], field: 'image', type: 'image', label: '图片' },
    { keys: ['地区', '级联', 'cascader', 'region'], field: 'region', type: 'neuCascader', label: '地区' },
    { keys: ['树', 'tree', '分类'], field: 'categoryTree', type: 'tree', label: '分类' },
    { keys: ['穿梭框', 'transfer'], field: 'selected', type: 'neuTransfer', label: '已选' },
    { keys: ['标签', 'tag', '状态标签'], field: 'statusTag', type: 'neuTag', label: '状态' },
  ];

  for (const item of keywordMap) {
    if (item.keys.some(k => p.includes(k))) {
      fields.push({
        type: item.type,
        field: item.field,
        label: item.label,
        ...(item.required ? { required: true } : {}),
        ...(item.options ? { options: item.options } : {}),
      });
    }
  }

  return fields;
}

function buildListConfig(fields) {
  return {
    pageName: '示例列表页',
    serverName: 'example',
    listUrl: '/example/list',
    functionGid: '00000000000000000000000000000000',
    addEditPageId: '00000000000000000000000000000000',
    confirmModalId: '00000000000000000000000000000000',
    rowKey: 'gid',
    columns: fields
      .filter(f => f.type !== 'tabs' && f.type !== 'editTable')
      .map(f => ({
        field: f.field,
        headerName: `\$\$\{label.${f.field}\}`,
        width: 120,
        fuzzyQuery: f.type === 'text',
      })),
    queryFields: fields
      .filter(f => f.type === 'text' || f.type === 'select' || f.type === 'date' || f.type === 'dateRange')
      .map(f => ({
        field: f.field,
        fieldType: f.type === 'select' ? '下拉' : (f.type === 'date' ? '日期' : (f.type === 'dateRange' ? '日期范围' : '文本')),
        queryType: f.type === 'select' ? 'eq' : 'like',
        ...(f.options && f.options.dict ? { dict: f.options.dict } : {}),
      })),
    rowOperations: ['edit', 'delete'],
  };
}

function buildFormConfig(pageName, fields, isView) {
  return {
    pageName,
    functionGid: '00000000000000000000000000000000',
    serverName: 'example',
    entityPath: 'example',
    entityIdField: 'gid',
    listPageId: '00000000000000000000000000000000',
    productGid: '181A7E84452003',
    projectGid: 'PJ181A490E5D4001',
    appGid: '181A7E84452003',
    branch: 'test',
    createBy: 'sysadmin',
    createTime: '2022-09-14 02:02:39',
    lastModifiedBy: 'sysadmin',
    lastModifyTime: '2022-09-14 02:02:39',
    state: 1,
    fields: isView ? fields.map(f => ({ ...f, readonly: true })) : fields,
  };
}

/**
 * 使用 Kimi (Moonshot) 从自然语言 prompt 生成 config
 * Kimi API 兼容 OpenAI 格式
 * @param {string} prompt 用户输入
 * @param {object} options
 * @param {string} options.apiKey Kimi API Key
 * @param {string} options.model 模型名（默认 moonshot-v1-8k）
 */
async function generateConfigFromPromptKimi(prompt, options = {}) {
  const apiKey = options.apiKey || process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 Kimi API Key，请传入 options.apiKey 或设置 KIMI_API_KEY / MOONSHOT_API_KEY 环境变量');
  }

  return generateConfigFromPrompt(prompt, {
    apiKey,
    baseURL: 'https://api.moonshot.cn/v1',
    model: options.model || process.env.KIMI_MODEL || 'moonshot-v1-8k',
    systemPrompt: options.systemPrompt,
  });
}

module.exports = {
  generateConfigFromPrompt,
  generateConfigFromPromptKimi,
  mockGenerateConfigFromPrompt,
  DEFAULT_SYSTEM_PROMPT,
};
