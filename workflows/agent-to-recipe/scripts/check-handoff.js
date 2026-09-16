#!/usr/bin/env node
'use strict';

// Host-side, read-only integrity check. Never loads a Recipe or grants permission
// to resume desktop actions. See the shared agent-to-recipe/v1 contract.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');

const SCHEMA = 'agent-to-recipe/v1';
const JSON_LIMIT = 4 * 1024 * 1024;
const FILE_LIMIT = 64 * 1024 * 1024;
const TOTAL_LIMIT = 256 * 1024 * 1024;
const REQUEST_FIELDS = ['schemaVersion', 'taskId', 'workPackageId', 'attemptId', 'skill', 'mode',
  'planRevision', 'contractRef', 'inputRefs', 'requiredOutputs', 'authority', 'capabilities',
  'budgets', 'environmentRef', 'evidenceRoots'];
const HANDOFF_FIELDS = ['schemaVersion', 'taskId', 'workPackageId', 'attemptId', 'skill',
  'producerVersion', 'requestRef', 'inputRefs', 'executionStatus', 'artifacts', 'gate',
  'facts', 'assumptions', 'unresolved', 'sideEffects', 'failures', 'planDelta', 'nextRequest'];
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

class CheckError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function requireCheck(condition, code, message) {
  if (!condition) throw new CheckError(code, message);
}
function relativeParts(value) {
  requireCheck(text(value) && !/[\\:\x00-\x1f\x7f]/.test(value) && !path.posix.isAbsolute(value)
    && !path.win32.isAbsolute(value), 'UNSAFE_PATH', 'Use a portable relative path inside an explicit root.');
  const parts = value.split('/');
  requireCheck(parts.every(part => part && part !== '.' && part !== '..'),
    'UNSAFE_PATH', 'Empty, dot and parent path segments are not accepted.');
  return parts;
}
function makeRoots(entries) {
  requireCheck(Array.isArray(entries) && entries.length > 0, 'ROOTS_REQUIRED', 'Provide at least one explicit read root.');
  const roots = new Map();
  for (const entry of entries) {
    requireCheck(Array.isArray(entry) && entry.length === 2, 'INVALID_ROOT', 'A root must be an ID/directory pair.');
    const [id, directory] = entry;
    requireCheck(typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)
      && text(directory), 'INVALID_ROOT', 'Invalid root ID or directory.');
    requireCheck(!roots.has(id), 'DUPLICATE_ROOT', 'A root ID may only be assigned once.');
    const absolute = fs.realpathSync(directory);
    requireCheck(fs.statSync(absolute).isDirectory(), 'INVALID_ROOT', 'An explicit root must be a directory.');
    roots.set(id, absolute);
  }
  return roots;
}
function resolveFile(roots, rootId, relative) {
  requireCheck(roots.has(rootId), 'UNAUTHORIZED_ROOT', 'The reference root was not explicitly allowed by the caller.');
  const root = roots.get(rootId);
  let current = root;
  for (const part of relativeParts(relative)) {
    current = path.join(current, part);
    requireCheck(!fs.lstatSync(current).isSymbolicLink(), 'SYMLINK', 'Symlinks below an allowed root are not accepted.');
  }
  const actual = fs.realpathSync(current);
  requireCheck(actual.startsWith(root.endsWith(path.sep) ? root : root + path.sep),
    'ROOT_ESCAPE', 'The resolved file must stay inside its allowed root.');
  return actual;
}
function entryFile(roots, filename) {
  requireCheck(text(filename), 'FILE_REQUIRED', 'Both request and handoff paths are required.');
  const absolute = path.resolve(filename);
  for (const [id, root] of roots) {
    const relative = path.relative(root, absolute);
    if (relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) {
      return resolveFile(roots, id, relative.split(path.sep).join('/'));
    }
  }
  throw new CheckError('UNAUTHORIZED_ROOT', 'The input file is outside the caller-approved roots.');
}
function readBytes(filename, limit, budget) {
  // O_NONBLOCK prevents a replaced FIFO from hanging; fstat rejects non-files.
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)
    | (fs.constants.O_NONBLOCK || 0));
  try {
    const before = fs.fstatSync(fd);
    requireCheck(before.isFile(), 'NOT_FILE', 'References must point to regular files.');
    requireCheck(before.size <= limit && budget.bytes + before.size <= TOTAL_LIMIT,
      'SIZE_LIMIT', 'The bounded integrity-check read budget was exceeded.');
    // Bound the allocation/read even if another process grows the file.
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
      requireCheck(count > 0, 'FILE_CHANGED', 'A file changed during the integrity check.');
      offset += count;
    }
    const after = fs.fstatSync(fd);
    requireCheck(before.size === after.size && before.mtimeMs === after.mtimeMs
      && before.ctimeMs === after.ctimeMs, 'FILE_CHANGED', 'A file changed during the integrity check.');
    budget.bytes += bytes.length;
    return bytes;
  } finally { fs.closeSync(fd); }
}
function parseDocument(bytes) {
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new CheckError('INVALID_JSON', 'Expected a complete UTF-8 JSON object.'); }
  requireCheck(object(parsed), 'INVALID_DOCUMENT', 'The document must be a JSON object.');
  return parsed;
}

