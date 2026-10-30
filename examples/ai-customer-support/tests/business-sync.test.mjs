import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access, symlink, mkdir, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import demoAdapter from '../integrations/demo-adapter.mjs';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const repo = resolve(root, '../..');
const cli = join(root, 'scripts/sync-business.mjs');
const demo = join(root, 'integrations/demo-adapter.mjs');
const demoURL = pathToFileURL(demo).href;
const token = 'SECRET_TOKEN_DO_NOT_LOG_321';
const base = `import demo from ${JSON.stringify(demoURL)};\n`;

async function fixture(t) {
  await mkdir(join(repo, '.runtime'), { recursive: true });
  const dir = await mkdtemp(join(repo, '.runtime/business-sync-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function adapter(dir, code) {
  const file = join(dir, 'adapter.mjs');
  await writeFile(file, base + code);
  return file;
}
function run(dir, options = {}) {
  const output = options.out ?? join(dir, 'snapshot.json');
  const args = [cli, '--adapter', options.adapter ?? demo, '--store', 'store-a', '--source', 'crm', '--out', output];
  if (options.cursor !== undefined) args.push('--cursor', options.cursor);
  if (options.timeout !== undefined) args.push('--timeout-ms', String(options.timeout));
  if (options.extra) args.push(...options.extra);
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, { cwd: repo, env: { ...process.env, BUSINESS_TEST_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('CLI did not terminate')); }, 15000);
    child.on('error', reject);
    child.on('close', status => { clearTimeout(timer); accept({ status, stdout, stderr, output }); });
  });
}
async function failed(result, code) {
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), { ok: false, code });
  assert.equal(result.stderr, '');
  assert.ok(!result.stdout.includes(token));
  await assert.rejects(access(result.output));
}

test('actual CLI demo normalizes, isolates stores, advances requested cursor and remains stable at v2', async t => {
  const dir = await fixture(t);
  for (const [i, cursor, next, version] of [[0, undefined, 'demo-v1', 1], [1, 'demo-v1', 'demo-v2', 2], [2, 'demo-v2', 'demo-v2', 2]]) {
    const result = await run(dir, { cursor, out: join(dir, `${i}.json`) });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { ok: true, code: 'PUBLISHED', path: relative(repo, result.output) });
    const snapshot = JSON.parse(await readFile(result.output, 'utf8'));
    assert.equal(snapshot.previousCursor, cursor ?? null);
    assert.equal(snapshot.cursor, next);
    assert.equal(snapshot.schemaVersion, 1);
    assert.equal(snapshot.records.length, 4);
    assert.deepEqual(snapshot.records.map(r => r.id), ['crm-product-1', 'crm-customer-1', 'crm-order-1', 'crm-image-1']);
    assert.ok(snapshot.records.every(r => r.storeId === 'store-a' && r.sourceId === 'crm' && r.version === version));
    assert.equal(snapshot.records.find(r => r.kind === 'product').data.name, 'Offline demo bag');
    assert.equal(snapshot.records.find(r => r.kind === 'customer').data.conversationId, null);
  }
  await failed(await run(dir, { cursor: 'unknown', out: join(dir, 'bad.json') }), 'HOOK_FAILED');
});

test('hooks execute pull -> normalize sequentially -> validated count observer -> publish; frozen context and summary', async t => {
  const dir = await fixture(t);
  const marker = join(dir, 'observed.json');
  const script = await adapter(dir, `import {writeFile} from 'node:fs/promises';
    const order=[]; let shared;
    export default {id:'custom',
      async pull(ctx){if(!Object.isFrozen(ctx)||Object.keys(ctx).sort().join()!=='cursor,sourceId,storeId')throw Error(); order.push('pull'); shared=await demo.pull(ctx);return shared;},
      async normalize(r,ctx){order.push(r.kind);return demo.normalize(r,ctx);},
      async afterSync(summary){
        if(!Object.isFrozen(summary)||Object.values(summary).some(x=>typeof x!=='number'))throw Error();
        order.push('afterSync'); shared.records[0].data.name='MUTATED'; shared.cursor='mutated';
        await writeFile(${JSON.stringify(marker)},JSON.stringify({order,summary}));
      }};`);
  const result = await run(dir, { adapter: script });
  assert.equal(result.status, 0, result.stdout);
  const observed = JSON.parse(await readFile(marker, 'utf8'));
  assert.deepEqual(observed.order, ['pull', 'product', 'customer', 'order', 'image', 'afterSync']);
  assert.deepEqual(observed.summary, { product: 1, order: 1, image: 1, customer: 1, deleted: 0, total: 4 });
  const snapshot = JSON.parse(await readFile(result.output, 'utf8'));
  assert.equal(snapshot.cursor, 'demo-v1');
  assert.equal(snapshot.records[0].data.name, 'Offline demo bag');
});


