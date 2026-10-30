// Repository root (uses an isolated disposable workdir; never the user's business-sync):
// ./dist/opendesk -script tests/custom-ui/ai-customer-support-workspace-files.js -console-mode script
// Native File owner gate only. No windows, chat bindings, providers, or permission recovery.
(async function () {
  const repo = File.cwd();
  const evidence = File.join(repo, '.runtime/tests/ai-customer-support/workspace-20261030/runtime-' + Date.now());
  const workdir = File.join(evidence, 'isolated-workdir');
  const root = File.join(workdir, '.runtime/business-sync');
  const helper = File.join(repo, 'examples/ai-customer-support/desktop/business-files.js');
  const validator = File.join(repo, 'examples/ai-customer-support/desktop/business-validator.generated.js');
  const checks = [], metrics = {};
  let failure, serial = 0, maxRequestBytes = 0, maxResponseBytes = 0;
  const MiB = 1024 * 1024;
  function bytes(text) {
    let total = 0;
    for (const character of text) {
      const code = character.codePointAt(0);
      total += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
    }
    return total;
  }
  function check(name, condition) {
    if (!condition) throw Error('WORKSPACE_FILE_GATE_FAILED: ' + name);
    checks.push(name);
  }
  function okay(result, label) {
    check(label + ' status', result && result.status === 'ok');
    return result;
  }
  File.ensureDir(workdir);
  try {
    (0, eval)(File.read(helper));
    const options = { workdir, validatorPath: validator };
    const direct = OpenDeskSupportBusinessFiles.create(File, options);
    const transport = OpenDeskSupportBusinessFiles.createTransport(File, options);
    const request = (operation, extra = {}) => direct.handle({ type: 'support.businessFile', requestId: 'gate-' + (++serial), operation, ...extra });
    async function send(operation, extra = {}) {
      const requestId = 'wire-' + (++serial);
      const doubleJSON = JSON.stringify(JSON.stringify({ type: 'support.businessFile', requestId, operation, ...extra }));
      maxRequestBytes = Math.max(maxRequestBytes, bytes(doubleJSON));
      checkBudget(maxRequestBytes);
      const response = await transport.handle(JSON.parse(JSON.parse(doubleJSON)));
      maxResponseBytes = Math.max(maxResponseBytes, bytes(JSON.stringify(response)));
      checkBudget(maxResponseBytes);
      if (response.requestId !== requestId) throw Error('WORKSPACE_FILE_GATE_CORRELATION');
      return response;
    }
    function checkBudget(size) { if (size > 65536) throw Error('WORKSPACE_FILE_GATE_FRAME_BUDGET'); }
    async function upload(text, expectedGeneration) {
      const start = okay(await send('workspaceSaveStart', { total: text.length, expectedGeneration }), 'upload start');
      for (let offset = 0; offset < text.length;) {
        let end = Math.min(offset + 8192, text.length);
        if (end < text.length && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff &&
            text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff) end--;
        const chunk = text.slice(offset, end);
        const ack = await send('backupChunk', { transferId: start.transferId, offset, text: chunk });
        if (ack.status !== 'ok' || ack.offset !== end) throw Error('WORKSPACE_FILE_GATE_UPLOAD');
        offset = end;
      }
      return send('backupCommit', { transferId: start.transferId });
    }
    async function readAll(name, generation) {
      const first = okay(await send('workspaceRestore', { name, generation }), 'restore start');
      const parts = [first.text]; let offset = first.text.length;
      while (offset < first.total) {
        const chunk = await send('readChunk', { transferId: first.transferId, offset });
        if (chunk.status !== 'ok' || chunk.name !== name || chunk.generation !== generation || chunk.offset !== offset || chunk.total !== first.total || !chunk.text.length) throw Error('WORKSPACE_FILE_GATE_READ');
        const end = chunk.text.charCodeAt(chunk.text.length - 1);
        if (end >= 0xd800 && end <= 0xdbff) throw Error('WORKSPACE_FILE_GATE_SURROGATE');
        parts.push(chunk.text); offset += chunk.text.length;
      }
      return parts.join('');
    }
    check('owner construction has no business directory', File.stat(root) === null);
    check('explicit empty list', request('list').entries.length === 0);
    check('explicit empty workspace index', request('workspaceList').generation === 0);
    check('empty lists do not create business directory', File.stat(root) === null);
    const small = JSON.stringify({ schemaVersion: 1, format: 'opendesk.ai-customer-support.business-backup', revision: 0,
      stores: [{ id: 'gate-store', name: '本机文件门禁' }], records: [], overrides: [], cursors: {} });
    const first = okay(await request('workspaceSave', { text: small, expectedGeneration: 0 }), 'first native save');
    check('canonical domain validator was lazily loaded', typeof OpenDeskSupportBusinessDomain.parseBackup === 'function');
    for (let generation = 2; generation <= 4; generation++) {
      const saved = okay(await request('workspaceSave', { text: small, expectedGeneration: generation - 1 }), 'rotated native save');
      check('generation monotonic ' + generation, saved.generation === generation);
    }
    let index = okay(request('workspaceList'), 'native index');
    check('three bounded native slots', index.candidates.length === 3 && index.candidates.map(c => c.generation).join(',') === '4,3,2');
    check('CAS refuses delayed request', (await request('workspaceSave', { text: small, expectedGeneration: 0 })).code === 'WORKSPACE_CONFLICT');
    check('restore refuses stale slot generation', request('workspaceRestore', { name: first.name, generation: 1 }).code === 'WORKSPACE_CONFLICT');
    const pinned = index.candidates[0];
    check('explicit current candidate recovery', request('workspaceRestore', { name: pinned.name, generation: pinned.generation }).text === small);
    const lease = File.open(File.join(root, 'workspace.lock'), 'a');
    try {
      check('real native advisory lock acquired', lease.tryLock());
      const other = OpenDeskSupportBusinessFiles.create(File, options);
      check('independent owner cannot save through native lock', (await other.handle({ type: 'support.businessFile', requestId: 'other-host', operation: 'workspaceSave', text: small, expectedGeneration: 4 })).code === 'WORKSPACE_BUSY');
    } finally { lease.close(); }
    check('lock released after finally', (await request('workspaceSave', { text: small, expectedGeneration: 4 })).generation === 5);
    index = request('workspaceList');
    const damaged = index.candidates[2], fallback = index.candidates[0];
    File.write(File.join(root, damaged.name), '{broken');
    check('corruption is diagnosed while good candidates remain', request('workspaceList').issues.some(i => i.name === damaged.name));
    check('unknown generation from corruption blocks native write', (await request('workspaceSave', { text: small, expectedGeneration: 5 })).code === 'WORKSPACE_DAMAGED');
    check('valid fallback remains explicitly recoverable', request('workspaceRestore', { name: fallback.name, generation: fallback.generation }).text === small);
    File.write(File.join(root, damaged.name), JSON.stringify({ schemaVersion: 2, generation: 100, text: small }));
    check('old envelope schema blocks native write', (await request('workspaceSave', { text: small, expectedGeneration: 5 })).code === 'WORKSPACE_DAMAGED');
    File.write(File.join(root, damaged.name), JSON.stringify({ schemaVersion: 1, generation: damaged.generation, text: small }));
    check('known generation with invalid backup is excluded', (() => {
      File.write(File.join(root, damaged.name), JSON.stringify({ schemaVersion: 1, generation: damaged.generation, text: '{}' }));
      return request('workspaceList').issues.some(i => i.name === damaged.name && i.code === 'INVALID_BACKUP');
    })());
    check('invalid business data never saves', (await request('workspaceSave', { text: '{}', expectedGeneration: 5 })).code === 'INVALID_BACKUP');
    check('oversize original never saves', (await request('workspaceSave', { text: 'x'.repeat(8 * MiB + 1), expectedGeneration: 5 })).code === 'FILE_TOO_LARGE');
    // A legal two-store near-limit backup with real customer entities, escaped
    // newlines/quotes/backslashes, CJK and emoji; never synthetic record strings.
    const large = JSON.parse(small);
    large.stores = [{ id: 'gate-a', name: 'A店' }, { id: 'gate-b', name: 'B店' }];
    const notes = '\n\t"\\中🙂'.repeat(1000);
    let estimate = bytes(JSON.stringify(large));
    for (let i = 0; i < 1000; i++) {
      const entity = { storeId: i % 2 ? 'gate-a' : 'gate-b', sourceId: 'gate-source', kind: 'customer', id: 'customer-' + i,
        version: 1, updatedAt: '2026-10-30T00:00:00.000Z', deleted: false,
        data: { name: '客户' + i, conversationId: null, tags: [], notes } };
      const size = bytes(JSON.stringify(entity)) + 1;
      if (estimate + size > 8 * MiB - 16384) break;
      large.records.push(entity); estimate += size;
    }
    let text = JSON.stringify(large);
    check('near 8MiB fixture is meaningful canonical backup', bytes(text) > 7 * MiB && OpenDeskSupportBusinessDomain.parseBackup(text).records.length > 100);
    text += ' '.repeat(8 * MiB - bytes(text));
    check('original is exactly 8MiB', bytes(text) === 8 * MiB);
    const largeSaved = okay(await upload(text, 5), '8MiB native transport commit');
    const envelope = File.stat(File.join(root, largeSaved.name));
    check('native envelope exceeds JSON API 8MiB ceiling', envelope.size > 8 * MiB);
    check('exact Unicode original roundtrips through native chunked bridge', await readAll(largeSaved.name, largeSaved.generation) === text);
    check('native slot preserves original text exactly', JSON.parse(File.read(File.join(root, largeSaved.name))).text === text);
    metrics.payloadBytes = bytes(text); metrics.envelopeBytes = envelope.size;
    // Inject a failure only after the real Runtime has exclusively published the
    // pending inode. The next save must quarantine that residue without treating
    // it as a recoverable version; no user workdir is involved.
    const interruptedFile = Object.create(File);
    interruptedFile.writeNew = (path, content) => {
      File.writeNew(path, content);
      if (path.endsWith('/workspace-pending.json')) throw Error('gate post-publication interruption');
    };
    const interruptedOwner = OpenDeskSupportBusinessFiles.create(interruptedFile, options);
    const interruptedSave = expectedGeneration => interruptedOwner.handle({ type: 'support.businessFile', requestId: 'interrupted', operation: 'workspaceSave', text: small, expectedGeneration });
    check('post-publication failure retains pending', (await interruptedSave(6)).code === 'FILE_UNAVAILABLE' && File.stat(File.join(root, 'workspace-pending.json')) !== null);
    check('interruption leaves latest committed generation intact', request('workspaceList').generation === 6);
    check('next native save quarantines pending then commits', (await request('workspaceSave', { text: small, expectedGeneration: 6 })).generation === 7 && File.stat(File.join(root, 'workspace-abandoned.json')) !== null);
    check('second interruption retains private pending for mode inspection', (await interruptedSave(7)).code === 'FILE_UNAVAILABLE' && request('workspaceList').generation === 7);

    File.writeNew(File.join(root, 'snapshot.json'), '{}');
    File.writeNew(File.join(root, 'ignored.txt'), '');
    check('basename whitelist excludes internal names', (() => {
      const result = request('list'); return result.entries.length === 1 && result.entries[0].name === 'snapshot.json' && !result.truncated;
    })());
    for (let i = 0; i < 110; i++) File.writeNew(File.join(root, 'list-' + i + '.json'), '{}');
    check('native list returns at most 100 with truncation', (() => { const result = request('list'); return result.entries.length === 100 && result.truncated && result.scanned <= 500; })());
    const clock = Date.now;
    try {
      let now = clock(); Date.now = () => now;
      const expiring = await send('workspaceSaveStart', { total: small.length, expectedGeneration: 6 });
      now += 120000;
      check('native transfer absolute 120s expiry', (await send('backupChunk', { transferId: expiring.transferId, offset: 0, text: small })).code === 'INVALID_REQUEST');
    } finally { Date.now = clock; }
    metrics.maxRequestBytes = maxRequestBytes; metrics.maxResponseBytes = maxResponseBytes; metrics.commands = serial;
    check('native wire frames stay under 64KiB', maxRequestBytes <= 65536 && maxResponseBytes <= 65536);
    check('fixed version storage remains three slots plus stable lock', File.listDir(root).filter(n => /^workspace-slot-[012]\.json$/.test(n)).length === 3);
  } catch (error) {
    failure = error;
    console.log('WORKSPACE_FILES_RUNTIME_ERROR ' + String(error));
  } finally {
    // Persist the small evidence synchronously before announcing success.
    // This gate already exercises async owners through workspace saves; an extra
    // async teardown write must not leave a success banner without result.json.
    File.writeNew(File.join(evidence, 'result.json'), JSON.stringify({ status: failure ? 'error' : 'ok', checks, metrics,
      workdir, scope: 'real Runtime File APIs and canonical domain; no UI or cross-process host proof',
      error: failure ? String(failure) : null }) + '\n');
  }
  if (failure) throw failure;
  console.log('WORKSPACE_FILES_RUNTIME_OK ' + JSON.stringify({ checks: checks.length, metrics, evidence }));
})();
