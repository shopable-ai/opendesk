import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SOURCE } from './config.mjs';
import { CoreError } from './protocol.mjs';

export const NATIVE_SOURCE_FILES = Object.freeze(['config.mjs', 'protocol.mjs', 'native-diagnostic.mjs',
  'native-host.mjs', 'installed-native-entry.mjs']);
export function shellQuote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
export function buildNativeHost(directory, targetDirectory = directory) {
  fs.mkdirSync(directory, {recursive: true, mode: 0o700}); fs.chmodSync(directory, 0o700);
  fs.accessSync(process.execPath, fs.constants.X_OK);
  for (const name of NATIVE_SOURCE_FILES) fs.writeFileSync(path.join(directory, name), fs.readFileSync(path.join(SOURCE, name)), {mode: 0o600});
  const wrapper = `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(path.join(targetDirectory, 'installed-native-entry.mjs'))} "$@"\n`;
  fs.writeFileSync(path.join(directory, 'native-host'), wrapper, {mode: 0o700}); fs.chmodSync(path.join(directory, 'native-host'), 0o700);
  const build = {format: 1, sourceDirectory: SOURCE, nodeExecutable: process.execPath,
    files: [...NATIVE_SOURCE_FILES, 'native-host'].map(name => ({name,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex')}))};
  fs.writeFileSync(path.join(directory, 'native-build.json'), JSON.stringify(build, null, 2) + '\n', {mode: 0o600});
  return build;
}
export function verifyNativeBuild(directory, {requireCurrentSource = true} = {}) {
  const build = JSON.parse(fs.readFileSync(path.join(directory, 'native-build.json'), 'utf8'));
  const required = [...NATIVE_SOURCE_FILES, 'native-host'];
  if (build.format !== 1 || build.sourceDirectory !== SOURCE || build.files?.length !== required.length ||
      new Set(build.files.map(item => item.name)).size !== required.length) throw new CoreError('NATIVE_BUILD_INVALID');
  const files = required.map(name => {
    const item = build.files.find(item => item.name === name), file = path.join(directory, name);
    if (!item || fs.lstatSync(file).isSymbolicLink() ||
        crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== item.sha256) throw new CoreError('NATIVE_BUILD_CHANGED');
    if (requireCurrentSource && name !== 'native-host' && crypto.createHash('sha256').update(fs.readFileSync(path.join(SOURCE, name))).digest('hex') !== item.sha256) {
      throw new CoreError('NATIVE_SOURCE_CHANGED');
    }
    return item;
  });
  return {status: 'PASS', sourceDirectory: build.sourceDirectory, nodeExecutable: build.nodeExecutable, files};
}
