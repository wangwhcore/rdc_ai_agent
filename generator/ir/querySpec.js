/**
 * 高级查询（漏斗）契约表 —— 生成期与 check 共用的唯一标定来源
 *
 * 所有数字都来自 401 份真实语料（225 个 AdvanceQueryHook / 390 条条件 /
 * 98 个 filterId 容器），不是拍脑袋定的。
 *
 * 结构回顾：
 *   desktop.layoutList['<AdvanceQueryHook.id>_filterId'] = { rows: [...] }
 *     每个 ColContainer 里放**一个**表单组件，property.filed === advancedQuery[].field
 *   AdvanceQueryHook.property.associateId === TableHook.id
 */

/** 容器键后缀：语料 159 个 *_filterId 键，归属 AQ 的 98 个全部是这个形态 */
const FILTER_CONTAINER_SUFFIX = '_filterId';

function filterContainerKey(hookId) {
  return `${hookId}${FILTER_CONTAINER_SUFFIX}`;
}

function isFilterContainerKey(key) {
  return typeof key === 'string' && key.endsWith(FILTER_CONTAINER_SUFFIX);
}

function filterContainerOwner(key) {
  return isFilterContainerKey(key) ? key.slice(0, -FILTER_CONTAINER_SUFFIX.length) : null;
}

/**
 * 查询组件 → operation
 * 语料 390 条条件实测：operation 是组件类型的函数，而不是独立配置项
 *   TextHook             -> like   205
 *   SelectHook           -> eq      61
 *   RangePickerComponent -> range   60
 *   CheckboxHook         -> in      54
 * 少数派（7/390 ≈ 1.8%）：TextHook→eq 3、SelectHook→like 2、SelectHook→in 2
 * 因此这个映射在 check 里只作为 info 级提示，不是 error。
 */
const COMPONENT_OPERATION = {
  TextHook: 'like',
  SelectHook: 'eq',
  RangePickerComponent: 'range',
  CheckboxHook: 'in',
  DatePickerHook: 'eq',
  InputNumberHook: 'eq',
};

/** 容器内允许出现的查询组件（语料只有这四种） */
const QUERY_COMPONENTS = Object.keys(COMPONENT_OPERATION);

/**
 * 表格列 fieldType → 查询组件（语料标定）
 *   100  text/''  -> TextHook | like
 *    50  date     -> RangePickerComponent | range
 *    33  enum     -> CheckboxHook | in
 *    32  enum     -> SelectHook | eq        ← enum 二义，语料五五开，默认取 SelectHook
 *    16  string   -> TextHook | like
 *     3  code     -> TextHook | like
 * enum 的二义无法从列推导：CheckboxHook 与 SelectHook 用的是同一个字典
 * （同一个 groupCode 在两组里都出现过），纯属设计器偏好。
 */
const FIELD_TYPE_COMPONENT = {
  '': 'TextHook',
  text: 'TextHook',
  string: 'TextHook',
  code: 'TextHook',
  number: 'InputNumberHook',
  currency: 'InputNumberHook',
  date: 'RangePickerComponent',
  datetime: 'RangePickerComponent',
  enum: 'SelectHook',
  boolean: 'CheckboxHook',
  // 中文写法（兼容 queryField 的老签名）
  文本: 'TextHook',
  下拉: 'SelectHook',
  多选: 'CheckboxHook',
  日期: 'RangePickerComponent',
  日期范围: 'RangePickerComponent',
  数字: 'InputNumberHook',
};

/** 旧写法 → 新写法。语料里从不出现 between，运行时用 range */
const OPERATION_ALIAS = { between: 'range' };

/** 表格里的固定列，永不作为查询条件 */
const FIXED_COLUMNS = ['serialNum', 'operation', 'rowSerialNum_EditTable'];

/** 条件默认栅格：8（一行 3 个）；CheckboxHook 语料里多为 24（独占整行） */
const DEFAULT_SPAN = 8;
const DEFAULT_SPAN_BY_COMPONENT = { CheckboxHook: 24 };

/** advancedQuery 条目的合法键集（语料 390/390 恰好这四个） */
const ADVANCED_QUERY_KEYS = ['field', 'operation', 'type', 'value'];

/** 新语料里 type 恒为 'val'、value 恒为 '' */
const DEFAULT_QUERY_VALUE_TYPE = 'val';

module.exports = {
  FILTER_CONTAINER_SUFFIX,
  filterContainerKey,
  isFilterContainerKey,
  filterContainerOwner,
  COMPONENT_OPERATION,
  QUERY_COMPONENTS,
  FIELD_TYPE_COMPONENT,
  OPERATION_ALIAS,
  FIXED_COLUMNS,
  DEFAULT_SPAN,
  DEFAULT_SPAN_BY_COMPONENT,
  ADVANCED_QUERY_KEYS,
  DEFAULT_QUERY_VALUE_TYPE,
};
