// From the repository root:
// ./dist/opendesk -script examples/http/download.test.js -console-mode script
//
// This deterministic self-test owns the existing loopback fixture process;
// users do not need to start a server. It shares the formal Runtime assertion
// module and throws on every setup or assertion failure.
'use strict';

const root = File.join(Execution.workdir, '.runtime', 'tests', 'http-download', Execution.id, 'example-self-test');
const ready = File.join(root, 'fixture-ready.json');
const fixtureOut = File.join(root, 'fixture.stdout.log');
const fixtureErr = File.join(root, 'fixture.stderr.log');
File.ensureDir(root);

const quote = (value) => "'" + String(value).replace(/'/g, "'\\''") + "'";
const fixtureScript = File.join(Execution.workdir, 'tests', 'runtime-api', 'fixture', 'server.py');
const start = await Command.run('/bin/sh', ['-c',
  'python3 ' + quote(fixtureScript) + ' --ready ' + quote(ready)
  + ' >' + quote(fixtureOut) + ' 2>' + quote(fixtureErr) + ' & echo $!',
], { cwd: Execution.workdir, timeout: 10_000, maxOutputBytes: 4096 });
const fixturePID = Number(String(start.stdout || '').trim());
if (!Number.isInteger(fixturePID) || fixturePID <= 0) throw new Error('fixture server did not report a PID');

async function stopFixture() {
  try { await Command.run('/bin/kill', ['-TERM', String(fixturePID)], { timeout: 5000 }); }
  catch (error) { console.warn('[HTTP-DOWNLOAD-EXAMPLE-TEST] fixture already stopped'); }
}

try {
  const deadline = Date.now() + 10_000;
  while (!File.exists(ready)) {
    if (Date.now() >= deadline) throw new Error('fixture server did not become ready');
    await delay(20);
  }
  const fixture = JSON.parse(File.read(ready));
  if (!fixture || typeof fixture.baseURL !== 'string') throw new Error('fixture ready data is invalid');

  (0, eval)(File.read(File.join(Execution.workdir, 'tests', 'runtime-api', 'crypto.js')));
  const assertions = (0, eval)(File.read(File.join(Execution.workdir, 'tests', 'runtime-api', 'support', 'http-download-assertions.js')));
  const path = File.join(root, 'download.bin');
  const sha256 = '0b25192a92556eedb929bf6ef6d8adb16ea43544f5141388eecc60bc77a155bf';
  const result = await http.download(fixture.baseURL + '/download/binary', { path, sha256 });
  assertions.verifyDownload(result, { path, bytesWritten: 12, sha256 });
  console.log('[HTTP-DOWNLOAD-EXAMPLE-TEST] ' + JSON.stringify({ status: 'passed', path, bytesWritten: result.bytesWritten, sha256: result.sha256 }));
} finally {
  await stopFixture();
}
