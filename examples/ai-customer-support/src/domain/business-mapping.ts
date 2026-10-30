import { parseBusinessSnapshot, type BusinessState, type Entity, type Snapshot } from './business';
import type { Product } from './catalog';

export type MappingKind = 'product' | 'customer';
export type MappingPlan = {
  schemaVersion: 1; name: string; storeId: string; sourceId: string;
  kind: MappingKind; fields: Record<string, string>;
};
type Context = { storeId: string; sourceId: string; previousCursor: string | null; cursor: string };
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export const mappingFields: Record<MappingKind, readonly { key: string; label: string }[]> = {
  product: [
    { key: 'id', label: '商品 ID' }, { key: 'name', label: '商品名称' }, { key: 'sku', label: '商品 SKU' },
    { key: 'price', label: '人民币价格' }, { key: 'summary', label: '商品简介' },
    { key: 'version', label: '版本' }, { key: 'updatedAt', label: '更新时间' },
  ],
  customer: [
    { key: 'id', label: '客户 ID' }, { key: 'name', label: '客户名称' }, { key: 'notes', label: '客户备注' },
    { key: 'version', label: '版本' }, { key: 'updatedAt', label: '更新时间' },
  ],
};
for (const fields of Object.values(mappingFields)) {
  fields.forEach(Object.freeze); Object.freeze(fields);
}
Object.freeze(mappingFields);
function fail(step: string, field: string, row?: number): never {
  throw new Error(`字段映射：${step}${row === undefined ? '' : `，第 ${row} 行`}，输出字段 ${field} 无效`);
}
const bytes = (value: string) => {
  let size = 0;
  for (const character of value) {
    const code = character.codePointAt(0)!;
    size += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return size;
};
function plain(value: unknown, step: string, field: string, row?: number): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(step, field, row);
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || forbidden.has(key) || !d.enumerable || !('value' in d)) fail(step, field, row);
  }
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[], step: string, field: string) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail(step, field);
}
function json(text: string, limit: number, step: string): unknown {
  if (typeof text !== 'string' || bytes(text) > limit) fail(step, 'JSON');
  try { return JSON.parse(text); } catch { return fail(step, 'JSON'); }
}
function snapshot(context: Context, records: Entity[]): Snapshot {
  return { schemaVersion: 1, storeId: context.storeId, sourceId: context.sourceId,
    previousCursor: context.previousCursor, cursor: context.cursor, records };
}
function validateContext(context: Context) {
  const c = plain(context, '检查归属', 'context');
  exact(c, ['storeId', 'sourceId', 'previousCursor', 'cursor'], '检查归属', 'context');
  for (const key of ['storeId', 'sourceId', 'cursor', 'previousCursor']) {
    if (typeof c[key] !== 'string' && !(key === 'previousCursor' && c[key] === null)) fail('检查归属与游标', key);
  }
  try { parseBusinessSnapshot(JSON.stringify(snapshot(context, []))); }
  catch { fail('检查归属与游标', 'context'); }
}
function validatePlan(value: unknown): MappingPlan {
  const p = plain(value, '检查配置', 'plan');
  exact(p, ['schemaVersion', 'name', 'storeId', 'sourceId', 'kind', 'fields'], '检查配置', 'plan');
  if (p.schemaVersion !== 1 || (p.kind !== 'product' && p.kind !== 'customer')) fail('检查配置', 'kind');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200 || /[\x00-\x1f\x7f]/.test(p.name)) fail('检查配置', 'name');
  if (typeof p.storeId !== 'string' || typeof p.sourceId !== 'string') fail('检查配置', 'owner');
  const fields = plain(p.fields, '检查配置', 'fields');
  exact(fields, mappingFields[p.kind].map(f => f.key), '检查配置', 'fields');
  for (const { key } of mappingFields[p.kind]) {
    const selector = fields[key];
    if (typeof selector !== 'string' || !selector.trim() || selector.length > 80 || forbidden.has(selector) ||
        /[\x00-\x1f\x7f-\x9f]/.test(selector)) fail('检查配置', key);
  }
  if (bytes(JSON.stringify(p)) > 8192) fail('检查配置大小', 'plan');
  validateContext({ storeId: p.storeId, sourceId: p.sourceId, previousCursor: null, cursor: 'mapping-check' });
  return JSON.parse(JSON.stringify(p)) as MappingPlan;
}
export function createMappingPlan(kind: MappingKind, storeId: string): MappingPlan {
  if (kind !== 'product' && kind !== 'customer') fail('创建配置', 'kind');
  return validatePlan({ schemaVersion: 1, name: kind === 'product' ? '商品字段映射' : '客户字段映射',
    storeId, sourceId: kind === 'product' ? 'mapping-products' : 'mapping-customers', kind,
    fields: Object.fromEntries(mappingFields[kind].map(({ key }) => [key, key === 'name' && kind === 'product' ? 'title' : key])) });
}
function sampleRow(kind: MappingKind): Record<string, string | number> {
  const common = { version: 1, updatedAt: '2026-10-30T00:00:00.000Z' };
  return kind === 'product'
    ? { id: 'mapped-mug-1', title: '虚构星云马克杯', sku: 'FICTION-MUG-001', price: '¥39.90', summary: '虚构商品，仅供离线演示', ...common }
    : { id: 'mapped-customer-1', name: '虚构客户小星', notes: '虚构客户，仅供离线演示', ...common };
}
export function mappingSample(kind: MappingKind): string {
  if (kind !== 'product' && kind !== 'customer') fail('生成样例', 'kind');
  return JSON.stringify([sampleRow(kind)], null, 2);
}
export function parseMappingPlan(text: string): MappingPlan {
  return validatePlan(json(text, 8192, '读取配置'));
}
function entity(plan: MappingPlan, values: Record<string, unknown>, context: Context): Entity {
  const common = { storeId: context.storeId, sourceId: context.sourceId, id: values.id as string,
    version: values.version as number, updatedAt: values.updatedAt as string, deleted: false };
  if (plan.kind === 'customer') return { ...common, kind: 'customer', data: {
    name: values.name as string, notes: values.notes as string, conversationId: null, tags: [],
  } };
  // Presentation placeholders carry no inferred SKU, price, identity, or version.
  const data: Product = { id: common.id, name: values.name as string, sku: values.sku as string,
    price: values.price as string, summary: values.summary as string, category: '未分类', model: '未提供',
    specs: [], images: [], imageType: 'bottle', color: '#64748b', source: plan.name,
    updated: typeof values.updatedAt === 'string' ? values.updatedAt.slice(0, 10) : '' };
  return { ...common, kind: 'product', data };
}
function mapRow(plan: MappingPlan, row: unknown, context: Context, line: number): Entity {
  const r = plain(row, '读取数据行', 'row', line);
  // Extra source columns are data only: never traverse, serialize, or copy them.
  for (const owner of ['storeId', 'sourceId'] as const) {
    if (Object.hasOwn(r, owner) && r[owner] !== context[owner]) fail('检查归属', owner, line);
  }
  // Start with fictional validation probes; every output field MUST be replaced by input.
  // No missing value can escape as a fabricated authoritative value.
  const sample = sampleRow(plan.kind);
  const values: Record<string, unknown> = { ...sample, name: sample.title ?? sample.name };
  for (const { key } of mappingFields[plan.kind]) {
    if (!Object.hasOwn(r, plan.fields[key])) fail('选择字段', key, line);
    const value = r[plan.fields[key]];
    if (key === 'version' ? typeof value !== 'number' : typeof value !== 'string') fail('检查字段类型', key, line);
    values[key] = value;
    try { parseBusinessSnapshot(JSON.stringify(snapshot(context, [entity(plan, values, context)]))); }
    catch { fail('校验业务字段', key, line); }
  }
  return entity(plan, values, context);
}
function binding(plan: MappingPlan, context: Context) {
  validateContext(context);
  if (plan.storeId !== context.storeId) fail('检查归属', 'storeId');
  if (plan.sourceId !== context.sourceId) fail('检查归属', 'sourceId');
}
/** Stateless full-entity mapping (also used by Node adapters), not a partial update.
 * Updates must supply validated BusinessState to runMappingPlan, or supply a complete
 * entity mapping through the adapter before the worker/parent validate its output.
 */
