'use strict';

// Coordinator accounting only. No dispatch, source evaluation, authority grant,
// Runtime API, desktop lock or stage verdict is implemented here.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { hash, makeRoots, resolveFile, readBytes, parseDocument, FILE_LIMIT, JSON_LIMIT,
  object, text, requireCheck: check } = require('./artifact-validation.js');

const RUNTIME = path.resolve(__dirname, '../../../.runtime');
const SLOT_KEYS = new Set(['modelRequests', 'executionAttempts', 'preflightRuns',
  'resetValidationRuns', 'businessDemonstrations', 'qualificationRuns',
  'legalVariationNewTasks', 'aggregateRepairAttempts']);
const RUN_KEYS = ['preflightRuns', 'resetValidationRuns', 'businessDemonstrations',
  'qualificationRuns', 'legalVariationNewTasks'];
const COUNTER_KEYS = new Set(['scopeElapsedMs', 'hostToolInvocations', 'publicApiCalls',
  'nativeInputs', ...SLOT_KEYS]);
const MAX_ATTEMPTS = 512;
const MAX_EVENTS = 2048;
const MAX_REFS = 128;
const same = (a, b) => canonical(a) === canonical(b);
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function bounded(value) {
  check(Buffer.byteLength(JSON.stringify(value)) <= 256 * 1024, 'SIZE_LIMIT', 'Ledger input exceeds 256 KiB limit.');
}
function id(value) { return text(value) && value.length <= 160 && !/[\x00-\x1f]/.test(value); }
function time(value) {
  check(typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value)
    && Number.isSafeInteger(Date.parse(value)), 'TIME', 'Use an absolute ISO timestamp.');
  return Date.parse(value);
}
function storage(root, create = false) {
  check(text(root) && path.isAbsolute(root), 'ROOT', 'Provide an explicit absolute ledger root.');
  const absolute = path.resolve(root);
  check(absolute.startsWith(RUNTIME + path.sep), 'ROOT', 'Ledger output must be inside repository .runtime/.');
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current)) check(!fs.lstatSync(current).isSymbolicLink(), 'SYMLINK', 'Ledger storage cannot use symlinks.');
  }
  if (create) fs.mkdirSync(absolute, { recursive: true });
  const file = path.join(absolute, 'scope-ledger.sqlite');
  if (fs.existsSync(file)) check(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(), 'ROOT', 'Ledger must be a regular file.');
  return file;
}
function counters(value, limits, complete = false) {
  check(object(value), 'COUNTERS', 'Provide scopeCounters as an object.');
  check(Object.keys(value).every(key => Object.hasOwn(limits, key)), 'COUNTERS', 'Unknown counter unit.');
  const result = {};
  for (const key of Object.keys(limits)) {
    check(!complete || Object.hasOwn(value, key), 'COUNTERS', 'Actual/initial counters must include every unit.');
    const count = Object.hasOwn(value, key) ? value[key] : 0;
    check(Number.isSafeInteger(count) && count >= 0 && count <= 1e12, 'COUNTERS', 'Counters must be nonnegative safe integers.');
    result[key] = count;
  }
  check(RUN_KEYS.reduce((sum, key) => sum + (result[key] || 0), 0) <= (result.executionAttempts || 0),
    'COUNTERS', 'Categorized run slots require their executionAttempt slots.');
  return result;
}
function refReader(entries) {
  const roots = makeRoots(entries);
  const budget = { bytes: 0 };
  let count = 0;
  return (ref, json = false) => {
    check(++count <= MAX_REFS && object(ref) && /^[a-f0-9]{64}$/.test(ref.sha256), 'REF', 'Provide bounded fixed file refs and SHA256.');
    const bytes = readBytes(resolveFile(roots, ref.rootId, ref.path), json ? JSON_LIMIT : FILE_LIMIT, budget);
    check(hash(bytes) === ref.sha256, 'HASH_DRIFT', 'Reference bytes differ: ' + ref.path);
    return json ? parseDocument(bytes) : null;
  };
}
function open(root, readOnly = false) {
  const file = storage(root);
  check(fs.existsSync(file), 'MISSING_LEDGER', 'Initialize an adopted current scope before reserve/settle/status.');
  const db = new DatabaseSync(file, { readOnly });
  db.exec('PRAGMA busy_timeout=5000;');
  if (!readOnly) db.exec('PRAGMA synchronous=FULL;');
  return db;
}
function load(db) {
  const row = db.prepare('SELECT body FROM scope WHERE singleton=1').get();
  check(row, 'MISSING_LEDGER', 'No initialized scope.');
  return JSON.parse(row.body);
}
function snapshot(db, config, now) {
  const rows = db.prepare('SELECT body FROM attempts ORDER BY rowid').all().map(row => JSON.parse(row.body));
  const used = { ...config.initialUsed };
  for (const attempt of rows) {
    for (const key of Object.keys(used)) {
      used[key] += attempt.charged[key];
      check(Number.isSafeInteger(used[key]), 'COUNTERS', 'Counter overflow.');
    }
  }
  // Wall time charges once across attempts and waits. Persisted high-water time
  // and a backwards-clock refusal prevent time credit on subsequent writes.
  used.scopeElapsedMs = Math.max(used.scopeElapsedMs, config.elapsedFloorMs,
    config.initialUsed.scopeElapsedMs + Math.max(now, config.highWaterMs) - config.startedMs);
  const overruns = rows.filter(row => row.actualCounters && Object.keys(used).some(key => row.actualCounters[key] > row.reserved[key]))
    .map(row => row.attemptId);
  const last = db.prepare('SELECT body,digest FROM events ORDER BY sequence DESC LIMIT 1').get();
  const remaining = Object.fromEntries(Object.keys(used).map(key => [key, config.limits[key] - used[key]]));
  return { scopeId: config.scopeId, root: config.root, deadline: config.deadline,
    limits: config.limits, units: config.units, scopeCounters: used, remaining,
    inFlight: rows.filter(row => ['reserved', 'unknown'].includes(row.state)).map(row => row.attemptId),
    attempts: rows, overruns, exhausted: Object.values(remaining).some(value => value < 0),
    deadlineReached: now >= time(config.deadline),
    lastReceipt: last ? { ...JSON.parse(last.body), sha256: last.digest } : null };
}
function append(db, config, kind, data) {
  const last = db.prepare('SELECT sequence, digest FROM events ORDER BY sequence DESC LIMIT 1').get();
  const sequence = Number(last?.sequence || 0) + 1;
  check(sequence <= MAX_EVENTS, 'LEDGER_BOUND', 'Scope event bound reached; stop, do not reset.');
  const receipt = { scopeId: config.scopeId, sequence, previousEventHash: last?.digest || null,
    kind, recordedAt: new Date().toISOString(), ...data };
  bounded(receipt);
  const digest = hash(Buffer.from(canonical(receipt)));
  db.prepare('INSERT INTO events(sequence,body,digest) VALUES(?,?,?)').run(sequence, JSON.stringify(receipt), digest);
  return { ...receipt, sha256: digest };
}
function transaction(root, action) {
  const db = open(root);
  try {
    db.exec('BEGIN IMMEDIATE');
    const config = load(db);
    const now = Date.now();
    check(now >= config.highWaterMs, 'CLOCK_ROLLBACK', 'Clock moved backwards; reconcile externally, never reset elapsed budget.');
    const result = action(db, config, now);
    const committedMs = Date.now();
    check(committedMs >= now, 'CLOCK_ROLLBACK', 'Clock moved backwards during the transaction.');
    if (result.kind === 'reserve') {
      check(committedMs < time(config.deadline), 'DEADLINE', 'Deadline reached before admission COMMIT.');
      check(!snapshot(db, config, committedMs).exhausted, 'BALANCE', 'Balance exhausted before admission COMMIT.');
    }
    config.highWaterMs = committedMs;
    db.prepare('UPDATE scope SET body=? WHERE singleton=1').run(JSON.stringify(config));
    db.exec('COMMIT'); // FULL synchronous rollback journal; only now return receipt.
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  } finally { db.close(); }
}

