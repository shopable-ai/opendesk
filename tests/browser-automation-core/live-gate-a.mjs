import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { Client, untilConnected } from '../../lab/browser-automation-core/client.mjs';
import { writeLine, LineDecoder } from '../../lab/browser-automation-core/protocol.mjs';
import { SOURCE, STATE, SOCKET, EVIDENCE, LIMITS, EXTENSION_ID, loadInstall } from '../../lab/browser-automation-core/config.mjs';
import { recordSubcases } from './case-subcases.mjs';
import { recordCase, completeCaseIndex } from './evidence-contract.mjs';
import { expectedLoaded } from '../../lab/browser-automation-core/candidate.mjs';
import { provenance } from './component-check.mjs';
import { inspectExtension } from '../../lab/browser-automation-core/extension-installation.mjs';
import { installationReport } from '../../lab/browser-automation-core/installation.mjs';

async function waitForClient() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { return await new Client().connect(); } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('BROKER_START_TIMEOUT');
}
async function rawProbe(payload) {
  const socket = net.createConnection(SOCKET), decoder = new LineDecoder();
  const messages = [];
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('RAW_PROBE_TIMEOUT')); }, 3000);
    socket.on('error', reject);
    socket.on('connect', () => writeLine(socket, {v: 1, kind: 'auth', role: 'client', credential: loadInstall().clientCredential}));
    socket.on('data', bytes => {
      for (const message of decoder.push(bytes)) {
        if (message.kind === 'authenticated') socket.write(payload);
        else { messages.push(message); clearTimeout(timer); socket.destroy(); resolve(); }
      }
    });
  });
  return messages;
}
export async function runGateA() {
  const install = loadInstall();
  if (!install.testMode) throw new Error('Run setup --test-mode before fault verification');
  if (fs.existsSync(SOCKET)) throw new Error('STOP_BROKER_FIRST: verify-a owns its broker process and restart');
  const directory = path.join(EVIDENCE, `gate-a-${Date.now()}`); fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const report = {gate: 'A', level: 'live-browser', status: 'NOT_RUN', directory, limits: LIMITS, provenance: provenance(), cases: []};
  report.candidateId = report.provenance.candidateId; report.runId = path.basename(directory); report.traceFiles = [];
  let brokerChild, client, brokerLog;
  async function startBroker() {
    brokerLog = fs.openSync(path.join(directory, `broker-${Date.now()}.log`), 'ax', 0o600);
    brokerChild = spawn(process.execPath, [`${SOURCE}/cli.mjs`, 'start'], {stdio: ['ignore', brokerLog, brokerLog]});
    client = await waitForClient();
    // Initial attach can await the Extension's 30 second reconnect alarm after setup.
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      const response = await client.request('status');
      if (response.result?.brokerPid !== brokerChild.pid) throw new Error('BROKER_OWNERSHIP_MISMATCH');
      if (response.result.connected) { report.traceFiles.push(path.join(response.result.evidenceDirectory, 'trace.ndjson')); return response.result; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('REAL_EXTENSION_NOT_CONNECTED');
  }
  async function stopBroker() {
    client?.close();
    if (brokerChild && brokerChild.exitCode === null) {
      await new Promise(resolve => {
        const killTimer = setTimeout(() => brokerChild.kill('SIGKILL'), 3000);
        brokerChild.once('exit', () => { clearTimeout(killTimer); resolve(); }); brokerChild.kill('SIGTERM');
      });
    }
    if (brokerLog != null) { fs.closeSync(brokerLog); brokerLog = null; }
  }
  const persist = () => fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), {mode: 0o600});
  const check = (id, fn) => recordCase(report, 'A', id, fn, persist);
  try {
    let status = await startBroker();
    assert.equal(status.browser.extensionId, EXTENSION_ID);
    if (status.browser.extensionVersion !== inspectExtension().version) throw new Error('LOADED_EXTENSION_VERSION_MISMATCH');
    assert.ok(/Chrome\//.test(status.browser.userAgent));
    assert.ok(!status.browser.userAgent.includes('SIMULATED'));
    const installed = installationReport();
    assert.equal(installed.status, 'PASS');
    assert.deepEqual(status.browser.nativeHost.build?.files, installed.nativeHost.build.files);
    assert.equal(status.browser.nativeHost.build.sourceDirectory, SOURCE);
    const nativeHostCommand = execFileSync('/bin/ps', ['-p', String(status.browser.nativeHost.hostPid), '-o', 'command='], {encoding: 'utf8'}).trim();
    assert.ok(nativeHostCommand.includes(path.join(installed.nativeHost.installedNativeDirectory, 'installed-native-entry.mjs')));
    const parentCommand = execFileSync('/bin/ps', ['-p', String(status.browser.nativeHost.parentPid), '-o', 'comm='], {encoding: 'utf8'}).trim();
    assert.ok(/Google Chrome|Chromium/.test(parentCommand), 'Native Host must actually be spawned by Chrome/Chromium');
    const info = await client.request('browserInfo');
    const expected = expectedLoaded();
    assert.equal(info.result.loadedResources.workerCodeSha256, expected.workerCodeSha256);
    assert.deepEqual(info.result.loadedResources.resources, expected.resources);
    report.loadedResources = info.result;
    report.browser = status.browser; report.connection = status; report.nativeHostParentCommand = parentCommand;
    report.nativeHostCommand = nativeHostCommand; report.nativeInstallation = installed.nativeHost;
    await check('A01', async () => {
      const nonce = crypto.randomUUID(), response = await client.request('echo', {nonce});
      assert.equal(response.result.nonce, nonce); assert.ok(response.requestId); assert.equal(response.brokerSession, status.brokerSession); assert.equal(response.browserSession, status.browserSession); assert.equal(response.connectionEpoch, status.connectionEpoch); return {nonce, response, session: status.brokerSession, epoch: status.connectionEpoch};
    });
    await check('A02', async () => {
      const emitted = await client.request('emitEvent');
      const events = (await client.request('events')).result;
      const event = events.find(event => event.eventType === 'requested'); assert.ok(event?.eventId); assert.equal(event.eventId, emitted.result.eventId); assert.equal(event.data.requestId, emitted.requestId); assert.equal(event.brokerSession, status.brokerSession); assert.equal(event.connectionEpoch, status.connectionEpoch); assert.equal(event.browserSession, status.browserSession); return {emitted, event};
    });
    await check('A03', async () => {
      const pairs = [];
      for (let i = 0; i < 100; i++) { const nonce = crypto.randomUUID(), response = await client.request('echo', {nonce});
        assert.equal(response.result.nonce, nonce); pairs.push({nonce, response}); }
      assert.equal(new Set(pairs.map(pair => pair.response.requestId)).size, 100); return pairs;
    });
    await check('A04', async () => {
      const params = Array.from({length: 10}, (_, i) => ({nonce: crypto.randomUUID(), delayMs: (10 - i) * 20}));
      const requestIds = params.map(() => crypto.randomUUID()), completionOrder = [], intervals = [];
      const responses = await Promise.all(params.map((value, i) => { const interval = {requestId: requestIds[i], started: Date.now()}; intervals.push(interval); return client.request('fault.delay', value, {requestId: requestIds[i]})
        .then(response => { interval.finished = Date.now(); completionOrder.push(response.requestId); return response; }); }));
      responses.forEach((response, i) => assert.equal(response.result.nonce, params[i].nonce));
      assert.notDeepEqual(completionOrder, requestIds, 'actual response arrival order must differ from dispatch order');
      assert.ok(Math.max(...intervals.map(x => x.started)) < Math.min(...intervals.map(x => x.finished)), 'all ten actual requests overlap');
      return {params, requestIds, dispatchOrder: requestIds, intervals, completionOrder, responses, delayBoundary: 'Native Host holds actual Extension echo ACK'};
    });
    await check('A05', async () => {
      const started = Date.now();
      const response = await client.request('fault.delay', {nonce: 'late', delayMs: 200}, {timeoutMs: 30});
      const elapsedMs = Date.now() - started; assert.ok(elapsedMs >= 30 && elapsedMs <= 30 + LIMITS.deadlineToleranceMs);
      assert.equal(response.error.code, 'TIMEOUT'); assert.equal((await client.request('echo', {nonce: 'fresh'})).result.nonce, 'fresh');
      assert.equal((await client.request('status')).result.pendingCount, 0);
      // A browser timer is a minimum delay; wait for the actual ACK event under a finite deadline.
      const deadline = Date.now() + LIMITS.defaultTimeoutMs;
      let events = [], lateEvent;
      while (Date.now() < deadline) {
        events = (await client.request('events')).result;
        lateEvent = events.find(event => event.type === 'late-response' && event.requestId === response.requestId);
        if (lateEvent) break;
        await new Promise(resolve => setTimeout(resolve, LIMITS.reconnectPollMs));
      }
      assert.ok(lateEvent, 'late ACK for this retired request must be observed within the configured deadline');
      assert.equal((await client.request('echo', {nonce: 'after-late'})).result.nonce, 'after-late');
      assert.equal((await client.request('status')).result.pendingCount, 0); const duplicateNonce = crypto.randomUUID(), duplicate = await client.request('fault.duplicateAck', {nonce: duplicateNonce});
      assert.equal(duplicate.result.nonce, duplicateNonce);
      const duplicateEvents = (await client.request('events')).result; assert.ok(duplicateEvents.some(event => event.type === 'late-response' && event.requestId === duplicate.requestId));
      const terminalRows = report.traceFiles.flatMap(file => fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line)));
      for (const id of [response.requestId, duplicate.requestId]) assert.equal(terminalRows.filter(row => row.requestId === id && ['SUCCESS', 'ERROR'].includes(row.status)).length, 1);
      return {duplicate, duplicateEvents, response, elapsedMs, frozenTimeoutMs: 30, toleranceMs: LIMITS.deadlineToleranceMs, lateEvent, events, lateAckDeadlineMs: LIMITS.defaultTimeoutMs};
    });
    for (const [id, operation] of [['A06', 'fault.disconnect'], ['A07', 'fault.hostExit'], ['A08', 'fault.reload']]) {
      await check(id, async () => {
        const before = await client.request('status');
        const pending = client.request('fault.delay', {nonce: 'interrupted', delayMs: 1000});
        const response = await client.request(operation); const interrupted = await pending;
        assert.ok(response.error && interrupted.error);
        const after = await untilConnected(client, state => state.connectionEpoch !== before.result.connectionEpoch);
        assert.notEqual(after.connectionEpoch, before.result.connectionEpoch);
        if (id === 'A07') { assert.notEqual(after.browser.nativeHost.hostPid, before.result.browser.nativeHost.hostPid); assert.throws(() => process.kill(before.result.browser.nativeHost.hostPid, 0), {code: 'ESRCH'}); }
        const nonce = crypto.randomUUID(), recovered = await client.request('echo', {nonce}); assert.equal(recovered.result.nonce, nonce); assert.equal(after.pendingCount, 0);
        return {before, response, interrupted, after, recovered};
      });
    }
    await check('A09', async () => {
      const before = (await client.request('status')).result;
      const pending = client.request('fault.delay', {nonce: 'broker-restart', delayMs: 1000});
      await stopBroker(); const interrupted = await pending; assert.ok(interrupted.error);
      const after = await startBroker(); assert.notEqual(after.brokerSession, before.brokerSession);
      assert.notEqual(after.connectionEpoch, before.connectionEpoch);
      assert.equal(after.pendingCount, 0); const nonce = crypto.randomUUID(), recovered = await client.request('echo', {nonce}); assert.equal(recovered.result.nonce, nonce); return {before, interrupted, after, recovered};
    });
    for (const [id, operation] of [['A10', 'fault.protocol'], ['A11', 'fault.malformed'], ['A12', 'fault.oversized']]) {
      await check(id, async () => {
        const before = (await client.request('status')).result;
        const response = await client.request(operation);
        const expectedCode = {A10: 'PROTOCOL_MISMATCH', A11: 'MALFORMED_MESSAGE', A12: 'MESSAGE_TOO_LARGE'}[id];
        assert.equal(response.error.code, expectedCode);
        const after = await untilConnected(client, state => state.connectionEpoch !== before.connectionEpoch);
        let localRejection;
        const malformedVariations = [];
        if (id === 'A10') localRejection = await rawProbe(Buffer.from('{"v":999,"kind":"request","requestId":"invalid"}\n'));
        if (id === 'A11') {
          localRejection = await rawProbe(Buffer.from('{\n'));
          for (const mode of ['error-string', 'both', 'missing', 'bad-outcome']) {
            const priorEpoch = (await client.request('status')).result.connectionEpoch;
            const invalid = await client.request('fault.malformed', {mode});
            assert.equal(invalid.error.code, 'MALFORMED_MESSAGE');
            const recovered = await untilConnected(client, state => state.connectionEpoch !== priorEpoch);
            assert.equal(recovered.pendingCount, 0); malformedVariations.push({mode, invalid, recovered});
          }
        }
        if (id === 'A12') {
          localRejection = await rawProbe(Buffer.alloc(LIMITS.maxMessageBytes + 1, 120));
          const overflowClient = await new Client().connect();
          try {
            const pending = Array.from({length: LIMITS.maxPending - 1}, () => client.request('fault.delay', {nonce: crypto.randomUUID(), delayMs: 1000}));
            assert.equal((await overflowClient.request('status')).result.pendingCount, LIMITS.maxPending - 1);
            pending.push(client.request('fault.delay', {nonce: crypto.randomUUID(), delayMs: 1000}));
            assert.equal((await overflowClient.request('status')).result.pendingCount, LIMITS.maxPending);
            const extra = await overflowClient.request('echo', {nonce: 'overflow'}); assert.equal(extra.error.code, 'QUEUE_FULL');
            const completed = await Promise.all(pending); completed.forEach(item => assert.equal(item.outcome, 'SUCCEEDED'));
            assert.equal((await overflowClient.request('status')).result.pendingCount, 0);
            for (const timeoutMs of [LIMITS.minTimeoutMs - 1, LIMITS.minTimeoutMs, LIMITS.maxTimeoutMs, LIMITS.maxTimeoutMs + 1]) {
              const response = await client.request('echo', {nonce: 'timeout-boundary'}, {timeoutMs});
              if (timeoutMs < LIMITS.minTimeoutMs || timeoutMs > LIMITS.maxTimeoutMs) assert.equal(response.error.code, 'INVALID_TIMEOUT'); else assert.equal(response.result.nonce, 'timeout-boundary');
            }
            client.socket.cork();
            const clientLoad = Array.from({length: LIMITS.maxClientPending}, () => client.request('fault.delay', {nonce: 'client-boundary', delayMs: 100}));
            await assert.rejects(client.request('echo'), {code: 'CLIENT_QUEUE_FULL'}); client.socket.uncork();
            const clientResponses = await Promise.all(clientLoad); assert.equal(clientResponses.filter(x => x.error?.code === 'QUEUE_FULL').length, 1);
            assert.equal(client.pending.size, 0);
          } finally { overflowClient.close(); }
        }
        assert.equal(localRejection[0].error.code, expectedCode);
        assert.equal((await client.request('echo', {nonce: 'healthy'})).result.nonce, 'healthy');
        const injectionEvents = (await client.request('events')).result;
        if (id === 'A12') assert.ok(injectionEvents.some(event => event.type === 'protocol-rejected' && event.actualBytes > LIMITS.maxMessageBytes && event.limitBytes === LIMITS.maxMessageBytes));
        return {before, response, after, localRejection, malformedVariations, injectionEvents, inputs: {operation, localBytes: id === 'A12' ? LIMITS.maxMessageBytes + 1 : null, protocolVersion: id === 'A10' ? 999 : 1, malformedLocal: id === 'A11' ? '{\n' : null}};
      });
    }
    const rows = report.traceFiles.flatMap(file => fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line)));
    for (const item of report.cases.filter(x => ['A01', 'A03', 'A04'].includes(x.caseId))) {
      const ids = item.caseId === 'A01' ? [item.actual.response.requestId] : item.caseId === 'A03' ? item.actual.map(x => x.response.requestId) : item.actual.requestIds;
      for (const id of ids) assert.equal(rows.filter(row => row.requestId === id && ['SUCCESS', 'ERROR'].includes(row.status)).length, 1);
    }
    report.terminalCorrelation = {status: 'PASS', sequential: 100, concurrent: 10, traceFiles: report.traceFiles};
    await recordSubcases(report, ['A'], persist);
    report.status = 'PASS';
  } catch (error) {
    report.status = report.cases.length ? 'FAIL' : 'BLOCKED'; report.errorCode = error.code || error.message;
  } finally {
    await stopBroker(); completeCaseIndex(report, ['A']); fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
  }
  if (report.status === 'PASS') {
    const file = path.join(EVIDENCE, 'current-state.json'), state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {};
    state.gates = {...state.gates, A: 'PASS'}; state.liveReport = path.join(directory, 'report.json'); state.coreStatus = 'NOT_RUN'; state.updatedAt = new Date().toISOString(); fs.writeFileSync(file, JSON.stringify(state, null, 2), {mode: 0o600});
  }
  return report;
}