/**
 * @param {{request: string, handoff: string, roots: Array<[string, string]>}} options
 * @returns {object} Integrity only; declared Gate values are unverified claims.
 */
function checkHandoff(options) {
  const errors = [];
  const budget = { bytes: 0 };
  const verified = new Map();
  const inspectedLocations = new Map();
  let checkedReferences = 0;
  let request, handoff, requestPath, requestBytes, roots;
  const attempt = (location, action) => {
    try { return action(); }
    catch (error) {
      errors.push({ location, code: error instanceof CheckError ? error.code : 'FILE_UNREADABLE',
        message: error instanceof CheckError ? error.message : 'A required file or root is not readable.' });
      return undefined;
    }
  };
  roots = attempt('roots', () => makeRoots(options.roots));
  if (roots) {
    request = attempt('request', () => {
      requestPath = entryFile(roots, options.request);
      requestBytes = readBytes(requestPath, JSON_LIMIT, budget);
      return parseDocument(requestBytes);
    });
    handoff = attempt('handoff', () => parseDocument(readBytes(entryFile(roots, options.handoff), JSON_LIMIT, budget)));
  }
  if (request && handoff) {
    for (const [label, document, fields] of [['request', request, REQUEST_FIELDS], ['handoff', handoff, HANDOFF_FIELDS]]) {
      for (const field of fields) attempt(label + '.' + field, () => requireCheck(own(document, field),
        'MISSING_FIELD', 'A field required by the shared handoff envelope is missing.'));
      attempt(label + '.schemaVersion', () => requireCheck(document.schemaVersion === SCHEMA,
        'SCHEMA_VERSION', 'Only agent-to-recipe/v1 envelopes are supported.'));
    }
    for (const field of ['taskId', 'workPackageId', 'attemptId', 'skill']) {
      attempt('handoff.' + field, () => requireCheck(text(request[field]) && request[field] === handoff[field],
        'IDENTITY_MISMATCH', 'The handoff must match the nonempty request identity.'));
    }
    attempt('handoff.executionStatus', () => requireCheck(['completed', 'failed', 'canceled', 'interrupted']
      .includes(handoff.executionStatus), 'EXECUTION_STATUS', 'Invalid executionStatus; blocked is not an execution status.'));
    attempt('handoff.gate', () => {
      requireCheck(object(handoff.gate) && ['pass', 'warn', 'fail'].includes(handoff.gate.verdict),
        'GATE', 'Expected a Gate with pass/warn/fail verdict.');
      requireCheck(own(handoff.gate, 'scope') && handoff.gate.scope != null
        && (text(handoff.gate.scope) || (typeof handoff.gate.scope === 'object'
          && Object.keys(handoff.gate.scope).length > 0)), 'GATE_SCOPE', 'An explicit nonempty Gate scope is required.');
      requireCheck(Array.isArray(handoff.gate.criterionRefs) && Array.isArray(handoff.gate.evidenceRefs),
        'GATE_REFS', 'Gate criterionRefs and evidenceRefs must be arrays.');
    });
    const inspectRef = (ref, location, kindRequired = false) => {
      if (inspectedLocations.has(location)) return inspectedLocations.get(location);
      const result = attempt(location, () => {
        requireCheck(object(ref) && text(ref.rootId) && text(ref.path) && text(ref.schemaVersion)
          && typeof ref.sha256 === 'string' && /^[0-9a-f]{64}$/.test(ref.sha256)
          && (!kindRequired || text(ref.kind)), 'INVALID_REF', 'Expected a complete content-bound reference, not a placeholder.');
        requireCheck(++checkedReferences <= 1000, 'REFERENCE_LIMIT', 'Too many references for one bounded check.');
        const filename = resolveFile(roots, ref.rootId, ref.path);
        const key = JSON.stringify([ref.rootId, ref.path, ref.sha256, ref.schemaVersion]);
        if (!verified.has(key)) {
          const digest = hash(readBytes(filename, FILE_LIMIT, budget));
          requireCheck(digest === ref.sha256, 'HASH_MISMATCH', 'Referenced bytes no longer match the recorded SHA-256.');
          verified.set(key, filename);
        }
        return filename;
      });
      inspectedLocations.set(location, result);
      return result;
    };
    for (const [location, refs] of [['request.inputRefs', request.inputRefs],
      ['handoff.inputRefs', handoff.inputRefs], ['handoff.artifacts', handoff.artifacts]]) {
      if (!Array.isArray(refs)) attempt(location, () => { throw new CheckError('REF_ARRAY', 'Expected an array of references.'); });
      else refs.forEach((ref, index) => inspectRef(ref, location + '[' + index + ']', true));
    }
    const boundRequest = inspectRef(handoff.requestRef, 'handoff.requestRef');
    if (boundRequest) attempt('handoff.requestRef', () => requireCheck(boundRequest === requestPath
      && handoff.requestRef.sha256 === hash(requestBytes), 'REQUEST_BINDING', 'The handoff must bind this exact request file and bytes.'));
    if (Array.isArray(request.inputRefs) && Array.isArray(handoff.inputRefs)) {
      const key = ref => object(ref) ? JSON.stringify([ref.kind, ref.rootId, ref.path, ref.sha256, ref.schemaVersion]) : null;
      const allowed = new Set(request.inputRefs.map(key));
      handoff.inputRefs.forEach((ref, index) => attempt('handoff.inputRefs[' + index + ']', () => requireCheck(allowed.has(key(ref)),
        'UNDECLARED_INPUT', 'Consumed input must be bound by the supplied request.')));
    }
    // Inspect additional canonical file refs (including continuation and evidence).
    // Criterion IDs and other domain-specific references are not schema-validated.
    let nodes = 0;
    const walk = (value, location, depth, referenceField = false) => {
      requireCheck(++nodes <= 50000 && depth <= 32, 'STRUCTURE_LIMIT', 'The bounded JSON structure limit was exceeded.');
      if (Array.isArray(value)) return value.forEach((item, i) => walk(item, location + '[' + i + ']', depth + 1, referenceField));
      if (!object(value)) return;
      if ((own(value, 'sha256') && (own(value, 'rootId') || own(value, 'path')))
        || (referenceField && (own(value, 'rootId') || own(value, 'path')))) {
        inspectRef(value, location);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        // Root declarations and permissions are not file references or read grants.
        if (location === 'request' && ['evidenceRoots', 'authority', 'capabilities'].includes(key)) continue;
        walk(child, location + '.' + key, depth + 1, /Refs?$/.test(key));
      }
    };
    attempt('references', () => { walk(request, 'request', 0); walk(handoff, 'handoff', 0); });
  }
  return {
    tool: 'agent-to-recipe-handoff-integrity/v1', integrity: errors.length ? 'fail' : 'pass',
    checkedFiles: new Set(verified.values()).size, readBytes: budget.bytes,
    declared: handoff ? { taskId: handoff.taskId, workPackageId: handoff.workPackageId,
      attemptId: handoff.attemptId, executionStatus: handoff.executionStatus,
      gateVerdict: object(handoff.gate) ? handoff.gate.verdict : undefined } : null,
    errors,
    notEvaluated: ['business-correctness', 'required-output-semantics', 'gate-scope-coverage',
      'authority-and-budgets', 'current-plan-and-producer-version', 'transitive-artifact-references',
      'live-desktop-state', 'side-effect-outcome', 'platform-qualification'],
    desktopActionsAuthorized: false,
    next: 'Review contract, plan, scope, unresolved items and side effects; integrity pass is not permission to resume or publish.'
  };
}