function init(options) {
  bounded(options);
  check(id(options.scopeId), 'SCOPE', 'Explicit current scopeId required.');
  check(object(options.limits) && Object.keys(options.limits).length >= 6
    && Object.keys(options.limits).every(key => COUNTER_KEYS.has(key)), 'COUNTERS', 'Use defined scope counter units only.');
  for (const key of ['scopeElapsedMs', 'hostToolInvocations', 'modelRequests', 'publicApiCalls', 'nativeInputs', 'executionAttempts']) {
    check(Object.hasOwn(options.limits, key), 'COUNTERS', 'Missing required unit: ' + key);
  }
  check(Object.values(options.limits).every(count => Number.isSafeInteger(count) && count >= 0 && count <= 1e12),
    'COUNTERS', 'Limits must be bounded nonnegative integers.');
  check(object(options.units) && same(Object.keys(options.units).sort(), Object.keys(options.limits).sort())
    && Object.values(options.units).every(text), 'UNITS', 'Explicit definitions required for all units.');
  const initialUsed = counters(options.initialUsed, options.limits, true);
  check(Object.keys(initialUsed).every(key => initialUsed[key] <= options.limits[key]), 'BALANCE', 'Initial consumption exceeds limits.');
  const now = Date.now();
  const deadlineMs = time(options.deadline);
  check(deadlineMs > now && deadlineMs - now <= options.limits.scopeElapsedMs - initialUsed.scopeElapsedMs,
    'DEADLINE', 'Deadline must fit the remaining elapsed envelope.');
  const root = path.resolve(options.root || '');
  storage(options.root);
  const read = refReader(options.roots);
  const proposal = read(options.proposalRef, true);
  check(proposal.scopeId === options.scopeId && object(proposal.proposedCeilings) && object(proposal.units), 'PROPOSAL', 'Current scope proposal required.');
  check(Object.keys(proposal.proposedCeilings).filter(key => COUNTER_KEYS.has(key))
    .every(key => Object.hasOwn(options.limits, key)), 'PROPOSAL', 'Do not omit proposal resource/slot ceilings.');
  for (const key of Object.keys(options.limits)) {
    check(Number.isSafeInteger(proposal.proposedCeilings[key]) && options.limits[key] <= proposal.proposedCeilings[key]
      && (Object.hasOwn(proposal.units, key) ? options.units[key] === proposal.units[key] : SLOT_KEYS.has(key)), 'PROPOSAL', 'Limits/units must come from the bound proposal.');
  }
  const envelope = proposal.balance?.chargedCurrentDiagnosticEnvelope;
  check(object(envelope) && Object.keys(envelope).every(key => Object.hasOwn(initialUsed, key)
    && initialUsed[key] >= envelope[key]), 'INITIAL_USED', 'Retain the proposal diagnostic envelope and host additions.');
  const adoption = read(options.adoptionRef, true);
  const binding = { scopeId: options.scopeId, root, roots: [...makeRoots(options.roots)],
    deadline: options.deadline, limits: options.limits, units: options.units, initialUsed,
    proposalRef: options.proposalRef };
  check(adoption.adopted === true && text(adoption.host) && text(adoption.authoritySource)
    && same(adoption.binding, binding), 'ADOPTION', 'Host adoption must bind this exact current scope envelope.');
  check(time(adoption.adoptedAt) <= now && deadlineMs > time(adoption.adoptedAt), 'ADOPTION', 'Adoption cannot be in the future.');
  const config = { ...binding, adoptionRef: options.adoptionRef, startedMs: time(adoption.adoptedAt), highWaterMs: now, elapsedFloorMs: initialUsed.scopeElapsedMs };
  check(deadlineMs - config.startedMs <= options.limits.scopeElapsedMs - initialUsed.scopeElapsedMs
    && now - config.startedMs + initialUsed.scopeElapsedMs < options.limits.scopeElapsedMs,
    'DEADLINE', 'Adopted scope already exhausted.');
  const file = storage(root, true);
  // Exclusive creation prevents accidentally reopening/resetting an old scope.
  fs.closeSync(fs.openSync(file, 'wx', 0o600));
  const db = new DatabaseSync(file);
  try {
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;'
      + 'CREATE TABLE scope(singleton INTEGER PRIMARY KEY CHECK(singleton=1),body TEXT NOT NULL);'
      + 'CREATE TABLE attempts(id TEXT PRIMARY KEY,body TEXT NOT NULL);'
      + 'CREATE TABLE events(sequence INTEGER PRIMARY KEY,body TEXT NOT NULL,digest TEXT NOT NULL);');
    db.prepare('INSERT INTO scope VALUES(1,?)').run(JSON.stringify(config));
    const receipt = append(db, config, 'init', { binding, adoptionRef: options.adoptionRef,
      historicalAdmission: 'Unknown; this ledger cannot establish past admission' });
    db.exec('COMMIT');
    return receipt;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    // Keep failed storage as evidence; never silently retry initialization.
    throw error;
  } finally { db.close(); }
}

