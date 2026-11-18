import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const adapter = path.join(repository, 'automation/browser_core_adapter.mjs');

test('BrowserDOM adapter distinguishes preflight refusal from post-dispatch evidence failure', t => {
  const runs = path.join(repository, '.runtime/tests/browser-automation-core');
  fs.mkdirSync(runs, {recursive: true});
  const root = fs.mkdtempSync(path.join(runs, 'adapter-outcomes-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));

  // Exercise the real adapter over stdio with an inert Client. This stub
  // never opens a socket, authenticates, launches a browser or performs input.
  const modules = path.join(root, 'lab/browser-automation-core');
  fs.mkdirSync(modules, {recursive: true});
  fs.writeFileSync(path.join(modules, 'config.mjs'), 'export const LIMITS = {maxTargets: 4, maxRequestsPerSession: 10};');
  fs.writeFileSync(path.join(modules, 'trace.mjs'), 'export const redact = value => value;');
  fs.writeFileSync(path.join(modules, 'candidate.mjs'), 'export const sourceSnapshot = () => ({candidateId: "synthetic"});');
  fs.writeFileSync(path.join(modules, 'client.mjs'), `
    import fs from 'node:fs';
    export class Client {
      async connect() {}
      close() {}
      async request(operation, params, options) {
        if (operation === 'status') return {result:{evidenceDirectory:process.cwd()}, outcome:'SUCCEEDED'};
        if (operation === 'tabs') {
          if (this.executionId === 'inventory-unavailable') {
            return {requestId:'inventory-id', error:{code:'CLIENT_TIMEOUT'}, outcome:'FAILED_CONFIRMED'};
          }
          return {result:{tabs:[{tab:1, url:'http://127.0.0.1:9000/'}]}, outcome:'SUCCEEDED'};
        }
        if (operation !== 'fill') throw new Error('unexpected fixture operation');
        fs.appendFileSync('stub-dispatch.ndjson', JSON.stringify({requestId:options.requestId}) + '\\n');
        const requestId = options.requestId;
        if (requestId === 'client-timeout') {
          return {requestId, error:{code:'CLIENT_TIMEOUT'}, outcome:'OUTCOME_UNKNOWN'};
        }
        if (requestId === 'core-refusal') {
          return {requestId, error:{code:'STALE_TARGET', outcome:'NOT_DISPATCHED'}};
        }
        if (requestId === 'stale-response') {
          return {requestId:'another-id', error:{code:'STALE_TARGET', outcome:'NOT_DISPATCHED'}};
        }
        const row = {executionId:this.executionId, requestId, status:'SUCCESS'};
        const count = requestId === 'multiple-terminals' ? 2 : 1;
        fs.writeFileSync('trace.ndjson', (JSON.stringify(row) + '\\n').repeat(count));
        return {requestId, result:{accepted:true}, outcome:'SUCCEEDED'};
      }
    }
  `);

  const call = (requestId, tab = 1) => ({requestId, operation: 'fill', params: {target: {tab}, value: 'fixture'}});
  function run(executionId, requests) {
    const configure = {configure: {coreRoot: root, origin: 'http://127.0.0.1:9000', tab: 1, executionId, source: 'recipe'}};
    const input = [configure, ...requests].map(value => JSON.stringify(value)).join('\n') + '\n';
    const result = spawnSync(process.execPath, [adapter], {cwd: root, input, encoding: 'utf8', timeout: 5000});
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const [configured, ...replies] = result.stdout.trim().split('\n').map(JSON.parse);
    assert.equal(configured.configured, true);
    assert.equal(replies.length, requests.length);
    return replies;
  }

  const [denied, late, timeout, refused, stale, succeeded] = run('synthetic-control', [
    call('denied', 2), call('multiple-terminals'), call('client-timeout'), call('core-refusal'),
    call('stale-response'), call('success'),
  ]);
  assert.deepEqual(denied.error, {code: 'PERMISSION_DENIED', outcome: 'NOT_DISPATCHED'});
  assert.deepEqual(late, {
    requestId: 'multiple-terminals',
    error: {code: 'MULTIPLE_CORE_TERMINALS', outcome: 'OUTCOME_UNKNOWN'},
    outcome: 'OUTCOME_UNKNOWN',
  });
  assert.deepEqual(timeout.error, {code: 'CLIENT_TIMEOUT', outcome: 'OUTCOME_UNKNOWN'});
  assert.equal(timeout.outcome, 'OUTCOME_UNKNOWN');
  assert.deepEqual(refused.error, {code: 'STALE_TARGET', outcome: 'NOT_DISPATCHED'});
  assert.equal(refused.outcome, 'NOT_DISPATCHED');
  assert.equal(stale.requestId, 'stale-response');
  assert.deepEqual(stale.error, {code: 'BROWSER_ADAPTER_RESPONSE_INVALID', outcome: 'OUTCOME_UNKNOWN'});
  assert.equal(stale.evidence, undefined);
  assert.equal(succeeded.requestId, 'success');
  assert.equal(succeeded.outcome, 'SUCCEEDED');
  assert.deepEqual(succeeded.result, {accepted: true});
  const [inventory] = run('inventory-unavailable', [call('preflight-failed')]);
  assert.equal(inventory.requestId, 'preflight-failed');
  assert.deepEqual(inventory.error, {code: 'CLIENT_TIMEOUT', outcome: 'NOT_DISPATCHED'});

  const dispatched = fs.readFileSync(path.join(root, 'stub-dispatch.ndjson'), 'utf8').trim().split('\n').map(line => JSON.parse(line).requestId);
  assert.deepEqual(dispatched, ['multiple-terminals', 'client-timeout', 'core-refusal', 'stale-response', 'success']);
});
