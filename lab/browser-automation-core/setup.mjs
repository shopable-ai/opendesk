import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { SOURCE, STATE, PRIVATE_INSTALL, SOCKET, EVIDENCE, HOST_NAME, ORIGIN, EXTENSION_ID, loadInstall } from './config.mjs';
import { CoreError } from './protocol.mjs';
import { inspectExtension } from './extension-installation.mjs';
import { buildNativeHost, verifyNativeBuild, shellQuote } from './native-build.mjs';
export { extensionIdentity } from './extension-installation.mjs';

function writePrivate(file, value) {
  const temporary = `${file}.new`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', {mode: 0o600});
  fs.chmodSync(temporary, 0o600); fs.renameSync(temporary, file);
}
export function setup(testMode = false) {
  if (process.platform !== 'darwin') throw new CoreError('SETUP_PLATFORM_UNSUPPORTED');
  const extension = inspectExtension();
  fs.mkdirSync(STATE, {recursive: true, mode: 0o700}); fs.chmodSync(STATE, 0o700);
  if (fs.existsSync(SOCKET) || fs.existsSync(path.join(STATE, 'broker.sock')) || fs.existsSync(path.join(STATE, 'broker.json'))) {
    throw new CoreError('STOP_BROKER_FIRST');
  }
  const nativeDirectory = path.join(os.homedir(), 'Library/Application Support/Google/Chrome/NativeMessagingHosts');
  fs.mkdirSync(nativeDirectory, {recursive: true});
  const nativeManifest = path.join(nativeDirectory, `${HOST_NAME}.json`);
  const wrapper = path.join(PRIVATE_INSTALL, 'native-host'), legacyWrapper = path.join(STATE, 'native-host');
  const native = {name: HOST_NAME, description: 'Browser Automation Core Demo',
    path: wrapper, type: 'stdio', allowed_origins: [ORIGIN]};
  if (fs.existsSync(nativeManifest)) {
    const current = JSON.parse(fs.readFileSync(nativeManifest));
    if (![wrapper, legacyWrapper].includes(current.path) || current.name !== HOST_NAME || current.type !== 'stdio' ||
        JSON.stringify(current.allowed_origins) !== JSON.stringify(native.allowed_origins)) {
      throw new CoreError('NATIVE_MANIFEST_CONFLICT');
    }
  }
  const installPath = path.join(STATE, 'install.json');
  const previous = fs.existsSync(installPath) ? loadInstall() : {};
  if (fs.existsSync(PRIVATE_INSTALL)) {
    const stat = fs.lstatSync(PRIVATE_INSTALL);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()) throw new CoreError('NATIVE_INSTALL_OWNER_MISMATCH');
    const existing = path.join(PRIVATE_INSTALL, 'install.json');
    if (fs.existsSync(existing) && JSON.parse(fs.readFileSync(existing)).sourceDirectory !== SOURCE) throw new CoreError('NATIVE_INSTALL_CONFLICT');
    if (!fs.existsSync(existing) && fs.readdirSync(PRIVATE_INSTALL).length) throw new CoreError('NATIVE_INSTALL_OWNER_UNVERIFIED');
  }
  if (Buffer.byteLength(SOCKET) >= 104) throw new CoreError('SOCKET_PATH_TOO_LONG');
  fs.mkdirSync(PRIVATE_INSTALL, {recursive: true, mode: 0o700}); fs.chmodSync(PRIVATE_INSTALL, 0o700);
  const stagingDirectory = path.join(EVIDENCE, `native-staging-${Date.now()}`);
  const build = buildNativeHost(stagingDirectory, PRIVATE_INSTALL);
  for (const name of [...build.files.map(item => item.name), 'native-build.json']) {
    const file = path.join(PRIVATE_INSTALL, name);
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new CoreError('NATIVE_INSTALL_SYMLINK');
    fs.copyFileSync(path.join(stagingDirectory, name), file); fs.chmodSync(file, name === 'native-host' ? 0o700 : 0o600);
  }
  verifyNativeBuild(PRIVATE_INSTALL);
  const install = {...previous, clientCredential: previous.clientCredential || crypto.randomBytes(32).toString('hex'),
    hostCredential: previous.hostCredential || crypto.randomBytes(32).toString('hex'),
    schemaVersion: 2, sourceDirectory: SOURCE, socketPath: SOCKET,
    diagnosticPath: path.join(STATE, 'native-host-status.json'), installedNativeDirectory: PRIVATE_INSTALL,
    nativeManifest, wrapper, extensionId: EXTENSION_ID, testMode, stagingDirectory};
  writePrivate(path.join(PRIVATE_INSTALL, 'install.json'), install);
  writePrivate(installPath, {kind: 'installed-native-pointer', sourceDirectory: SOURCE,
    installFile: path.join(PRIVATE_INSTALL, 'install.json')});
  fs.writeFileSync(nativeManifest, JSON.stringify(native, null, 2) + '\n', {mode: 0o600});
  return {extensionDirectory: extension.extensionDirectory, extensionId: EXTENSION_ID, extension,
    nativeManifest, installedNativeDirectory: PRIVATE_INSTALL, stagingDirectory, socketPath: SOCKET, testMode,
    credentialStorage: 'persistent private user install 0700 / 0600; no credentials in staging or workspace pointer'};
}
export function cleanupInstallation() {
  const install = loadInstall();
  if (fs.existsSync(SOCKET) || fs.existsSync(path.join(STATE, 'broker.sock')) || fs.existsSync(path.join(STATE, 'broker.json'))) throw new CoreError('STOP_BROKER_FIRST');
  let build;
  if (install.schemaVersion === 2) {
    if (install.installedNativeDirectory !== PRIVATE_INSTALL || install.sourceDirectory !== SOURCE) throw new CoreError('NATIVE_INSTALL_OWNER_MISMATCH');
    build = verifyNativeBuild(PRIVATE_INSTALL, {requireCurrentSource: false});
  }
  if (fs.existsSync(install.nativeManifest)) {
    const current = JSON.parse(fs.readFileSync(install.nativeManifest));
    if (current.path !== install.wrapper || JSON.stringify(current.allowed_origins) !== JSON.stringify([ORIGIN])) throw new CoreError('NATIVE_MANIFEST_CHANGED');
    fs.unlinkSync(install.nativeManifest);
  }
  if (build) {
    for (const name of [...build.files.map(item => item.name), 'native-build.json', 'install.json']) fs.unlinkSync(path.join(PRIVATE_INSTALL, name));
    if (!fs.readdirSync(PRIVATE_INSTALL).length) fs.rmdirSync(PRIVATE_INSTALL);
  }
  const legacyWrapper = path.join(STATE, 'native-host');
  if (fs.existsSync(legacyWrapper) && fs.readFileSync(legacyWrapper, 'utf8') ===
      `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(path.join(SOURCE, 'native-host.mjs'))} "$@"\n`) fs.unlinkSync(legacyWrapper);
  for (const name of ['install.json', 'broker.json', 'native-host-status.json']) {
    const file = path.join(STATE, name); if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  return {removedDemoNativeRegistration: true, preservedEvidence: true,
    manualStep: 'Remove Browser Automation Core Demo from Chrome extensions; other extensions unchanged'};
}
