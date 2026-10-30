import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const send = parentPort.postMessage.bind(parentPort);
const MAX_BYTES = 1024 * 1024;
// Suppress ordinary console output before importing user code. Raw stdout/stderr
// are also captured/discarded by the parent, including import-time output.
for (const name of Object.getOwnPropertyNames(console)) {
  if (typeof console[name] === 'function') console[name] = () => {};
}
// An unresolved promise alone does not keep a Worker alive. Keep the lane
// active until completion or the parent's deadline, including async hangs.
const keepAlive = setInterval(() => {}, 1000);
let stage = 'HOOK_FAILED';
try {
  const bundled = await build({
    entryPoints: [resolve(import.meta.dirname, '../src/domain/business.ts')],
    bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent',
  });
  const { parseBusinessSnapshot } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
  const adapter = (await import(pathToFileURL(workerData.adapter).href)).default;
  if (!adapter || typeof adapter.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(adapter.id) ||
      typeof adapter.pull !== 'function' || ['normalize', 'afterSync'].some(key => adapter[key] !== undefined && typeof adapter[key] !== 'function')) throw new Error();
  const context = Object.freeze({ storeId: workerData.storeId, sourceId: workerData.sourceId, cursor: workerData.cursor });
  const pulled = await adapter.pull(context);
  stage = 'SCHEMA';
  if (!pulled || typeof pulled !== 'object' || Array.isArray(pulled) ||
      Object.keys(pulled).some(key => !['cursor', 'records'].includes(key)) ||
      typeof pulled.cursor !== 'string' || !Array.isArray(pulled.records) || pulled.records.length > 10000) throw new Error();
  const records = [];
  stage = 'HOOK_FAILED';
  for (const record of pulled.records) records.push(adapter.normalize ? await adapter.normalize(record, context) : record);
  stage = 'SCHEMA';
  const json = JSON.stringify({ schemaVersion: 1, storeId: context.storeId, sourceId: context.sourceId,
    previousCursor: context.cursor, cursor: pulled.cursor, records });
  if (Buffer.byteLength(json) > MAX_BYTES) { stage = 'SIZE'; throw new Error(); }
  // Validate the exact bytes to be published, so afterSync cannot mutate them.
  parseBusinessSnapshot(json);
  const frozenSnapshot = JSON.parse(json);
  if (frozenSnapshot.storeId !== context.storeId || frozenSnapshot.sourceId !== context.sourceId ||
      frozenSnapshot.previousCursor !== context.cursor || frozenSnapshot.records.some(record => record.storeId !== context.storeId || record.sourceId !== context.sourceId)) throw new Error();
  const counts = { product: 0, order: 0, image: 0, customer: 0, deleted: 0, total: frozenSnapshot.records.length };
  for (const record of frozenSnapshot.records) { counts[record.kind]++; if (record.deleted) counts.deleted++; }
  stage = 'HOOK_FAILED';
  if (adapter.afterSync) await adapter.afterSync(Object.freeze(counts));
  send({ ok: true, json });
} catch {
  send({ ok: false, code: stage });
} finally {
  clearInterval(keepAlive);
}
