const OpenAI = require('openai');
const { diagnose } = require('../ir/jsonFormat');

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
    "functionGid": "00000000000000000000000000000000",
    "frontId": "00000000000000000000000000000000",
    "serverName": "purchase",
    "entityPath": "purchaseOrder",
    "entityIdField": "orderId",
    "listPageFrontId": "00000000000000000000000000000000",
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
- columns: [{"field", "headerName", "width", "fuzzyQuery", "fieldType", "tag"}]
- rowOperations: ["edit", "delete", "copy"]
- addEditPageFrontId, confirmModalFrontId
- queryFields（**可选**）：高级查询条件默认**由 columns 推导**，不必写。
  漏斗容器里的查询组件是按列类型定的：
    fieldType "text"/"string"/"code" -> 文本输入框（like）
    fieldType "date"               -> 日期范围（range）
    fieldType "enum" 或给了 "tag"   -> 下拉单选（eq）
  只有需要「只查部分列」「改查询组件类型」「显式指定字典」时才写：
    queryFields: ["status", "createTime"]                        // 只写字段名，类型自动从列上取
    queryFields: [{"field":"status","component":"CheckboxHook"}] // 改成多选（in）
  写成 queryFields: false 则表示**不生成高级查询**，页面只有一个单独的表格。

⚠️ 关于列的硬性要求：**查询条件完全来自 columns 的类型**，所以列的 fieldType 必须写准，
   否则高级查询里会出现错误的输入框（例如日期列变成文本框）。
   字典枚举列用 "tag": "<字典 groupCode>" 表示。

⚠️ 关于 id 的硬性要求（不遵守会导致页面运行时报错）：
- 所有 32 位 hex 的 id 一律写成全 0 占位符 "00000000000000000000000000000000"，
  由使用者后续替换；**绝对不要输出 "..." 这类省略号占位符**。
- 跨布局引用（addEditPageFrontId / confirmModalFrontId / listPageFrontId）填的是
  目标布局的 **frontId**，不是 MdFrontLayout 的文件名 gid，两者不通用。

请根据用户描述推断最合适的页面类型和字段。如果用户没有提供 functionGid/frontId 等元数据，使用上面的全 0 占位符。
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

  // LLM 直出的 JSON 常常带尾随逗号、JSON 注释、单引号、缺闭合括号、
  // 甚至在代码块外多说一句话 —— 这类格式问题改一个字符就能好，
  // 不该让整次生成失败。所以先做「格式检查 + 强制修订」，再解析。
  const d = diagnose(jsonStr, { label: 'LLM 返回内容' });

  let parsed;
  if (d.ok) {
    parsed = d.value;
  } else if (d.repairable) {
    parsed = d.repair.value;
    console.warn(`⚠️ LLM 返回内容存在 JSON 格式问题，已强制修订（${d.howToFix}）：`
      + `${d.problems.map(p => p.label || p.reason).join('、')}`);
    for (const w of d.repair.warnings) console.warn(`⚠️  ${w}`);
  } else {
    throw new Error(
      'LLM 返回内容无法解析为 JSON，且不属于可自动修订的类别'
      + (d.fatal ? `\n${d.fatal.message}` : '')
      + `\n原始内容:\n${content}`
    );
  }

  if (!parsed || !parsed.type || !parsed.config) {
    throw new Error('LLM 返回的 JSON 缺少 type 或 config 字段');
  }

  // 把修订情况挂在信封上（消费者只用 type/config，不影响既有调用方）
  parsed.repairReport = d.repairable
    ? {
      method: d.repair.method,
      methods: d.repair.methods,
      problems: d.problems.map(p => p.reason),
      warnings: d.repair.warnings,
    }
    : null;

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
    addEditPageFrontId: '00000000000000000000000000000000',
    confirmModalFrontId: '00000000000000000000000000000000',
    rowKey: 'gid',
    columns: fields
      .filter(f => f.type !== 'tabs' && f.type !== 'editTable')
      .map(f => ({
        field: f.field,
        headerName: `\$\$\{label.${f.field}\}`,
        width: 120,
        fuzzyQuery: f.type === 'text',
        // 列类型必须带上：高级查询条件是按列类型推导的
        ...(f.type === 'date' || f.type === 'dateRange' ? { fieldType: 'date' } : {}),
        ...(f.type === 'select' && f.options && f.options.dict ? { tag: f.options.dict } : {}),
      })),
    queryFields: fields
      .filter(f => ['text', 'select', 'date', 'dateRange'].includes(f.type))
      .map(f => {
        const isDate = f.type === 'date' || f.type === 'dateRange';
        const isSelect = f.type === 'select';
        const component = isDate ? 'RangePickerComponent' : (isSelect ? 'SelectHook' : 'TextHook');
        // operation 必须是组件对应的那个：日期范围是 range，不是 like
        const operation = isDate ? 'range' : (isSelect ? 'eq' : 'like');
        return {
          field: f.field,
          component,
          operation,
          // 旧字段名兼容（configNormalizer / batchParseDesigner 仍按这套读）
          fieldType: isDate ? '日期范围' : (isSelect ? '下拉' : '文本'),
          queryType: operation,
          ...(f.options && f.options.dict ? { dict: f.options.dict } : {}),
        };
      }),
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
    listPageFrontId: '00000000000000000000000000000000',
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
