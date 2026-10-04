import { Broker } from './broker.mjs';
import { connectedClient } from './client.mjs';
import { setup, cleanupInstallation } from './setup.mjs';
import { freezeCandidate, currentCandidate, expectedLoaded, sourceSnapshot } from './candidate.mjs';
import { EXTENSION_ID, loadInstall } from './config.mjs';
import { installationReport } from './installation.mjs';
import { recoverStaleBroker, startBackgroundBroker, stopOwnedBroker, stopOwnedFixture } from './process-control.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SOURCE, STATE, EVIDENCE, SOCKET } from './config.mjs';
import { executeOrder, observeReady, success } from './golden.mjs';

const command = process.argv[2];
try {
  if (command === 'setup') console.log(JSON.stringify(setup(process.argv.includes('--test-mode')), null, 2));
  else if (command === 'installation') {
    const report = installationReport(); console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'PASS') process.exitCode = 1;
  }
  else if (command === 'cleanup') {
    if (fs.existsSync(SOCKET)) await stopOwnedBroker();
    const fixture = await stopOwnedFixture();
    console.log(JSON.stringify({fixture}, null, 2));
    console.log(JSON.stringify(cleanupInstallation(), null, 2));
  }
  else if (command === 'audit') {
    const {auditCore} = await import('../../tests/browser-automation-core/audit-core.mjs');
    const report = auditCore(JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'final-index.json'))));
    fs.writeFileSync(path.join(EVIDENCE, 'final-audit.json'), JSON.stringify(report, null, 2), {mode: 0o600});
    console.log(JSON.stringify(report, null, 2));
  }
  else if (command === 'freeze') console.log(JSON.stringify(freezeCandidate(), null, 2));
  else if (command === 'recover') console.log(JSON.stringify(await recoverStaleBroker(), null, 2));
  else if (command === 'stop') console.log(JSON.stringify(await stopOwnedBroker(), null, 2));
  else if (command === 'start' && process.argv.includes('--background')) {
    console.log(JSON.stringify(await startBackgroundBroker(), null, 2));
  }
  else if (command === 'start') {
    const broker = await new Broker().start();
    console.log(JSON.stringify({broker: 'started', ...broker.status()}, null, 2));
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; await broker.stop(); process.exit(0); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  } else if (command === 'doctor' || command === 'status') {
    const client = await connectedClient();
    try {
      const response = await client.request('status');
      if (command === 'doctor') response.installation = installationReport();
      if (command === 'doctor') {
        response.loadedVersionMatches = response.result?.browser?.extensionVersion === response.installation.extension.version;
        const expected = expectedLoaded();
        response.loadedResourcesMatch = response.result?.browser?.loadedResources?.workerCodeSha256 === expected.workerCodeSha256 && JSON.stringify(response.result.browser.loadedResources.resources) === JSON.stringify(expected.resources);
        if (!response.result?.connected || response.result.browser.extensionId !== EXTENSION_ID || !response.loadedVersionMatches || !response.loadedResourcesMatch) process.exitCode = 1;
      }
      console.log(JSON.stringify(response, null, 2));
    } finally { client.close(); }
  } else if (command === 'echo') {
    const client = await connectedClient();
    try { console.log(JSON.stringify(await client.request('echo', {nonce: crypto.randomUUID()}), null, 2)); }
    finally { client.close(); }
  } else if (command === 'verify-components') {
    const { checkComponents } = await import('../../tests/browser-automation-core/component-check.mjs');
    const report = await checkComponents(); console.log(JSON.stringify(report, null, 2));
    if (report.results.length !== 2 || report.results.some(item => item.status !== 'PASS')) process.exitCode = 1;
  } else if (command === 'verify-a') {
    const { runGateA } = await import('../../tests/browser-automation-core/live-gate-a.mjs');
    const report = await runGateA(); console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'PASS') process.exitCode = 1;
  } else if (command === 'verify-dom') {
    const { runDOMGates } = await import('../../tests/browser-automation-core/live-dom.mjs');
    const report = await runDOMGates({visualCheckpoint: process.argv.includes('--visual-checkpoint')}); console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'PASS') process.exitCode = 1;
  } else if (command === 'tabs') {
    const client = await connectedClient(); try { console.log(JSON.stringify(await client.request('tabs'), null, 2)); } finally { client.close(); }
  } else if (command === 'fixture') {
    const file = path.join(STATE, 'fixture-public.json');
    if (fs.existsSync(file)) {
      const old = JSON.parse(fs.readFileSync(file));
      try { process.kill(old.pid, 0); throw Object.assign(new Error('FIXTURE_ALREADY_RUNNING'), {code: 'FIXTURE_ALREADY_RUNNING'}); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    const { startFixture } = await import('../../tests/browser-automation-core/fixture-server.mjs');
    const fixture = await startFixture(), instance = fixture.instance;
    fs.mkdirSync(STATE, {recursive: true, mode: 0o700});
    fs.writeFileSync(file, JSON.stringify({sourceDirectory: SOURCE, pid: process.pid, instance, origin: fixture.origin, url: fixture.url, directory: fixture.directory}), {mode: 0o600});
    fs.writeFileSync(path.join(STATE, 'fixture-verifier.json'), JSON.stringify({instance, credential: fixture.verifierCredential}), {mode: 0o600});
    console.log(JSON.stringify({fixture: 'started', url: fixture.url, directory: fixture.directory, stop: 'Ctrl+C in this terminal', verifierCredential: 'private file; omitted'}));
    const stop = async () => {
      await fixture.close();
      if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file)).instance === instance) for (const name of ['fixture-public.json', 'fixture-verifier.json']) fs.unlinkSync(path.join(STATE, name));
      process.exit(0);
    };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  } else if (command === 'golden') {
    const fixture = JSON.parse(fs.readFileSync(path.join(STATE, 'fixture-public.json')));
    const orders = process.argv.slice(3); if (!orders.length) throw Object.assign(new Error('ORDER_IDS_REQUIRED'), {code: 'ORDER_IDS_REQUIRED'});
    const client = await connectedClient();
    try {
      let tab;
      if (loadInstall().testMode) tab = (await success(client, 'test.openTab', {url: fixture.url})).result.tab;
      else {
        const matching = (await success(client, 'tabs')).result.tabs.filter(item => item.url === fixture.url);
        if (matching.length !== 1) throw Object.assign(new Error('FIXTURE_TAB_NOT_UNIQUE'), {code: 'FIXTURE_TAB_NOT_UNIQUE'});
        tab = matching[0].tab;
      }
      const scope = await observeReady(client, tab);
      const executions = []; for (const orderId of orders) executions.push(await executeOrder(client, scope, orderId));
      const directory = path.join(EVIDENCE, `golden-${Date.now()}`); fs.mkdirSync(directory, {recursive: true, mode: 0o700});
      const report = {status: 'PASS', candidateId: sourceSnapshot().candidateId, runId: path.basename(directory), source: 'real DOM executor only; independent verification still required', tab, scope,
        fixtureOrigin: fixture.origin, fixtureInstance: fixture.instance, executions};
      fs.writeFileSync(path.join(directory, 'executor.json'), JSON.stringify(report, null, 2), {mode: 0o600});
      fs.writeFileSync(path.join(STATE, 'golden-latest.json'), JSON.stringify({report: path.join(directory, 'executor.json')}), {mode: 0o600});
      console.log(JSON.stringify({status: report.status, report: path.join(directory, 'executor.json'), tab, independentVerifier: 'NOT_RUN; run verify-golden'}, null, 2));
    } finally { client.close(); }
  } else if (command === 'verify-golden') {
    const pointer = JSON.parse(fs.readFileSync(path.join(STATE, 'golden-latest.json'))), execution = JSON.parse(fs.readFileSync(pointer.report));
    const fixture = JSON.parse(fs.readFileSync(path.join(STATE, 'fixture-public.json'))), verifier = JSON.parse(fs.readFileSync(path.join(STATE, 'fixture-verifier.json')));
    if (fixture.instance !== execution.fixtureInstance || verifier.instance !== fixture.instance) throw Object.assign(new Error('FIXTURE_INSTANCE_MISMATCH'), {code: 'FIXTURE_INSTANCE_MISMATCH'});
    const { verifyOrder } = await import('../../tests/browser-automation-core/independent-verifier.mjs');
    const results = []; for (const item of execution.executions) results.push(await verifyOrder({instance: fixture.instance, origin: fixture.origin, verifierCredential: verifier.credential}, item));
    const report = {status: 'PASS', candidateId: execution.candidateId, fixtureInstance: fixture.instance, executorReport: pointer.report, results};
    fs.writeFileSync(path.join(path.dirname(pointer.report), 'independent-verifier.json'), JSON.stringify(report, null, 2), {mode: 0o600});
    console.log(JSON.stringify(report, null, 2));
  } else if (command === 'verify') {
    if (fs.existsSync(SOCKET)) await stopOwnedBroker();
    const { checkComponents } = await import('../../tests/browser-automation-core/component-check.mjs');
    const { runGateA } = await import('../../tests/browser-automation-core/live-gate-a.mjs');
    const { runDOMGates } = await import('../../tests/browser-automation-core/live-dom.mjs');
    const candidate = freezeCandidate();
    const components = await checkComponents(); if (components.results.some(item => item.status !== 'PASS')) throw Object.assign(new Error('COMPONENT_FAIL'), {code: 'COMPONENT_FAIL'});
    const gateA = await runGateA(); if (gateA.status !== 'PASS') { console.log(JSON.stringify({status: gateA.status, components: components.directory, gateA: gateA.directory})); process.exitCode = 1; }
    else {
      const file = path.join(EVIDENCE, 'current-state.json'); const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {};
      state.gates = {...state.gates, A: 'PASS'}; state.liveReport = path.join(gateA.directory, 'report.json'); fs.writeFileSync(file, JSON.stringify(state, null, 2), {mode: 0o600});
      const dom = await runDOMGates({visualCheckpoint: process.argv.includes('--visual-checkpoint')});
      const report = {status: dom.status, scope: 'functional A–D plus components; full delivery/visual audit remains separate',
        candidateId: candidate.candidateId, candidate: path.join(candidate.directory, 'candidate.json'), components: path.join(components.directory, 'report.json'), A: path.join(gateA.directory, 'report.json'), BCD: path.join(dom.directory, 'report.json')};
      fs.writeFileSync(path.join(EVIDENCE, 'latest-functional-verification.json'), JSON.stringify(report, null, 2), {mode: 0o600});
      currentCandidate(); console.log(JSON.stringify(report, null, 2)); if (dom.status !== 'PASS') process.exitCode = 1;
    }
  } else {
    console.log('Usage: node lab/browser-automation-core/cli.mjs setup [--test-mode] | installation | start [--background] | stop | recover | doctor | status | echo | tabs | fixture | golden <orders> | verify-golden | verify [--visual-checkpoint] | verify-components | verify-a | verify-dom | cleanup | freeze');
    process.exitCode = 2;
  }
} catch (error) {
  console.error(JSON.stringify({errorCode: error.code || 'INTERNAL_ERROR', command,
    detail: 'No automatic retries of actions. Check setup, broker and extension connection.'})); process.exitCode = 1;
}
