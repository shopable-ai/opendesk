(function installOpenDeskAssistantTaskContract(global) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const INTENTS = new Set(['explain', 'use', 'make', 'improve']);
  const ASSET_KINDS = new Set(['none', 'js-file', 'automation-directory', 'installed-flow']);
  const INSTALL_ID = /^(?:flow|local)-[a-f0-9]{32}$/;
  const TERMINAL = new Set(['business-complete', 'failed', 'canceled']);

  class TaskContractError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = 'TaskContractError';
      this.code = code;
      if (details && typeof details === 'object') Object.assign(this, details);
    }
  }

  function fail(code, message, details) {
    throw new TaskContractError(code, message, details);
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function text(value, field, maxLength = 4096, required = false) {
    const result = String(value == null ? '' : value).replace(/\u0000/g, '').trim();
    if (required && !result) fail('INVALID_ARGUMENT', `${field} is required`);
    if (result.length > maxLength) fail('INVALID_ARGUMENT', `${field} is too long`);
    return result;
  }

  function uniqueTexts(value, field, maxItems = 64) {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > maxItems) fail('INVALID_ARGUMENT', `${field} must be an array`);
    return [...new Set(value.map(item => text(item, field, 4096, true)))];
  }

  function normalizePath(value) {
    let input = text(value, 'path', 8192, true).replace(/\\/g, '/');
    const drive = /^[A-Za-z]:\//.test(input) ? input.slice(0, 2).toLowerCase() : '';
    const absolute = drive ? input.slice(2).startsWith('/') : input.startsWith('/');
    if (!absolute) fail('ASSET_PATH_NOT_ABSOLUTE', 'asset paths must be absolute');
    if (drive) input = input.slice(2);
    const stack = [];
    for (const part of input.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (!stack.length) fail('ASSET_PATH_ESCAPE', 'asset path escapes its root');
        stack.pop();
      } else {
        stack.push(part);
      }
    }
    return `${drive}${drive ? '/' : '/'}${stack.join('/')}`.replace(/\/$/, '') || '/';
  }

  function isWithin(root, candidate) {
    const base = normalizePath(root);
    const target = normalizePath(candidate);
    const insensitive = /^[a-z]:\//.test(base);
    const left = insensitive ? base.toLowerCase() : base;
    const right = insensitive ? target.toLowerCase() : target;
    return right === left || right.startsWith(left.endsWith('/') ? left : `${left}/`);
  }

  function normalizeAsset(raw) {
    const input = raw && typeof raw === 'object' ? raw : {kind: 'none'};
    const kind = text(input.kind || 'none', 'asset.kind', 64, true);
    if (!ASSET_KINDS.has(kind)) fail('INVALID_ASSET_KIND', `unsupported asset kind: ${kind}`);
    if (kind === 'none') return Object.freeze({kind: 'none'});
    if (kind === 'js-file') {
      const ref = normalizePath(input.ref);
      if (!/\.m?js$/i.test(ref)) fail('INVALID_JS_ASSET', 'single-file asset must be a .js or .mjs file');
      return Object.freeze({
        kind,
        ref,
        scope: 'exact-file',
        sourceDigest: text(input.sourceDigest, 'asset.sourceDigest', 256),
      });
    }
    if (kind === 'automation-directory') {
      return Object.freeze({
        kind,
        ref: normalizePath(input.ref),
        scope: 'directory',
        boundaryResolved: input.boundaryResolved === true,
      });
    }
    const installId = text(input.installId || input.ref, 'asset.installId', 160, true);
    if (!INSTALL_ID.test(installId)) fail('INVALID_FLOW_ID', 'installed Flow requires a canonical installId');
    return Object.freeze({
      kind,
      installId,
      flowId: text(input.flowId, 'asset.flowId', 240),
      sourceVisible: false,
    });
  }

  function create(input) {
    const value = input || {};
    const intent = text(value.intent, 'intent', 32, true);
    if (!INTENTS.has(intent)) fail('INVALID_INTENT', `unsupported intent: ${intent}`);
    const asset = normalizeAsset(value.asset);
    if (intent === 'use' && asset.kind !== 'installed-flow' && asset.kind !== 'js-file') {
      fail('INVALID_USE_ASSET', 'use requires an installed Flow or an explicitly selected JS file');
    }
    const now = text(value.updatedAt || value.createdAt || new Date().toISOString(), 'updatedAt', 64, true);
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      revision: Number.isInteger(value.revision) && value.revision >= 0 ? value.revision : 0,
      taskId: text(value.taskId, 'taskId', 160, true),
      sessionId: text(value.sessionId, 'sessionId', 160, true),
      requestId: text(value.requestId, 'requestId', 160),
      userGoal: text(value.userGoal, 'userGoal', 20000, true),
      intent,
      asset,
      projectId: text(value.projectId, 'projectId', 240),
      projectRecordRef: text(value.projectRecordRef, 'projectRecordRef', 4096),
      agentWorkspaceRef: text(value.agentWorkspaceRef, 'agentWorkspaceRef', 4096),
      businessCwd: value.businessCwd ? normalizePath(value.businessCwd) : '',
      resourceRefs: Object.freeze(uniqueTexts(value.resourceRefs, 'resourceRefs')),
      outputRefs: Object.freeze(uniqueTexts(value.outputRefs, 'outputRefs')),
      status: text(value.status || 'queued', 'status', 64, true),
      createdAt: text(value.createdAt || now, 'createdAt', 64, true),
      updatedAt: now,
      evidence: Object.freeze(Array.isArray(value.evidence) ? clone(value.evidence) : []),
    });
  }

  function assertReadable(contract, target) {
    const task = create(contract);
    const path = normalizePath(target);
    if (task.asset.kind === 'js-file') {
      if (path !== task.asset.ref) fail('ASSET_SCOPE_DENIED', 'single-file association does not authorize parent, sibling, or dependency reads');
      return path;
    }
    if (task.asset.kind === 'automation-directory') {
      if (!task.asset.boundaryResolved) fail('ASSET_BOUNDARY_AMBIGUOUS', 'automation directory boundary must be resolved before reading files');
      if (!isWithin(task.asset.ref, path)) fail('ASSET_SCOPE_DENIED', 'path is outside the associated automation directory');
      return path;
    }
    fail('ASSET_SOURCE_UNAVAILABLE', 'this task has no readable source asset');
  }

  function createStore(options) {
    const settings = options || {};
    const file = settings.file;
    const rootDir = text(settings.rootDir, 'rootDir', 8192, true);
    const clock = settings.clock || (() => new Date());
    if (!file || typeof file.join !== 'function' || typeof file.ensureDir !== 'function'
      || typeof file.exists !== 'function' || typeof file.listDir !== 'function'
      || typeof file.readJSON !== 'function' || typeof file.writeJSON !== 'function') {
      fail('INVALID_STORE', 'task contract store requires immutable JSON file operations');
    }
    const tasksRoot = file.join(rootDir, 'tasks');
    file.ensureDir(tasksRoot);

    function taskDir(taskId) {
      return file.join(tasksRoot, text(taskId, 'taskId', 160, true));
    }
    function versions(taskId) {
      const dir = taskDir(taskId);
      if (!file.exists(dir)) return [];
      return file.listDir(dir).map(String).filter(name => /^\d{8}\.json$/.test(name)).sort();
    }
    async function load(taskId) {
      const names = versions(taskId);
      if (!names.length) return null;
      return create(await file.readJSON(file.join(taskDir(taskId), names[names.length - 1]), {maxBytes: 1024 * 1024}));
    }
    async function save(input) {
      const requested = create(input);
      const previous = await load(requested.taskId);
      if (previous && previous.sessionId !== requested.sessionId) fail('TASK_SESSION_CONFLICT', 'taskId is already owned by another session');
      const revision = previous ? previous.revision + 1 : 1;
      const next = create({...requested, revision, createdAt: previous ? previous.createdAt : requested.createdAt,
        updatedAt: clock().toISOString()});
      const dir = taskDir(next.taskId);
      file.ensureDir(dir);
      const target = file.join(dir, `${String(revision).padStart(8, '0')}.json`);
      if (file.exists(target)) fail('TASK_REVISION_CONFLICT', 'task revision already exists');
      await file.writeJSON(target, next, {spaces: 0, createDirs: true, maxBytes: 1024 * 1024});
      return next;
    }
    return Object.freeze({load, save, rootDir: tasksRoot});
  }

  function createCandidateService(options) {
    const settings = options || {};
    const file = settings.file;
    const digest = settings.digest;
    if (!file || typeof file.read !== 'function' || typeof file.write !== 'function') {
      fail('INVALID_CANDIDATE_IO', 'candidate service requires read/write file operations');
    }
    if (typeof digest !== 'function') fail('INVALID_DIGEST', 'candidate service requires a digest function');

    function candidate(input) {
      const task = create(input.contract);
      if (task.intent !== 'improve' && task.intent !== 'make') fail('INVALID_CANDIDATE_INTENT', 'candidate generation is only valid for make/improve');
      const sourceRef = input.sourceRef ? assertReadable(task, input.sourceRef) : '';
      const sourceContent = sourceRef ? String(file.read(sourceRef)) : '';
      const proposedContent = String(input.content == null ? '' : input.content);
      if (!proposedContent) fail('EMPTY_CANDIDATE', 'candidate content is empty');
      return Object.freeze({
        candidateId: text(input.candidateId, 'candidateId', 160, true),
        taskId: task.taskId,
        sessionId: task.sessionId,
        sourceRef,
        sourceDigest: sourceRef ? String(digest(sourceContent)) : '',
        content: proposedContent,
        status: 'candidate-pending',
        independentlyVerified: false,
      });
    }

    function saveAs(input) {
      const item = input.candidate;
      if (!item || item.status !== 'candidate-pending') fail('INVALID_CANDIDATE', 'candidate is not pending review');
      const destination = normalizePath(input.destination);
      const sourceRef = item.sourceRef ? normalizePath(item.sourceRef) : '';
      if (sourceRef && destination === sourceRef) {
        const current = String(file.read(sourceRef));
        if (String(digest(current)) !== item.sourceDigest) {
          fail('SOURCE_CONFLICT', 'source changed after the candidate was created; refusing to overwrite it');
        }
      } else if (typeof file.exists === 'function' && file.exists(destination) && input.replaceExisting !== true) {
        fail('DESTINATION_EXISTS', 'save-as destination already exists');
      }
      file.write(destination, item.content);
      return Object.freeze({...item, savedTo: destination, status: 'saved'});
    }

    function markVerified(item, evidence) {
      if (!item || (item.status !== 'candidate-pending' && item.status !== 'saved')) fail('INVALID_CANDIDATE', 'candidate cannot be verified');
      return Object.freeze({...item, independentlyVerified: true, verificationEvidence: clone(evidence || {}), status: 'verified'});
    }
    return Object.freeze({create: candidate, saveAs, markVerified});
  }

  function comparableInspection(value) {
    const item = value && typeof value === 'object' ? value : {};
    return JSON.stringify({
      installId: String(item.installId || ''),
      flowId: String(item.flowId || ''),
      version: String(item.version || ''),
      state: String(item.state || ''),
      archiveDigest: String(item.archiveDigest || ''),
      manifestDigest: String(item.manifestDigest || ''),
      authorizationRevision: String(item.authorizationRevision || ''),
      permissionRevision: String(item.permissionRevision || ''),
    });
  }

  function createFlowUseService(options) {
    const settings = options || {};
    const gateway = settings.gateway;
    const digest = settings.digest;
    if (!gateway || typeof gateway.inspect !== 'function' || typeof gateway.run !== 'function' || typeof gateway.stop !== 'function') {
      fail('FLOW_GATEWAY_UNAVAILABLE', 'installed Flow use requires the host-owned Flow gateway');
    }
    if (typeof digest !== 'function') fail('INVALID_DIGEST', 'Flow use requires a digest function');
    const consumed = new Set();

    function validateInspection(contract, inspected) {
      if (!inspected || inspected.installId !== contract.asset.installId) fail('FLOW_IDENTITY_MISMATCH', 'Flow gateway returned a different install identity');
      if (inspected.state !== 'ready' || inspected.runnable === false) {
        fail('FLOW_NOT_RUNNABLE', inspected.stateReason || 'installed Flow is not ready to run');
      }
      if (Object.prototype.hasOwnProperty.call(inspected, 'source') || Object.prototype.hasOwnProperty.call(inspected, 'sourceText')) {
        fail('PROTECTED_SOURCE_EXPOSED', 'Flow inspection must not expose protected source');
      }
    }

    function validateFixedInputs(inspected, input) {
      const fixed = inspected && inspected.fixedInputs && typeof inspected.fixedInputs === 'object' ? inspected.fixedInputs : {};
      const actual = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
      for (const [key, expected] of Object.entries(fixed)) {
        if (Object.prototype.hasOwnProperty.call(actual, key) && JSON.stringify(actual[key]) !== JSON.stringify(expected)) {
          fail('FLOW_FIXED_INPUT_CONFLICT', `input ${key} conflicts with the Flow's fixed behavior`);
        }
      }
      return Object.freeze({...fixed, ...clone(actual)});
    }

    async function prepare(contractInput, input) {
      const contract = create(contractInput);
      if (contract.intent !== 'use' || contract.asset.kind !== 'installed-flow') {
        fail('INVALID_FLOW_USE', 'Flow use requires intent=use and an installed-flow asset');
      }
      const inspected = await gateway.inspect(contract.asset.installId);
      validateInspection(contract, inspected);
      const actualInput = validateFixedInputs(inspected, input);
      const snapshot = comparableInspection(inspected);
      const token = String(digest(JSON.stringify({
        v: 1, taskId: contract.taskId, sessionId: contract.sessionId, requestId: contract.requestId,
        snapshot, input: actualInput,
      })));
      return Object.freeze({
        schemaVersion: 1,
        taskId: contract.taskId,
        sessionId: contract.sessionId,
        requestId: contract.requestId,
        installId: contract.asset.installId,
        input: actualInput,
        inspection: clone(inspected),
        inspectionSnapshot: snapshot,
        confirmationToken: token,
        preview: Object.freeze({
          name: String(inspected.name || inspected.flowId || contract.asset.installId),
          version: String(inspected.version || ''),
          effectScope: clone(inspected.effectScope || null),
          input: clone(actualInput),
          sourceVisible: false,
        }),
      });
    }

    async function confirmAndRun(contractInput, prepared, confirmationToken, context) {
      const contract = create(contractInput);
      if (!prepared || prepared.taskId !== contract.taskId || prepared.sessionId !== contract.sessionId
        || prepared.requestId !== contract.requestId || prepared.installId !== contract.asset.installId) {
        fail('STALE_CONFIRMATION', 'confirmation belongs to a different task/session/request');
      }
      if (confirmationToken !== prepared.confirmationToken) fail('STALE_CONFIRMATION', 'confirmation token is invalid or stale');
      if (consumed.has(confirmationToken)) fail('DUPLICATE_CONFIRMATION', 'confirmation token was already consumed');
      const inspected = await gateway.inspect(contract.asset.installId);
      validateInspection(contract, inspected);
      if (comparableInspection(inspected) !== prepared.inspectionSnapshot) {
        fail('FLOW_CHANGED_AFTER_PREVIEW', 'Flow state/content/authorization changed after preview');
      }
      consumed.add(confirmationToken);
      const result = await gateway.run({
        installId: contract.asset.installId,
        input: clone(prepared.input),
        signal: context && context.signal || null,
      });
      if (!result || !text(result.executionId, 'executionId', 240)) fail('EXECUTION_ID_MISSING', 'host did not return the real Execution identity');
      return Object.freeze({
        executionId: String(result.executionId),
        status: String(result.status || 'unknown'),
        result: clone(result.result),
        businessVerified: result.businessVerified === true,
        verification: clone(result.verification || null),
      });
    }

    async function stop(executionId) {
      const id = text(executionId, 'executionId', 240, true);
      try {
        const result = await gateway.stop(id);
        if (result && result.stopped === true) return Object.freeze({executionId: id, status: 'canceled'});
        return Object.freeze({executionId: id, status: 'stopping', effect: 'unknown'});
      } catch (error) {
        return Object.freeze({executionId: id, status: 'stopping', effect: 'unknown', stopError: String(error && error.message || error)});
      }
    }

    return Object.freeze({prepare, confirmAndRun, stop});
  }

  global.OpenDeskAssistantTaskContract = Object.freeze({
    SCHEMA_VERSION,
    INTENTS: Object.freeze([...INTENTS]),
    ASSET_KINDS: Object.freeze([...ASSET_KINDS]),
    TaskContractError,
    create,
    normalizeAsset,
    assertReadable,
    createStore,
    createCandidateService,
    createFlowUseService,
    isTerminal(status) { return TERMINAL.has(String(status || '')); },
  });
})(globalThis);
