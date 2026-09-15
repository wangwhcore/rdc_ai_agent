const { uuid } = require('../uuid');
const { text } = require('./TextHook');
const { select } = require('./SelectHook');
const { checkbox } = require('./CheckboxHook');
const { dateRange } = require('./RangePickerComponent');
const {
  COMPONENT_OPERATION,
  FIELD_TYPE_COMPONENT,
  OPERATION_ALIAS,
  FIXED_COLUMNS,
  DEFAULT_SPAN,
  DEFAULT_SPAN_BY_COMPONENT,
  DEFAULT_QUERY_VALUE_TYPE,
  filterContainerKey: makeFilterContainerKey,
} = require('../../ir/querySpec');

/**
 * 高级查询（漏斗）契约 —— 标定表在 `ir/querySpec.js`（生成期与 check 共用）。
 *
 * 结构（语料一致）：
 *   layoutList['<AdvanceQueryHook.id>_filterId'] = { rows: [...] }   ← 漏斗条件容器
 *     每列（ColContainer）里放**一个**表单组件，组件 property.filed === advancedQuery[].field
 *   非空的 advancedQuery（63 例）**全部**有容器；为空的 162 例中 127 例没有容器、
 *   35 例留着空容器 —— 所以「没有容器」是合法的，「非空却没容器」才是缺陷。
 *
 * 配对关系：
 *   AdvanceQueryHook.property.associateId -> TableHook 的 id（语料 218/225，7 例为空串）
 *   即「高级查询与表格成对出现」；没有高级查询时就是一个单独的表格，不生成任何 filterId 容器。
 */

/** operation → 查询组件（反向；用于兼容旧的 queryType 写法） */
const OPERATION_COMPONENT = {
  like: 'TextHook',
  eq: 'SelectHook',
  range: 'RangePickerComponent',
  between: 'RangePickerComponent', // 旧写法：语料里从不出现 between，运行时用 range
  in: 'CheckboxHook',
};

/** 表格里固定列，永远不作为查询条件 */
const FIXED_COLUMN_SET = new Set(FIXED_COLUMNS);

function operationOf(component) {
  return COMPONENT_OPERATION[component] || 'like';
}

function spanOf(component, explicit) {
  if (explicit) return Number(explicit);
  return DEFAULT_SPAN_BY_COMPONENT[component] || DEFAULT_SPAN;
}

/**
 * 把一个查询条件规范化为内部形态
 * @param {object} input 允许 { field, fieldType, queryType/operation, component, label, dict, span, ... }
 */
function normalizeCondition(input) {
  const field = input.field;
  if (!field) throw new Error('查询条件缺少 field');

  // 组件优先级：显式 component > queryType/operation 反查 > fieldType 推导
  let component = input.component;
  if (!component && (input.queryType || input.operation)) {
    const op = input.queryType || input.operation;
    component = OPERATION_COMPONENT[op] || FIELD_TYPE_COMPONENT[input.fieldType] || 'TextHook';
  }
  if (!component) component = FIELD_TYPE_COMPONENT[input.fieldType] || 'TextHook';

  // operation 以组件为准（语料：operation 是组件类型的函数），显式给的除外
  const explicitOp = input.operation || input.queryType;
  const operation = explicitOp
    ? (OPERATION_ALIAS[explicitOp] || explicitOp)
    : operationOf(component);

  const label = input.label || `\$\${label.${field}}`;
  return {
    field,
    label,
    component,
    operation,
    span: spanOf(component, input.span),
    dict: input.dict || input.dictGroupCode || '',
    description: input.description || label,
    props: input.props || {},
  };
}

/**
 * 列的「真实类型」要看两处：columnsType 优先，再退回 fieldType。
 *
 * 语料里 enum 列存的是 columnsType = { type: 'enumerate', code: '<字典>' }，
 * fieldType 也是 'enum'，但字典 code 只在 columnsType 里；
 * 而用 column(..., { tag: 'xxx' }) 写的列 fieldType 仍是 'text'，
 * columnsType 才是 { type: 'tag', tagType: 'xxx' }。
 * 只看 fieldType 会把这类枚举列误判成文本输入框，字典也会丢。
 */
function componentFromColumn(col) {
  const ct = (col.columnsType && typeof col.columnsType === 'object') ? col.columnsType : {};
  switch (ct.type) {
    case 'enumerate':
    case 'tag':
    case 'switch':
      return { component: 'SelectHook', dict: ct.code || ct.tagType || col.dict || '' };
    case 'date':
    case 'datetime':
      return { component: 'RangePickerComponent', dict: '' };
    case 'currency':
      return { component: 'InputNumberHook', dict: '' };
    case 'link':
      // 链接列是跳转用的，不作为查询条件
      return null;
    default:
      return { component: FIELD_TYPE_COMPONENT[col.fieldType] || 'TextHook', dict: col.dict || '' };
  }
}

