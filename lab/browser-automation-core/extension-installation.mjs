import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { SOURCE, EXTENSION_ID } from './config.mjs';
import { CoreError } from './protocol.mjs';

export function extensionIdentity(key) {
  return [...crypto.createHash('sha256').update(Buffer.from(key, 'base64')).digest().subarray(0, 16)]
    .map(byte => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join('');
}
export function inspectExtension(directory = path.join(SOURCE, 'extension')) {
  const realDirectory = fs.realpathSync(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(realDirectory, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3 || !manifest.key || extensionIdentity(manifest.key) !== EXTENSION_ID) {
    throw new CoreError('EXTENSION_ID_MISMATCH');
  }
  const worker = manifest.background?.service_worker;
  if (typeof worker !== 'string') throw new CoreError('EXTENSION_WORKER_MISSING');
  const resources = ['manifest.json', worker, manifest.action?.default_popup, 'status.js', 'locator.js', 'content.js'].filter(Boolean);
  const files = [...new Set(resources)].map(name => {
    const file = path.resolve(realDirectory, name);
    if (!file.startsWith(realDirectory + path.sep) || !fs.statSync(file).isFile()) {
      throw new CoreError('EXTENSION_RESOURCE_INVALID');
    }
    const bytes = fs.readFileSync(file);
    if (name.endsWith('.js')) new vm.Script(bytes.toString('utf8'), {filename: file});
    return {name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
  });
  return {status: 'PASS', scope: 'filesystem/manifest/resources/syntax only; Chrome loading NOT_RUN',
    extensionDirectory: directory, realDirectory, extensionId: EXTENSION_ID,
    name: manifest.name, version: manifest.version, manifestVersion: manifest.manifest_version, worker, files};
}
