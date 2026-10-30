// Explicit example schema, not a vendor SDK. Unknown upstream fields are not copied.
import { createHash } from 'node:crypto';
export const MAX_RESPONSE_BYTES = 64 * 1024;
export const MAX_PAGE_RECORDS = 100;
export const REQUEST_TIMEOUT_MS = 1500;
const fail = () => { throw new Error('BUSINESS_ADAPTER_FAILED'); };
const text = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000 || /[\x00-\x1f\x7f]/.test(value)) fail();
  return value.trim();
};
const integer = (value, min = 1) => {
  if (!Number.isSafeInteger(value) || value < min) fail();
  return value;
};
const rawId = value => {
  if (typeof value === 'number') return String(integer(value, 0));
  return text(value);
};
// Include source because domain entity identity is store/kind/id (not source).
// Preserve case/punctuation; replacing punctuation with '-' would cause collisions.
export const stableId = (sourceId, kind, value) => kind + '-' + createHash('sha256')
  .update(JSON.stringify([sourceId, kind, rawId(value)])).digest('hex');
const cursor = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 512 || /[\x00-\x1f\x7f]/.test(value)) fail();
  return value;
};
const amount = value => {
  integer(value, 0);
  if (value > 100000000000) fail();
  return value / 100;
};
const status = { pending: '待付款', paid: '待发货', shipped: '运输中', complete: '已完成', cancelled: '已取消' };

export function normalizePage(page, context) {
  if (!page || page.request_cursor !== context.cursor || !Array.isArray(page.rows) || page.rows.length > MAX_PAGE_RECORDS) fail();
  const next = cursor(page.next_cursor);
  // At end-of-feed the same cursor is allowed only for an empty page.
  if (next === context.cursor && page.rows.length) fail();
  const records = page.rows.map(row => {
    if (!row || !['product', 'customer', 'order', 'image'].includes(row.type) || typeof row.deleted !== 'boolean') fail();
    const id = (kind, value) => stableId(context.sourceId, kind, value);
    const record = { storeId: context.storeId, sourceId: context.sourceId, kind: row.type,
      id: id(row.type, row.external_id), version: integer(row.revision), updatedAt: text(row.modified_at),
      deleted: row.deleted, data: null };
    if (row.deleted) return record;
    const f = row.fields;
    if (!f || typeof f !== 'object' || Array.isArray(f)) fail();
    if (row.type === 'customer') {
      record.data = { name: text(f.display_name), conversationId: null,
        tags: [], notes: '' }; // Conversation mapping and free-form CRM notes require separate review.
    } else if (row.type === 'product') {
      if (!Array.isArray(f.image_ids) || f.image_ids.length > 30) fail();
      record.data = { id: record.id, sku: text(f.sku), name: text(f.title), category: text(f.category),
        price: '¥' + amount(f.price_fen).toFixed(2), model: text(f.model), summary: text(f.description),
        specs: [], images: f.image_ids.map(value => ({ id: id('image', value), label: 'Imported illustration' })),
        imageType: 'bag', color: '#5579a0', source: context.sourceId, updated: record.updatedAt.slice(0, 10) };
    } else if (row.type === 'image') {
      record.data = { productId: id('product', f.product_id), imageId: record.id,
        label: text(f.label), dataUrl: null }; // No remote image URL/bitmap fetching.
    } else {
      if (!Object.hasOwn(status, f.status) || !Array.isArray(f.lines) || !f.lines.length || f.lines.length > 100) fail();
      record.data = { orderId: record.id, customerId: id('customer', f.customer_id),
        items: f.lines.map(line => ({ productId: id('product', line.product_id), sku: text(line.sku),
          quantity: integer(line.quantity), specification: text(line.specification) })),
        status: status[f.status], amount: amount(f.total_fen), paymentStatus: text(f.payment),
        shippingStatus: text(f.shipping), afterSalesStatus: text(f.after_sales),
        updatedAt: record.updatedAt.slice(0, 10), source: context.sourceId };
    }
    return record;
  });
  return { cursor: next, records };
}

export async function readBounded(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_RESPONSE_BYTES) fail();
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}

export function rejectCredentialEcho(value, secret) {
  // Check decoded strings/keys, so JSON unicode escapes cannot conceal a token.
  if (typeof value === 'string' && value.includes(secret)) fail();
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key.includes(secret)) fail();
      rejectCredentialEcho(child, secret);
    }
  }
}
