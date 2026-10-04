import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT, SOURCE, EVIDENCE, LIMITS } from './config.mjs';

export const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export function codeHash(file, name) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf(`function ${name}() {`), end = source.lastIndexOf('})();');
  if (start < 0 || end < start) throw Error('EXECUTABLE_PROVENANCE_MISSING');
  return hash(source.slice(start, end + 1));
}
export function sourceSnapshot() {
  const files = [];
  for (const directory of ['lab/browser-automation-core', 'tests/browser-automation-core']) {
    for (const name of fs.readdirSync(path.join(ROOT, directory), {recursive: true})) {
      const file = path.join(directory, name);
      if (/\.(mjs|js|json|html|md)$/.test(file) && fs.statSync(path.join(ROOT, file)).isFile()) files.push(file);
    }
  }
  files.push('docs/quality/browser-automation/core-demo-acceptance.json');
  const resources = files.sort().map(file => ({file, sha256: hash(fs.readFileSync(path.join(ROOT, file)))}));
  return {candidateId: hash(JSON.stringify(resources)), files: resources};
}
export function expectedLoaded() {
  return {workerCodeSha256: codeHash(path.join(SOURCE, 'extension/worker.js'), 'browserCoreWorker'),
    contentCodeSha256: codeHash(path.join(SOURCE, 'extension/content.js'), 'browserCoreContent'),
    locatorCodeSha256: codeHash(path.join(SOURCE, 'extension/locator.js'), 'browserCoreLocator'),
    resources: Object.fromEntries(['manifest.json', 'worker.js', 'locator.js', 'content.js'].map(name => [name, hash(fs.readFileSync(path.join(SOURCE, 'extension', name)))]))};
}
export function freezeCandidate() {
  const directory = path.join(EVIDENCE, `candidate-${Date.now()}`);
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const record = {...sourceSnapshot(), expectedLoaded: expectedLoaded(), nodeVersion: process.version, limits: LIMITS,
    frozenAt: new Date().toISOString(), gitSha: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim(),
    uncommitted: execFileSync('git', ['status', '--short'], {cwd: ROOT, encoding: 'utf8'}).trim().split('\n'),
    pushState: 'No commit or push authorized or performed', directory};
  const file = path.join(directory, 'candidate.json');
  fs.writeFileSync(file, JSON.stringify(record, null, 2), {mode: 0o600});
  fs.writeFileSync(path.join(EVIDENCE, 'candidate-current.json'), JSON.stringify({file}), {mode: 0o600});
  return record;
}
export function currentCandidate() {
  const pointer = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'candidate-current.json')));
  const candidate = JSON.parse(fs.readFileSync(pointer.file));
  if (candidate.candidateId !== sourceSnapshot().candidateId) throw Error('CANDIDATE_CHANGED');
  return candidate;
}
