import { products, allOrders, customers, isCustomerId, type Product, type Order, type CustomerId } from './catalog';

export type Store = { id: string; name: string };
export type EntityKind = 'product' | 'order' | 'image' | 'customer';
export type CustomerData = { name: string; conversationId: CustomerId | null; tags: string[]; notes: string };
export type ImageData = { productId: string; imageId: string; label: string; dataUrl: string | null };
type DataByKind = { product: Product; order: Order; image: ImageData; customer: CustomerData };
export type Entity = { [K in EntityKind]: {
  storeId: string; sourceId: string; kind: K; id: string; version: number;
  updatedAt: string; deleted: boolean; data: DataByKind[K] | null;
} }[EntityKind];
export type Snapshot = {
  schemaVersion: 1; storeId: string; sourceId: string;
  previousCursor: string | null; cursor: string; records: Entity[];
};
export type BusinessState = {
  revision: number; stores: Store[]; records: Entity[]; overrides: Entity[]; cursors: Record<string, string>;
};
export type ImportPreview = {
  baseRevision: number; snapshot: Snapshot; added: number; updated: number; deleted: number; unchanged: number;
};

// Limits apply to deltas AND the accumulated store (including tombstones), so paging cannot bypass them.
export const BUSINESS_LIMITS = Object.freeze({
  maxRecordsPerStore: 1000, maxStores: 20, maxImageBytes: 128 * 1024,
  maxSnapshotBytes: 1024 * 1024, maxBackupBytes: 8 * 1024 * 1024,
  maxStoreBytes: 6 * 1024 * 1024, maxImageDimension: 4096, maxImagePixels: 4 * 1024 * 1024
});
const { maxRecordsPerStore: MAX_RECORDS, maxStores: MAX_STORES, maxImageBytes: MAX_IMAGE_BYTES,
  maxSnapshotBytes: MAX_SNAPSHOT_BYTES, maxBackupBytes: MAX_BACKUP_BYTES, maxStoreBytes: MAX_STORE_BYTES } = BUSINESS_LIMITS;