test('normalization can repair raw schema and invalid normalization vetoes observer/publication', async t => {
  const dir = await fixture(t);
  const script = await adapter(dir, `export default {...demo,
    async pull(ctx){const p=await demo.pull(ctx);p.records[0].data.name='';return p;},
    normalize(r,ctx){return r.kind==='product'?{...r,data:{...r.data,name:'Repaired product'}}:demo.normalize(r,ctx);}};`);
  const result = await run(dir, { adapter: script });
  assert.equal(result.status, 0, result.stdout);
  assert.equal(JSON.parse(await readFile(result.output, 'utf8')).records[0].data.name, 'Repaired product');
  const marker = join(dir, 'observer');
  const invalid = await adapter(dir, `import {writeFile} from 'node:fs/promises';export default {...demo,
    normalize(r){return {...r,version:-1};},afterSync(){return writeFile(${JSON.stringify(marker)},'bad');}};`);
  await failed(await run(dir, { adapter: invalid, cursor: 'demo-v1', out: join(dir, 'invalid.json') }), 'SCHEMA');
  await assert.rejects(access(marker));
});

test('invalid snapshots never reach observer or publish', async t => {
  const dir = await fixture(t);
  const marker = join(dir, 'observer');
  const mutations = [
    "p.records[0].version=0", "p.records[0].data.price=-1", "p.records[0].storeId='other'",
    "p.records[0].sourceId='other'", "p.records[0].extra=true", "p.records[0].updatedAt='yesterday'",
    "p.records[0].kind='unknown'", "p.cursor=1", "p.extra=true",
  ];
  for (let i = 0; i < mutations.length; i++) {
    const script = await adapter(dir, `import {writeFile} from 'node:fs/promises'; export default {...demo,
      async pull(ctx){const p=await demo.pull(ctx);${mutations[i]};return p;},
      async afterSync(){await writeFile(${JSON.stringify(marker)},'bad');}};`);
    await failed(await run(dir, { adapter: script, out: join(dir, `bad-${i}.json`) }), 'SCHEMA');
  }
  await assert.rejects(access(marker));
});

test('all hook stages, module load, process crash and console/errors are contained', async t => {
  const dir = await fixture(t);
  const noisy = `console.log(process.env.BUSINESS_TEST_TOKEN);console.error(process.env.BUSINESS_TEST_TOKEN);process.stdout.write(process.env.BUSINESS_TEST_TOKEN);process.stderr.write(process.env.BUSINESS_TEST_TOKEN);`;
  for (const stage of ['load', 'pull', 'normalize', 'afterSync', 'crash']) {
    const code = stage === 'load' ? `${noisy}throw Error(process.env.BUSINESS_TEST_TOKEN);` :
      `${noisy}export default {...demo, ${stage === 'crash' ? 'pull(){process.exit(7)}' : `${stage}(){throw Error(process.env.BUSINESS_TEST_TOKEN)}`}};`;
    const script = await adapter(dir, code);
    await failed(await run(dir, { adapter: script }), stage === 'crash' ? 'WORKER' : 'HOOK_FAILED');
  }
  const script = await adapter(dir, `${noisy}export default demo;`);
  const result = await run(dir, { adapter: script });
  assert.equal(result.status, 0, result.stdout);
  assert.equal(result.stderr, '');
  assert.ok(!result.stdout.includes(token));
});

test('worker deadline interrupts import, sync infinite loops and async hangs at every hook stage', async t => {
  const dir = await fixture(t);
  for (const stage of ['load', 'pull', 'normalize', 'afterSync', 'async']) {
    const code = stage === 'load' ? 'while(true){}' : stage === 'async' ?
      'export default {...demo, pull(){return new Promise(()=>{})}};' :
      `export default {...demo,${stage}(){while(true){}}};`;
    const script = await adapter(dir, code);
    await failed(await run(dir, { adapter: script, timeout: 800 }), 'TIMEOUT');
  }
});

test('existing file and dangling symlink are never clobbered; simultaneous publishers yield one winner', async t => {
  const dir = await fixture(t);
  const output = join(dir, 'existing.json');
  await writeFile(output, 'keep');
  const result = await run(dir, { out: output });
  assert.deepEqual(JSON.parse(result.stdout), { ok: false, code: 'EXISTS' });
  assert.equal(await readFile(output, 'utf8'), 'keep');
  const dangling = join(dir, 'dangling.json');
  await symlink(join(dir, 'missing.json'), dangling);
  assert.equal(JSON.parse((await run(dir, { out: dangling })).stdout).code, 'EXISTS');
  const results = await Promise.all([run(dir), run(dir)]);
  assert.deepEqual(results.map(r => r.status).sort(), [0, 1]);
  assert.equal(JSON.parse(results.find(r => r.status === 1).stdout).code, 'EXISTS');
  assert.ok(!(await readdir(dir)).some(name => name.endsWith('.tmp')));
});