/**
 * 从表格列推导查询条件 —— 这是「查询条件都来自于表格中的字段（包括类型）」的落点。
 *
 * @param {array} columns 表格列：ColumnHook 实例，或 { field, headerName, fieldType, ... } 普通对象
 * @param {object} [options]
 * @param {array} [options.only] 只保留这些 field（给出时按此顺序）
 * @param {array} [options.exclude] 排除这些 field
 */
function deriveQueryFields(columns, options = {}) {
  const list = (columns || []).map(c => {
    if (!c || typeof c !== 'object') return null;
    // ColumnHook 实例：字段在 this 上；普通对象直接读
    const field = c.field;
    if (!field) return null;
    const found = componentFromColumn(c);
    if (!found) return null; // link 等不可查询的列直接剔除
    const label = c.headerName || c.label || `\$\${label.${field}}`;
    return {
      field,
      fieldType: c.fieldType !== undefined ? c.fieldType : 'text',
      label,
      dict: found.dict,
      defaultComponent: found.component,
      columnsType: c.columnsType,
      source: c,
      query: c.query,
    };
  }).filter(Boolean);

  const byField = new Map(list.map(c => [c.field, c]));
  const exclude = new Set(options.exclude || []);
  let picked;

  if (Array.isArray(options.only) && options.only.length) {
    picked = options.only.map(f => {
      const name = typeof f === 'string' ? f : f.field;
      const base = byField.get(name);
      const extra = typeof f === 'string' ? {} : f;
      if (!base && !extra.fieldType && !extra.component) {
        throw new Error(
          `deriveQueryFields(): 查询字段 ${JSON.stringify(name)} 不在表格列里。` +
          '查询条件必须来自表格字段 —— 请检查 field 拼写，或显式给出 fieldType/component。'
        );
      }
      // 类型以表格列为准，显式传的覆盖
      return { ...(base || {}), ...extra, field: name };
    });
  } else {
    picked = list.filter(c => !FIXED_COLUMN_SET.has(c.field));
  }

  return picked
    .filter(c => !exclude.has(c.field))
    .filter(c => {
      if (c.query === false) return false;
      if (c.query && typeof c.query === 'object' && c.query.enabled === false) return false;
      return true;
    })
    .map(c => {
      const q = (c.query && typeof c.query === 'object') ? c.query : {};
      // 显式声明的优先级高于从列推导出来的；两者都读，
      // 这样 queryField(...) 的产物和 column(..., { query: {...} }) 的写法都能用
      return normalizeCondition({
        field: c.field,
        fieldType: c.fieldType,
        label: q.label || c.label,
        component: q.component || c.component || c.defaultComponent,
        operation: q.operation || c.operation,
        span: q.span || c.span,
        dict: q.dict || c.dict || '',
        description: q.description || c.description,
        props: q.props || c.props,
      });
    });
}

class AdvanceQueryHook {
  constructor(options = {}) {
    this.id = options.id || uuid();
    this.associateId = options.associateId || '';
    this.mode = options.mode || 'default';
    this.searchVisible = options.searchVisible !== false;
    this.brifShow = options.brifShow || false;
    // ★ 原为 `options.queryVisible || true` —— 恒为 true，传 false 也得到 true。
    // 语料 401 份实测该键取值：false 299 / true 145，**默认应为 false**（67%），
    // 所以旧写法不只是「参数失效」，默认值本身也与语料相反。
    // 同文件相邻的 searchVisible / isMerage / visible 都用的 `!== false`，
    // 只有这个写错，属实现内部不一致。
    this.queryVisible = options.queryVisible || false;
    this.isMerage = options.isMerage !== false;
    this.brifWidth = options.brifWidth || 400;
    this.visible = options.visible !== false;
    this.placeholder = options.placeholder || '$${label.pleaseEnter}';
    this.title = options.title || '高级查询';
    this.description = options.description || '查询区';

    // 条件：既接受规范化后的对象，也接受老签名 { field, fieldType, queryType }
    const raw = options.conditions || options.fields || [];
    this.conditions = raw.map(c => (c && c.component && c.operation ? c : normalizeCondition(c)));

    // ★ 组件实例与容器结构在**构造期**建好：toJSON() 里再生成 uuid 会让
    //   「内联挂载副本」与「components 映射副本」的 id 分叉，破坏幂等与逐字节 diff。
    this._conditions = this.conditions.map(c => this._buildConditionComponent(c));
    this._filterRows = this._buildFilterRows();
  }

  /** 条件对应的表单组件实例（已带稳定 id） */
  get conditionComponents() {
    return this._conditions.map(c => c.instance);
  }

  /** 容器的 layoutList 键：<HookId>_filterId（语料归属 AQ 的 98 个全部是这个形态） */
  get filterContainerKey() {
    return makeFilterContainerKey(this.id);
  }

  get hasConditions() {
    return this._conditions.length > 0;
  }

  _buildConditionComponent(cond) {
    const common = { field: cond.field, label: cond.label, dict: cond.dict, ...cond.props };
    let instance;
    switch (cond.component) {
      case 'SelectHook': instance = select(cond.field, cond.label, common); break;
      case 'CheckboxHook': instance = checkbox(cond.field, cond.label, common); break;
      case 'RangePickerComponent': instance = dateRange(cond.field, cond.label, common); break;
      case 'TextHook':
      default: instance = text(cond.field, cond.label, common); break;
    }
    return { cond, instance };
  }

