(function installOpenDeskAssistantTaskContract(global) {
  'use strict';

  const SCHEMA_VERSION = 2;
  const INTENTS = new Set(['explain', 'use', 'make', 'improve']);
  const ASSET_KINDS = new Set(['none', 'js-file', 'automation-directory', 'installed-flow']);
  const INSTALL_ID = /^(?:flow|local)-[a-f0-9]{32}$/;
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
  const TERMINAL = new Set(['business-complete', 'failed', 'canceled', 'interrupted']);
  const DEFAULT_CONFIRM_TTL_MS = 5 * 60 * 1000;

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

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const item of Object.values(value)) deepFreeze(item);
    return Object.freeze(value);
  }

  function text(value, field, maxLength, required) {
    const limit = maxLength == null ? 4096 : maxLength;
    const result = String(value == null ? '' : value).replace(/\u0000/g, '').trim();
    if (required && !result) fail('INVALID_ARGUMENT', field + ' is required');
    if (result.length > limit) fail('INVALID_ARGUMENT', field + ' is too long');
    return result;
  }

  function identifier(value, field, required) {
    const result = text(value, field, 160, required);
    if (!result) return '';
    if (!SAFE_ID.test(result)) fail('INVALID_IDENTIFIER', field + ' contains unsafe characters');
    return result;
  }

  function uniqueTexts(value, field, maxItems) {
    if (value == null) return [];
    const limit = maxItems == null ? 64 : maxItems;
    if (!Array.isArray(value) || value.length > limit) fail('INVALID_ARGUMENT', field + ' must be an array');
    return [...new Set(value.map(item => text(item, field, 4096, true)))];
  }

  function normalizePath(value) {
    let input = text(value, 'path', 8192, true).replace(/\\/g, '/');
    const unc = input.startsWith('//');
    const driveMatch = /^([A-Za-z]:)\//.exec(input);
    const drive = driveMatch ? driveMatch[1].toLowerCase() : '';
    if (!unc && !drive && !input.startsWith('/')) fail('ASSET_PATH_NOT_ABSOLUTE', 'asset paths must be absolute');
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
    if (unc) {
      if (stack.length < 2) fail('ASSET_PATH_NOT_ABSOLUTE', 'UNC path must include server and share');
      return '//' + stack.join('/');
    }
    if (drive && stack.length === 0) return drive + '/';
    if (!drive && stack.length === 0) return '/';
    const prefix = drive ? drive + '/' : '/';
    return prefix + stack.join('/');
  }

  function isWithin(root, candidate) {
    const base = normalizePath(root);
    const target = normalizePath(candidate);
    const insensitive = /^[a-z]:\//.test(base) || base.startsWith('//');
    const left = insensitive ? base.toLowerCase() : base;
    const right = insensitive ? target.toLowerCase() : target;
    return right === left || right.startsWith(left.endsWith('/') ? left : left + '/');
  }

  function normalizeAsset(raw) {
    const input = raw && typeof raw === 'object' ? raw : {kind: 'none'};
    const kind = text(input.kind || 'none', 'asset.kind', 64, true);
    if (!ASSET_KINDS.has(kind)) fail('INVALID_ASSET_KIND', 'unsupported asset kind: ' + kind);
    if (kind === 'none') return Object.freeze({kind: 'none'});
    if (kind === 'js-file') {
      const ref = normalizePath(input.ref);
      if (!/\.m?js$/i.test(ref)) fail('INVALID_JS_ASSET', 'single-file asset must be a .js or .mjs file');
      return Object.freeze({
        kind,
        ref,
        scope: 'exact-file',
        sourceDigest: text(input.sourceDigest, 'asset.sourceDigest', 256, false),
      });
    }
    if (kind === 'automation-directory') {
      const root = normalizePath(input.ref);
      const entryRef = input.entryRef ? normalizePath(input.entryRef) : '';
      if (entryRef && !isWithin(root, entryRef)) fail('ASSET_SCOPE_DENIED', 'automation entry must remain inside the associated directory');
      return Object.freeze({
        kind,
        ref: root,
        entryRef,
        scope: 'directory',
        boundaryResolved: input.boundaryResolved === true,
      });
    }
    const installId = text(input.installId || input.ref, 'asset.installId', 160, true);
    if (!INSTALL_ID.test(installId)) fail('INVALID_FLOW_ID', 'installed Flow requires a canonical installId');
    return Object.freeze({
      kind,
      installId,
      flowId: text(input.flowId, 'asset.flowId', 240, false),
      sourceVisible: false,
    });
  }

  function normalizeAuthorizations(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    return Object.freeze({
      readSource: input.readSource === true,
      shareSourceWithModel: input.shareSourceWithModel === true,
    });
  }

  function create(input) {
    const value = input || {};
    const intent = text(value.intent, 'intent', 32, true);
    if (!INTENTS.has(intent)) fail('INVALID_INTENT', 'unsupported intent: ' + intent);
    const now = text(value.updatedAt || value.createdAt || new Date().toISOString(), 'updatedAt', 64, true);
    return deepFreeze({
      schemaVersion: SCHEMA_VERSION,
      revision: Number.isInteger(value.revision) && value.revision >= 0 ? value.revision : 0,
      taskId: identifier(value.taskId, 'taskId', true),
      conversationId: identifier(value.conversationId, 'conversationId', false),
      sessionId: identifier(value.sessionId, 'sessionId', false),
      requestId: identifier(value.requestId, 'requestId', false),
      userGoal: text(value.userGoal, 'userGoal', 20000, true),
      intent,
      asset: normalizeAsset(value.asset),
      authorizations: normalizeAuthorizations(value.authorizations),
      projectId: text(value.projectId, 'projectId', 240, false),
      projectRecordRef: text(value.projectRecordRef, 'projectRecordRef', 4096, false),
      agentWorkspaceRef: text(value.agentWorkspaceRef, 'agentWorkspaceRef', 4096, false),
      businessCwd: value.businessCwd ? normalizePath(value.businessCwd) : '',
      resourceRefs: Object.freeze(uniqueTexts(value.resourceRefs, 'resourceRefs', 64)),
      outputRefs: Object.freeze(uniqueTexts(value.outputRefs, 'outputRefs', 64)),
      status: text(value.status || 'queued', 'status', 64, true),
      createdAt: text(value.createdAt || now, 'createdAt', 64, true),
      updatedAt: now,
      evidence: Object.freeze(Array.isArray(value.evidence) ? clone(value.evidence) : []),
    });
  }

  function assertReadable(contract, target) {
    const task = create(contract);
    if (!task.authorizations.readSource) fail('SOURCE_READ_NOT_AUTHORIZED', 'source association does not authorize reading');
    const candidate = normalizePath(target);
    if (task.asset.kind === 'js-file') {
      if (candidate !== task.asset.ref) fail('ASSET_SCOPE_DENIED', 'single-file association does not authorize parent, sibling, or dependency reads');
      return candidate;
    }
    if (task.asset.kind === 'automation-directory') {
      if (!task.asset.boundaryResolved) fail('ASSET_BOUNDARY_AMBIGUOUS', 'automation directory boundary must be resolved before reading files');
      if (!isWithin(task.asset.ref, candidate)) fail('ASSET_SCOPE_DENIED', 'path is outside the associated automation directory');
      return candidate;
    }
    fail('ASSET_SOURCE_UNAVAILABLE', 'this task has no readable source asset');
  }

  function createStore(options) {
    const settings = options || {};
    const file = settings.file;
    const requestedRootDir = normalizePath(settings.rootDir);
    const clock = settings.clock || (() => new Date());
    if (!file || typeof file.join !== 'function' || typeof file.ensureDir !== 'function'
      || typeof file.exists !== 'function' || typeof file.listDir !== 'function'
      || typeof file.readJSON !== 'function' || typeof file.writeNew !== 'function'
      || typeof file.realPath !== 'function') {
      fail('INVALID_STORE', 'task contract store requires join/ensureDir/exists/listDir/readJSON/writeNew/realPath');
    }
    file.ensureDir(requestedRootDir);
    const rootDir = normalizePath(file.realPath(requestedRootDir));
    const requestedTasksRoot = file.join(rootDir, 'tasks');
    file.ensureDir(requestedTasksRoot);
    const tasksRoot = normalizePath(file.realPath(requestedTasksRoot));
    const chains = new Map();

    function samePath(left, right) {
      return isWithin(left, right) && isWithin(right, left);
    }

    function assertDirectory(path, allowMissing) {
      const expected = normalizePath(path);
      if (!file.exists(expected)) {
        if (allowMissing === true) return expected;
        fail('TASK_STORAGE_MISSING', 'task storage directory is missing');
      }
      let actual;
      try {
        actual = normalizePath(file.realPath(expected));
      } catch (error) {
        fail('TASK_STORAGE_REDIRECTED', 'task storage directory cannot be resolved safely', {cause: error});
      }
      if (!samePath(expected, actual)) {
        fail('TASK_STORAGE_REDIRECTED', 'task storage directory resolves through an unexpected alias');
      }
      return expected;
    }

    function taskDir(taskId) {
      return file.join(tasksRoot, identifier(taskId, 'taskId', true));
    }

    function versions(taskId) {
      const dir = taskDir(taskId);
      if (!file.exists(dir)) return [];
      assertDirectory(dir, false);
      return file.listDir(dir).map(String).filter(name => /^\d{8}\.json$/.test(name)).sort();
    }

    async function load(taskId) {
      const names = versions(taskId);
      if (!names.length) return null;
      return create(await file.readJSON(file.join(taskDir(taskId), names[names.length - 1]), {maxBytes: 1024 * 1024}));
    }

    async function list() {
      if (!file.exists(tasksRoot)) return [];
      assertDirectory(tasksRoot, false);
      const items = [];
      for (const name of file.listDir(tasksRoot).map(String).sort()) {
        if (!SAFE_ID.test(name)) continue;
        const item = await load(name);
        if (item) items.push(item);
      }
      return items;
    }

    function save(input, saveOptions) {
      const requested = create(input);
      const expectedOption = saveOptions && saveOptions.expectedRevision;
      const expectedRevision = Number.isInteger(expectedOption) ? expectedOption : requested.revision;
      const previousChain = chains.get(requested.taskId) || Promise.resolve();
      const operation = previousChain.then(async () => {
        const previous = await load(requested.taskId);
        const actualRevision = previous ? previous.revision : 0;
        if (expectedRevision !== actualRevision) {
          fail('TASK_REVISION_CONFLICT', 'task revision changed before save', {expectedRevision, actualRevision});
        }
        const revision = actualRevision + 1;
        const next = create(Object.assign({}, requested, {
          revision,
          createdAt: previous ? previous.createdAt : requested.createdAt,
          updatedAt: clock().toISOString(),
        }));
        const dir = taskDir(next.taskId);
        assertDirectory(tasksRoot, false);
        file.ensureDir(dir);
        assertDirectory(tasksRoot, false);
        assertDirectory(dir, false);
        const target = file.join(dir, String(revision).padStart(8, '0') + '.json');
        try {
          await Promise.resolve(file.writeNew(target, JSON.stringify(next) + '\n'));
        } catch (error) {
          if (file.exists(target) || (error && /exist/i.test(String(error.message || error)))) {
            fail('TASK_REVISION_CONFLICT', 'task revision was committed concurrently', {expectedRevision, actualRevision: revision});
          }
          throw error;
        }
        return next;
      });
      chains.set(requested.taskId, operation.catch(() => {}));
      return operation;
    }

    return Object.freeze({load, list, save, rootDir: tasksRoot, assertDirectory});
  }

  function createCandidateService(options) {
    const settings = options || {};
    const file = settings.file;
    const digest = settings.digest;
    const protectedRoots = Array.isArray(settings.protectedRoots) ? settings.protectedRoots.map(normalizePath) : [];
    if (!file || typeof file.writeNew !== 'function' || typeof file.exists !== 'function') {
      fail('INVALID_CANDIDATE_IO', 'candidate service requires writeNew/exists file operations');
    }
    if (typeof digest !== 'function') fail('INVALID_DIGEST', 'candidate service requires a digest function');

    function candidate(input) {
      const task = create(input.contract);
      if (task.intent !== 'improve' && task.intent !== 'make') fail('INVALID_CANDIDATE_INTENT', 'candidate generation is only valid for make/improve');
      const sourceRef = input.sourceRef ? assertReadable(task, input.sourceRef) : '';
      let sourceDigest = '';
      if (sourceRef) {
        const snapshot = input.sourceSnapshot && typeof input.sourceSnapshot === 'object' ? input.sourceSnapshot : null;
        if (!snapshot || normalizePath(snapshot.ref) !== sourceRef) {
          fail('INVALID_SOURCE_SNAPSHOT', 'candidate source requires a host-validated snapshot for the exact authorized path');
        }
        sourceDigest = text(snapshot.digest, 'sourceSnapshot.digest', 256, true);
      }
      const proposedContent = String(input.content == null ? '' : input.content);
      if (!proposedContent) fail('EMPTY_CANDIDATE', 'candidate content is empty');
      return deepFreeze({
        candidateId: identifier(input.candidateId, 'candidateId', true),
        taskId: task.taskId,
        sourceRef,
        sourceDigest,
        content: proposedContent,
        contentDigest: String(digest(proposedContent)),
        status: 'candidate-pending',
        independentlyVerified: false,
        savedTo: '',
      });
    }

    function saveAs(input) {
      const item = input && input.candidate;
      if (!item || !['candidate-pending', 'verified'].includes(item.status)) fail('INVALID_CANDIDATE', 'candidate is not reviewable');
      if (input.authorized !== true) fail('WRITE_NOT_AUTHORIZED', 'save-as requires an explicit user-authorized destination');
      const destination = normalizePath(input.destination);
      const sourceRef = item.sourceRef ? normalizePath(item.sourceRef) : '';
      if (sourceRef) {
        const currentSourceDigest = text(input.currentSourceDigest, 'currentSourceDigest', 256, true);
        if (currentSourceDigest !== String(item.sourceDigest || '')) {
          fail('SOURCE_CONFLICT', 'source changed after the candidate was created');
        }
      }
      if (sourceRef && destination === sourceRef) fail('OVERWRITE_NOT_SUPPORTED', 'candidate save-as cannot overwrite the source file');
      for (const root of protectedRoots) {
        if (isWithin(root, destination)) fail('PROTECTED_DESTINATION', 'candidate cannot be saved into a protected product/install directory');
      }
      if (file.exists(destination)) fail('DESTINATION_EXISTS', 'save-as destination already exists');
      try {
        file.writeNew(destination, item.content);
      } catch (error) {
        if (file.exists(destination) || (error && /exist/i.test(String(error.message || error)))) {
          fail('DESTINATION_EXISTS', 'save-as destination appeared concurrently');
        }
        throw error;
      }
      return deepFreeze(Object.assign({}, item, {savedTo: destination, status: 'saved'}));
    }

    function markVerified(item, evidence) {
      if (!item || !['candidate-pending', 'saved'].includes(item.status)) fail('INVALID_CANDIDATE', 'candidate cannot be verified');
      const proof = evidence && typeof evidence === 'object' ? evidence : {};
      if (String(proof.candidateDigest || '') !== String(item.contentDigest || '')) fail('VERIFICATION_MISMATCH', 'verification does not match the current candidate');
      if (proof.status !== 'passed') fail('VERIFICATION_FAILED', 'verification result is not passed');
      const executionId = text(proof.executionId, 'verification.executionId', 240, true);
      const criteriaId = text(proof.criteriaId, 'verification.criteriaId', 240, true);
      const observedAt = text(proof.observedAt, 'verification.observedAt', 64, true);
      return deepFreeze(Object.assign({}, item, {
        independentlyVerified: true,
        verificationEvidence: {candidateDigest: item.contentDigest, executionId, criteriaId, observedAt, status: 'passed'},
        status: 'verified',
      }));
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
      runnable: item.runnable === true,
      protected: item.protected === true,
      archiveDigest: String(item.archiveDigest || ''),
      manifestDigest: String(item.manifestDigest || ''),
      authorizationRevision: String(item.authorizationRevision || ''),
      permissionRevision: String(item.permissionRevision || ''),
      invocation: item.invocation && typeof item.invocation === 'object' ? clone(item.invocation) : null,
    });
  }

  function createFlowUseService(options) {
    const settings = options || {};
    const gateway = settings.gateway;
    const randomUUID = settings.randomUUID || (global.crypto && typeof global.crypto.randomUUID === 'function' ? () => global.crypto.randomUUID() : null);
    const clock = settings.clock || (() => new Date());
    const ttlMs = Number.isFinite(settings.confirmTTLms) ? settings.confirmTTLms : DEFAULT_CONFIRM_TTL_MS;
    if (!gateway || typeof gateway.inspect !== 'function' || typeof gateway.run !== 'function') {
      fail('FLOW_GATEWAY_UNAVAILABLE', 'installed Flow use requires the host-owned Flow gateway');
    }
    if (!randomUUID) fail('CONFIRMATION_ID_UNAVAILABLE', 'Flow confirmation requires a host random UUID source');
    const registry = new Map();

    function validateInspection(contract, inspected) {
      if (!inspected || inspected.installId !== contract.asset.installId) fail('FLOW_IDENTITY_MISMATCH', 'Flow gateway returned a different install identity');
      if (inspected.state !== 'ready' || inspected.runnable !== true) {
        fail('FLOW_NOT_RUNNABLE', inspected && inspected.stateReason || 'installed Flow is not ready to run');
      }
      if (Object.prototype.hasOwnProperty.call(inspected, 'source') || Object.prototype.hasOwnProperty.call(inspected, 'sourceText')
        || Object.prototype.hasOwnProperty.call(inspected, 'entry') || Object.prototype.hasOwnProperty.call(inspected, 'root')) {
        fail('PROTECTED_SOURCE_EXPOSED', 'Flow inspection exposed non-public execution material');
      }
    }

    function flowInputMatchesType(value, kind) {
      if (kind === 'string') return typeof value === 'string';
      if (kind === 'number') return typeof value === 'number' && Number.isFinite(value);
      if (kind === 'integer') return typeof value === 'number' && Number.isInteger(value);
      if (kind === 'boolean') return typeof value === 'boolean';
      if (kind === 'object') return !!value && typeof value === 'object' && !Array.isArray(value);
      if (kind === 'array') return Array.isArray(value);
      return false;
    }

    function validateInvocationInput(inspected, input) {
      const invocation = inspected && inspected.invocation && typeof inspected.invocation === 'object'
        ? inspected.invocation : null;
      if (!invocation) {
        fail('FLOW_INVOCATION_CONTRACT_MISSING',
          'this installed Flow does not publish a signed assistant-use contract; run it from Flow Runner instead of guessing its behavior');
      }
      if (invocation.schemaVersion !== 1 || typeof invocation.effectSummary !== 'string' || !invocation.effectSummary.trim()) {
        fail('FLOW_INVOCATION_CONTRACT_INVALID', 'Flow assistant-use contract is invalid');
      }
      const parameters = invocation.parameters && typeof invocation.parameters === 'object'
        ? invocation.parameters : {};
      const fixed = invocation.fixedInputs && typeof invocation.fixedInputs === 'object'
        ? clone(invocation.fixedInputs) : {};
      const actual = input && typeof input === 'object' && !Array.isArray(input) ? clone(input) : {};

      for (const key of Object.keys(actual)) {
        if (!Object.prototype.hasOwnProperty.call(parameters, key)) {
          fail('FLOW_UNKNOWN_INPUT', 'input ' + key + ' is not declared by the signed Flow invocation contract');
        }
      }
      for (const [key, expected] of Object.entries(fixed)) {
        if (Object.prototype.hasOwnProperty.call(actual, key)
          && JSON.stringify(actual[key]) !== JSON.stringify(expected)) {
          fail('FLOW_FIXED_INPUT_CONFLICT', 'input ' + key + " conflicts with the Flow's fixed behavior");
        }
      }
      const merged = {...fixed, ...actual};
      for (const [key, parameter] of Object.entries(parameters)) {
        if (!parameter || typeof parameter !== 'object') {
          fail('FLOW_INVOCATION_CONTRACT_INVALID', 'Flow parameter metadata is invalid');
        }
        if (!Object.prototype.hasOwnProperty.call(merged, key)) {
          if (parameter.required === true) fail('FLOW_REQUIRED_INPUT_MISSING', 'required input ' + key + ' is missing');
          continue;
        }
        if (!flowInputMatchesType(merged[key], String(parameter.type || ''))) {
          fail('FLOW_INPUT_TYPE_MISMATCH', 'input ' + key + ' does not match declared type ' + String(parameter.type || ''));
        }
      }
      return deepFreeze({
        input: clone(merged),
        invocation: clone(invocation),
      });
    }

    async function prepare(contractInput, input, context) {
      const contract = create(contractInput);
      if (contract.intent !== 'use' || contract.asset.kind !== 'installed-flow') {
        fail('INVALID_FLOW_USE', 'Flow use requires intent=use and an installed-flow asset');
      }
      const inspected = await gateway.inspect(contract.asset.installId, context || {});
      validateInspection(contract, inspected);
      const invocationUse = validateInvocationInput(inspected, input);
      const actualInput = invocationUse.input;
      const canonical = {
        taskId: contract.taskId,
        taskRevision: contract.revision,
        requestId: contract.requestId,
        installId: contract.asset.installId,
        input: clone(actualInput),
        inspectionSnapshot: comparableInspection(inspected),
        archiveDigest: String(inspected.archiveDigest || ''),
        manifestDigest: String(inspected.manifestDigest || ''),
        expiresAtMS: clock().getTime() + ttlMs,
      };
      const token = randomUUID();
      registry.set(token, canonical);
      return deepFreeze({
        schemaVersion: 1,
        taskId: canonical.taskId,
        taskRevision: canonical.taskRevision,
        requestId: canonical.requestId,
        installId: canonical.installId,
        confirmationToken: token,
        preview: {
          name: String(inspected.name || inspected.flowId || contract.asset.installId),
          version: String(inspected.version || ''),
          publisherId: String(inspected.publisherId || ''),
          effectSummary: String(invocationUse.invocation.effectSummary),
          parameters: clone(invocationUse.invocation.parameters || {}),
          fixedInputs: clone(invocationUse.invocation.fixedInputs || {}),
          input: clone(actualInput),
          sourceVisible: false,
          protected: inspected.protected === true,
        },
      });
    }

    async function confirmAndRun(contractInput, prepared, confirmationToken, context) {
      const contract = create(contractInput);
      const canonical = registry.get(String(confirmationToken || ''));
      if (!canonical) fail('STALE_CONFIRMATION', 'confirmation is unknown, expired, or already consumed');
      registry.delete(String(confirmationToken));
      if (canonical.expiresAtMS < clock().getTime()) fail('STALE_CONFIRMATION', 'confirmation expired before execution');
      if (!prepared || prepared.confirmationToken !== confirmationToken
        || canonical.taskId !== contract.taskId || canonical.taskRevision !== contract.revision
        || canonical.requestId !== contract.requestId || canonical.installId !== contract.asset.installId) {
        fail('STALE_CONFIRMATION', 'confirmation belongs to a different task revision or asset');
      }
      const inspected = await gateway.inspect(contract.asset.installId, context || {});
      validateInspection(contract, inspected);
      if (comparableInspection(inspected) !== canonical.inspectionSnapshot) {
        fail('FLOW_CHANGED_AFTER_PREVIEW', 'Flow state/content/authorization changed after preview');
      }
      const result = await gateway.run({
        installId: canonical.installId,
        input: clone(canonical.input),
        expectedArchiveDigest: canonical.archiveDigest,
        expectedManifestDigest: canonical.manifestDigest,
        signal: context && context.signal || null,
        onReserved: context && context.onReserved || null,
      });
      if (!result || !text(result.executionId, 'executionId', 240, true)) fail('EXECUTION_ID_MISSING', 'host did not return the real Execution identity');
      return deepFreeze({
        executionId: String(result.executionId),
        status: String(result.status || 'unknown'),
        result: clone(result.result),
        businessVerified: result.businessVerified === true,
        verification: clone(result.verification || null),
      });
    }

    function invalidateTask(taskId) {
      const id = identifier(taskId, 'taskId', true);
      for (const [token, value] of registry.entries()) if (value.taskId === id) registry.delete(token);
    }

    return Object.freeze({prepare, confirmAndRun, invalidateTask});
  }

  global.OpenDeskAssistantTaskContract = Object.freeze({
    SCHEMA_VERSION,
    INTENTS: Object.freeze([...INTENTS]),
    ASSET_KINDS: Object.freeze([...ASSET_KINDS]),
    TaskContractError,
    create,
    normalizeAsset,
    normalizePath,
    isWithin,
    assertReadable,
    createStore,
    createCandidateService,
    createFlowUseService,
    isTerminal(status) { return TERMINAL.has(String(status || '')); },
  });
})(globalThis);
