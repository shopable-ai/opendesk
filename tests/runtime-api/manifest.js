// Versioned, machine-readable Runtime API catalog source. The conformance run
// serializes this exact expanded catalog as catalog.snapshot.json and fingerprints
// it; no fixed method count is used as a pass condition.

globalThis.RuntimeAPIObjects = {
  page: { docs: 'docs-user-api/page.md', types: 'types/page.d.ts', source: 'automation/page.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: [
    'screenshot', 'captureScreen', 'goto', 'openURL', 'openApp', 'openURLInApp', 'title', 'url',
    'waitFor', 'waitForTimeout', 'waitForNavigation', 'waitForFunction', 'waitForAll',
    'checkPermissions', 'requestPermissions', 'ensurePermissions', 'ensureMacPermissions',
    'checkScreenshotPermissions', 'openMacOSPrivacySettings', 'requestMacPermissions',
    'requestMacAutomationPermission', 'browser', 'context',
  ] },
  mouse: { docs: 'docs-user-api/input.md', types: 'types/mouse.d.ts', source: 'automation/mouse.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: ['click', 'clickForPID', 'move', 'down', 'up', 'getPos', 'wheel'] },
  keyboard: { docs: 'docs-user-api/input.md', types: 'types/keyboard.d.ts', source: 'automation/keyboard.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: ['type', 'press', 'down', 'up', 'combination'] },
  touchscreen: { docs: 'docs-user-api/input.md', types: 'types/touchscreen.d.ts', source: 'automation/touchscreen.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: ['tap'] },
  window: { docs: 'docs-user-api/window.md', types: 'types/window.d.ts', source: 'automation/window_manager.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: [
    'getActiveWindow', 'getWindowByTitle', 'getFocusWindow', 'focus', 'setWindowBounds',
    'setWidth', 'setHeight', 'maximize', 'minimize', 'restore', 'restoreByPID',
    'minimizeByPID', 'maximizeByPID', 'closeWindow', 'closeActiveWindow', 'kill',
    'title', 'getTitle', 'content', 'getContent', 'list', 'setAlwaysOnTop',
    'unsetTopMost', 'bringToTop', 'js_beautify',
  ] },
  Screen: { docs: 'docs-user-api/screen.md', types: 'types/Screen.d.ts', source: 'automation/screen.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: [
    'getWidth', 'getHeight', 'getDisplays', 'getPrimaryDisplay', 'getDisplay',
    'getVirtualBounds', 'pixel', 'pixels', 'screenshot',
  ] },
  System: { docs: 'docs-user-api/system.md', types: 'types/System.d.ts', source: 'automation/system.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: [
    'getSystemInfo', 'getProcessList', 'killProcess', 'getNetworkInterfaces',
    'getNetworkConnections', 'getPowerInfo', 'shutdown', 'restart', 'sleep',
    'getDirectoryContents', 'getExecutablePath', 'getWorkingDirectory', 'getUserInfo',
    'isAdministrator', 'getSystemMetrics', 'getFingerprint', 'toJSON',
  ] },
  File: { docs: 'docs-user-api/file.md', types: 'types/File.d.ts', source: 'automation/file.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: [
    'path', 'cwd', 'create', 'createIfNotExists', 'createWithDirs', 'exists', 'ensureDir',
    'read', 'readBytes', 'write', 'append', 'writeBytes', 'appendBytes', 'copy',
    'renameWithoutExtension', 'rename', 'move', 'getExtension', 'getName',
    'getNameWithoutExtension', 'remove', 'removeDir', 'listDir', 'isFile', 'isDir',
    'isEmptyDir', 'getHumanReadableSize', 'getSimplifiedPath', 'join', 'open',
  ] },
  AppStorage: { docs: 'docs-user-api/storage.md', types: 'types/AppStorage.d.ts', source: 'automation/storage.go', status: 'secondary', platforms: ['darwin', 'linux', 'windows'], methods: ['getItem', 'setItem', 'removeItem', 'clear', 'getLength', 'key'] },
  clipboard: { docs: 'docs-user-api/clipboard-console.md', types: 'types/clipboard.d.ts', source: 'automation/clipboard.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: ['copy', 'paste', 'clear'] },
  console: { docs: 'docs-user-api/clipboard-console.md', types: 'types/console.d.ts', source: 'automation/console.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: [
    'log', 'info', 'warn', 'error', 'debug', 'table', 'group', 'groupEnd', 'time',
    'timeEnd', 'clear',
  ] },
  http: { docs: 'docs-user-api/http.md', types: 'types/http.d.ts', source: 'automation/http.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: ['request', 'get', 'post'] },
  axios: { docs: 'docs-user-api/http.md', types: 'types/axios.d.ts', source: 'polyfills/004-axios.js', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: ['request', 'get', 'post', 'put', 'delete', 'patch'] },
  OCR: { docs: 'docs-user-api/vision.md', types: 'types/Vision.d.ts', source: 'automation/ocr.go', status: 'secondary', platforms: ['darwin', 'linux', 'windows'], methods: ['extractText'] },
  Vision: { docs: 'docs-user-api/vision.md', types: 'types/Vision.d.ts', source: 'automation/vision.go', status: 'secondary', platforms: ['darwin', 'linux', 'windows'], methods: ['runOCR', 'detectUI', 'getCapabilities', 'analyzeLayout', 'annotateRegions'] },
  ImageColor: { docs: 'docs-user-api/image-color.md', types: 'types/ImageColor.d.ts', source: 'automation/imageColor.go', status: 'secondary', platforms: ['darwin', 'linux', 'windows'], methods: [
    'findPos', 'loadBase64', 'resize', 'clip', 'pixel', 'findColor', 'findColorBlocks',
    'hasColor', 'isGray', 'getSize', 'save', 'findRedChannel', 'findGreenChannel',
    'findBlueChannel', 'toRGB', 'toRGBA', 'toHSL', 'toHSLA', 'isColorSimilar', 'analyzeLayout',
  ] },
  Sound: { docs: 'docs-user-api/runtime-utilities.md', types: 'types/Sound.d.ts', source: 'automation/sound.go', status: 'secondary', platforms: ['darwin', 'linux', 'windows'], methods: ['playSuccess', 'playFail', 'playWarning', 'playError', 'playCaptcha', 'playSound', 'play'] },
  FloatingWindow: { docs: 'docs-user-api/runtime-utilities.md', types: 'types/FloatingWindow.d.ts', source: 'automation/floating_window.go', status: 'conditional-experimental', platforms: ['darwin', 'linux', 'windows'], optional: true, methods: ['addButton', 'removeButton', 'show', 'hide', 'setPosition', 'onButtonClick', 'setAlwaysOnTop', 'run'] },
  browser: { docs: 'docs-user-api/runtime.md', types: 'types/browser.d.ts', source: 'automation/browser.go', status: 'compatibility', platforms: ['darwin', 'linux', 'windows'], methods: ['newPage', 'newContext', 'defaultContext', 'contexts', 'pages', 'lastPage', 'close', 'isClosed'] },
  context: { docs: 'docs-user-api/runtime.md', types: 'types/browser.d.ts', source: 'automation/browser.go', status: 'compatibility', platforms: ['darwin', 'linux', 'windows'], methods: ['browser', 'newPage', 'adoptPage', 'pages', 'lastPage', 'close', 'isClosed', 'cookies', 'setCookies', 'clearCookies', 'storage', 'setStorage', 'getStorage', 'clearStorage', 'session', 'setSessionValue', 'getSessionValue', 'clearSession'] },
  global: { docs: 'docs-user-api/polyfills.md', types: 'types/global.d.ts', source: 'polyfills', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: [
    'notify', 'copyToClipboard', 'getClipboard', 'AbortController', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'sleep', 'sleepSeconds', 'requestAnimationFrame',
    'cancelAnimationFrame',
  ] },
};

