const {
  buildAddEditPage,
  text,
  select,
  date,
  number,
  editTable,
  editColumn,
} = require('../index');

module.exports = buildAddEditPage({
  pageName: '采购订单',
  serverName: 'purchase',
  entityPath: 'purchaseOrder',
  entityIdField: 'orderId',
  functionGid: '92bc6124ae5a475dad12cfd1ebc286fa',
  listPageId: '00000000000000000000000000000000',
  colsPerRow: 2,
  colSpan: 12,
  fields: [
    text('orderCode', '订单编码').required(),
    select('status', '状态', { dict: 'orderStatus' }),
    date('orderDate', '订单日期'),
    text('supplierName', '供应商'),
    editTable('orderLines', '订单行', {
      title: '订单明细',
      rowKey: 'lineId',
      columns: [
        editColumn('lineNo', '行号', { width: 80, cellType: text('lineNo', '行号') }),
        editColumn('materialCode', '物料编码', { cellType: text('materialCode', '物料编码') }),
        editColumn('materialName', '物料名称', { cellType: text('materialName', '物料名称') }),
        editColumn('qty', '数量', { width: 100, cellType: number('qty', '数量') }),
        editColumn('price', '单价', { width: 100, cellType: number('price', '单价', { precision: 2 }) }),
      ],
    }),
  ],
});
