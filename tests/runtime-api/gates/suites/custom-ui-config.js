// custom-ui-config: suite implementation loaded by catalog-runner.js; not a standalone entry.
// Runtime assertions remain in their existing tests/runtime-api files.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, RUN_DIR, BINARY, fail, writeJSON, generate, executeProcess } = context;

async function customUIConfig() {
  const root = File.join(RUN_DIR, 'custom-ui-config-cli');
  const source = File.join(ROOT_DIR, 'tests', 'runtime-api', 'custom-ui-config.js');
  const scriptDir = File.join(root, 'script-adjacent');
  const emptyDir = File.join(root, 'default-disabled');
  const tmSourceDir = File.join(root, 'tm-source');
  const tmWorkDir = File.join(root, 'tm-work');
  const configDir = File.join(root, 'configs');
  for (const path of [scriptDir, emptyDir, tmSourceDir, tmWorkDir, configDir]) File.ensureDir(path);
  const enabled = { schemaVersion: 1, runtime: { capabilities: ['ui'] } };
  const disabled = { schemaVersion: 1, runtime: { capabilities: [] } };
  await writeJSON(File.join(scriptDir, 'clawdesk.runtime.json'), enabled);
  await writeJSON(File.join(tmSourceDir, 'clawdesk.runtime.json'), disabled);
  await writeJSON(File.join(tmWorkDir, 'clawdesk.runtime.json'), enabled);
  await writeJSON(File.join(configDir, 'disabled.json'), disabled);
  await writeJSON(File.join(configDir, 'invalid-host-path.json'), { schemaVersion: 1, runtime: { capabilities: ['ui'], hostPath: '/tmp/untrusted' } });
  await writeJSON(File.join(configDir, 'unknown-capability.json'), { schemaVersion: 1, runtime: { capabilities: ['mouse'] } });

  async function success(gate, workdir, script, expectedEnabled, activationSource, prefixArgs = []) {
    const extra = File.join(root, `${gate}.expectation.json`);
    await writeJSON(extra, {
      enabled: expectedEnabled,
      activationSource,
      executionActivationSource: activationSource,
      floatingWindowDefined: expectedEnabled,
    });
    await generate(source, script, extra);
    const result = await executeProcess(gate, BINARY, [
      ...prefixArgs, '-script', script, '-console-mode', 'script', '-timeout', '2',
      '-log-dir', File.join(RUN_DIR, 'runtime-logs', gate),
    ], {
      cwd: workdir,
      deadlineSeconds: 60,
      stdoutPath: File.join(root, `${gate}.stdout.log`),
      stderrPath: File.join(root, `${gate}.stderr.log`),
      display: false,
    });
    File.write(File.join(root, `${gate}.exit-status`), `${result.exitCode}\n`);
    if (result.exitCode !== 0 || !result.stdout.includes('CUSTOM_UI_CONFIG_OK=')) {
      fail(`Custom UI CLI case ${gate} failed with status ${result.exitCode}: ${result.stderr || result.stdout}`);
    }
  }

  async function errorCase(gate, configPath, expectedCode, http = false) {
    const script = File.join(root, `${gate}.js`);
    if (!http) File.write(script, File.read(source));
    const args = http
      ? ['-http', '-port', '0', '-config', configPath, '-console-mode', 'script']
      : ['-config', configPath, '-script', script, '-console-mode', 'script', '-timeout', '2', '-log-dir', File.join(RUN_DIR, 'runtime-logs', gate)];
    const result = await executeProcess(gate, BINARY, args, {
      deadlineSeconds: 60,
      stdoutPath: File.join(root, `${gate}.stdout.log`),
      stderrPath: File.join(root, `${gate}.stderr.log`),
      display: false,
    });
    File.write(File.join(root, `${gate}.exit-status`), `${result.exitCode}\n`);
    if (result.exitCode === 0 || result.exitCode === 124 || !(result.stdout + result.stderr).includes(expectedCode)) {
      fail(`Custom UI CLI error case ${gate} did not expose ${expectedCode} (status ${result.exitCode})`);
    }
  }

  await success('custom-ui-config-script-adjacent', ROOT_DIR, File.join(scriptDir, 'task.js'), true, 'projectConfig');
  await success('custom-ui-config-default-disabled', ROOT_DIR, File.join(emptyDir, 'task.js'), false, 'disabled');
  await success('custom-ui-config-explicit-over-auto', ROOT_DIR, File.join(scriptDir, 'explicit.js'), false, 'disabled', ['-config', File.join(configDir, 'disabled.json')]);
  await success('custom-ui-config-cli-over-missing', ROOT_DIR, File.join(scriptDir, 'cli.js'), true, 'cli', ['-ui', '-config', File.join(configDir, 'does-not-exist.json')]);
  await success('custom-ui-config-no-ui-wins', ROOT_DIR, File.join(scriptDir, 'no-ui.js'), false, 'disabled', ['-no-ui', '-ui', '-config', File.join(scriptDir, 'clawdesk.runtime.json')]);
  await success('custom-ui-config-working-directory', tmWorkDir, File.join(tmSourceDir, 'tm.config.js'), true, 'projectConfig');
  await errorCase('custom-ui-config-invalid-host-path', File.join(configDir, 'invalid-host-path.json'), 'RUNTIME_CONFIG_INVALID');
  await errorCase('custom-ui-config-unknown-capability', File.join(configDir, 'unknown-capability.json'), 'RUNTIME_CONFIG_UNSUPPORTED');
  await errorCase('custom-ui-config-explicit-missing', File.join(configDir, 'does-not-exist.json'), 'RUNTIME_CONFIG_NOT_FOUND');
  await errorCase('custom-ui-config-http-invalid', File.join(configDir, 'invalid-host-path.json'), 'RUNTIME_CONFIG_INVALID', true);
  console.log('[RUNTIME-API-CUSTOM-UI-CONFIG] CLI priority and strict errors passed');
}

return Object.freeze({ customUIConfig });
})