const unitBehavior = new Set([
  ...RuntimeAPIObjects.page.methods.filter((method) => !['captureScreen', 'openMacOSPrivacySettings', 'requestMacAutomationPermission'].includes(method)).map((method) => 'page.' + method),
  ...RuntimeAPIObjects.mouse.methods.map((method) => 'mouse.' + method),
  ...RuntimeAPIObjects.keyboard.methods.map((method) => 'keyboard.' + method),
  'window.list', 'window.setAlwaysOnTop', 'window.unsetTopMost', 'window.js_beautify',
  ...RuntimeAPIObjects.Screen.methods.filter((method) => method !== 'screenshot').map((method) => 'Screen.' + method),
  ...RuntimeAPIObjects.System.methods.filter((method) => !['killProcess', 'shutdown', 'restart', 'sleep'].includes(method)).map((method) => 'System.' + method),
  ...RuntimeAPIObjects.File.methods.map((method) => 'File.' + method),
  ...RuntimeAPIObjects.AppStorage.methods.filter((method) => method !== 'clear').map((method) => 'AppStorage.' + method),
  ...RuntimeAPIObjects.console.methods.map((method) => 'console.' + method),
  'http.request', 'OCR.extractText', 'Vision.getCapabilities', 'Vision.analyzeLayout', 'Vision.annotateRegions',
  ...RuntimeAPIObjects.ImageColor.methods.map((method) => 'ImageColor.' + method),
  'Sound.playSound', 'Sound.play',
  ...RuntimeAPIObjects.browser.methods.filter((method) => method !== 'close').map((method) => 'browser.' + method),
  ...RuntimeAPIObjects.context.methods.filter((method) => method !== 'close').map((method) => 'context.' + method),
  ...['AbortController', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'sleep', 'sleepSeconds', 'requestAnimationFrame', 'cancelAnimationFrame'].map((method) => 'global.' + method),
]);

