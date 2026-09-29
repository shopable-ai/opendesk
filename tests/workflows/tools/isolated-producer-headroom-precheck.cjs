'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { EVIDENCE_ROOT, createBroker, sha256 } = require('./isolated-producer.cjs');

const DEFAULT_PYTHON = '/Users/mac/.local/share/headroom-ai-venv/bin/python';
const DISABLED = [
  'optimize', 'image_optimize', 'ccr_inject_tool', 'ccr_inject_system_instructions',
  'ccr_handle_responses', 'ccr_context_tracking', 'ccr_proactive_expansion',
  'code_aware_enabled', 'code_graph_watcher', 'read_lifecycle',
  'cache_enabled', 'rate_limit_enabled', 'retry_enabled', 'prefix_freeze_enabled',
  'cost_tracking_enabled', 'log_requests', 'log_full_messages', 'fallback_enabled',
  'memory_enabled', 'memory_inject_tools', 'memory_inject_context',
  'memory_use_native_tool', 'memory_bridge_enabled', 'memory_bridge_auto_import',
  'traffic_learning_enabled', 'discover_pipeline_extensions', 'http2',
];

const BOOTSTRAP = String.raw`
import asyncio
import errno
import hashlib
import importlib.metadata
import json
import logging
import os
from pathlib import Path
import socket
import sys
from urllib.parse import urlparse

root = Path(sys.argv[1])
config_values = json.loads((root / "config.json").read_text())
logging.basicConfig(level=logging.ERROR)
upstream = urlparse(config_values["openai_api_url"])
assert upstream.hostname == "127.0.0.1"
denied_events = {}

def restrict_network(event, arguments):
    allowed = True
    if event == "socket.connect":
        address = arguments[1]
        allowed = isinstance(address, tuple) and address[0] == "127.0.0.1" and address[1] == upstream.port
    elif event == "socket.bind":
        address = arguments[1]
        allowed = isinstance(address, tuple) and address[0] == "127.0.0.1"
    elif event in ("socket.getaddrinfo", "socket.gethostbyname"):
        allowed = arguments[0] in ("127.0.0.1", b"127.0.0.1")
    if not allowed:
        denied_events[event] = denied_events.get(event, 0) + 1
        with (root / "audit-denials.jsonl").open("a") as audit_log:
            audit_log.write(json.dumps({"event": event, "target": str(arguments[1] if event in ("socket.connect", "socket.bind") else arguments[0])}) + "\n")
        raise PermissionError(errno.EPERM, "probe_network_destination_denied")

sys.addaudithook(restrict_network)
probe_socket = socket.socket()
probe_socket.settimeout(0.2)
try:
    blocked = probe_socket.connect_ex(("127.0.0.1", 1))
except PermissionError as error:
    blocked = error.errno
probe_socket.close()
if blocked not in (errno.EPERM, errno.EACCES):
    raise RuntimeError("python_socket_policy_not_enforced")

import headroom
from headroom.proxy.models import ProxyConfig
from headroom.proxy.server import create_app
import uvicorn

listener = socket.socket()
listener.bind(("127.0.0.1", 0))
listener.listen(128)
listener.setblocking(False)
port = listener.getsockname()[1]
config_values["port"] = port
config = ProxyConfig(**config_values)
app = create_app(config)
server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port,
    log_config=None, access_log=False, loop="asyncio", lifespan="on"))

def write_json(name, value):
    temporary = root / (name + ".tmp")
    temporary.write_text(json.dumps(value, indent=2))
    temporary.replace(root / name)

async def main():
    task = asyncio.create_task(server.serve(sockets=[listener]))
    for attempt in range(300):
        if server.started:
            break
        if task.done():
            await task
            raise RuntimeError("headroom_startup_failed")
        await asyncio.sleep(0.1)
    if not server.started:
        server.should_exit = True
        raise RuntimeError("headroom_startup_timeout")
    proxy = app.state.proxy
    assert proxy.memory_handler is None
    assert proxy.cache is None
    assert proxy.usage_reporter is None
    assert proxy.traffic_learner is None
    assert not proxy._compression_caches
    package = Path(headroom.__file__).parent
    sources = {}
    for relative in ("proxy/server.py", "proxy/models.py", "proxy/handlers/openai.py",
                     "proxy/helpers.py", "providers/proxy_routes.py", "copilot_auth.py"):
        sources[relative] = hashlib.sha256((package / relative).read_bytes()).hexdigest()
    ready = {"pid": os.getpid(), "port": port, "version": importlib.metadata.version("headroom-ai"),
             "sourceRoot": str(package), "sourceSha256": sources, "config": config_values,
             "resolvedOpenAIEndpoint": proxy.OPENAI_API_URL,
             "osSandbox": False, "networkControl": "python-audit-hook-not-os",
             "pythonSocketPolicyVerified": True, "memoryHandlerAbsent": True,
             "cacheAbsent": True, "usageReporterAbsent": True, "trafficLearnerAbsent": True,
             "rustCoreStatus": app.state.rust_core_status,
             "initialCompressionCacheEntries": len(proxy._compression_caches)}
    write_json("ready.json", ready)
    await task
    write_json("shutdown.json", {"pid": os.getpid(), "stopped": True,
        "compressionCacheEntries": len(proxy._compression_caches), "deniedAuditEvents": denied_events})

try:
    asyncio.run(main())
except BaseException as error:
    write_json("startup-failure.json", {"type": type(error).__name__})
    raise
`;

