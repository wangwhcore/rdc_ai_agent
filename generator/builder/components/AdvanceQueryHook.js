const { uuid } = require('../uuid');

const FIELD_TYPE_MAP = {
  '文本': 'TextHook',
  'text': 'TextHook',
  '下拉': 'SelectHook',
  'select': 'SelectHook',
  '日期': 'DatePickerHook',
  'date': 'DatePickerHook',
  '日期范围': 'RangePickerComponent',
  'daterange': 'RangePickerComponent',
  '数字': 'InputNumberHook',
  'number': 'InputNumberHook',
};

const QUERY_TYPE_MAP = {
  '精确': 'eq',
  '等于': 'eq',
  'eq': 'eq',
  '模糊': 'like',
  'like': 'like',
  '范围': 'between',
  'between': 'between',
  '多选': 'in',
  'in': 'in',
};

class AdvanceQueryHook {
  constructor(options = {}) {
    this.id = options.id || uuid();
    this.associateId = options.associateId || '';
    this.mode = options.mode || 'default';
    this.searchVisible = options.searchVisible !== false;
    this.brifShow = options.brifShow || false;
    this.queryVisible = options.queryVisible || true;
    this.isMerage = options.isMerage !== false;
    this.brifWidth = options.brifWidth || 400;
    this.visible = options.visible !== false;
    this.placeholder = options.placeholder || '$${label.pleaseEnter}';
    this.title = options.title || '高级查询';
    this.fields = options.fields || [];
  }

  toJSON() {
    const firstField = this.fields[0];
    return {
      type: 'AdvanceQueryHook',
      property: {
        id: this.id,
        description: '查询区',
        size: '',
        enabled: true,
        filterField: '[]',
        componentTypeName: '',
        isSimpleQueryValidate: false,
        mode: this.mode,
        isFormValidate: false,
        advancedQuery: this.fields.map(f => this.buildField(f)),
        dataSetting: '',
        subscribes: [],
        searchVisible: this.searchVisible,
        brifShow: this.brifShow,
        queryVisible: this.queryVisible,
        isSearchControl: false,
        isMerage: this.isMerage,
        searchField: '',
        visible: this.visible,
        placeholder: firstField
          ? (firstField.placeholder || firstField.label)
          : this.placeholder,
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

  buildField(f) {
    return {
      label: f.label,
      field: f.field,
      fieldType: FIELD_TYPE_MAP[f.fieldType] || f.fieldType || 'TextHook',
      colSpan: f.colSpan || 8,
      queryType: QUERY_TYPE_MAP[f.queryType] || f.queryType || 'like',
      placeholder: f.placeholder || f.label,
      componentType: FIELD_TYPE_MAP[f.fieldType] || f.fieldType || 'TextHook',
      ...(f.dict ? { dictGroupCode: f.dict } : {}),
    };
  }
}

function addQuery(options) {
  return new AdvanceQueryHook(options);
}

function queryField(field, fieldType, queryType, extra = {}) {
  const mappedType = FIELD_TYPE_MAP[fieldType] || fieldType || 'TextHook';
  return {
    field,
    fieldType,
    queryType,
    label: extra.label || `\$\${label.${field}}`,
    placeholder: extra.placeholder || `\$\${label.${field}}`,
    colSpan: extra.colSpan || 8,
    componentType: mappedType,
    ...extra,
  };
}

module.exports = { AdvanceQueryHook, addQuery, queryField };