function reserve(root, options) {
  bounded(options);
  return transaction(root, (db, config, now) => {
    check(options.scopeId === config.scopeId && id(options.attemptId), 'SCOPE', 'Current scope and unique attempt required.');
    check(!db.prepare('SELECT id FROM attempts WHERE id=?').get(options.attemptId), 'DUPLICATE_ATTEMPT', 'Use a new attempt after failure; never replay an old ID.');
    const before = snapshot(db, config, now);
    check(before.attempts.length < MAX_ATTEMPTS, 'LEDGER_BOUND', 'Scope attempt bound reached.');
    check(!before.deadlineReached && before.remaining.scopeElapsedMs > 0, 'DEADLINE', 'Scope deadline/elapsed budget reached.');
    check(before.overruns.length === 0, 'OVERRUN', 'An actual exceeded its reserved cap; stop dispatch and return to the host.');
    check(before.inFlight.length === 0, 'IN_FLIGHT', 'Reserved/unknown attempt remains; no further dispatch.');
    const reserved = counters(options.scopeCounters, config.limits);
    check(reserved.modelRequests + reserved.executionAttempts + reserved.hostToolInvocations > 0,
      'COUNTERS', 'Reserve the actual model/run/tool dispatch slots.');
    check(Object.keys(reserved).every(key => reserved[key] <= before.remaining[key]), 'BALANCE', 'Insufficient shared scope balance.');
    const read = refReader(config.roots);
    read(config.adoptionRef, true);
    const request = read(options.requestRef, true);
    check(request.schemaVersion === 'agent-to-recipe/v1' && request.attemptId === options.attemptId
      && id(request.taskId) && id(request.workPackageId) && text(request.skill)
      && object(request.budgets) && object(request.authority) && Array.isArray(request.inputRefs),
    'REQUEST', 'Bind an actual shared-contract invocation request.');
    const proposal = read(config.proposalRef, true);
    check(!proposal.taskId || request.taskId === proposal.taskId, 'REQUEST', 'Request task must match the scope proposal.');
    check(Array.isArray(options.objectRefs) && options.objectRefs.length > 0, 'REF', 'Bind actual dispatch inputs/methods/criteria via objectRefs.');
    check(request.inputRefs.every(ref => options.objectRefs.some(item => same(item, ref)))
      && (!request.contractRef || options.objectRefs.some(ref => same(ref, request.contractRef))),
    'REQUEST_BINDING', 'Every request input/contract must be in the actual object binding.');
    for (const ref of options.objectRefs) read(ref); // Data only, including JS refs.
    const owner = read(options.ownerEvidenceRef, true);
    check(text(options.owner) && owner.scopeId === config.scopeId && owner.attemptId === options.attemptId
      && owner.owner === options.owner && owner.terminal === true && owner.sideEffectState === 'known'
      && time(owner.observedAt) <= now && now - time(owner.observedAt) <= 60000
      && time(owner.observedAt) >= config.startedMs, 'OWNER', 'Fresh host owner/terminal evidence required.');
    check(Date.now() < time(config.deadline), 'DEADLINE', 'Deadline reached while validating bindings.');
    check(Object.keys(reserved).every(key => reserved[key] <= snapshot(db, config, Date.now()).remaining[key]),
      'BALANCE', 'Balance exhausted while validating bindings.');
    const attempt = { attemptId: options.attemptId, workPackageId: request.workPackageId,
      owner: options.owner, requestRef: options.requestRef, objectRefs: options.objectRefs,
      ownerEvidenceRef: options.ownerEvidenceRef, admittedMs: now, reserved, charged: reserved, actualCounters: null, state: 'reserved' };
    config.elapsedFloorMs = before.scopeCounters.scopeElapsedMs + reserved.scopeElapsedMs;
    db.prepare('INSERT INTO attempts(id,body) VALUES(?,?)').run(attempt.attemptId, JSON.stringify(attempt));
    const after = snapshot(db, config, now);
    const receipt = append(db, config, 'reserve', { ...attempt,
      usedBefore: before.scopeCounters, remainingBefore: before.remaining, inFlightBefore: before.inFlight,
      remainingAfterReservation: after.remaining });
    attempt.admissionSequence = receipt.sequence;
    db.prepare('UPDATE attempts SET body=? WHERE id=?').run(JSON.stringify(attempt), attempt.attemptId);
    return receipt;
  });
}

