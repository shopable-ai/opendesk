// Entirely fictional and offline. No credentials, SDKs, network, or writes.
const updatedAt = '2026-10-30T00:00:00.000Z';
export default {
  id: 'offline-demo',
  async pull(context) {
    if (![null, 'demo-v1', 'demo-v2'].includes(context.cursor)) throw new Error('Unsupported demo cursor');
    const version = context.cursor === null ? 1 : 2;
    const record = (kind, id, data) => ({ storeId: context.storeId, sourceId: context.sourceId,
      kind, id, version, updatedAt, deleted: false, data });
    return { cursor: `demo-v${version}`, records: [
      record('product', 'crm-product-1', {
        id: 'crm-product-1', sku: 'CRM-DEMO-001', name: '  Offline demo bag  ', category: '箱包',
        price: '¥159', model: 'CRM-BAG-1', summary: 'Fictional offline product',
        specs: [{ label: 'Material', value: 'Canvas' }], images: [{ id: 'crm-image-1', label: 'Offline illustration' }],
        imageType: 'bag', color: '#5579a0', source: 'offline-demo', updated: '2026-10-30',
      }),
      record('customer', 'crm-customer-1', { name: '  Fictional customer  ', conversationId: null, tags: [], notes: 'Offline example only' }),
      record('order', 'crm-order-1', {
        orderId: 'crm-order-1', customerId: 'crm-customer-1',
        items: [{ productId: 'crm-product-1', sku: 'CRM-DEMO-001', quantity: 1, specification: 'Canvas' }],
        status: version === 1 ? '待发货' : '已完成', amount: 159, paymentStatus: '已支付（演示）',
        shippingStatus: version === 1 ? '待出库（演示）' : '已签收（演示）', afterSalesStatus: '暂无售后记录',
        updatedAt: '2026-10-30', source: 'offline-demo',
      }),
      record('image', 'crm-image-1', { productId: 'crm-product-1', imageId: 'crm-image-1', label: 'Offline illustration', dataUrl: null }),
    ] };
  },
  normalize(record, context) {
    if (!Object.isFrozen(context)) throw new Error('Context must be frozen');
    return record.data?.name ? { ...record, data: { ...record.data, name: record.data.name.trim() } } : record;
  },
  afterSync(summary) {
    if (!Object.isFrozen(summary) || summary.total !== 4 || summary.product !== 1 ||
        summary.customer !== 1 || summary.order !== 1 || summary.image !== 1) throw new Error('Unexpected demo counts');
  },
};