const HELP = 'Usage: node workflows/agent-to-recipe/scripts/check-handoff.js --request <request.json> --handoff <handoff.json> --root <id=directory> [--root <id=directory> ...]\nRead-only host check; roots come from the caller, never from evidenceRoots. Exit: 0 integrity pass, 1 check failed, 2 usage error.\n';
function main(argv) {
  if (argv.length === 1 && argv[0] === '--help') { process.stdout.write(HELP); return 0; }
  try {
    const options = { roots: [] };
    for (let i = 0; i < argv.length; i += 2) {
      const flag = argv[i], value = argv[i + 1];
      requireCheck(['--request', '--handoff', '--root'].includes(flag) && text(value)
        && !value.startsWith('--'), 'USAGE', 'Unknown option or missing argument.');
      if (flag === '--root') {
        const separator = value.indexOf('=');
        requireCheck(separator > 0 && separator < value.length - 1, 'USAGE', 'Use --root id=directory.');
        options.roots.push([value.slice(0, separator), value.slice(separator + 1)]);
      } else {
        const key = flag.slice(2);
        requireCheck(!own(options, key), 'USAGE', 'Input options may only be supplied once.');
        options[key] = value;
      }
    }
    requireCheck(text(options.request) && text(options.handoff) && options.roots.length > 0,
      'USAGE', 'Request, handoff and explicit roots are required.');
    const report = checkHandoff(options);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return report.integrity === 'pass' ? 0 : 1;
  } catch (error) {
    process.stderr.write((error instanceof CheckError ? error.message : 'Invalid invocation.') + '\n' + HELP);
    return 2;
  }
}
if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { checkHandoff, main };