function writeJson(filename, value) {
  fs.writeFileSync(filename, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
}

function interpreterMetadata(python) {
  const links = [];
  let current = python;
  for (let depth = 0; depth < 12 && fs.lstatSync(current).isSymbolicLink(); depth += 1) {
    const target = fs.readlinkSync(current);
    links.push({ path: current, target });
    current = path.resolve(path.dirname(current), target);
  }
  return { invokedPath: python, canonicalPath: fs.realpathSync(python), links };
}

function cleanEnvironment(root) {
  return {
    PATH: '/usr/bin:/bin', LANG: 'C', HOME: path.join(root, 'home'), TMPDIR: path.join(root, 'tmp'),
    NO_PROXY: '127.0.0.1,localhost,::1', no_proxy: '127.0.0.1,localhost,::1',
    XDG_CONFIG_HOME: path.join(root, 'config'), XDG_CACHE_HOME: path.join(root, 'cache'),
    HEADROOM_CONFIG_DIR: path.join(root, 'headroom-config'), HEADROOM_WORKSPACE_DIR: path.join(root, 'headroom-workspace'),
    HEADROOM_TELEMETRY: 'off', HEADROOM_TELEMETRY_WARN: 'off', DO_NOT_TRACK: '1',
    HEADROOM_PREFER_OPENAI_TARGET: '1', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1',
    HEADROOM_REQUIRE_RUST_CORE: 'false',
    TIKTOKEN_CACHE_DIR: path.join(root, 'tokenizer-cache'),
  };
}

async function stopChild(child, exited) {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  const stopped = await Promise.race([exited.then(() => true), delay(5000).then(() => false)]);
  if (!stopped) {
    child.kill('SIGKILL');
    await exited;
  }
  return { exitCode: child.exitCode, signalCode: child.signalCode, forced: !stopped };
}

async function startTemporaryHeadroom({ root, upstreamPort, python = DEFAULT_PYTHON, requestTimeout = 10 }) {
  const environment = cleanEnvironment(root);
  for (const name of ['HOME', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'HEADROOM_CONFIG_DIR', 'HEADROOM_WORKSPACE_DIR', 'TIKTOKEN_CACHE_DIR']) fs.mkdirSync(environment[name], { mode: 0o700 });
  writeJson(path.join(root, 'environment.json'), environment);
  writeJson(path.join(root, 'interpreter.json'), interpreterMetadata(python));
  const config = { host: '127.0.0.1', openai_api_url: `http://127.0.0.1:${upstreamPort}`,
    request_timeout_seconds: requestTimeout, connect_timeout_seconds: 3, retry_max_attempts: 1,
    proxy_extensions: [], pipeline_extensions: [], memory_bridge_md_paths: [], smart_routing: true,
    ...Object.fromEntries(DISABLED.map(name => [name, false])) };
  writeJson(path.join(root, 'config.json'), config);
  fs.writeFileSync(path.join(root, 'bootstrap.py'), BOOTSTRAP, { flag: 'wx', mode: 0o600 });
  const stdout = fs.openSync(path.join(root, 'bootstrap.stdout.log'), 'wx', 0o600);
  const stderr = fs.openSync(path.join(root, 'bootstrap.stderr.log'), 'wx', 0o600);
  let child;
  let exited;
  try {
    child = spawn(python, ['-I', '-B', path.join(root, 'bootstrap.py'), root],
      { cwd: root, env: environment, stdio: ['ignore', stdout, stderr] });
    exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
  } finally { fs.closeSync(stdout); fs.closeSync(stderr); }
  try {
    const deadline = Date.now() + 45000;
    const readyPath = path.join(root, 'ready.json');
    while (!fs.existsSync(readyPath)) {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) throw new Error('headroom_startup_failed');
      if (Date.now() > deadline) throw new Error('headroom_startup_timeout');
      await delay(100);
    }
    const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
    assert.notEqual(ready.pid, 8347);
    assert.notEqual(ready.port, 8787);
    assert.equal(ready.osSandbox, false);
    assert.equal(ready.pythonSocketPolicyVerified, true);
    assert.equal(ready.memoryHandlerAbsent, true);
    for (const name of DISABLED) assert.equal(ready.config[name], false);
    assert.equal(ready.config.smart_routing, true);
    return { child, exited, ready };
  } catch (error) {
    await stopChild(child, exited);
    throw error;
  }
}

