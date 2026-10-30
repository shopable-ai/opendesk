// Trusted Node code: full process/filesystem/network privileges, NOT a sandbox.
// Run via scripts/sync-business.mjs; its worker AND parent validate final bytes.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/domain/business-mapping.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent',
});
const { createMappingPlan, mappingSample, mapBusinessRow } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
export default {
  id: 'mapped-offline-demo',
  pull(context) {
    if (![null, 'mapped-v1'].includes(context.cursor)) throw new Error('Unsupported fictional cursor');
    const plan = createMappingPlan('product', context.storeId);
    plan.sourceId = context.sourceId;
    const row = JSON.parse(mappingSample('product'))[0];
    row.title = row.title.trim(); // Optional trusted customization: one plain string operation.
    const record = mapBusinessRow(plan, row, { ...context, previousCursor: context.cursor, cursor: 'mapped-v1' });
    return { cursor: 'mapped-v1', records: [record] };
  },
};