const liveBehavior = new Set([
  ...['screenshot', 'captureScreen', 'openApp', 'openURLInApp', 'title', 'url', 'checkPermissions',
    'requestPermissions', 'ensurePermissions', 'ensureMacPermissions',
    'checkScreenshotPermissions', 'requestMacPermissions'].map((method) => 'page.' + method),
  ...['click', 'move', 'down', 'up', 'getPos', 'wheel'].map((method) => 'mouse.' + method),
  ...RuntimeAPIObjects.keyboard.methods.map((method) => 'keyboard.' + method),
  'touchscreen.tap', 'Screen.screenshot',
  ...RuntimeAPIObjects.clipboard.methods.map((method) => 'clipboard.' + method),
  ...RuntimeAPIObjects.http.methods.map((method) => 'http.' + method),
  ...RuntimeAPIObjects.axios.methods.map((method) => 'axios.' + method),
  'global.copyToClipboard', 'global.getClipboard',
]);
const compositionBehavior = new Set([
  // These methods must prove their coordinate relationship in the relocated
  // Safari fixture, not merely return successfully in an isolated live call.
  'window.getActiveWindow', 'window.setWindowBounds',
]);

const restricted = {
  'page.openMacOSPrivacySettings': 'opens System Settings',
  'page.requestMacAutomationPermission': 'may create an AppleEvents consent prompt',
  'mouse.clickForPID': 'requires a reviewed AXPress-capable native control and Accessibility permission',
  'window.closeWindow': 'closes an operator window',
  'window.closeActiveWindow': 'closes the active operator window',
  'window.kill': 'terminates a process',
  'window.getFocusWindow': 'repeats high-latency macOS focus enumeration; live routing uses getActiveWindow',
  'window.title': 'repeats high-latency macOS title enumeration; page.title is live-verified',
  'window.getTitle': 'repeats high-latency macOS title enumeration; getWindowByTitle is live-verified',
  'window.content': 'compatibility title accessor repeats slow macOS enumeration',
  'window.getContent': 'compatibility content accessor repeats slow macOS enumeration',
  'System.killProcess': 'terminates a process',
  'System.shutdown': 'powers off the host',
  'System.restart': 'restarts the host',
  'System.sleep': 'suspends the host',
  'AppStorage.clear': 'would delete the operator persistent store',
  'Vision.runOCR': 'requires a configured external or local provider and representative fixture',
  'Vision.detectUI': 'requires a configured external or local provider and representative fixture',
  'global.notify': 'creates a real operating-system notification',
  'browser.close': 'would close the singleton compatibility facade used by later tests',
  'context.close': 'would close the singleton compatibility context used by later tests',
};
for (const method of ['playSuccess', 'playFail', 'playWarning', 'playError', 'playCaptcha']) restricted['Sound.' + method] = 'plays audible system output';
for (const method of RuntimeAPIObjects.FloatingWindow.methods) restricted['FloatingWindow.' + method] = 'conditional UI loop is absent with SKIP_FYNE_INIT=1';
for (const method of RuntimeAPIObjects.window.methods) {
  const id = 'window.' + method;
  const hasSafeBehavior = ['getActiveWindow', 'setWindowBounds', 'list', 'setAlwaysOnTop', 'unsetTopMost', 'js_beautify'].includes(method);
  if (!hasSafeBehavior && !restricted[id]) {
    restricted[id] = 'generic macOS Accessibility enumeration or third-party window action is high-latency and only the verified foreground fixture route is live-tested';
  }
}

