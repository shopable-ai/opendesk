'use strict';

// Shared, read-only file and reference primitives for authoring checks. These
// helpers prove byte identity inside caller-approved roots; callers still own
// every business or stage-specific semantic decision.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');

const SCHEMA = 'agent-to-recipe/v1';
const JSON_LIMIT = 4 * 1024 * 1024;
const FILE_LIMIT = 64 * 1024 * 1024;
const TOTAL_LIMIT = 256 * 1024 * 1024;
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
  requireCheck(text(filename), 'FILE_REQUIRED', 'Every input artifact path is required.');
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
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)
    | (fs.constants.O_NONBLOCK || 0));
  try {
    const before = fs.fstatSync(fd);
    requireCheck(before.isFile(), 'NOT_FILE', 'References must point to regular files.');
    requireCheck(before.size <= limit && budget.bytes + before.size <= TOTAL_LIMIT,
      'SIZE_LIMIT', 'The bounded integrity-check read budget was exceeded.');
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

function parseJson(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new CheckError('INVALID_JSON', 'Expected complete UTF-8 JSON.'); }
}

function parseDocument(bytes) {
  const parsed = parseJson(bytes);
  requireCheck(object(parsed), 'INVALID_DOCUMENT', 'The document must be a JSON object.');
  return parsed;
}

module.exports = {
  SCHEMA, JSON_LIMIT, FILE_LIMIT, TOTAL_LIMIT, own, object, text, hash,
  CheckError, requireCheck, relativeParts, makeRoots, resolveFile, entryFile,
  readBytes, parseJson, parseDocument,
};
