const {
  buildAddEditPage,
  text,
  select,
  date,
  number,
  textarea,
  neuTag,
  neuCascader,
  tree,
  time,
  reUpload,
  gridFieldTable,
  gridColumn,
  tabs,
} = require('../index');

module.exports = buildAddEditPage({
  pageName: '商品详情',
  serverName: 'product',
  entityPath: 'product',
  entityIdField: 'productId',
  functionGid: '00000000000000000000000000000000',
  listPageId: '00000000000000000000000000000000',
  colsPerRow: 3,
  colSpan: 8,
  fields: [
    text('productCode', '商品编码').required(),
    text('productName', '商品名称').required(),
    select('category', '分类', { dict: 'productCategory' }),
    neuTag('status', '状态', {
      customValue: "[{code:'ON',text:'在售',type:'success'},{code:'OFF',text:'停售',type:'error'}]",
    }),
    number('price', '售价', { precision: 2 }),
    date('launchDate', '上架日期'),
    time('saleStartTime', '开售时间'),
    neuCascader('region', '销售地区', {
      dataSource: { type: 'api', serverName: 'mdgeneric', url: '/md/address/getall' },
    }),
    tree('brandTree', '品牌树', { checkable: false }),
    textarea('description', '商品描述'),
    reUpload('images', '商品图片', { uploadMode: 'Dragger', fileKey: 'imageCodes' }),
    gridFieldTable('skus', 'SKU 明细', {
      rowKey: 'skuId',
      columns: [
        gridColumn('skuCode', 'SKU 编码', { cellType: text('skuCode', 'SKU 编码') }),
        gridColumn('spec', '规格', { cellType: text('spec', '规格') }),
        gridColumn('stock', '库存', { cellType: number('stock', '库存') }),
      ],
    }),
    tabs('附加信息')
      .addTab('物流设置', 'layout-logistics')
      .addTab('售后政策', 'layout-aftersale'),
  ],
});
