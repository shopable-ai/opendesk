// Formal loopback Runtime gate for the native streaming http.download API.
// It is launched only through OPENDESK_RUNTIME_API_MODE=http-download, where
// the existing fixture owner supplies RUNTIME_API_FIXTURE and teardown proof.
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/crypto.js');

if (!globalThis.RUNTIME_API_FIXTURE) {
  throw new Error('RUNTIME_API_FIXTURE was not injected for http.download tests');
}

const HTTPDownloadAssertions = (0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/support/http-download-assertions.js')));
if (!HTTPDownloadAssertions || typeof HTTPDownloadAssertions.verifyDownload !== 'function') {
  throw new Error('http.download shared assertions are unavailable');
}

(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const fixture = RUNTIME_API_FIXTURE;
  const root = File.join(RuntimeAPITest.context.runDir, 'http-download');
  File.ensureDir(root);
  const url = (suffix) => fixture.baseURL + suffix;
  const target = (name) => File.join(root, name);

  const vectors = Object.freeze({
    binary: { bytesWritten: 12, sha256: '0b25192a92556eedb929bf6ef6d8adb16ea43544f5141388eecc60bc77a155bf' },
    empty: { bytesWritten: 0, sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
    chunked: { bytesWritten: 16, sha256: 'af570f38c33a917964e92a9acd03f9c7fc1a5200fd739313a6fbbac41e913608' },
    gzip: { bytesWritten: 22, sha256: 'cfe45f8ee4d06d5cae8e82f26008cb97c12883a289919023024b51b3469a01a1' },
    large: { bytesWritten: 12 * 1024 * 1024, sha256: 'b6967a4c54cdab8a16907be0774af71e5db8198045f91933ebed106ddba22dfb' },
  });

  function expected(name, path) {
    return { path, ...vectors[name] };
  }

  RuntimeAPITest.contractObject('http');

  test({
    name: '[HTTP-DOWNLOAD-002] binary, empty, chunked and gzip downloads match independent known vectors',
    tier: 'unit',
    covers: ['http.download'],
  }, async () => {
    for (const [name, endpoint] of Object.entries({ binary: '/download/binary', empty: '/download/empty', chunked: '/download/chunked', gzip: '/download/gzip' })) {
      const path = target('bytes-' + name + '.bin');
      const result = await http.download(url(endpoint), { path, sha256: vectors[name].sha256 });
      HTTPDownloadAssertions.verifyDownload(result, expected(name, path));
    }
  });

  test({
    name: '[HTTP-DOWNLOAD-003] large streaming download exceeds buffered request limit without expanding it',
    tier: 'unit',
    covers: ['http.download', 'http.request'],
  }, async () => {
    const path = target('large.bin');
    const result = await http.download(url('/download/large'), { path, maxBytes: 13 * 1024 * 1024, sha256: vectors.large.sha256 });
    const bytes = HTTPDownloadAssertions.verifyDownload(result, { ...expected('large', path), verifyFileSHA: false });
    equal(bytes.length, vectors.large.bytesWritten);
    equal(bytes[0], 0);
    equal(bytes[250], 250);
    equal(bytes[251], 0);
    equal(bytes[bytes.length - 1], (bytes.length - 1) % 251);
    await RuntimeAPITest.expectThrow(() => http.get(url('/download/large'), { responseType: 'arraybuffer' }), 'HTTP response body exceeds configured limit');
  });

  test({
    name: '[HTTP-DOWNLOAD-004] maxBytes and digest failures preserve the pre-existing target',
    tier: 'unit',
    covers: ['http.download'],
  }, async () => {
    const limitPath = target('preserve-limit.bin');
    File.writeBytes(limitPath, [111, 108, 100]);
    await HTTPDownloadAssertions.expectDownloadError(() => http.download(url('/download/binary'), { path: limitPath, overwrite: true, maxBytes: 4 }), 'MAX_BYTES_EXCEEDED', 200, false);
    equal(JSON.stringify(Array.from(new Uint8Array(File.readBytes(limitPath)))), JSON.stringify([111, 108, 100]));
    await HTTPDownloadAssertions.expectDownloadError(() => http.download(url('/download/binary'), { path: limitPath, overwrite: true, sha256: '0'.repeat(64) }), 'SHA256_MISMATCH', 200, false);
    equal(JSON.stringify(Array.from(new Uint8Array(File.readBytes(limitPath)))), JSON.stringify([111, 108, 100]));
  });

  test({
    name: '[HTTP-DOWNLOAD-005] status, truncation and unsupported encodings never publish partial files',
    tier: 'unit',
    covers: ['http.download'],
  }, async () => {
    const cases = [
      ['/download/status-500', 'HTTP_STATUS', 500],
      ['/download/status-206', 'HTTP_STATUS', 206],
      ['/download/status-304', 'HTTP_STATUS', 304],
      ['/download/truncated', 'IO_FAILED', 200],
      ['/download/unknown-encoding', 'UNSUPPORTED_ENCODING', 200],
    ];
    for (const [endpoint, code, status] of cases) {
      const path = target('failure-' + code + '-' + status + '.bin');
      await HTTPDownloadAssertions.expectDownloadError(() => http.download(url(endpoint), { path }), code, status, false);
      assert(!File.exists(path), 'failed download published ' + path);
    }
  });

  test({
    name: '[HTTP-DOWNLOAD-006] conflict, overwrite, createDirs and Unicode paths retain correct target semantics',
    tier: 'unit',
    covers: ['http.download'],
  }, async () => {
    const conflict = target('existing.bin');
    File.writeBytes(conflict, [111, 108, 100]);
    // This is rejected before opening a network connection, so no HTTP status
    // exists. Structured download errors use status=0 for that boundary.
    await HTTPDownloadAssertions.expectDownloadError(() => http.download(url('/download/binary'), { path: conflict }), 'TARGET_EXISTS', 0, false);
    equal(JSON.stringify(Array.from(new Uint8Array(File.readBytes(conflict)))), JSON.stringify([111, 108, 100]));
    const replaced = await http.download(url('/download/binary'), { path: conflict, overwrite: true, sha256: vectors.binary.sha256 });
    HTTPDownloadAssertions.verifyDownload(replaced, expected('binary', conflict));

    const nested = target('中文 路径/nested/file.bin');
    await HTTPDownloadAssertions.expectDownloadError(() => http.download(url('/download/binary'), { path: nested }), 'IO_FAILED');
    const created = await http.download(url('/download/binary'), { path: nested, createDirs: true, sha256: vectors.binary.sha256 });
    HTTPDownloadAssertions.verifyDownload(created, expected('binary', nested));

    const directoryTarget = target('directory-target');
    File.ensureDir(directoryTarget);
    await HTTPDownloadAssertions.expectDownloadError(() => http.download(url('/download/binary'), { path: directoryTarget, overwrite: true }), 'UNSUPPORTED_FILE_TYPE', 0, false);
    const symlinkSource = target('symlink-source.bin');
    const symlinkTarget = target('symlink-target.bin');
    File.writeBytes(symlinkSource, [111, 108, 100]);
    await Command.run('/bin/ln', ['-s', symlinkSource, symlinkTarget], { timeout: 5000 });
    await HTTPDownloadAssertions.expectDownloadError(() => http.download(url('/download/binary'), { path: symlinkTarget, overwrite: true }), 'UNSUPPORTED_FILE_TYPE', 0, false);
  });

  test({
    name: '[HTTP-DOWNLOAD-007] redirects enforce same-origin defaults and strip caller headers after explicit cross-origin opt-in',
    tier: 'unit',
    covers: ['http.download'],
  }, async () => {
    const samePath = target('redirect-same.bin');
    const same = await http.download(url('/download/redirect/same'), { path: samePath, sha256: vectors.binary.sha256 });
    HTTPDownloadAssertions.verifyDownload(same, expected('binary', samePath));
    await HTTPDownloadAssertions.expectDownloadError(() => http.download(url('/download/redirect/loop-a'), { path: target('loop.bin') }), 'REDIRECT_DENIED', 302, false);
    await HTTPDownloadAssertions.expectDownloadError(() => http.download(url('/download/redirect/cross'), { path: target('cross-denied.bin'), headers: { 'X-Download-Secret': 'must-not-leak' } }), 'REDIRECT_DENIED', 302, false);
    const crossPath = target('cross-allowed.json');
    const cross = await http.download(url('/download/redirect/cross'), {
      path: crossPath,
      allowCrossOriginRedirects: true,
      headers: { 'X-Download-Secret': 'must-not-leak' },
    });
    assert(cross.committed === true && File.read(crossPath).includes('"secret": ""'), File.read(crossPath));
  });

  test({
    name: '[HTTP-DOWNLOAD-008] pre-cancel and shared-signal cancellation leave no target and isolate listener failures',
    tier: 'unit',
    covers: ['http.download', 'global.AbortController'],
  }, async () => {
    await http.get(url('/reset'));
    const before = (await http.get(url('/state'))).data.downloadRequests;
    const pre = new AbortController();
    pre.abort('first reason');
    pre.abort('second reason');
    equal(pre.signal.reason, 'first reason');
    const prePath = target('pre-canceled.bin');
    await HTTPDownloadAssertions.expectDownloadError(() => http.download(url('/download/binary'), { path: prePath, signal: pre.signal }), 'CANCELED', 0, false);
    equal((await http.get(url('/state'))).data.downloadRequests, before);
    assert(!File.exists(prePath), 'pre-canceled download created a target');

    const controller = new AbortController();
    let delivered = 0;
    controller.signal.onabort = () => { throw new Error('listener secret must not be logged'); };
    controller.signal.addEventListener('abort', () => { delivered += 1; });
    const first = http.download(url('/download/slow'), { path: target('canceled-a.bin'), signal: controller.signal });
    const second = http.download(url('/download/slow'), { path: target('canceled-b.bin'), signal: controller.signal });
    // Either worker can observe the shared abort first. Mark both rejections
    // handled in this turn, then assert their structured values below.
    first.catch(() => {});
    second.catch(() => {});
    setTimeout(() => controller.abort('shared cancellation'), 40);
    await HTTPDownloadAssertions.expectDownloadError(() => first, 'CANCELED', 200, false);
    await HTTPDownloadAssertions.expectDownloadError(() => second, 'CANCELED', 200, false);
    equal(delivered, 1, 'later listener did not receive abort');
    assert(!File.exists(target('canceled-a.bin')) && !File.exists(target('canceled-b.bin')), 'canceled download published a target');
  });

  test({
    name: '[HTTP-DOWNLOAD-009] per-execution download concurrency is bounded and completed files stay committed',
    tier: 'unit',
    covers: ['http.download'],
  }, async () => {
    const controller = new AbortController();
    const downloads = Array.from({ length: 5 }, (_, index) => http.download(url('/download/slow'), { path: target('parallel-' + index + '.bin'), signal: controller.signal }));
    // Mark every immediately-created Promise handled before a cancellation can
    // settle it. Individual assertions below still await the original result.
    for (const download of downloads) download.catch(() => {});
    await HTTPDownloadAssertions.expectDownloadError(() => downloads[4], 'CONCURRENCY_LIMIT', 0, false);
    controller.abort('release parallel downloads');
    for (let index = 0; index < 4; index += 1) {
      await HTTPDownloadAssertions.expectDownloadError(() => downloads[index], 'CANCELED', 0, false);
    }
    const committedPath = target('committed-before-abort.bin');
    const committed = await http.download(url('/download/binary'), { path: committedPath, sha256: vectors.binary.sha256 });
    const afterCommit = new AbortController();
    afterCommit.abort('too late');
    HTTPDownloadAssertions.verifyDownload(committed, expected('binary', committedPath));
  });

  test({
    name: '[HTTP-DOWNLOAD-010] connection and deadline failures never publish a target',
    tier: 'unit',
    covers: ['http.download'],
  }, async () => {
    const refused = target('connection-refused.bin');
    await HTTPDownloadAssertions.expectDownloadError(() => http.download('http://127.0.0.1:1/never-listening', { path: refused }), 'IO_FAILED', 0, false);
    assert(!File.exists(refused), 'connection failure created a target');
    const timedOut = target('timed-out.bin');
    await HTTPDownloadAssertions.expectDownloadError(() => http.download(url('/download/slow'), { path: timedOut, timeout: 5 }), 'TIMEOUT', undefined, false);
    assert(!File.exists(timedOut), 'timeout created a target');
  });
})();

await RuntimeAPITest.run('RUNTIME-API-HTTP-DOWNLOAD');