globalThis.RuntimeAPIManifest = [];
for (const [family, definition] of Object.entries(RuntimeAPIObjects)) {
  for (const method of definition.methods) {
    const id = family + '.' + method;
    const behaviorTiers = [
      ...(unitBehavior.has(id) ? ['unit'] : []),
      ...(liveBehavior.has(id) ? ['live'] : []),
      ...(compositionBehavior.has(id) ? ['composition'] : []),
    ];
    const contractOnlyReason = behaviorTiers.length === 0 ? restricted[id] || null : null;
    RuntimeAPIManifest.push({
      id,
      family,
      source: { runtime: definition.source, docs: definition.docs, types: definition.types },
      status: definition.status,
      platforms: definition.platforms,
      requiredVerificationTiers: ['contract', ...behaviorTiers],
      riskClassification: restricted[id] ? 'restricted' : 'safe',
      contractOnlyReason,
      evidenceRequirements: behaviorTiers.length > 0 ? ['contract-result', ...behaviorTiers.map((tier) => tier + '-result')] : ['contract-result', 'risk-rationale'],
    });
  }
}

globalThis.RuntimeAPITestFiles = {
  async: [
    'tests/runtime-api/async-lifecycle.js',
  ],
  unit: [
    'tests/runtime-api/unit/page.test.js',
    'tests/runtime-api/unit/mouse.test.js',
    'tests/runtime-api/unit/keyboard.test.js',
    'tests/runtime-api/unit/touchscreen.test.js',
    'tests/runtime-api/unit/window.test.js',
    'tests/runtime-api/unit/screen.test.js',
    'tests/runtime-api/unit/system.test.js',
    'tests/runtime-api/unit/file.test.js',
    'tests/runtime-api/unit/storage.test.js',
    'tests/runtime-api/unit/clipboard.test.js',
    'tests/runtime-api/unit/console.test.js',
    'tests/runtime-api/unit/http.test.js',
    'tests/runtime-api/unit/axios.test.js',
    'tests/runtime-api/unit/http-axios.test.js',
    'tests/runtime-api/unit/ocr.test.js',
    'tests/runtime-api/unit/vision.test.js',
    'tests/runtime-api/unit/vision-layout.test.js',
    'tests/runtime-api/unit/image-color.test.js',
    'tests/runtime-api/unit/sound.test.js',
    'tests/runtime-api/unit/floating-window.test.js',
    'tests/runtime-api/unit/browser.test.js',
    'tests/runtime-api/unit/context.test.js',
    'tests/runtime-api/unit/page-compat.test.js',
    'tests/runtime-api/unit/window-library.test.js',
    'tests/runtime-api/unit/globals.test.js',
  ],
  live: [
    'tests/runtime-api/live/page.test.js',
    'tests/runtime-api/live/permissions-session.test.js',
    'tests/runtime-api/live/capture-screen.test.js',
    'tests/runtime-api/live/mouse.test.js',
    'tests/runtime-api/live/wheel.test.js',
    'tests/runtime-api/live/keyboard.test.js',
    'tests/runtime-api/live/touchscreen.test.js',
    'tests/runtime-api/live/screen.test.js',
    'tests/runtime-api/live/clipboard.test.js',
    'tests/runtime-api/live/http-axios.test.js',
    'tests/runtime-api/live/composition.test.js',
    'tests/runtime-api/live/composition-replay.test.js',
  ],
};

globalThis.RuntimeAPICatalog = {
  schemaVersion: '1.0.0',
  catalogVersion: '2026-08-31',
  entries: RuntimeAPIManifest,
};
