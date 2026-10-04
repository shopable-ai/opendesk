import fs from 'node:fs';
import path from 'node:path';
import { inspectExtension } from './extension-installation.mjs';
import { STATE, PRIVATE_INSTALL, SOCKET, SOURCE, ORIGIN, HOST_NAME, loadInstall } from './config.mjs';
import { verifyNativeBuild } from './native-build.mjs';

export function installationReport() {
  const extension = inspectExtension();
  let nativeHost;
  try {
    const install = loadInstall();
    const manifest = JSON.parse(fs.readFileSync(install.nativeManifest, 'utf8'));
    const wrapper = fs.readFileSync(install.wrapper, 'utf8');
    const build = verifyNativeBuild(PRIVATE_INSTALL);
    const checks = {
      name: manifest.name === HOST_NAME, path: manifest.path === install.wrapper,
      type: manifest.type === 'stdio', allowedOrigins: JSON.stringify(manifest.allowed_origins) === JSON.stringify([ORIGIN]),
      wrapperExecutable: !!(fs.statSync(install.wrapper).mode & 0o100),
      nodeExecutable: wrapper.includes(process.execPath) && fs.existsSync(process.execPath),
      privateDirectory: (fs.statSync(PRIVATE_INSTALL).mode & 0o777) === 0o700,
      privateCredentialFile: (fs.statSync(path.join(PRIVATE_INSTALL, 'install.json')).mode & 0o777) === 0o600,
      workspacePointerPrivate: (fs.statSync(path.join(STATE, 'install.json')).mode & 0o777) === 0o600,
      installedEntry: wrapper.includes(path.join(PRIVATE_INSTALL, 'installed-native-entry.mjs')),
      currentSourceSnapshot: build.status === 'PASS' && install.sourceDirectory === SOURCE,
      socketBinding: install.socketPath === SOCKET,
    };
    nativeHost = {status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
      scope: 'registration/filesystem only; actual Chrome spawn not implied',
      nativeManifest: install.nativeManifest, wrapper: install.wrapper, testMode: install.testMode, checks,
      installedNativeDirectory: PRIVATE_INSTALL, stagingDirectory: install.stagingDirectory, socketPath: SOCKET, build};
  } catch (error) { nativeHost = {status: 'FAIL', errorCode: error.code || 'INSTALLATION_INVALID'}; }
  let nativeDiagnostic = null;
  try { nativeDiagnostic = JSON.parse(fs.readFileSync(path.join(STATE, 'native-host-status.json'), 'utf8')); } catch {}
  return {status: nativeHost.status, extension, nativeHost, nativeDiagnostic,
    liveLoading: 'NOT_RUN: only doctor/verify-a with real Chrome provenance can confirm loading',
    diagnosticStep: 'Chrome: Browser Automation Core Demo → toolbar action → Connection status. Native errors appear there after reloading this version.'};
}