test('output rejects outside .runtime, traversal, wrong extension and directory symlinks', async t => {
  const dir = await fixture(t);
  for (const out of [join(repo, 'outside-business-test.json'), join(repo, '.runtime/../outside-business-test.json'), join(dir, 'bad.txt')]) {
    await failed(await run(dir, { out }), 'PATH');
  }
  assert.deepEqual(JSON.parse((await run(dir, { out: join(repo, '.runtime') })).stdout), { ok: false, code: 'PATH' });
  await mkdir(join(dir, 'real'));
  await symlink(join(dir, 'real'), join(dir, 'linked'));
  await failed(await run(dir, { out: join(dir, 'linked/out.json') }), 'PATH');
});

test('size cap, invalid adapter and bounded/unknown arguments fail without raw diagnostics', async t => {
  const dir = await fixture(t);
  const script = await adapter(dir, `export default {...demo,async pull(ctx){const p=await demo.pull(ctx);p.records[0].data.summary='x'.repeat(1024*1024);return p;}};`);
  await failed(await run(dir, { adapter: script }), 'SIZE');
  await failed(await run(dir, { adapter: join(dir, 'missing.mjs') }), 'ADAPTER');
  for (const timeout of ['0', '99', '60001', 'NaN']) await failed(await run(dir, { timeout }), 'ARGUMENTS');
  await failed(await run(dir, { extra: ['--unknown', token] }), 'ARGUMENTS');
});


test('parent independently validates forged worker DTOs and requested cursor binding', async t => {
  const dir = await fixture(t);
  const forged = [{}, { schemaVersion: 1, storeId: 'other', sourceId: 'crm', previousCursor: null, cursor: 'x', records: [] },
    { schemaVersion: 1, storeId: 'store-a', sourceId: 'crm', previousCursor: 'wrong', cursor: 'x', records: [] }];
  for (const snapshot of forged) {
    const script = await adapter(dir, `import {parentPort} from 'node:worker_threads';
      parentPort.postMessage({ok:true,json:${JSON.stringify(JSON.stringify(snapshot))}});while(true){}`);
    await failed(await run(dir, { adapter: script }), 'SCHEMA');
  }
});

test('raw worker stream flood is discarded and terminated within a byte budget', async t => {
  const dir = await fixture(t);
  for (const stream of ['stdout', 'stderr']) {
    const script = await adapter(dir, `export default {...demo,async pull(){
      setInterval(()=>process.${stream}.write(process.env.BUSINESS_TEST_TOKEN.repeat(1024)),1);
      return await new Promise(()=>{});}};`);
    await failed(await run(dir, { adapter: script, timeout: 3000 }), 'WORKER');
  }
});

test('trusted custom HTTP adapter performs an actual loopback GET with external host credential', async t => {
  const dir = await fixture(t);
  const requests = [];
  const server = createServer(async (request, response) => {
    requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization });
    const snapshot = await demoAdapter.pull(Object.freeze({ storeId: 'store-a', sourceId: 'crm', cursor: 'demo-v1' }));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(snapshot));
  });
  await new Promise(accept => server.listen(0, '127.0.0.1', accept));
  t.after(() => new Promise(accept => server.close(accept)));
  const endpoint = `http://127.0.0.1:${server.address().port}/records`;
  const script = await adapter(dir, `export default {...demo,async pull(ctx){
    const url=new URL(${JSON.stringify(endpoint)});url.searchParams.set('cursor',ctx.cursor??'');
    const response=await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+process.env.BUSINESS_TEST_TOKEN},signal:AbortSignal.timeout(1000)});
    if(!response.ok)throw Error('HTTP failure');return await response.json();}};`);
  const result = await run(dir, { adapter: script, cursor: 'demo-v1' });
  assert.equal(result.status, 0, result.stdout);
  assert.deepEqual(requests, [{ method: 'GET', url: '/records?cursor=demo-v1', authorization: 'Bearer ' + token }]);
  const json = await readFile(result.output, 'utf8');
  assert.ok(!json.includes(token));
  assert.ok(!result.stdout.includes(token));
  assert.equal(JSON.parse(json).previousCursor, 'demo-v1');
  assert.equal(JSON.parse(json).cursor, 'demo-v2');
});
