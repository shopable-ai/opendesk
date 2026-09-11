#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SHA256 = /^[a-f0-9]{64}$/;
const RECORDING_ID = /^rec-[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ACTIONS_FILE = /^actions(?:\.r\d{3})?\.json$/;

function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assert(condition, code, message) {
  if (!condition) throw failure(code, message);
}

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readRegular(filePath, label) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (_) {
    throw failure('FILE_UNREADABLE', `${label} is missing or unreadable`);
  }
  assert(stat.isFile() && !stat.isSymbolicLink(), 'INVALID_FILE', `${label} must be a regular file`);
  return fs.readFileSync(filePath);
}

function assertDirectory(directoryPath, label) {
  let stat;
  try {
    stat = fs.lstatSync(directoryPath);
  } catch (_) {
    throw failure('FILE_UNREADABLE', `${label} is missing or unreadable`);
  }
  assert(stat.isDirectory() && !stat.isSymbolicLink(),
    'INVALID_DIRECTORY', `${label} must be a real directory, not a symbolic link`);
}

function parseJSON(bytes, label) {
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    assert(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_JSON', `${label} must contain an object`);
    return value;
  } catch (error) {
    if (error && error.code) throw error;
    throw failure('INVALID_JSON', `${label} is not valid JSON`);
  }
}

function embeddedBasename(value, label) {
  const text = typeof value === 'string' ? value : '';
  assert(text && !/[\x00-\x1f\x7f]/.test(text), 'INVALID_REFERENCE', `${label} is invalid`);
  return text.replace(/\\/g, '/').split('/').pop();
}

