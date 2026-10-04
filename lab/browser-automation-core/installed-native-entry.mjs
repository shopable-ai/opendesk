import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Installed entry for the SAME native implementation. Validate its frozen payload before import.
const directory = path.dirname(fileURLToPath(import.meta.url));
let recordStage = () => {};
try {
  const build = JSON.parse(fs.readFileSync(path.join(directory, 'native-build.json'), 'utf8'));
  const required = ['config.mjs', 'protocol.mjs', 'native-diagnostic.mjs', 'native-host.mjs', 'installed-native-entry.mjs', 'native-host'];
  if (build.format !== 1 || build.files?.length !== required.length ||
      new Set(build.files.map(item => item.name)).size !== required.length) throw Object.assign(new Error(), {code: 'NATIVE_BUILD_INVALID'});
  for (const name of required) {
    const item = build.files.find(item => item.name === name);
    const file = path.join(directory, name);
    if (!item || fs.lstatSync(file).isSymbolicLink() ||
        crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== item.sha256) {
      throw Object.assign(new Error(), {code: 'NATIVE_BUILD_CHANGED'});
    }
  }
  const install = JSON.parse(fs.readFileSync(path.join(directory, 'install.json'), 'utf8'));
  if (install.sourceDirectory !== build.sourceDirectory || !path.isAbsolute(install.socketPath) ||
      typeof install.diagnosticPath !== 'string' || !path.isAbsolute(install.diagnosticPath) ||
      typeof install.hostCredential !== 'string' || install.hostCredential.length !== 64) {
    throw Object.assign(new Error(), {code: 'NATIVE_INSTALL_INVALID'});
  }
  const { nativeDiagnostic } = await import('./native-diagnostic.mjs');
  recordStage = nativeDiagnostic(install.diagnosticPath, {
    source: 'installed Native Host; verify parent identity separately', hostPid: process.pid, parentPid: process.ppid,
    sourceDirectory: build.sourceDirectory,
  });
  const { runNativeHost } = await import('./native-host.mjs');
  runNativeHost({socketPath: install.socketPath, install, origin: process.argv[2], onStage: recordStage,
    build: {sourceDirectory: build.sourceDirectory, files: build.files}});
} catch (error) {
  recordStage('STARTUP_FAILED', error.code || 'NATIVE_STARTUP_FAILED');
  // stdout is reserved for the Native Messaging protocol. No stack, input or credentials.
  process.exitCode = 1;
}