  /**
   * 漏斗容器：每个条件一列，按栅格贪心填满 24 换行
   * 语料实测的行内列数分布 3,3 / 3,3,1 / 3,3,1,1 与「填满 24 换行」完全吻合
   */
  _buildFilterRows() {
    const rows = [];
    let cols = null;
    let used = 0;
    for (const { cond, instance } of this._conditions) {
      const span = cond.span;
      if (!cols || used + span > 24) {
        cols = [];
        used = 0;
        rows.push({ id: uuid(), cols });
      }
      cols.push({
        id: uuid(),
        span,
        component: instance.toJSON(),
      });
      used += span;
    }
    return rows;
  }

  toJSON() {
    const first = this.conditions[0];
    return {
      type: 'AdvanceQueryHook',
      property: {
        id: this.id,
        description: this.description,
        size: '',
        enabled: true,
        filterField: '[]',
        componentTypeName: '',
        isSimpleQueryValidate: false,
        mode: this.mode,
        isFormValidate: false,
        // ★ 真实形状只有这四个键（语料 390/390 全是 {field,operation,type,value}）
        advancedQuery: this.conditions.map(c => ({
          field: c.field,
          operation: c.operation,
          type: DEFAULT_QUERY_VALUE_TYPE,
          value: '',
        })),
        dataSetting: '',
        subscribes: [],
        searchVisible: this.searchVisible,
        brifShow: this.brifShow,
        queryVisible: this.queryVisible,
        isSearchControl: false,
        isMerage: this.isMerage,
        searchField: '',
        visible: this.visible,
        placeholder: first ? first.label : this.placeholder,
        // 语料 225/225 恒为 float:'left'（带引号）。运行时会把该字符串当 JS 值求值，
        // 写成裸标识符 float:left 会求值失败并被原样当成 style 字符串下发，
        // React 遍历字符串下标触发 “Failed to set an indexed property [0] on 'CSSStyleDeclaration'”。
        tagStyle: "{display:'inline-block',float:'left'}",
        title: this.title,
        isIndependentQuery: false,
        brifWidth: this.brifWidth,
        associateId: this.associateId,
        filterVisible: true,
        isMapRequest: false,
      },
    };
  }

  /**
   * 漏斗容器区域：{ '<HookId>_filterId': { rows } }
   * 没有条件时返回 {} —— 语料里 advancedQuery 为空的高级查询一个容器都没有。
   */
  buildFilterRegion() {
    if (!this.hasConditions) return {};
    return {
      [makeFilterContainerKey(this.id)]: {
        rows: this._filterRows.map(r => ({
          type: 'RowContainer',
          property: {
            id: r.id,
            style: { gutter: 32, justify: 'start', align: 'top', type: 'flex' },
          },
          cols: r.cols.map(c => ({
            type: 'ColContainer',
            property: {
              id: c.id,
              style: {
                pull: 0, span: c.span, xxl: c.span, order: 0, offset: 0,
                xl: c.span, md: c.span, sm: c.span, push: 0, lg: c.span, xs: c.span,
              },
            },
            components: [c.component],
          })),
        })),
      },
    };
  }

  /** 容器内组件的注册条目：必须全部登记到 desktop.components（语料 389/389） */
  buildConditionRegistrations() {
    return this._conditions.reduce((acc, { instance }) => {
      const json = instance.toJSON();
      acc[json.property.id] = json;
      return acc;
    }, {});
  }
}

function addQuery(options) {
  return new AdvanceQueryHook(options);
}

function queryField(field, fieldType, queryType, extra = {}) {
  // 老签名：queryField(field, '下拉', 'eq', { dict })；统一走 normalizeCondition。
  // 规范化结果覆盖同名字段，extra 里其它键（placeholder/colSpan 等）原样保留。
  const cond = normalizeCondition({
    field,
    fieldType,
    queryType,
    label: extra.label,
    span: extra.span || extra.colSpan,
    component: extra.component,
    operation: extra.operation,
    dict: extra.dict,
    description: extra.description,
    props: extra.props,
  });
  return {
    ...extra,
    ...cond,
    // 旧字段名别名：老调用方（configNormalizer / naturalLanguageService / 测试）仍按这套读
    fieldType: cond.component,
    componentType: cond.component,
    queryType: cond.operation,
    colSpan: extra.colSpan || cond.span,
  };
}

module.exports = {
  AdvanceQueryHook,
  addQuery,
  queryField,
  deriveQueryFields,
  normalizeCondition,
  componentFromColumn,
  // 以下常量定义在 ir/querySpec.js（check 侧共用同一份标定），此处仅做再导出
  COMPONENT_OPERATION,
  OPERATION_COMPONENT,
  FIELD_TYPE_COMPONENT,
  FIXED_COLUMNS,
  DEFAULT_SPAN,
  DEFAULT_SPAN_BY_COMPONENT,
};