const BACKUP_FORMAT = 'opendesk.ai-customer-support.business-backup';
const kinds: EntityKind[] = ['product', 'order', 'image', 'customer'];
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
function fail(message: string): never { throw new Error('Business data: ' + message); }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
// Keep the shared reducer bundle usable in a plain ECMAScript/Goja realm too.
const bytes = (s: string) => {
  let size = 0;
  for (const character of s) {
    const code = character.codePointAt(0)!;
    size += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return size;
};

function object(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('expected plain object');
  const o = value as Record<string, unknown>;
  if (keys && (Object.keys(o).length !== keys.length || keys.some(k => !Object.hasOwn(o, k)))) fail('missing or unknown keys');
  if (keys && Object.keys(o).some(k => !keys.includes(k))) fail('unknown key');
  return o;
}
function text(value: unknown, max = 2000, empty = false): asserts value is string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail('invalid string');
}
function id(value: unknown): asserts value is string {
  text(value, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/\-]*$/.test(value) || forbidden.has(value)) fail('invalid identifier');
}
function integer(value: unknown, min = 1, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) fail('invalid integer');
}
function list(value: unknown, max: number, min = 0): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail('invalid array size');
}
function date(value: unknown, timestamp = false): asserts value is string {
  text(value, 30);
  if (timestamp) {
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) ||
        !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z')) fail('invalid UTC timestamp');
  } else if (!/^\d{4}-\d\d-\d\d$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('invalid date');
}
function safeTree(value: unknown, maxBytes: number): void {
  let nodes = 0;
  function walk(v: unknown, depth: number): void {
    if (++nodes > 250000 || depth > 20) fail('JSON complexity limit');
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return;
    if (typeof v === 'number') { if (!Number.isFinite(v)) fail('nonfinite number'); return; }
    if (typeof v !== 'object') fail('not JSON data');
    if (Array.isArray(v)) {
      if (v.length > MAX_STORES * MAX_RECORDS * 2) fail('array limit');
      if (Object.getPrototypeOf(v) !== Array.prototype || Reflect.ownKeys(v).length !== v.length + 1) fail('not JSON array');
      for (let i = 0; i < v.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(v, String(i));
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) fail('not JSON array item');
        walk(descriptor.value, depth + 1);
      }
    } else {
      const o = object(v);
      for (const key of Reflect.ownKeys(o)) {
        if (typeof key !== 'string' || forbidden.has(key)) fail('prototype key');
        const descriptor = Object.getOwnPropertyDescriptor(o, key)!;
        if (!descriptor.enumerable || !('value' in descriptor)) fail('not JSON property');
        walk(descriptor.value, depth + 1);
      }
    }
  }
  walk(value, 0);
  if (bytes(JSON.stringify(value)) > maxBytes) fail('JSON byte limit');
}
function parse(textValue: string, max: number): unknown {
  if (typeof textValue !== 'string' || textValue.length > max || bytes(textValue) > max) fail('JSON byte limit');
  let value: unknown;
  try { value = JSON.parse(textValue); } catch { return fail('invalid JSON'); }
  safeTree(value, max);
  return value;
}
// Structural container checks are shared by UI, CLI and JSON imports. A browser decoder is an
// additional check, since bounded headers cannot prove validity of every compressed bitstream.
function bitmapDimensions(raw: string, type: string): [number, number] {
  const u = (n: number) => raw.charCodeAt(n);
  const be16 = (n: number) => u(n) * 256 + u(n + 1);
  const be32 = (n: number) => u(n) * 16777216 + u(n + 1) * 65536 + u(n + 2) * 256 + u(n + 3);
  const le16 = (n: number) => u(n) + u(n + 1) * 256;
  const le24 = (n: number) => le16(n) + u(n + 2) * 65536;
  const le32 = (n: number) => le24(n) + u(n + 3) * 16777216;
  if (type === 'png') {
    if (!raw.startsWith('\x89PNG\r\n\x1a\n')) fail('bitmap magic bytes mismatch');
    let offset = 8, width = 0, height = 0, imageData = false, ended = false;
    while (offset + 12 <= raw.length) {
      const length = be32(offset), tag = raw.slice(offset + 4, offset + 8), data = offset + 8;
      if (length > raw.length - offset - 12) fail('truncated PNG chunk');
      if (offset === 8 && (tag !== 'IHDR' || length !== 13)) fail('missing PNG IHDR');
      if (tag === 'IHDR') {
        if (offset !== 8 || length !== 13) fail('invalid PNG IHDR');
        width = be32(data); height = be32(data + 4);
        const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
        if (!depths[u(data + 9)]?.includes(u(data + 8)) || u(data + 10) !== 0 || u(data + 11) !== 0 || u(data + 12) > 1) fail('invalid PNG encoding');
      } else if (tag === 'IDAT') imageData ||= length > 0;
      else if (tag === 'acTL') fail('animated PNG not supported');
      else if (tag === 'IEND') {
        if (length !== 0 || !imageData || offset + 12 !== raw.length) fail('invalid PNG end');
        ended = true;
      }
      offset += length + 12;
    }
    if (!ended || offset !== raw.length) fail('truncated PNG');
    return [width, height];
  }
  if (type === 'jpeg') {
    if (raw.length < 4 || u(0) !== 255 || u(1) !== 216) fail('bitmap magic bytes mismatch');
    let offset = 2, width = 0, height = 0, scan = false, entropy = false;
    while (offset < raw.length) {
      if (u(offset++) !== 255) fail('invalid JPEG marker');
      while (offset < raw.length && u(offset) === 255) offset++;
      const marker = u(offset++);
      if (marker === 217) {
        if (!scan || !entropy || offset !== raw.length) fail('truncated JPEG image');
        return [width, height];
      }
      if (marker === 216 || marker === 0 || (marker >= 208 && marker <= 215) || offset + 2 > raw.length) fail('invalid JPEG segment');
      const length = be16(offset), data = offset + 2;
      if (length < 2 || length > raw.length - offset) fail('truncated JPEG segment');
      if ([192, 193, 194].includes(marker)) {
        if (width || length < 11 || u(data) !== 8 || u(data + 5) < 1 || u(data + 5) > 4 || length !== 8 + 3 * u(data + 5)) fail('invalid JPEG SOF');
        height = be16(data + 1); width = be16(data + 3);
      } else if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) fail('unsupported JPEG SOF');
      offset += length;
      if (marker === 218) {
        if (!width || !height || length < 8 || u(data) < 1 || u(data) > 4 || length !== 6 + 2 * u(data)) fail('invalid JPEG SOS');
        scan = true;
        while (offset < raw.length) {
          if (u(offset) !== 255) { entropy = true; offset++; continue; }
          if (offset + 1 >= raw.length) fail('truncated JPEG scan');
          const next = u(offset + 1);
          if (next === 0 || (next >= 208 && next <= 215)) { entropy = true; offset += 2; continue; }
          break;
        }
      }
    }
    return fail('missing JPEG EOI');
  }
  if (!raw.startsWith('RIFF') || raw.slice(8, 12) !== 'WEBP' || raw.length < 20 || le32(4) !== raw.length - 8) fail('bitmap magic bytes mismatch');
  let offset = 12, canvas: [number, number] | undefined, image: [number, number] | undefined;
  while (offset + 8 <= raw.length) {
    const tag = raw.slice(offset, offset + 4), length = le32(offset + 4), data = offset + 8;
    if (length > raw.length - data || data + length + (length % 2) > raw.length) fail('truncated WebP chunk');
    if (tag === 'VP8X') {
      if (offset !== 12 || canvas || length !== 10 || (u(data) & 0xc3) || le24(data + 1) !== 0) fail('invalid or animated WebP');
      canvas = [le24(data + 4) + 1, le24(data + 7) + 1];
    } else if (tag === 'VP8 ') {
      if (image || length <= 10 || (u(data) & 1) || raw.slice(data + 3, data + 6) !== '\x9d\x01\x2a') fail('invalid WebP VP8');
      image = [le16(data + 6) & 0x3fff, le16(data + 8) & 0x3fff];
    } else if (tag === 'VP8L') {
      if (image || length <= 5 || u(data) !== 47 || (u(data + 4) >> 5) !== 0) fail('invalid WebP VP8L');
      const bits = le32(data + 1);
      image = [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    } else if (tag === 'ANIM' || tag === 'ANMF') fail('animated WebP not supported');
    offset = data + length + (length % 2);
  }
  if (!image || offset !== raw.length || (canvas && (canvas[0] !== image[0] || canvas[1] !== image[1]))) fail('invalid WebP dimensions/chunks');
  return image;
}
function bitmap(value: unknown): void {
  if (value === null) return;
  text(value, Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64);
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) fail('only base64 PNG/JPEG/WebP bitmaps allowed');
  let raw: string;
  try { raw = atob(match[2]); } catch { return fail('invalid base64'); }
  if (raw.length > MAX_IMAGE_BYTES || btoa(raw) !== match[2]) fail('bitmap size or encoding');
  const [width, height] = bitmapDimensions(raw, match[1]);
  if (!width || !height || width > BUSINESS_LIMITS.maxImageDimension || height > BUSINESS_LIMITS.maxImageDimension ||
      width * height > BUSINESS_LIMITS.maxImagePixels) fail('bitmap dimensions/pixel limit');
}
function validateEntity(value: unknown): asserts value is Entity {
  const e = object(value, ['storeId', 'sourceId', 'kind', 'id', 'version', 'updatedAt', 'deleted', 'data']);
  id(e.storeId); id(e.sourceId); id(e.id); integer(e.version); date(e.updatedAt, true);
  if (!kinds.includes(e.kind as EntityKind) || typeof e.deleted !== 'boolean') fail('invalid kind/deleted');
  if (e.deleted) { if (e.data !== null) fail('tombstone must have null data'); return; }
  if (e.kind === 'product') {
    const p = object(e.data, ['id', 'sku', 'name', 'category', 'price', 'model', 'summary', 'specs', 'imageType', 'color', 'images', 'source', 'updated']);
    if (p.id !== e.id) fail('product id mismatch');
    id(p.id); id(p.sku);
    for (const k of ['name', 'category', 'model', 'summary', 'source']) text(p[k]);
    text(p.price, 32);
    if (!/^¥(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(p.price)) fail('invalid product price');
    date(p.updated);
    if (!['jacket', 'shoe', 'bottle', 'speaker', 'bag', 'shirt'].includes(p.imageType as string)) fail('invalid imageType');
    if (typeof p.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(p.color)) fail('invalid color');
    list(p.specs, 30); list(p.images, 30);
    for (const item of p.specs) { const v = object(item, ['label', 'value']); text(v.label, 200); text(v.value); }
    const ids = new Set();
    for (const item of p.images) {
      const v = object(item, ['id', 'label']); id(v.id); text(v.label, 200);
      if (ids.has(v.id)) fail('duplicate product image id'); ids.add(v.id);
    }
  } else if (e.kind === 'order') {
    const o = object(e.data, ['orderId', 'customerId', 'items', 'status', 'amount', 'paymentStatus', 'shippingStatus', 'afterSalesStatus', 'updatedAt', 'source']);
    if (o.orderId !== e.id) fail('order id mismatch');
    id(o.orderId); id(o.customerId); date(o.updatedAt);
    if (!['待付款', '待发货', '运输中', '已完成', '售后中', '已取消', '已关闭'].includes(o.status as string)) fail('invalid order status');
    // v1 money is fixed CNY. Convert to safe integer fen and require an exact round trip.
    if (typeof o.amount !== 'number' || !Number.isFinite(o.amount) || o.amount < 0 || o.amount > 1e9 || !Number.isSafeInteger(Math.round(o.amount * 100)) || Math.round(o.amount * 100) / 100 !== o.amount) fail('invalid amount');
    for (const k of ['paymentStatus', 'shippingStatus', 'afterSalesStatus', 'source']) text(o[k]);
    list(o.items, 100, 1);
    for (const item of o.items) {
      const v = object(item, ['productId', 'sku', 'quantity', 'specification']);
      id(v.productId); id(v.sku); integer(v.quantity, 1, 100000); text(v.specification);
    }
  } else if (e.kind === 'customer') {
    const c = object(e.data, ['name', 'conversationId', 'tags', 'notes']);
    text(c.name, 200); text(c.notes, 10000, true); list(c.tags, 30);
    for (const tag of c.tags) text(tag, 100);
    if (new Set(c.tags).size !== c.tags.length) fail('duplicate tags');
    if (c.conversationId !== null && !isCustomerId(c.conversationId)) fail('invalid conversation mapping');
  } else {
    const image = object(e.data, ['productId', 'imageId', 'label', 'dataUrl']);
    id(image.productId); id(image.imageId); text(image.label, 200); bitmap(image.dataUrl);
  }
}
export const entityKey = (e: Pick<Entity, 'storeId' | 'kind' | 'id'>): string => JSON.stringify([e.storeId, e.kind, e.id]);
const cursorKey = (storeId: string, sourceId: string) => JSON.stringify([storeId, sourceId]);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(value);
}
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
function effective(state: BusinessState): Entity[] {
  const map = new Map(state.records.map(e => [entityKey(e), e]));
  for (const e of state.overrides) map.set(entityKey(e), e);
  return [...map.values()].filter(e => !e.deleted);
}
export function effectiveEntities<K extends EntityKind>(state: BusinessState, storeId: string, kind: K): Extract<Entity, { kind: K }>[];
export function effectiveEntities(state: BusinessState, storeId: string): Entity[];
export function effectiveEntities(state: BusinessState, storeId: string, kind?: EntityKind): Entity[];
export function effectiveEntities(state: BusinessState, storeId: string, kind?: EntityKind): Entity[] {
  // Return detached data: a consumer cannot silently modify a reviewed import through a view result.
  return clone(effective(state).filter(e => e.storeId === storeId && (!kind || e.kind === kind)));
}
function references(records: Entity[]): void {
  const map = new Map(records.filter(e => !e.deleted).map(e => [entityKey(e), e]));
  const slots = new Set<string>(), images = new Set<string>();
  for (const e of map.values()) {
    const ref = (kind: EntityKind, target: string) => {
      const found = map.get(entityKey({ storeId: e.storeId, kind, id: target }));
      if (!found || found.sourceId !== e.sourceId) fail('dangling or cross-source reference');
      return found;
    };
    if (e.kind === 'order' && e.data) {
      ref('customer', e.data.customerId);
      for (const item of e.data.items) {
        const p = ref('product', item.productId);
        if (p.kind !== 'product' || p.data?.sku !== item.sku) fail('order SKU mismatch');
      }
    } else if (e.kind === 'image' && e.data) {
      const p = ref('product', e.data.productId);
      if (p.kind !== 'product' || !p.data?.images.some(i => i.id === e.data!.imageId)) fail('unknown product image');
      const key = JSON.stringify([e.storeId, e.data.productId, e.data.imageId]);
      if (images.has(key)) fail('duplicate image slot'); images.add(key);
    } else if (e.kind === 'customer' && e.data?.conversationId) {
      const key = JSON.stringify([e.storeId, e.data.conversationId]);
      if (slots.has(key)) fail('duplicate conversation mapping'); slots.add(key);
    }
  }
}
function validateState(value: unknown): asserts value is BusinessState {
  safeTree(value, MAX_BACKUP_BYTES);
  const s = object(value, ['revision', 'stores', 'records', 'overrides', 'cursors']);
  integer(s.revision, 0); list(s.stores, MAX_STORES, 1); list(s.records, MAX_STORES * MAX_RECORDS); list(s.overrides, MAX_STORES * MAX_RECORDS);
  const stores = new Set<string>();
  for (const store of s.stores) { const v = object(store, ['id', 'name']); id(v.id); text(v.name, 200); if (stores.has(v.id)) fail('duplicate store'); stores.add(v.id); }
  const records = new Map<string, Entity>(), overrides = new Set<string>();
  for (const value of s.records) {
    validateEntity(value);
    if (!stores.has(value.storeId)) fail('unknown store');
    const key = entityKey(value);
    if (records.has(key)) fail('duplicate entity / ownership collision'); records.set(key, value);
  }
  for (const value of s.overrides) {
    validateEntity(value);
    const key = entityKey(value), base = records.get(key);
    if (!base || base.deleted || value.sourceId === 'local' || value.kind === 'order' || value.sourceId !== base.sourceId || value.version !== base.version || Date.parse(value.updatedAt) < Date.parse(base.updatedAt)) fail('invalid local override owner/version');
    if (overrides.has(key)) fail('duplicate override'); overrides.add(key);
  }
  const cursors = object(s.cursors);
  if (Object.keys(cursors).length > MAX_STORES * MAX_RECORDS) fail('cursor limit');
  for (const [key, cursor] of Object.entries(cursors)) {
    let pair: unknown;
    try { pair = JSON.parse(key); } catch { return fail('invalid cursor key'); }
    list(pair, 2, 2); id(pair[0]); id(pair[1]);
    if (!stores.has(pair[0]) || pair[1] === 'local' || JSON.stringify(pair) !== key) fail('invalid cursor owner');
    text(cursor, 512);
  }
  const state = value as BusinessState;
  for (const storeId of stores) {
    const r = state.records.filter(e => e.storeId === storeId), o = state.overrides.filter(e => e.storeId === storeId);
    if (r.length > MAX_RECORDS || o.length > MAX_RECORDS || bytes(JSON.stringify([r, o])) > MAX_STORE_BYTES) fail('whole store limit');
  }
  references(state.records); references(effective(state));
}
function validateSnapshot(value: unknown): asserts value is Snapshot {
  safeTree(value, MAX_SNAPSHOT_BYTES);
  const s = object(value, ['schemaVersion', 'storeId', 'sourceId', 'previousCursor', 'cursor', 'records']);
  if (s.schemaVersion !== 1) fail('unsupported snapshot schema');
  id(s.storeId); id(s.sourceId); if (s.sourceId === 'local') fail('reserved local source');
  if (s.previousCursor !== null) text(s.previousCursor, 512);
  text(s.cursor, 512); list(s.records, MAX_RECORDS);
  const keys = new Set<string>();
  for (const e of s.records) {
    validateEntity(e);
    if (e.storeId !== s.storeId || e.sourceId !== s.sourceId) fail('batch owner mismatch');
    const key = entityKey(e); if (keys.has(key)) fail('duplicate batch entity'); keys.add(key);
  }
}
export function parseBusinessSnapshot(value: string): Snapshot {
  const snapshot = parse(value, MAX_SNAPSHOT_BYTES); validateSnapshot(snapshot); return snapshot;
}
function planImport(state: BusinessState, snapshot: Snapshot): { preview: ImportPreview; state: BusinessState } {
  validateState(state); validateSnapshot(snapshot);
  if (!state.stores.some(s => s.id === snapshot.storeId)) fail('unknown store');
  const key = cursorKey(snapshot.storeId, snapshot.sourceId), current = state.cursors[key] ?? null;
  const records = new Map(state.records.map(e => [entityKey(e), e]));
  const preview: ImportPreview = { baseRevision: state.revision, snapshot: clone(snapshot), added: 0, updated: 0, deleted: 0, unchanged: 0 };
  const repeat = current === snapshot.cursor;
  if (!repeat && (current !== snapshot.previousCursor || snapshot.cursor === snapshot.previousCursor)) fail('cursor continuity');
  for (const e of snapshot.records) {
    const k = entityKey(e), old = records.get(k);
    if (old && old.sourceId !== e.sourceId) fail('source ownership collision');
    if (old && equal(old, e)) { preview.unchanged++; continue; }
    if (repeat) fail('cursor replay conflict');
    if (old && (e.version <= old.version || Date.parse(e.updatedAt) < Date.parse(old.updatedAt))) fail('version rollback or conflict');
    if (state.overrides.some(o => entityKey(o) === k)) fail('upstream/local conflict; clear local override first');
    if (e.deleted) preview.deleted++; else if (!old || old.deleted) preview.added++; else preview.updated++;
    records.set(k, clone(e));
  }
  if (repeat) return { preview, state };
  const next: BusinessState = { ...state, revision: state.revision + 1, records: [...records.values()], cursors: { ...state.cursors, [key]: snapshot.cursor } };
  validateState(next);
  return { preview, state: next };
}
export function previewBusinessImport(state: BusinessState, snapshot: Snapshot): ImportPreview {
  return planImport(state, snapshot).preview;
}
export function applyBusinessImport(state: BusinessState, preview: ImportPreview): BusinessState {
  object(preview, ['baseRevision', 'snapshot', 'added', 'updated', 'deleted', 'unchanged']);
  if (preview.baseRevision !== state.revision) fail('stale preview revision');
  const result = planImport(state, preview.snapshot);
  if (!equal(result.preview, preview)) fail('preview was modified');
  return result.state === state ? state : clone(result.state);
}
export function saveLocalEntity(state: BusinessState, entity: Entity): BusinessState {
  validateState(state); safeTree(entity, MAX_SNAPSHOT_BYTES); validateEntity(entity);
  if (entity.kind === 'order') fail('orders are read-only');
  if (!state.stores.some(s => s.id === entity.storeId)) fail('unknown store');
  const key = entityKey(entity), base = state.records.find(e => entityKey(e) === key);
  const next = clone(state);
  if (!base) {
    if (entity.sourceId !== 'local' || entity.deleted || entity.version !== 1) fail('local creation requires source local, version 1');
    next.records.push(clone(entity));
  } else if (base.sourceId === 'local') {
    if (entity.sourceId !== 'local' || entity.version < base.version || Date.parse(entity.updatedAt) < Date.parse(base.updatedAt)) fail('local owner/version rollback');
    next.records = next.records.map(e => entityKey(e) === key ? clone(entity) : e);
  } else {
    if (base.deleted || entity.sourceId !== base.sourceId || entity.version !== base.version || Date.parse(entity.updatedAt) < Date.parse(base.updatedAt)) fail('override requires current source owner/version');
    next.overrides = next.overrides.filter(e => entityKey(e) !== key);
    if (!equal(base, entity)) next.overrides.push(clone(entity));
  }
  validateState(next);
  if (equal(next, state)) return state;
  next.revision++; integer(next.revision, 0);
  return next;
}
export function clearLocalOverride(state: BusinessState, key: string): BusinessState {
  validateState(state);
  const next = clone(state);
  next.overrides = next.overrides.filter(e => entityKey(e) !== key);
  next.records = next.records.filter(e => !(entityKey(e) === key && e.sourceId === 'local'));
  validateState(next);
  if (equal(next, state)) return state;
  next.revision++; integer(next.revision, 0);
  return next;
}
export function addBusinessStore(state: BusinessState, storeId: string, name: string): BusinessState {
  validateState(state); id(storeId); text(name, 200);
  if (state.stores.some(store => store.id === storeId)) fail('duplicate store');
  const next = clone(state);
  next.stores.push({ id: storeId, name });
  next.revision++;
  validateState(next);
  return next;
}
export function exportBusinessBackup(state: BusinessState): string {
  validateState(state);
  const backup = { schemaVersion: 1, format: BACKUP_FORMAT, ...clone(state) };
  safeTree(backup, MAX_BACKUP_BYTES);
  return JSON.stringify(backup);
}
export function parseBusinessBackup(value: string): BusinessState {
  const b = object(parse(value, MAX_BACKUP_BYTES), ['schemaVersion', 'format', 'revision', 'stores', 'records', 'overrides', 'cursors']);
  if (b.schemaVersion !== 1 || b.format !== BACKUP_FORMAT) fail('unsupported backup format');
  const state = { revision: b.revision, stores: b.stores, records: b.records, overrides: b.overrides, cursors: b.cursors };
  validateState(state); return state;
}
export function createBusinessState(): BusinessState {
  const state: BusinessState = {
    revision: 0, stores: [{ id: 'store-demo', name: '示例旗舰店' }, { id: 'store-outlet', name: '示例分店' }],
    records: [], overrides: [], cursors: {}
  };
  for (const store of state.stores) {
    const selected = store.id === 'store-demo' ? products : products.slice(0, 1);
    const wrap = (kind: EntityKind, id: string, data: unknown): Entity => ({
      storeId: store.id, sourceId: 'demo', kind, id, version: 1,
      updatedAt: '2026-10-28T00:00:00.000Z', deleted: false, data: clone(data)
    } as Entity);
    for (const p of selected) {
      state.records.push(wrap('product', p.id, p));
      for (const image of p.images) state.records.push(wrap('image', p.id + ':' + image.id, {
        productId: p.id, imageId: image.id, label: image.label, dataUrl: null
      }));
    }
    for (const customerId of store.id === 'store-demo' ? customers : customers.slice(0, 1)) state.records.push(wrap('customer', customerId, {
      name: '示例客户 ' + customerId, conversationId: customerId, tags: ['演示'], notes: ''
    }));
    for (const order of store.id === 'store-demo' ? allOrders : allOrders.slice(0, 1)) state.records.push(wrap('order', order.orderId, order));
    state.cursors[cursorKey(store.id, 'demo')] = 'demo-v1';
  }
  validateState(state);
  return state;
}
