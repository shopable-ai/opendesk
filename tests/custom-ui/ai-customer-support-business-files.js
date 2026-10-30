// Repository root:
// ./dist/opendesk -script tests/custom-ui/ai-customer-support-business-files.js -console-mode script
// Formal native File bridge gate; no windows, providers, or chat bindings.
(async function () {
  const cwd = File.cwd();
  const token = Date.now() + '-' + Math.floor(Math.random() * 1000000000);
  const root = File.join(cwd, '.runtime/business-sync');
  const evidence = File.join(cwd, '.runtime/tests/ai-customer-support/multistore-20261030/file-runtime-' + token);
  const created = [], checks = [];
  let failure;
  function check(label, condition) {
    if (!condition) throw Error('FILE_GATE_FAILED: ' + label);
    checks.push(label);
  }
  function put(name, text) {
    File.writeNew(File.join(root, name), text); created.push(name);
  }
  File.ensureDir(evidence);
  try {
    (0, eval)(File.read(File.join(cwd, 'examples/ai-customer-support/desktop/business-files.js')));
    const bridge = OpenDeskSupportBusinessFiles.create(File);
    const request = (operation, extra = {}) => bridge.handle({ type: 'support.businessFile', requestId: 'native-file-gate', operation, ...extra });
    File.ensureDir(root);
    check('fixed workspace has no directory aliases', File.realPath(cwd) === cwd &&
      File.realPath(File.join(cwd, '.runtime')) === File.join(cwd, '.runtime') && File.realPath(root) === root);
    const snapshotName = 'gate-snapshot-' + token + '.json';
    const snapshot = JSON.stringify({ schemaVersion: 1, storeId: 'gate-store', sourceId: 'gate-source', previousCursor: null, cursor: 'v1', records: [] });
    put(snapshotName, snapshot);
    const imported = request('snapshot', { name: snapshotName });
    check('snapshot native readback', imported.status === 'ok' && imported.name === snapshotName && imported.text === snapshot);
    const backup = JSON.stringify({ schemaVersion: 1, format: 'opendesk.ai-customer-support.business-backup', revision: 0,
      stores: [], records: [], overrides: [], cursors: {} });
    const exported = request('backup', { text: backup });
    check('backup exclusive native export', exported.status === 'ok' && /^business-backup-\d+-\d+\.json$/.test(exported.name) && !Object.prototype.hasOwnProperty.call(exported, 'text'));
    created.push(exported.name);
    check('backup native direct readback', File.read(File.join(root, exported.name)) === backup);
    const restored = request('restore', { name: exported.name });
    check('restore native readback', restored.status === 'ok' && restored.name === exported.name && restored.text === backup);
    // Existing private export must survive both native exclusive create and a bridge collision.
    let refused = false;
    try { File.writeNew(File.join(root, exported.name), 'must not overwrite'); } catch { refused = true; }
    check('writeNew refuses overwrite', refused && File.read(File.join(root, exported.name)) === backup);
    const fixedNow = Date.now;
    let collision;
    try {
      Date.now = () => Number(exported.name.split('-')[2]);
      collision = OpenDeskSupportBusinessFiles.create(File).handle({ type: 'support.businessFile', requestId: 'collision', operation: 'backup', text: backup });
    } finally { Date.now = fixedNow; }
    check('bridge collision cannot overwrite', collision.status === 'error' && collision.code === 'FILE_UNAVAILABLE' && File.read(File.join(root, exported.name)) === backup);
    // Valid transparent 1x1 PNG; public File.writeBytes receives a standard ArrayBuffer.
    const imageName = 'gate-image-' + token + '.png';
    const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,11,73,68,65,84,120,156,99,96,0,2,0,0,5,0,1,122,94,171,63,0,0,0,0,73,69,78,68,174,66,96,130]);
    put(imageName, '');
    File.writeBytes(File.join(root, imageName), png.buffer);
    const image = request('image', { name: imageName });
    check('image native bytes to dataURL', image.status === 'ok' && image.name === imageName &&
      image.text === 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=');
    const gifResult = request('image', { name: 'blocked.gif' });
    check('GIF is rejected before read', gifResult.status === 'error' && gifResult.code === 'INVALID_NAME');
    for (const name of ['../secret.json', 'bad..json', 'a/b.json', 'bad.txt']) {
      const result = request('snapshot', { name });
      check('invalid basename ' + name, result.status === 'error' && result.code === 'INVALID_NAME' && !Object.prototype.hasOwnProperty.call(result, 'text'));
    }
    check('unknown request field rejected', request('snapshot', { name: snapshotName, path: '/private' }).code === 'INVALID_REQUEST');
    // Transport uses the same real Runtime File owner, with an IO counter proving
    // start/chunks do not touch it. This gate does not claim native UI delivery.
    let io = 0;
    const countedFile = {};
    for (const method of ['cwd', 'join', 'realPath', 'stat', 'ensureDir', 'read', 'readBytes', 'writeNew']) {
      countedFile[method] = (...args) => { io++; return File[method](...args); };
    }
    const transport = OpenDeskSupportBusinessFiles.createTransport(countedFile);
    let serial = 0, maxRequestBytes = 0, maxResponseBytes = 0;
    function bytes(text) {
      let count = 0;
      for (const character of text) {
        const c = character.codePointAt(0);
        count += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
      }
      return count;
    }
    function send(operation, extra = {}) {
      const requestId = 'native-transport-' + (++serial);
      const encoded = JSON.stringify({ type: 'support.businessFile', requestId, operation, ...extra });
      // Actual web API receives a string TrustedJSON value, serialized again.
      const doubleJSON = JSON.stringify(encoded);
      maxRequestBytes = Math.max(maxRequestBytes, bytes(doubleJSON));
      if (maxRequestBytes > 65536) throw Error('TRANSPORT_REQUEST_BUDGET');
      const response = JSON.parse(JSON.stringify(transport.handle(JSON.parse(JSON.parse(doubleJSON)))));
      maxResponseBytes = Math.max(maxResponseBytes, bytes(JSON.stringify(response)));
      if (maxResponseBytes > 65536 || response.requestId !== requestId) throw Error('TRANSPORT_RESPONSE_BUDGET_OR_CORRELATION');
      return response;
    }
    function readAll(operation, name) {
      const initial = send(operation, { name });
      if (initial.status !== 'ok' || initial.offset !== 0 || initial.text.length > 8192) throw Error('TRANSPORT_INITIAL_READ');
      const parts = [initial.text]; let offset = initial.text.length;
      while (offset < initial.total) {
        const next = send('readChunk', { transferId: initial.transferId, offset });
        if (next.status !== 'ok' || next.offset !== offset || next.total !== initial.total ||
          next.name !== name || !next.text.length || next.text.length > 8192) throw Error('TRANSPORT_READ_CHUNK');
        parts.push(next.text); offset += next.text.length;
      }
      if (send('readChunk', { transferId: initial.transferId, offset }).status !== 'error') throw Error('TRANSPORT_READ_NOT_RELEASED');
      return parts.join('');
    }
    check('transport creation has no filesystem calls', io === 0);
    const largeValue = JSON.parse(backup);
    largeValue.records = ['\u0000\n\t"\\中🙂'.repeat(390000)];
    const largeBackup = JSON.stringify(largeValue);
    check('transport backup fixture near 8MiB', bytes(largeBackup) > 7 * 1024 * 1024 && bytes(largeBackup) <= 8 * 1024 * 1024);
    const start = send('backupStart', { total: largeBackup.length });
    check('transport upload start', start.status === 'ok' && start.offset === 0 && start.total === largeBackup.length);
    for (let offset = 0; offset < largeBackup.length;) {
      let end = Math.min(offset + 8192, largeBackup.length);
      if (end < largeBackup.length && largeBackup.charCodeAt(end - 1) >= 0xd800 && largeBackup.charCodeAt(end - 1) <= 0xdbff &&
        largeBackup.charCodeAt(end) >= 0xdc00 && largeBackup.charCodeAt(end) <= 0xdfff) end--;
      const text = largeBackup.slice(offset, end);
      const ack = send('backupChunk', { transferId: start.transferId, offset, text });
      if (ack.status !== 'ok' || ack.offset !== offset + text.length || ack.total !== largeBackup.length) throw Error('TRANSPORT_UPLOAD_CHUNK');
      offset = end;
    }
    check('transport upload has no filesystem calls before commit', io === 0);
    const saved = send('backupCommit', { transferId: start.transferId });
    if (saved.status === 'ok') created.push(saved.name);
    check('transport native large backup committed', saved.status === 'ok' && File.read(File.join(root, saved.name)) === largeBackup);
    check('transport native large restore roundtrip', readAll('restore', saved.name) === largeBackup);
    check('transport refuses direct backup', send('backup', { text: backup }).code === 'INVALID_REQUEST');
    const interrupted = send('backupStart', { total: backup.length });
    const beforeInterrupted = io;
    check('transport interrupted commit rejected', send('backupCommit', { transferId: interrupted.transferId }).code === 'INVALID_REQUEST');
    check('transport interrupted commit has no filesystem calls', io === beforeInterrupted);
    const largeImageName = 'gate-large-image-' + token + '.png';
    const largePNG = new Uint8Array(96 * 1024); largePNG.set(png);
    put(largeImageName, ''); File.writeBytes(File.join(root, largeImageName), largePNG.buffer);
    const expectedImage = request('image', { name: largeImageName });
    check('transport native image above 64KiB roundtrip', expectedImage.text.length > 65536 && readAll('image', largeImageName) === expectedImage.text);
    const first = send('image', { name: largeImageName });
    check('transport native wrong read offset rejected', send('readChunk', { transferId: first.transferId, offset: 0 }).code === 'INVALID_REQUEST');
    const clock = Date.now;
    try {
      let time = clock(); Date.now = () => time;
      const expiringRead = send('image', { name: largeImageName });
      const expiringUpload = send('backupStart', { total: backup.length });
      time += 120000;
      check('transport native read expiry', send('readChunk', { transferId: expiringRead.transferId, offset: 8192 }).code === 'INVALID_REQUEST');
      check('transport native upload expiry', send('backupChunk', { transferId: expiringUpload.transferId, offset: 0, text: backup }).code === 'INVALID_REQUEST');
    } finally { Date.now = clock; }
    check('transport native double-JSON request and object response budgets', maxRequestBytes <= 65536 && maxResponseBytes <= 65536);
    console.log('BUSINESS_FILES_TRANSPORT_BUDGET ' + JSON.stringify({ maxRequestBytes, maxResponseBytes, commands: serial }));
    console.log('BUSINESS_FILES_RUNTIME_OK ' + JSON.stringify({ checks: checks.length, evidence }));
  } catch (error) {
    failure = error;
  } finally {
    for (const name of created) {
      try { File.remove(File.join(root, name)); } catch { failure = failure || Error('FILE_GATE_CLEANUP_FAILED'); }
    }
    await File.writeJSON(File.join(evidence, 'result.json'), { status: failure ? 'error' : 'ok', checks,
      scope: 'native Runtime File bridge; no UI or business-domain validation', cleaned: created.length });
  }
  if (failure) throw failure;
})();