async function runHeadroomPrecheck({ python = DEFAULT_PYTHON } = {}) {
  assert.equal(process.platform, 'darwin', 'This probe targets the inspected macOS Headroom installation.');
  assert(path.isAbsolute(python));
  fs.mkdirSync(EVIDENCE_ROOT, { recursive: true });
  const root = fs.mkdtempSync(path.join(EVIDENCE_ROOT, 'headroom-mock-'));
  const captures = [];
  const responses = [];
  let responseMode = 'success';
  let captureFailure;
  const upstream = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      try {
        const bytes = Buffer.concat(chunks);
        const body = JSON.parse(bytes);
        const index = captures.length;
        fs.writeFileSync(path.join(root, `upstream-${index}.body.json`), bytes, { flag: 'wx', mode: 0o600 });
        captures.push({ method: request.method, path: request.url, body, rawSha256: sha256(bytes), raw: bytes.toString() });
        if (responseMode === 'missing-model') {
          response.writeHead(404, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: { type: 'invalid_request_error', code: 'model_not_found', message: 'SYNTHETIC_MOCK_ONLY' } }));
          return;
        }
        const model = responseMode === 'wrong-model' ? 'gpt-6-astra' : 'hr-6-astra';
        const result = { id: `resp_headroom_mock_${index}`, object: 'response', created_at: 1,
          status: 'completed', model, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: `SYNTHETIC_MOCK_RESULT_${index}` }] }],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
        if (body.stream) {
          response.writeHead(200, { 'content-type': 'text/event-stream' });
          response.end(`event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: result })}\n\ndata: [DONE]\n\n`);
        } else {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify(result));
        }
      } catch (error) {
        captureFailure = error;
        response.writeHead(500);
        response.end('mock_capture_failed');
      }
    });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = upstream.address().port;
  let child;
  let exited;
  let outcome;
  try {
    const started = await startTemporaryHeadroom({ root, upstreamPort, python });
    ({ child, exited } = started);
    const { ready } = started;
    const packetRoot = path.join(root, 'synthetic-packet');
    fs.mkdirSync(packetRoot);
    const broker = createBroker({ packetRoot, evidenceRoot: root, timeoutMs: 15000 });
    const route = { version: 1, mode: 'mock', endpoint: `http://127.0.0.1:${ready.port}/v1/responses`, model: 'hr-6-astra', expectedResponseModel: 'hr-6-astra', stream: false };
    for (let turn = 0; turn < 4; turn += 1) {
      responseMode = ['success', 'success', 'wrong-model', 'missing-model'][turn];
      route.stream = turn === 1;
      const text = `SYNTHETIC_CURRENT_TURN_${turn}_NO_BUSINESS_CONTENT`;
      const relative = `synthetic-${turn}.txt`;
      fs.writeFileSync(path.join(packetRoot, relative), text);
      const packet = { version: 1, taskId: 'headroom-transport-precheck', stage: 1, turn,
        files: [{ id: 'synthetic-requirement', role: 'requirement', path: relative, sha256: sha256(text) }] };
      const before = captures.length;
      const previousEvidence = new Set(fs.readdirSync(root).filter(name => name.startsWith('broker-')));
      let result;
      if (turn < 2) result = await broker.send({ packet, route });
      else await assert.rejects(broker.send({ packet, route }), { code: turn === 2 ? 'response_model_mismatch' : 'http_status_rejected' });
      const addedEvidence = fs.readdirSync(root).filter(name => name.startsWith('broker-') && !previousEvidence.has(name));
      assert.equal(addedEvidence.length, 1);
      const brokerEvidenceDirectory = path.join(root, addedEvidence[0]);
      const responsePath = path.join(brokerEvidenceDirectory, 'response.json');
      const actualResponse = fs.existsSync(responsePath) ? JSON.parse(fs.readFileSync(responsePath, 'utf8')) : null;
      const actualTransport = JSON.parse(fs.readFileSync(path.join(brokerEvidenceDirectory, 'transport.json'), 'utf8'));
      assert.equal(captures.length, before + 1, 'Each broker request must reach upstream exactly once.');
      const capture = captures[before];
      const { compilePacket } = require('./isolated-producer.cjs');
      const expected = compilePacket({ packetRoot, packet, route });
      assert.equal(capture.method, 'POST');
      assert.equal(capture.path, '/v1/responses');
      assert.deepEqual(capture.body, JSON.parse(expected.bodyText));
      assert.deepEqual(capture.body.tools, []);
      assert.equal(capture.body.tool_choice, 'none');
      assert.equal(capture.body.model, 'hr-6-astra');
      for (let prior = 0; prior < turn; prior += 1) {
        assert(!capture.raw.includes(`SYNTHETIC_CURRENT_TURN_${prior}`));
        assert(!capture.raw.includes(`SYNTHETIC_MOCK_RESULT_${prior}`));
      }
      responses.push({ turn, mockOnly: true, expectedResponse: responseMode,
        requestedModel: capture.body.model, reportedModel: actualResponse?.model ?? null,
        brokerBodySha256: expected.bodySha256, upstreamBodySha256: capture.rawSha256,
        rawBytesIdentical: capture.raw === expected.bodyText, parsedBodyIdentical: true,
        responseId: actualResponse?.id ?? null, httpStatus: actualTransport.status,
        responseBodySha256: actualTransport.responseBodySha256, brokerEvidenceDirectory });
    }
    if (captureFailure) throw captureFailure;
    outcome = { pass: true, mockOnly: true, productionRequests: 0, businessPromptRequests: 0,
      osSandbox: false, networkControl: 'python-audit-hook-not-os',
      trustedComponents: ['maintainer', 'Node broker/mock host', 'Python interpreter and native dependencies', 'installed Headroom', 'host filesystem and process environment isolation'],
      evidenceRoot: root, childPid: ready.pid, childPort: ready.port, upstreamPort,
      headroomVersion: ready.version, sourceSha256: ready.sourceSha256,
      probeSourceSha256: sha256(fs.readFileSync(__filename)),
      rustCoreStatus: ready.rustCoreStatus, upstreamRequests: captures.length, cases: responses };
    return outcome;
  } catch (error) {
    writeJson(path.join(root, 'failure.json'), { code: 'headroom_precheck_failed', type: error.name });
    process.stderr.write(`Precheck failure evidence: ${root}\n`);
    throw error;
  } finally {
    if (child && exited) {
      const stopped = await stopChild(child, exited);
      writeJson(path.join(root, 'child-exit.json'), stopped);
      if (outcome) outcome.childStopped = stopped;
    }
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    if (outcome) writeJson(path.join(root, 'proof.json'), outcome);
  }
}

module.exports = { runHeadroomPrecheck, cleanEnvironment, interpreterMetadata, DISABLED, startTemporaryHeadroom, stopChild };
if (require.main === module) {
  if (process.argv.length === 3 && process.argv[2] === '--run') {
    runHeadroomPrecheck().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
      process.stderr.write(`${error.name}: ${error.message}\n`);
      process.exitCode = 1;
    });
  } else {
    process.stdout.write('From repository root: node tests/workflows/tools/isolated-producer-headroom-precheck.cjs --run\nRuns a temporary installed Headroom on the trusted host with clean state, a Python socket audit guard and a test-owned upstream HTTP mock. NOT OS sandboxing; Python/native dependencies and the host remain trusted. Synthetic prompts only; no credentials, aliases, business packets, shared-process changes, or production requests. Evidence goes under .runtime/tests/agent-to-recipe/revision-20260929/isolation-probe/.\n');
  }
}