function relative(repoRoot, filePath) {
  return './' + path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function resolveScript(repoRoot, input) {
  assert(typeof input === 'string' && input.length > 0, 'INVALID_ARGUMENT', 'scriptFile is required');
  assert(!/[\x00-\x1f\x7f`]/.test(input), 'INVALID_ARGUMENT', 'scriptFile contains unsafe characters');
  const normalizedInput = input.replace(/\\/g, path.sep);
  const scriptPath = path.resolve(repoRoot, normalizedInput);
  const rel = path.relative(repoRoot, scriptPath);
  assert(rel && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel),
    'PATH_OUTSIDE_REPOSITORY', 'scriptFile must stay within the current repository');
  const parts = rel.split(path.sep);
  assert(parts.length === 5 && parts[0] === '.runtime' && parts[1] === 'recordings'
    && RECORDING_ID.test(parts[2]) && parts[3] === 'generated' && parts[4].endsWith('.js'),
  'INVALID_SCRIPT_PATH', 'scriptFile must be a generated JavaScript inside one Recorder package');
  const recordingDir = path.dirname(path.dirname(scriptPath));
  for (const [directoryPath, label] of [
    [path.join(repoRoot, '.runtime'), 'runtime directory'],
    [path.join(repoRoot, '.runtime', 'recordings'), 'recordings directory'],
    [recordingDir, 'recording directory'],
    [path.dirname(scriptPath), 'generated directory'],
  ]) {
    assertDirectory(directoryPath, label);
  }
  return {scriptPath, recordingDir, recordingId: parts[2]};
}

function candidateName(scriptName) {
  const base = scriptName.slice(0, -3);
  return (base.endsWith('.recipe') ? base.slice(0, -7) : base) + '.candidate.json';
}

function inspectBundle(scriptInput, options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const {scriptPath, recordingDir, recordingId} = resolveScript(repoRoot, scriptInput);
  const scriptBytes = readRegular(scriptPath, 'scriptFile');
  const scriptSha256 = hash(scriptBytes);

  const candidatePath = path.join(path.dirname(scriptPath), candidateName(path.basename(scriptPath)));
  const candidateBytes = readRegular(candidatePath, 'candidateFile');
  const candidate = parseJSON(candidateBytes, 'candidateFile');
  assert((candidate.formatVersion === 'opendesk.recorder.basic-candidate/v3'
      || candidate.formatVersion === 'opendesk.recorder.basic-candidate/v4')
    && candidate.mode === 'basic' && candidate.recordingId === recordingId,
  'CANDIDATE_IDENTITY_MISMATCH', 'candidate identity does not match the script package');
  if (candidate.formatVersion === 'opendesk.recorder.basic-candidate/v4') {
    assert(candidate.pointerMotion === 'instant' || candidate.pointerMotion === 'smooth',
      'INVALID_CANDIDATE', 'candidate pointer motion policy is invalid');
  }
  assert(candidate.script && SHA256.test(String(candidate.script.sha256 || '')),
    'INVALID_CANDIDATE', 'candidate script reference is invalid');
  assert(embeddedBasename(candidate.script.file, 'candidate.script.file') === path.basename(scriptPath),
    'SCRIPT_REFERENCE_MISMATCH', 'candidate refers to a different script filename');
  assert(candidate.script.sha256 === scriptSha256,
    'SCRIPT_HASH_MISMATCH', 'actual script bytes do not match the candidate hash');

  assert(candidate.actions && SHA256.test(String(candidate.actions.sha256 || ''))
    && Number.isInteger(candidate.actions.revision) && candidate.actions.revision > 0,
  'INVALID_CANDIDATE', 'candidate actions reference is invalid');
  const actionsName = embeddedBasename(candidate.actions.file, 'candidate.actions.file');
  assert(ACTIONS_FILE.test(actionsName), 'INVALID_ACTIONS_REFERENCE', 'candidate actions filename is not allowed');
  const actionsPath = path.join(recordingDir, actionsName);
  const actionsBytes = readRegular(actionsPath, 'actionsFile');
  assert(hash(actionsBytes) === candidate.actions.sha256,
    'ACTIONS_HASH_MISMATCH', 'actual actions bytes do not match the candidate hash');
  const actions = parseJSON(actionsBytes, 'actionsFile');
  assert(actions.formatVersion === 'opendesk.recorder.actions/v2'
    && actions.recordingId === recordingId && actions.revision === candidate.actions.revision,
  'ACTIONS_IDENTITY_MISMATCH', 'actions identity or revision does not match the candidate');
  assert(actions.readiness === 'ready', 'ACTIONS_NOT_READY', 'actions readiness must be ready');

  assert(actions.raw && actions.raw.file === 'raw/events.ndjson'
    && SHA256.test(String(actions.raw.sha256 || ''))
    && Number.isInteger(actions.raw.bytes) && actions.raw.bytes >= 0,
  'INVALID_RAW_REFERENCE', 'actions raw reference is invalid');
  const rawDir = path.join(recordingDir, 'raw');
  assertDirectory(rawDir, 'raw directory');
  const rawPath = path.join(rawDir, 'events.ndjson');
  const rawBytes = readRegular(rawPath, 'rawFile');
  assert(rawBytes.length === actions.raw.bytes && hash(rawBytes) === actions.raw.sha256,
    'RAW_MISMATCH', 'actual raw bytes do not match actions');

  const manifestPath = path.join(recordingDir, 'manifest.json');
  const manifestBytes = readRegular(manifestPath, 'manifestFile');
  const manifest = parseJSON(manifestBytes, 'manifestFile');
  assert(manifest.recordingId === recordingId && manifest.storage && manifest.storage.state === 'saved'
    && manifest.storage.rawFile === 'raw/events.ndjson'
    && manifest.storage.rawBytes === rawBytes.length
    && manifest.storage.rawSha256 === actions.raw.sha256,
  'MANIFEST_MISMATCH', 'manifest does not match the fixed raw source');

  const actionIds = Array.isArray(actions.actions)
    ? actions.actions.map(action => action && action.id) : [];
  assert(actionIds.length > 0 && actionIds.every(id => typeof id === 'string' && id.length > 0)
    && new Set(actionIds).size === actionIds.length,
  'INVALID_ACTION_IDS', 'actions must contain unique non-empty IDs');
  const mappings = Array.isArray(candidate.mappings) ? candidate.mappings : [];
  const mappingIds = mappings.map(mapping => mapping && mapping.actionId);
  assert(mappingIds.length === actionIds.length
    && mappingIds.every((id, index) => id === actionIds[index]),
  'ACTION_MAPPING_MISMATCH', 'candidate mappings do not cover actions exactly once in order');
  const scriptLineCount = scriptBytes.toString('utf8').split(/\r?\n/).length;
  assert(mappings.every((mapping, index) => Number.isInteger(mapping.line)
    && mapping.line > 0 && mapping.line <= scriptLineCount
    && (index === 0 || mapping.line > mappings[index - 1].line)),
  'ACTION_MAPPING_MISMATCH', 'candidate mapping lines must be positive, ordered, and inside the source script');

  return {
    valid: true,
    recordingId,
    script: {file: relative(repoRoot, scriptPath), sha256: scriptSha256},
    candidate: {file: relative(repoRoot, candidatePath), sha256: hash(candidateBytes)},
    actions: {
      file: relative(repoRoot, actionsPath), sha256: candidate.actions.sha256,
      revision: actions.revision, readiness: actions.readiness, actionIds,
    },
    manifest: {file: relative(repoRoot, manifestPath), sha256: hash(manifestBytes)},
    raw: {file: relative(repoRoot, rawPath), sha256: actions.raw.sha256, bytes: rawBytes.length},
  };
}

if (require.main === module) {
  try {
    const result = inspectBundle(process.argv[2]);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(JSON.stringify({
      valid: false,
      code: error && error.code ? error.code : 'INSPECTION_FAILED',
      message: error && error.message ? error.message : String(error),
    }) + '\n');
    process.exitCode = 1;
  }
}

module.exports = {inspectBundle};