function settle(root, options) {
  bounded(options);
  return transaction(root, (db, config, now) => {
    check(options.scopeId === config.scopeId, 'SCOPE', 'Current scope required.');
    const row = db.prepare('SELECT body FROM attempts WHERE id=?').get(options.attemptId);
    check(row, 'ATTEMPT', 'No prior committed reservation; historical use cannot be admitted retroactively.');
    const attempt = JSON.parse(row.body);
    check(['reserved', 'unknown'].includes(attempt.state), 'SETTLED', 'Terminal attempt immutable; use a new attempt.');
    check(['success', 'failed', 'unknown'].includes(options.outcome), 'OUTCOME', 'Use success/failed/unknown.');
    const actual = counters(options.scopeCounters, config.limits, true);
    if (attempt.actualCounters) check(Object.keys(actual).every(key => actual[key] >= attempt.actualCounters[key]),
      'COUNTERS', 'Cumulative actuals cannot decrease during reconciliation.');
    const evidence = refReader(config.roots)(options.evidenceRef, true);
    check(evidence.scopeId === config.scopeId && evidence.attemptId === attempt.attemptId
      && evidence.admissionSequence === attempt.admissionSequence && evidence.owner === attempt.owner
      && evidence.outcome === options.outcome && same(evidence.scopeCounters, actual)
      && time(evidence.observedAt) >= attempt.admittedMs && time(evidence.observedAt) <= now
      && now - time(evidence.observedAt) <= 60000,
    'SETTLEMENT_BINDING', 'Host actuals must bind the committed receipt/owner.');
    check(options.outcome === 'unknown' || (evidence.terminal === true && evidence.sideEffectState === 'known'),
      'OWNER', 'Missing terminal or unknown side effects must settle as unknown.');
    const before = snapshot(db, config, now);
    // Conservative policy: no unused reservation refunds, even on success.
    // Actual excess is committed, never lost by rolling back an overrun.
    config.elapsedFloorMs = before.scopeCounters.scopeElapsedMs
      + Math.max(0, actual.scopeElapsedMs - attempt.charged.scopeElapsedMs);
    attempt.actualCounters = actual;
    attempt.charged = Object.fromEntries(Object.keys(actual).map(key => [key, Math.max(attempt.charged[key], actual[key])]));
    attempt.state = options.outcome;
    db.prepare('UPDATE attempts SET body=? WHERE id=?').run(JSON.stringify(attempt), attempt.attemptId);
    const after = snapshot(db, config, now);
    return append(db, config, 'settle', { attemptId: attempt.attemptId, admissionSequence: attempt.admissionSequence,
      outcome: options.outcome, evidenceRef: options.evidenceRef, actualCounters: actual,
      charged: attempt.charged, usedBefore: before.scopeCounters, remainingBefore: before.remaining,
      remainingAfter: after.remaining, inFlight: after.inFlight,
      overrun: Object.keys(actual).filter(key => actual[key] > attempt.reserved[key]), exhausted: after.exhausted });
  });
}
function status(root) {
  const db = open(root, true);
  try {
    db.exec('BEGIN');
    const config = load(db);
    const result = snapshot(db, config, Date.now());
    db.exec('COMMIT');
    return result;
  } finally { db.close(); }
}
function main(argv) {
  const [command, ...args] = argv;
  check(['init', 'reserve', 'settle', 'status'].includes(command), 'CLI', 'Use init/reserve/settle/status.');
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    check(['--root', '--data'].includes(args[i]) && text(args[i + 1]) && !Object.hasOwn(flags, args[i]), 'CLI', 'Use unique --root/--data flags.');
    flags[args[i]] = args[i + 1];
  }
  check(command === 'status' ? flags['--root'] && !flags['--data'] : flags['--data'], 'CLI', 'Mutations need --data; status needs only --root.');
  const data = command === 'status' ? null : parseDocument(readBytes(path.resolve(flags['--data']), JSON_LIMIT, { bytes: 0 }));
  const root = flags['--root'] || data?.root;
  const result = command === 'init' ? init({ ...data, ...(flags['--root'] ? { root: path.resolve(root) } : {}) })
    : command === 'status' ? status(path.resolve(root))
      : ({ reserve, settle })[command](path.resolve(root), data);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(JSON.stringify({ code: error.code || 'BUDGET_ERROR', message: error.message }) + '\n');
    process.exitCode = 2;
  }
}
module.exports = { init, reserve, settle, status };
