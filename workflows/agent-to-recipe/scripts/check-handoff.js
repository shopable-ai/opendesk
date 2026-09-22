#!/usr/bin/env node
'use strict';

// Host-side, read-only integrity check. Never loads a Recipe or grants permission
// to resume desktop actions. See the shared agent-to-recipe/v1 contract.
const {
  SCHEMA, JSON_LIMIT, FILE_LIMIT, own, object, text, hash, CheckError,
  requireCheck, makeRoots, resolveFile, entryFile, readBytes, parseDocument,
} = require('./artifact-validation.js');
const REQUEST_FIELDS = ['schemaVersion', 'taskId', 'workPackageId', 'attemptId', 'skill', 'mode',
  'planRevision', 'contractRef', 'inputRefs', 'requiredOutputs', 'authority', 'capabilities',
  'budgets', 'environmentRef', 'evidenceRoots'];
const HANDOFF_FIELDS = ['schemaVersion', 'taskId', 'workPackageId', 'attemptId', 'skill',
  'producerVersion', 'requestRef', 'inputRefs', 'executionStatus', 'artifacts', 'gate',
  'facts', 'assumptions', 'unresolved', 'sideEffects', 'failures', 'planDelta', 'nextRequest'];

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


/**
 * Verify one normal-path formal handoff is actually consumed by a downstream
 * request through an exact published artifact reference. This remains read-only:
 * it does not create requests/handoffs, mutate progress, or grant execution.
 * Failed/warn handoffs stay available to diagnostic consumers through
 * checkHandoff(), but cannot use this normal-path consumption proof.
 *
 * @param {{request:string,handoff:string,consumerRequest:string,roots:Array<[string,string]>}} options
 */
function checkHandoffConsumption(options) {
  const producer = checkHandoff(options);
  const errors = [...producer.errors];
  const consumedArtifacts = [];
  let producerHandoff, consumerRequest;
  const attempt = (location, action) => {
    try { return action(); }
    catch (error) {
      errors.push({ location, code: error instanceof CheckError ? error.code : 'FILE_UNREADABLE',
        message: error instanceof CheckError ? error.message : 'A required file or root is not readable.' });
      return undefined;
    }
  };
  if (producer.integrity === 'pass') {
    const roots = attempt('roots', () => makeRoots(options.roots));
    if (roots) {
      const budget = { bytes: 0 };
      producerHandoff = attempt('handoff', () =>
        parseDocument(readBytes(entryFile(roots, options.handoff), JSON_LIMIT, budget)));
      consumerRequest = attempt('consumerRequest', () =>
        parseDocument(readBytes(entryFile(roots, options.consumerRequest), JSON_LIMIT, budget)));
      if (producerHandoff && consumerRequest) {
        for (const field of REQUEST_FIELDS) attempt('consumerRequest.' + field, () =>
          requireCheck(own(consumerRequest, field), 'MISSING_FIELD',
            'A field required by the shared downstream request envelope is missing.'));
        attempt('consumerRequest.schemaVersion', () => requireCheck(consumerRequest.schemaVersion === SCHEMA,
          'SCHEMA_VERSION', 'Only agent-to-recipe/v1 downstream requests are supported.'));
        attempt('consumerRequest.taskId', () => requireCheck(text(consumerRequest.taskId)
          && consumerRequest.taskId === producerHandoff.taskId, 'TASK_MISMATCH',
        'A normal downstream request must belong to the same task as the published handoff.'));
        attempt('handoff.gate', () => requireCheck(producerHandoff.gate?.verdict === 'pass',
          'PRODUCER_GATE', 'Only a pass handoff can enter this normal downstream-consumption check.'));
        const refKey = ref => object(ref) ? JSON.stringify(
          [ref.kind, ref.rootId, ref.path, ref.sha256, ref.schemaVersion]) : null;
        const published = new Set((Array.isArray(producerHandoff.artifacts) ? producerHandoff.artifacts : []).map(refKey));
        if (!Array.isArray(consumerRequest.inputRefs)) {
          attempt('consumerRequest.inputRefs', () => { throw new CheckError('REF_ARRAY', 'Expected an array of downstream input references.'); });
        } else {
          for (let index = 0; index < consumerRequest.inputRefs.length; index += 1) {
            const ref = consumerRequest.inputRefs[index];
            attempt('consumerRequest.inputRefs[' + index + ']', () => {
              requireCheck(object(ref) && text(ref.kind) && text(ref.rootId) && text(ref.path)
                && text(ref.schemaVersion) && typeof ref.sha256 === 'string'
                && /^[0-9a-f]{64}$/.test(ref.sha256), 'INVALID_REF',
              'Expected a complete content-bound downstream input reference.');
              const filename = resolveFile(roots, ref.rootId, ref.path);
              requireCheck(hash(readBytes(filename, FILE_LIMIT, budget)) === ref.sha256, 'HASH_MISMATCH',
                'Downstream input bytes no longer match the recorded SHA-256.');
              if (published.has(refKey(ref))) consumedArtifacts.push(ref);
            });
          }
          attempt('consumerRequest.inputRefs', () => requireCheck(consumedArtifacts.length > 0,
            'CONSUMER_INPUT_NOT_PUBLISHED',
            'The downstream request does not consume any exact artifact published by this handoff.'));
        }
      }
    }
  }
  return {
    tool: 'agent-to-recipe-handoff-consumption/v1',
    integrity: errors.length ? 'fail' : 'pass',
    producerIntegrity: producer.integrity,
    consumedArtifacts,
    errors,
    notEvaluated: ['business-correctness', 'downstream-skill-input-sufficiency', 'current-plan-impact-analysis',
      'progress-mutation', 'live-desktop-state', 'platform-qualification'],
    desktopActionsAuthorized: false,
    next: errors.length
      ? 'Keep the published handoff and downstream request immutable; repair the exact binding or route diagnostics without promoting a failed handoff.'
      : 'The downstream request consumes exact published bytes; independently check its Skill inputs, current plan, authority and business Gate before execution.'
  };
}

const HELP = 'Usage: node workflows/agent-to-recipe/scripts/check-handoff.js --request <request.json> --handoff <handoff.json> [--consumer-request <downstream-request.json>] --root <id=directory> [--root <id=directory> ...]\\nRead-only host check; optional consumer-request proves normal downstream consumption of an exact published artifact. Roots come from the caller, never from evidenceRoots. Exit: 0 integrity pass, 1 check failed, 2 usage error.\\n'; roots come from the caller, never from evidenceRoots. Exit: 0 integrity pass, 1 check failed, 2 usage error.\n';
function main(argv) {
  if (argv.length === 1 && argv[0] === '--help') { process.stdout.write(HELP); return 0; }
  try {
    const options = { roots: [] };
    for (let i = 0; i < argv.length; i += 2) {
      const flag = argv[i], value = argv[i + 1];
      requireCheck(['--request', '--handoff', '--consumer-request', '--root'].includes(flag) && text(value)
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
    const report = options.consumerRequest ? checkHandoffConsumption(options) : checkHandoff(options);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return report.integrity === 'pass' ? 0 : 1;
  } catch (error) {
    process.stderr.write((error instanceof CheckError ? error.message : 'Invalid invocation.') + '\n' + HELP);
    return 2;
  }
}
if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { checkHandoff, checkHandoffConsumption, main };