export function mapBusinessRow(plan: MappingPlan, row: unknown, context: Context): Entity {
  const checked = validatePlan(plan); binding(checked, context);
  return mapRow(checked, row, context, 1);
}
/** With already validated business state, retain unmapped metadata from matching base
 * records only. Overrides and relationships remain subject to previewBusinessImport.
 * Without state this produces full entities with defaults, not partial updates.
 */
export function runMappingPlan(plan: MappingPlan, input: string, context: Context, business?: BusinessState): Snapshot {
  const checked = validatePlan(plan); binding(checked, context);
  const rows = json(input, 64 * 1024, '读取输入');
  if (!Array.isArray(rows) || rows.length > 100) fail('检查输入行数（最多100行）', 'records');
  const seen = new Set<string>();
  const records = rows.map((row, index) => {
    let record = mapRow(checked, row, context, index + 1);
    if (seen.has(record.id)) fail('检查重复记录', 'id', index + 1);
    seen.add(record.id);
    const previous = business?.records.find(e => e.storeId === record.storeId && e.sourceId === record.sourceId &&
      e.kind === record.kind && e.id === record.id);
    if (previous && !previous.deleted) {
      if (record.kind === 'customer' && record.data && previous.kind === 'customer' && previous.data) {
        record = { ...record, data: { ...record.data,
          conversationId: previous.data.conversationId, tags: previous.data.tags } };
      } else if (record.kind === 'product' && record.data && previous.kind === 'product' && previous.data) {
        const { id, name, sku, price, summary, updated } = record.data;
        record = { ...record, data: { ...previous.data, id, name, sku, price, summary, updated } };
      }
      try { parseBusinessSnapshot(JSON.stringify(snapshot(context, [record]))); }
      catch { fail('校验保留业务字段', 'data', index + 1); }
    }
    return record;
  });
  try { return parseBusinessSnapshot(JSON.stringify(snapshot(context, records))); }
  catch { return fail('整批业务校验', 'records'); }
}
