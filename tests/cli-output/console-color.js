#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const BINARY = path.resolve(ROOT_DIR, process.env.OPENDESK_BINARY || 'dist/opendesk');
const RUN_ID = `console-color-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const EVIDENCE_DIR = path.join(ROOT_DIR, '.runtime', 'tests', 'cli-output', RUN_ID);
const ANSI_CSI = /\x1b\[/;

assert.ok(fs.existsSync(BINARY), `OpenDesk binary does not exist: ${BINARY}; run make build first`);
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

function runCase(name, args, environment = {}) {
  const result = spawnSync(BINARY, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      NO_COLOR: '',
      FORCE_COLOR: '',
      ...environment,
    },
  });
  fs.writeFileSync(path.join(EVIDENCE_DIR, `${name}.stdout.log`), result.stdout || '');
  fs.writeFileSync(path.join(EVIDENCE_DIR, `${name}.stderr.log`), result.stderr || '');
  return result;
}

function artifactDir(name) {
  return path.join(EVIDENCE_DIR, 'artifacts', name);
}

function environmentArgs(name, ...extra) {
  return [
    '-script', 'examples/environment.js',
    '-log-dir', artifactDir(name),
    ...extra,
  ];
}

function assertSucceeded(result, name) {
  assert.equal(result.error, undefined, `${name}: ${result.error && result.error.message}`);
  assert.equal(result.status, 0, `${name} failed: ${result.stderr}`);
}

function assertNoANSI(value, name) {
  assert.ok(!ANSI_CSI.test(value), `${name} contains ANSI CSI`);
}

function stripANSI(value) {
  return value.replace(/\x1b\[[0-9;]*m/g, '');
}

function parseEnvironmentMarker(stdout) {
  const marker = '[ENVIRONMENT-EXAMPLE] ';
  const line = stdout.split(/\r?\n/).find((candidate) => candidate.includes(marker));
  assert.ok(line, 'environment marker is missing');
  return JSON.parse(line.slice(line.indexOf(marker) + marker.length));
}

const forced = runCase('forced', environmentArgs('forced', '-console-mode', 'full', '-color', 'always'));
assertSucceeded(forced, 'forced');
assert.match(forced.stdout, /\x1b\[90m\[FRAMEWORK\]\x1b\[0m/);
assert.match(forced.stdout, /\x1b\[35m\[META\]\x1b\[0m/);
assert.match(forced.stdout, /\x1b\[1;96m\[SCRIPT\]\x1b\[0m \x1b\[1;96m\[LOG\]\x1b\[0m \[ENVIRONMENT-EXAMPLE\]/);
assert.match(forced.stdout, /\x1b\[1;32m\[SUMMARY\]\x1b\[0m/);
assert.equal(parseEnvironmentMarker(forced.stdout).consoleMode, 'full');

const forcedTextLines = stripANSI(forced.stdout).split(/\r?\n/);
const frameworkLines = forcedTextLines.filter((line) => line.startsWith('[FRAMEWORK]'));
assert.ok(frameworkLines.length > 0, 'full mode did not expose framework diagnostics');
frameworkLines.forEach((line) => {
  assert.match(line, /^\[FRAMEWORK\] \[DEBUG\] /, `bootstrap line is not framework debug: ${line}`);
});
const businessLine = forcedTextLines.find((line) => line.includes('[ENVIRONMENT-EXAMPLE]'));
assert.ok(businessLine, 'business marker is missing');
assert.match(businessLine, /^\[SCRIPT\] \[LOG\] \[ENVIRONMENT-EXAMPLE\]/);
assert.ok(!businessLine.includes('[DEBUG]'), `business log was marked as framework diagnostics: ${businessLine}`);

for (const file of ['stdout.log', 'stderr.log', 'events.ndjson', 'summary.json', 'agent_summary.json']) {
  const filePath = path.join(artifactDir('forced'), file);
  const content = fs.readFileSync(filePath, 'utf8');
  assertNoANSI(content, `artifact ${file}`);
  assert.ok(!content.includes('\\u001b['), `artifact ${file} contains JSON-escaped ANSI`);
  if (file.endsWith('.json')) {
    JSON.parse(content);
  }
  if (file === 'events.ndjson') {
    content.trim().split('\n').forEach((line) => JSON.parse(line));
  }
}

const forcedEvents = fs.readFileSync(path.join(artifactDir('forced'), 'events.ndjson'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
const bootstrapEvents = forcedEvents.filter((event) => event.category === 'framework');
assert.ok(bootstrapEvents.length > 0, 'structured bootstrap events are missing');
bootstrapEvents.forEach((event) => {
  assert.equal(event.level, 'debug', `bootstrap event is not debug: ${event.message}`);
  assert.equal(event.source, 'runtime', `bootstrap event has wrong owner: ${event.message}`);
});
const businessEvent = forcedEvents.find((event) => event.message.startsWith('[ENVIRONMENT-EXAMPLE] '));
assert.ok(businessEvent, 'structured business event is missing');
assert.equal(businessEvent.category, 'script');
assert.equal(businessEvent.level, 'info');
assert.equal(businessEvent.source, 'console');
assert.equal(businessEvent.fields.consoleMethod, 'log');
assert.ok(!forcedEvents.some((event) => event.message === 'script execution completed successfully'),
  'framework completion leaked into business events');

const autoPipe = runCase('auto-pipe', environmentArgs('auto-pipe', '-console-mode', 'summary', '-color', 'auto'));
assertSucceeded(autoPipe, 'auto-pipe');
assertNoANSI(autoPipe.stdout + autoPipe.stderr, 'auto pipe');

const noColor = runCase(
  'no-color',
  environmentArgs('no-color', '-console-mode', 'full', '-color', 'auto'),
  { NO_COLOR: '1', FORCE_COLOR: '1' },
);
assertSucceeded(noColor, 'no-color');
assertNoANSI(noColor.stdout + noColor.stderr, 'NO_COLOR');

const forceColor = runCase(
  'force-color',
  environmentArgs('force-color', '-console-mode', 'summary', '-color', 'auto'),
  { FORCE_COLOR: '1' },
);
assertSucceeded(forceColor, 'force-color');
assert.match(forceColor.stdout, ANSI_CSI);

const never = runCase(
  'never',
  environmentArgs('never', '-console-mode', 'full', '-color', 'never'),
  { FORCE_COLOR: '1' },
);
assertSucceeded(never, 'never');
assertNoANSI(never.stdout + never.stderr, 'never');

const normalMode = runCase('mode-normal', [
  '-script-text', "console.log('NORMAL_BUSINESS'); console.debug('NORMAL_DETAIL');",
  '-console-mode', 'normal',
  '-color', 'never',
  '-log-dir', artifactDir('mode-normal'),
]);
assertSucceeded(normalMode, 'mode-normal');
assert.match(normalMode.stdout, /^\[SCRIPT\] \[LOG\] NORMAL_BUSINESS$/m);
assert.ok(!normalMode.stdout.includes('NORMAL_DETAIL'), 'normal mode exposed business debug');
assert.ok(!normalMode.stdout.includes('[FRAMEWORK]'), 'normal mode exposed framework diagnostics');

const accessibleLevels = runCase('text-levels', [
  '-script-text', "console.log('BUSINESS'); console.warn('WATCH'); console.debug('DETAIL'); console.error('BUSINESS_ERROR');",
  '-console-mode', 'script',
  '-color', 'never',
  '-log-dir', artifactDir('text-levels'),
]);
assertSucceeded(accessibleLevels, 'text-levels');
assert.match(accessibleLevels.stdout, /^\[SCRIPT\] \[LOG\] BUSINESS$/m);
assert.match(accessibleLevels.stdout, /\[SCRIPT\] \[WARN\] WATCH/);
assert.match(accessibleLevels.stdout, /\[SCRIPT\] \[DEBUG\] DETAIL/);
assert.match(accessibleLevels.stderr, /^\[SCRIPT\] \[ERROR\] BUSINESS_ERROR$/m);
assert.ok(!accessibleLevels.stdout.includes('[FRAMEWORK]'), 'script mode exposed framework diagnostics');

const agent = runCase('agent', environmentArgs('agent', '-output-format', 'json', '-color', 'always'));
assertSucceeded(agent, 'agent');
assertNoANSI(agent.stdout + agent.stderr, 'agent');
const agentSummary = JSON.parse(agent.stdout);
assert.equal(agentSummary.status, 'succeeded');
assert.equal(agentSummary.scriptLogs.length, 1, 'framework completion leaked into business scriptLogs');
assert.match(agentSummary.scriptLogs[0].message, /^\[ENVIRONMENT-EXAMPLE\] /);

const emptyAgent = runCase('agent-empty', [
  '-script-text', 'void 0;',
  '-output-format', 'json',
  '-color', 'always',
  '-log-dir', artifactDir('agent-empty'),
]);
assertSucceeded(emptyAgent, 'agent-empty');
const emptyAgentSummary = JSON.parse(emptyAgent.stdout);
assert.deepEqual(emptyAgentSummary.scriptLogs || [], [], 'framework lifecycle leaked into scriptLogs');

const pollingNoise = runCase('polling-noise', [
  '-script-text', "let attempts = 0; await page.waitForFunction(() => { attempts += 1; if (attempts === 1) throw new Error('TRANSIENT_POLL'); return true; }, { polling: 1, timeout: 1000 });",
  '-output-format', 'json',
  '-color', 'always',
  '-log-dir', artifactDir('polling-noise'),
]);
assertSucceeded(pollingNoise, 'polling-noise');
const pollingSummary = JSON.parse(pollingNoise.stdout);
assert.deepEqual(pollingSummary.scriptLogs || [], [], 'ignored framework polling detail leaked into scriptLogs');

const imageColorNoise = runCase('image-color-noise', [
  '-script-text', "const blocks = ImageColor.findColorBlocks('unused', '', {}); if (!Array.isArray(blocks) || blocks.length !== 0) throw new Error('unexpected blocks');",
  '-output-format', 'json',
  '-color', 'always',
  '-log-dir', artifactDir('image-color-noise'),
]);
assertSucceeded(imageColorNoise, 'image-color-noise');
const imageColorSummary = JSON.parse(imageColorNoise.stdout);
assert.deepEqual(imageColorSummary.scriptLogs || [], [], 'ImageColor diagnostics bypassed structured logging');
assertNoANSI(imageColorNoise.stdout + imageColorNoise.stderr, 'ImageColor agent output');

const clearAgent = runCase('clear-agent', [
  '-script-text', "console.clear(); console.log('CLEAR_OK');",
  '-output-format', 'json',
  '-color', 'always',
  '-log-dir', artifactDir('clear-agent'),
]);
assertSucceeded(clearAgent, 'clear-agent');
assertNoANSI(clearAgent.stdout + clearAgent.stderr, 'clear agent');
const clearSummary = JSON.parse(clearAgent.stdout);
assert.ok(clearSummary.scriptLogs.some((item) => item.message === 'CLEAR_OK'));

const failedAgent = runCase('failed-agent', [
  '-script-text', "throw new Error('COLOR_FAILURE');",
  '-output-format', 'json',
  '-color', 'always',
  '-log-dir', artifactDir('failed-agent'),
]);
assert.equal(failedAgent.status, 1, `failed-agent exit status: ${failedAgent.stderr}`);
assertNoANSI(failedAgent.stdout + failedAgent.stderr, 'failed agent');
assert.equal(JSON.parse(failedAgent.stdout).status, 'failed');
assert.equal(JSON.parse(failedAgent.stdout).errors.length, 1, 'execution failure was reported more than once');
assert.match(failedAgent.stderr, /COLOR_FAILURE/);

const report = {
  schemaVersion: '1.0.0',
  binary: BINARY,
  cases: [
    'forced',
    'auto-pipe',
    'no-color',
    'force-color',
    'never',
    'mode-normal',
    'text-levels',
    'agent',
    'agent-empty',
    'polling-noise',
    'image-color-noise',
    'clear-agent',
    'failed-agent',
  ],
  status: 'passed',
};
fs.writeFileSync(path.join(EVIDENCE_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`PASS: terminal color contract; evidence=${path.relative(ROOT_DIR, EVIDENCE_DIR)}\n`);
