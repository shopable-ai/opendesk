// Local business-data owner only; this bridge grants no chat/provider authority.
(function (global) {
  'use strict';
  const MiB = 1024 * 1024;
  const limits = { snapshot: MiB, restore: 8 * MiB, backup: 8 * MiB, image: 128 * 1024 };
  const basename = name => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name) && !name.includes('..');
  const slots = [0, 1, 2].map(i => 'workspace-slot-' + i + '.json');
  const envelopeLimit = 6 * limits.backup + 1024;
  const internalNames = [...slots, 'workspace-pending.json', 'workspace-abandoned.json'];
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
  const backupKeys = ['schemaVersion', 'format', 'revision', 'stores', 'records', 'overrides', 'cursors'];
  const own = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
  const plain = o => o !== null && typeof o === 'object' && !Array.isArray(o) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(o));
  const fail = code => { throw code; };
  function utf8Size(text) {
    let size = 0;
    for (const character of text) {
      const c = character.codePointAt(0);
      size += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
    }
    return size;
  }
  function json(text, backup) {
    let value;
    try { value = JSON.parse(text); } catch { fail('INVALID_JSON'); }
    const pending = [[value, 0]];
    while (pending.length) {
      const [node, depth] = pending.pop();
      if (node === null || typeof node !== 'object') {
        if (typeof node === 'number' && !Number.isFinite(node)) fail('INVALID_JSON');
        continue;
      }
      if (depth >= 128) fail('INVALID_JSON');
      for (const key of Object.keys(node)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('INVALID_JSON');
        pending.push([node[key], depth + 1]);
      }
    }
    if (backup && (!plain(value) || Object.keys(value).length !== backupKeys.length ||
      !backupKeys.every(key => own(value, key)) || value.schemaVersion !== 1 ||
      value.format !== 'opendesk.ai-customer-support.business-backup' ||
      !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      !Array.isArray(value.stores) || !Array.isArray(value.records) || !Array.isArray(value.overrides) ||
      !plain(value.cursors))) fail('INVALID_BACKUP');
    return value;
  }
  function base64(bytes) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const chunks = [];
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      chunks.push(alphabet[a >> 2] + alphabet[((a & 3) << 4) | ((b || 0) >> 4)] +
        (i + 1 < bytes.length ? alphabet[((b & 15) << 2) | ((c || 0) >> 6)] : '=') +
        (i + 2 < bytes.length ? alphabet[c & 63] : '='));
    }
    return chunks.join('');
  }
  function create(File, opts = {}) {
    // Even cwd/path resolution is deferred until a validated user request.
    let counter = 0;
    function directory(createMissing) {
      const cwd = opts.workdir || File.cwd();
      if (File.realPath(cwd) !== cwd) fail('UNSAFE_PATH');
      let parent = cwd;
      for (const part of ['.runtime', 'business-sync']) {
        parent = File.join(parent, part);
        if (!File.stat(parent)) {
          if (!createMissing) fail('FILE_UNAVAILABLE');
          // A broken symlink also fails realPath after ensureDir; never traverse it.
          File.ensureDir(parent);
        }
        if (File.realPath(parent) !== parent) fail('UNSAFE_PATH');
        if (File.stat(parent)?.type !== 'directory') fail('UNSAFE_PATH');
      }
      return parent;
    }
    function validateBackup(text) {
      json(text, true);
      let validator = opts.validateBackup || global.OpenDeskSupportBusinessDomain?.parseBackup;
      const validatorPath = opts.validatorPath || (global.Execution?.scriptDir ? File.join(global.Execution.scriptDir, 'desktop/business-validator.generated.js') : undefined);
      if (!validator && validatorPath) {
        try { (0, eval)(File.read(validatorPath)); } catch { fail('VALIDATOR_UNAVAILABLE'); }
        validator = global.OpenDeskSupportBusinessDomain?.parseBackup;
      }
      if (typeof validator !== 'function') fail('VALIDATOR_UNAVAILABLE');
      try { validator(text); } catch { fail('INVALID_BACKUP'); }
    }
    function safeFile(root, name, max) {
      const path = File.join(root, name), stat = File.stat(path);
      if (!stat) return null;
      if (File.realPath(path) !== path) fail('UNSAFE_PATH');
      if (stat.type !== 'file' || !Number.isSafeInteger(stat.size) || stat.size < 0) fail('FILE_UNAVAILABLE');
      if (stat.size > max) fail('FILE_TOO_LARGE');
      return { path, stat };
    }
    function scan(root) {
      const candidates = [], issues = [];
      let generation = 0, damaged = false;
      for (const name of slots) {
        try {
          const file = safeFile(root, name, envelopeLimit);
          if (!file) continue;
          const raw = File.read(file.path);
          if (typeof raw !== 'string' || utf8Size(raw) > envelopeLimit) fail('FILE_TOO_LARGE');
          const value = json(raw, false);
          if (!plain(value) || Object.keys(value).sort().join(',') !== 'generation,schemaVersion,text' ||
            value.schemaVersion !== 1 || !Number.isSafeInteger(value.generation) || value.generation < 1 || typeof value.text !== 'string') fail('INVALID_WORKSPACE');
          generation = Math.max(generation, value.generation);
          // A known generation with invalid business content must never become a candidate.
          if (utf8Size(value.text) > limits.backup) { issues.push({ name, code: 'FILE_TOO_LARGE' }); continue; }
          try { validateBackup(value.text); } catch (code) {
            if (code === 'VALIDATOR_UNAVAILABLE') throw code;
            issues.push({ name, code: 'INVALID_BACKUP' }); continue;
          }
          if (File.realPath(file.path) !== file.path) fail('UNSAFE_PATH');
          candidates.push({ name, generation: value.generation, revision: JSON.parse(value.text).revision, text: value.text });
        } catch (code) {
          if (code === 'VALIDATOR_UNAVAILABLE') throw code;
          damaged = true;
          issues.push({ name, code: ['UNSAFE_PATH', 'FILE_TOO_LARGE'].includes(code) ? code : 'INVALID_WORKSPACE' });
        }
      }
      candidates.sort((a, b) => b.generation - a.generation || a.name.localeCompare(b.name));
      if (new Set(candidates.map(c => c.generation)).size !== candidates.length) damaged = true;
      directory(false);
      return { candidates, issues, generation, damaged };
    }
    function emptyRoot() {
      const cwd = opts.workdir || File.cwd();
      if (File.realPath(cwd) !== cwd) fail('UNSAFE_PATH');
      // An explicit read/list must not create even the runtime directory.
      for (const part of ['.runtime', '.runtime/business-sync']) {
        const path = File.join(cwd, part);
        if (!File.stat(path)) {
          // realPath must fail for missing paths; a resolvable alias is never missing.
          try { File.realPath(path); } catch { return true; }
          fail('UNSAFE_PATH');
        }
        if (File.realPath(path) !== path) fail('UNSAFE_PATH');
      }
      return false;
    }
    function list(result) {
      if (emptyRoot()) return { ...result, status: 'ok', entries: [], scanned: 0, truncated: false };
      const root = directory(false), names = File.listDir(root), entries = [];
      let scanned = 0;
      for (const name of names) {
        if (scanned >= 500 || entries.length >= 100) break;
        scanned++;
        if (!basename(name) || internalNames.includes(name) || !/\.(json|png|jpe?g|webp)$/i.test(name)) continue;
        try {
          const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
          const file = safeFile(root, name, own(mime, extension) ? limits.image : limits.backup);
          if (file) entries.push({ name, size: file.stat.size, modifiedAt: file.stat.modifiedAt });
        } catch { /* Skip inaccessible, oversize and aliased candidates. */ }
      }
      directory(false);
      return { ...result, status: 'ok', entries, scanned, truncated: scanned < names.length };
    }
    async function workspaceSave(request, result) {
      let lease;
      try {
        if (typeof request.text !== 'string' || !Number.isSafeInteger(request.expectedGeneration) || request.expectedGeneration < 0) fail('INVALID_REQUEST');
        if (utf8Size(request.text) > limits.backup) fail('FILE_TOO_LARGE');
        validateBackup(request.text);
        if (request.deadline !== undefined && Date.now() >= request.deadline) fail('TRANSFER_EXPIRED');
        const root = directory(true), lockPath = File.join(root, 'workspace.lock');
        const existing = File.stat(lockPath);
        if (existing && (existing.type !== 'file' || File.realPath(lockPath) !== lockPath)) fail('UNSAFE_PATH');
        if (!existing) {
          try { File.writeNew(lockPath, ''); } catch {
            // Another host may have created the stable lock, but never follow a dangling alias.
            if (!File.stat(lockPath) || File.realPath(lockPath) !== lockPath) fail('UNSAFE_PATH');
          }
        }
        lease = File.open(lockPath, 'a');
        if (File.realPath(lockPath) !== lockPath) fail('UNSAFE_PATH');
        if (!lease.tryLock()) fail('WORKSPACE_BUSY');
        const current = scan(root);
        if (current.damaged) fail('WORKSPACE_DAMAGED');
        if (current.generation !== request.expectedGeneration) fail('WORKSPACE_CONFLICT');
        if (current.generation >= Number.MAX_SAFE_INTEGER) fail('WORKSPACE_DAMAGED');
        const newest = current.candidates[0]?.name;
        const name = slots.find(n => !File.stat(File.join(root, n))) ||
          slots.filter(n => n !== newest).sort((a, b) =>
            (current.candidates.find(c => c.name === a)?.generation || 0) -
            (current.candidates.find(c => c.name === b)?.generation || 0))[0];
        const target = File.join(root, name);
        if (File.stat(target) && File.realPath(target) !== target) fail('UNSAFE_PATH');
        directory(false);
        const generation = current.generation + 1;
        // File.writeJSON has an 8MiB serialized-output ceiling. A JSON string
        // envelope can exceed it for a valid 8MiB original, so use the same-dir
        // exclusive publisher then Unix rename under the stable advisory lock.
        // The pending and abandoned names are fixed: retries cannot grow history.
        const pending = File.join(root, 'workspace-pending.json');
        const abandoned = File.join(root, 'workspace-abandoned.json');
        if (File.stat(pending)) {
          safeFile(root, 'workspace-pending.json', envelopeLimit);
          if (File.stat(abandoned)) safeFile(root, 'workspace-abandoned.json', envelopeLimit);
          File.move(pending, abandoned);
        }
        const payload = JSON.stringify({ schemaVersion: 1, generation, text: request.text });
        if (utf8Size(payload) > envelopeLimit) fail('FILE_TOO_LARGE');
        if (request.deadline !== undefined && Date.now() >= request.deadline) fail('TRANSFER_EXPIRED');
        await File.writeNew(pending, payload);
        // Synchronous writeNew cannot be canceled. Recheck absolute expiry and
        // path identity after publication and immediately before the commit.
        if (request.deadline !== undefined && Date.now() >= request.deadline) fail('TRANSFER_EXPIRED');
        safeFile(root, 'workspace-pending.json', envelopeLimit);
        directory(false);
        if (File.stat(target) && File.realPath(target) !== target) fail('UNSAFE_PATH');
        File.move(pending, target);
        return { ...result, status: 'ok', name, generation };
      } catch (code) {
        return { ...result, code: code?.committed === true ? 'COMMIT_UNKNOWN' :
          (['INVALID_REQUEST', 'FILE_TOO_LARGE', 'INVALID_BACKUP', 'VALIDATOR_UNAVAILABLE', 'UNSAFE_PATH',
            'WORKSPACE_BUSY', 'WORKSPACE_DAMAGED', 'WORKSPACE_CONFLICT', 'TRANSFER_EXPIRED'].includes(code) ? code : 'FILE_UNAVAILABLE') };
      } finally {
        if (lease) lease.close();
      }
    }
    function handle(request) {
      const result = { type: 'support.businessFileResult', requestId: '', status: 'error' };
      try {
        if (!plain(request)) fail('INVALID_REQUEST');
        const keys = Reflect.ownKeys(request);
        if (keys.some(key => typeof key !== 'string' ||
          !['type', 'requestId', 'operation', 'name', 'text', 'generation', 'expectedGeneration', 'deadline'].includes(key) ||
          !own(Object.getOwnPropertyDescriptor(request, key), 'value'))) fail('INVALID_REQUEST');
        if (own(request, 'requestId') && typeof request.requestId === 'string' &&
          /^[\x21-\x7e]{1,40}$/.test(request.requestId)) result.requestId = request.requestId;
        else fail('INVALID_REQUEST');
        if (!own(request, 'type') || request.type !== 'support.businessFile' || !own(request, 'operation') ||
          typeof request.operation !== 'string' || (!own(limits, request.operation) && !['list', 'workspaceList', 'workspaceSave', 'workspaceRestore'].includes(request.operation))) fail('INVALID_REQUEST');
        const operation = request.operation;
        const allowed = operation === 'workspaceSave' ? ['text', 'expectedGeneration', 'deadline'] :
          operation === 'workspaceRestore' ? ['name', 'generation'] :
          ['list', 'workspaceList'].includes(operation) ? [] : operation === 'backup' ? ['text'] : ['name'];
        if (keys.some(key => !['type', 'requestId', 'operation', ...allowed].includes(key))) fail('INVALID_REQUEST');
        if (operation === 'list') return list(result);
        if (operation === 'workspaceSave') return workspaceSave(request, result);
        if (operation === 'workspaceList' || operation === 'workspaceRestore') {
          if (operation === 'workspaceRestore' && (!slots.includes(request.name) || !Number.isSafeInteger(request.generation) || request.generation < 1)) fail('INVALID_REQUEST');
          const current = emptyRoot() ? { generation: 0, candidates: [], issues: [] } : scan(directory(false));
          if (operation === 'workspaceList') return { ...result, status: 'ok', generation: current.generation,
            candidates: current.candidates.map(({ text, ...metadata }) => metadata), issues: current.issues };
          const candidate = current.candidates.find(c => c.name === request.name && c.generation === request.generation);
          if (!candidate) fail('WORKSPACE_CONFLICT');
          return { ...result, status: 'ok', ...candidate };
        }
        if (operation === 'backup') {
          if (own(request, 'name') || !own(request, 'text') || typeof request.text !== 'string') fail('INVALID_REQUEST');
          if (utf8Size(request.text) > limits.backup) fail('FILE_TOO_LARGE');
          validateBackup(request.text);
          const root = directory(true);
          const name = 'business-backup-' + Date.now() + '-' + (++counter) + '.json';
          // Runtime writeNew publishes exclusively with private file permissions.
          File.writeNew(File.join(root, name), request.text);
          return { ...result, status: 'ok', name };
        }
        if (own(request, 'text')) fail('INVALID_REQUEST');
        if (!own(request, 'name')) return { ...result, status: 'canceled' };
        const name = request.name;
        if (!basename(name) || internalNames.includes(name) || !name.includes('.')) fail('INVALID_NAME');
        const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
        if (operation === 'image' ? !own(mime, extension) : extension !== 'json') fail('INVALID_NAME');
        const root = directory(false), path = File.join(root, name);
        if (File.realPath(path) !== path) fail('UNSAFE_PATH');
        const stat = File.stat(path);
        if (!stat || stat.type !== 'file' || !Number.isSafeInteger(stat.size) || stat.size < 0) fail('FILE_UNAVAILABLE');
        if (stat.size > limits[operation]) fail('FILE_TOO_LARGE');
        let text;
        if (operation === 'image') {
          const raw = File.readBytes(path);
          const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw;
          if (!bytes || !Number.isSafeInteger(bytes.length)) fail('FILE_UNAVAILABLE');
          if (bytes.length > limits.image) fail('FILE_TOO_LARGE');
          for (let i = 0; i < bytes.length; i++) {
            if (!Number.isInteger(bytes[i]) || bytes[i] < 0 || bytes[i] > 255) fail('FILE_UNAVAILABLE');
          }
          text = 'data:' + mime[extension] + ';base64,' + base64(bytes);
        } else {
          text = File.read(path);
          if (typeof text !== 'string') fail('FILE_UNAVAILABLE');
          if (utf8Size(text) > limits[operation]) fail('FILE_TOO_LARGE');
          if (operation === 'restore') validateBackup(text); else json(text, false);
        }
        if (File.realPath(path) !== path) fail('UNSAFE_PATH');
        directory(false);
        return { ...result, status: 'ok', name, text };
      } catch (error) {
        const codes = ['INVALID_REQUEST', 'INVALID_NAME', 'INVALID_JSON', 'INVALID_BACKUP',
          'UNSAFE_PATH', 'FILE_UNAVAILABLE', 'FILE_TOO_LARGE', 'INVALID_WORKSPACE', 'WORKSPACE_CONFLICT', 'VALIDATOR_UNAVAILABLE'];
        return { ...result, code: codes.includes(error) ? error : 'FILE_UNAVAILABLE' };
      }
    }
    return Object.freeze({ handle });
  }
  function createTransport(File, opts = {}) {
    const direct = create(File, opts);
    const chunkSize = 8192, lifetime = 120000;
    let reading, uploading;
    const fields = {
      snapshot: ['name'], restore: ['name'], image: ['name'], list: [], workspaceList: [],
      workspaceRestore: ['name', 'generation'], workspaceSaveStart: ['total', 'expectedGeneration'],
      readChunk: ['transferId', 'offset'], backupStart: ['total'],
      backupChunk: ['transferId', 'offset', 'text'], backupCommit: ['transferId']
    };
    const id = value => typeof value === 'string' && /^[\x21-\x7e]{1,40}$/.test(value);
    function part(result, offset) {
      const { name, text, transferId, generation } = reading;
      const total = text.length;
      let end = Math.min(total, offset + chunkSize);
      // Native JSON owners convert isolated surrogate halves to replacement
      // characters. Keep each valid pair in one wire message.
      if (end < total && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff &&
        text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff) end--;
      const chunk = text.slice(offset, end);
      reading.offset = offset + chunk.length;
      if (reading.offset === total) reading = undefined;
      return { ...result, status: 'ok', name, text: chunk, transferId, offset, total, ...(generation === undefined ? {} : { generation }) };
    }
    function handle(request) {
      const result = { type: 'support.businessFileResult', requestId: '', status: 'error' };
      // Expiry uses creation time, not activity; commands never extend retention.
      const now = Date.now();
      if (reading && now - reading.started >= lifetime) reading = undefined;
      if (uploading && now - uploading.started >= lifetime) uploading = undefined;
      let descriptors;
      try {
        if (!plain(request)) fail('INVALID_REQUEST');
        descriptors = Object.getOwnPropertyDescriptors(request);
        const data = key => own(descriptors, key) && own(descriptors[key], 'value');
        if (data('requestId') && id(descriptors.requestId.value)) result.requestId = descriptors.requestId.value;
        if (!result.requestId || Reflect.ownKeys(descriptors).some(key =>
          typeof key !== 'string' || !data(key))) fail('INVALID_REQUEST');
        if (!data('type') || request.type !== 'support.businessFile' || !data('operation') ||
          typeof request.operation !== 'string' || !own(fields, request.operation)) fail('INVALID_REQUEST');
        const operation = request.operation, extra = fields[operation];
        if (Object.keys(descriptors).some(key => !['type', 'requestId', 'operation', ...extra].includes(key)) ||
          (!['snapshot', 'restore', 'image'].includes(operation) && !extra.every(data))) fail('INVALID_REQUEST');
        if (['list', 'workspaceList'].includes(operation)) return direct.handle(request);
        if (['snapshot', 'restore', 'image', 'workspaceRestore'].includes(operation)) {
          // A new read replaces the previous slot, including when validation fails.
          reading = undefined;
          const response = direct.handle(request);
          if (response.status !== 'ok') return response;
          reading = { name: response.name, text: response.text, generation: response.generation, transferId: request.requestId, offset: 0, started: now };
          return part(result, 0);
        }
        if (operation === 'readChunk') {
          if (!id(request.transferId) || !reading || request.transferId !== reading.transferId ||
            !Number.isSafeInteger(request.offset) || request.offset !== reading.offset) fail('INVALID_REQUEST');
          return part(result, request.offset);
        }
        if (operation === 'backupStart' || operation === 'workspaceSaveStart') {
          if (!Number.isSafeInteger(request.total) || request.total <= 0 || request.total > limits.backup) fail('INVALID_REQUEST');
          if (operation === 'workspaceSaveStart' && (!Number.isSafeInteger(request.expectedGeneration) || request.expectedGeneration < 0)) fail('INVALID_REQUEST');
          uploading = { workspace: operation === 'workspaceSaveStart', expectedGeneration: request.expectedGeneration, bytes: 0, transferId: request.requestId, total: request.total, offset: 0, chunks: [], started: now };
        } else {
          if (!id(request.transferId) || !uploading || request.transferId !== uploading.transferId) fail('INVALID_REQUEST');
          if (operation === 'backupChunk') {
            if (!Number.isSafeInteger(request.offset) || request.offset !== uploading.offset ||
              typeof request.text !== 'string' || request.text.length > chunkSize ||
              uploading.offset + request.text.length > uploading.total) fail('INVALID_REQUEST');
            // Empty chunks acknowledge the offset without growing retained memory.
            uploading.bytes += utf8Size(request.text);
            if (uploading.bytes > limits.backup) fail('INVALID_REQUEST');
            if (request.text.length) uploading.chunks.push(request.text);
            uploading.offset += request.text.length;
          } else {
            if (uploading.offset !== uploading.total) fail('INVALID_REQUEST');
            const complete = uploading;
            uploading = undefined;
            const text = complete.chunks.join('');
            return direct.handle({ type: request.type, requestId: request.requestId, operation: complete.workspace ? 'workspaceSave' : 'backup', text,
              ...(complete.workspace ? { expectedGeneration: complete.expectedGeneration, deadline: complete.started + lifetime } : {}) });
          }
        }
        return { ...result, status: 'ok', transferId: uploading.transferId, offset: uploading.offset, total: uploading.total };
      } catch {
        // Inspect only data descriptors: never invoke an untrusted getter while rejecting.
        if (descriptors && own(descriptors, 'operation') && own(descriptors.operation, 'value') &&
          ['backupChunk', 'backupCommit'].includes(descriptors.operation.value) && own(descriptors, 'transferId') && own(descriptors.transferId, 'value') &&
          uploading && descriptors.transferId.value === uploading.transferId) uploading = undefined;
        return { ...result, code: 'INVALID_REQUEST' };
      }
    }
    return Object.freeze({ handle });
  }
  global.OpenDeskSupportBusinessFiles = Object.freeze({ create, createTransport });
})(globalThis);
