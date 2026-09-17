// Native visual qualification for the production Flow Runner surface.
// Run from the repository root after ./scripts/build_macos_app.sh:
// ./dist/opendesk -script tests/runtime-api/flow-runner-native-macos.js -console-mode script
'use strict';

function assert(condition, message, details) {
  if (condition) return;
  throw new Error(message + (details === undefined ? '' : ': ' + JSON.stringify(details)));
}

function collectNames(node, names) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.name === 'string' && node.name) names.push(node.name);
  for (const child of Array.isArray(node.children) ? node.children : []) collectNames(child, names);
}

function windowIdentity(item) {
  return [item && item.pid, item && item.id, item && item.title, item && item.exePath].join('\u0000');
}

function observableWindow(item) {
  return {
    id: item && item.id,
    pid: item && item.pid,
    title: item && item.title,
    exeName: item && item.exeName,
    exePath: item && item.exePath,
    x: item && item.x,
    y: item && item.y,
    width: item && item.width,
    height: item && item.height,
  };
}

if (System.getPlatformInfo().os !== 'darwin') {
  console.log('[SKIP] Flow Runner native qualification requires macOS.');
} else {
  const appPath = File.join(Execution.workdir, 'dist', 'OpenDesk.app');
  const executablePath = File.join(appPath, 'Contents', 'MacOS', 'opendesk');
  const target = {path: appPath};
  const title = 'OpenDesk — 自动化';
  const evidenceDir = File.join(
    Execution.workdir, '.runtime', 'tests', 'flow-runner', 'native-macos',
    String(Date.now()) + '-' + Execution.id,
  );
  File.ensureDir(evidenceDir);
  assert(File.isFile(executablePath), 'current OpenDesk App bundle is missing', {appPath, executablePath});

  const currentPID = System.getPlatformInfo().processId;
  const initialWindows = window.list();
  const initialWindowIdentities = new Set(initialWindows.map(windowIdentity));
  const foreignProductProcesses = App.list().filter(item => item.pid !== currentPID
    && item.bundleId === 'com.opendesk.desktop'
    && item.path !== appPath);
  const foreignFlowRunnerWindows = initialWindows.filter(item => item
    && item.title === title
    && (typeof item.exePath !== 'string' || !item.exePath.startsWith(appPath + '/')));
  if (foreignProductProcesses.length || foreignFlowRunnerWindows.length) {
    const conflict = {
      schemaVersion: 1,
      status: 'blocked',
      reason: foreignProductProcesses.length
        ? 'another-opendesk-product-instance-is-running'
        : 'another-flow-runner-ui-host-is-running',
      expectedAppPath: appPath,
      processes: foreignProductProcesses,
      windows: foreignFlowRunnerWindows.map(observableWindow),
    };
    File.write(File.join(evidenceDir, 'blocked.json'), JSON.stringify(conflict, null, 2) + '\n');
    console.log('FLOW_RUNNER_NATIVE_MACOS_BLOCKED=' + JSON.stringify(conflict));
  } else {
    const requestedPID = Number(Execution.env.OPENDESK_FLOW_RUNNER_PID || 0);
    assert(!requestedPID || (Number.isInteger(requestedPID) && requestedPID > 0),
      'OPENDESK_FLOW_RUNNER_PID must be a positive integer when supplied', Execution.env.OPENDESK_FLOW_RUNNER_PID);
    const alreadyRunning = App.isRunning(target);
    let startedHere = false;
    try {
      const launched = requestedPID
        ? {pids: [requestedPID]}
        : await App.launch(target, {waitUntilReady: 'process', timeout: 30000, activate: true});
      startedHere = !requestedPID && !alreadyRunning;
      const pids = new Set(launched.pids);
      const deadline = Date.now() + 30000;
      let flowWindow = null;
      let observedWindows = initialWindows;
      while (!flowWindow && Date.now() < deadline) {
        observedWindows = window.list();
        const candidates = observedWindows.filter(item => {
          if (!item || item.title !== title) return false;
          if (pids.has(item.pid)) return true;
          if (alreadyRunning) return typeof item.exePath === 'string' && item.exePath.startsWith(appPath + '/');
          return !initialWindowIdentities.has(windowIdentity(item));
        });
        if (candidates.length === 1) flowWindow = candidates[0];
        else if (candidates.length > 1) {
          throw new Error('Flow Runner title is ambiguous: ' + JSON.stringify(candidates));
        } else {
          await System.delay(100);
        }
      }
      const observation = {
        title,
        launchedPids: launched.pids,
        initialWindows: initialWindows.map(observableWindow),
        observedWindows: observedWindows.map(observableWindow),
      };
      File.write(File.join(evidenceDir, 'window-observation.json'), JSON.stringify(observation, null, 2) + '\n');
      assert(flowWindow, 'Flow Runner window did not appear with the expected title', observation);
      assert(flowWindow.width > 0 && flowWindow.height > 0,
        'Flow Runner window has invalid bounds', flowWindow);
      if (typeof flowWindow.exePath === 'string' && flowWindow.exePath) {
        assert(flowWindow.exePath === executablePath || flowWindow.exePath.startsWith(appPath + '/'),
          'Flow Runner window was not loaded from the current App bundle', {appPath, actual: flowWindow.exePath});
      }

      const screenshot = await Screen.screenshot({
        clip: {x: flowWindow.x, y: flowWindow.y, width: flowWindow.width, height: flowWindow.height},
        path: File.join(evidenceDir, 'flow-runner.png'),
        returnType: 'object',
      });
      assert(screenshot && screenshot.sizeBytes > 100,
        'Flow Runner screenshot was not written', screenshot);

      const snapshot = await Accessibility.snapshot({
        within: flowWindow,
        timeout: 10000,
        maxDepth: 8,
        maxNodes: 1000,
        properties: ['role', 'name', 'identifier', 'enabled', 'bounds'],
      });
      const names = [];
      collectNames(snapshot.root, names);
      for (const label of ['运行', '停止', '上一个流程', '下一个流程', '流程列表']) {
        assert(names.includes(label), 'Flow Runner AX tree lacks required control', {label, names});
      }

      const result = {
        schemaVersion: 1,
        platform: 'darwin',
        appPath,
        executablePath,
        alreadyRunning,
        launchedPids: launched.pids,
        window: flowWindow,
        screenshot: {path: screenshot.path, sizeBytes: screenshot.sizeBytes, width: screenshot.width, height: screenshot.height},
        accessibility: {complete: snapshot.complete, truncated: snapshot.truncated, stats: snapshot.stats, names},
      };
      File.write(File.join(evidenceDir, 'result.json'), JSON.stringify(result, null, 2) + '\n');
      console.log('FLOW_RUNNER_NATIVE_MACOS_OK=' + JSON.stringify(result));
    } finally {
      if (startedHere && App.isRunning(target)) {
        await App.terminate(target, {timeout: 15000});
      }
    }
  }
}
