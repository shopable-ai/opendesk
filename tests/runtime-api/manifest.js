// Versioned, machine-readable Runtime API catalog source. The conformance run
// serializes this exact expanded catalog as catalog.snapshot.json and fingerprints
// it; no fixed method count is used as a pass condition.

globalThis.RuntimeAPIObjects = {
  page: { docs: 'docs/api/page.md', types: 'types/page.d.ts', source: 'automation/page.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: [
    'screenshot', 'captureScreen', 'goto', 'openURL', 'openApp', 'openURLInApp', 'title', 'url',
    'waitFor', 'waitForTimeout', 'waitForNavigation', 'waitForFunction', 'waitForAll',
    'checkPermissions', 'requestPermissions', 'ensurePermissions', 'ensureMacPermissions',
    'checkScreenshotPermissions', 'openMacOSPrivacySettings', 'requestMacPermissions',
    'requestMacAutomationPermission', 'browser', 'context',
  ] },
  mouse: { docs: 'docs/api/mouse.md', types: 'types/mouse.d.ts', source: 'automation/mouse.go + polyfills/005-geometry.js', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: ['click', 'clickPoint', 'clickForPID', 'move', 'down', 'up', 'getPos', 'wheel'] },
  keyboard: { docs: 'docs/api/input.md', types: 'types/keyboard.d.ts', source: 'automation/keyboard.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: ['type', 'press', 'down', 'up', 'combination'] },
  globalShortcut: { docs: 'docs/api/global-shortcut.md', types: 'types/globalShortcut.d.ts', source: 'automation/global_shortcut.go', status: 'stable', platforms: ['darwin', 'windows'], methods: ['register', 'unregister', 'isRegistered', 'unregisterAll'] },
  Events: { docs: 'docs/api/events.md', types: 'types/Events.d.ts', source: 'automation/desktop_events.go', status: 'experimental', platforms: ['darwin', 'linux', 'windows'], methods: ['on', 'once', 'getCapabilities'] },
  App: { docs: 'docs/api/app.md', types: 'types/App.d.ts', source: 'automation/app.go + automation/app_backend*.go', status: 'experimental', platforms: ['darwin', 'linux', 'windows'], methods: [
    'launch', 'get', 'list', 'isRunning', 'waitForLaunch', 'waitForExit', 'terminate', 'restart', 'getCapabilities',
  ] },
  Notifications: { docs: 'docs/api/notifications.md', types: 'types/Notifications.d.ts', source: 'automation/notifications.go + automation/notifications_backend*.go', status: 'experimental', platforms: ['darwin'], methods: [
    'list', 'waitFor', 'dismiss', 'getCapabilities',
  ] },
  touchscreen: { docs: 'docs/api/input.md', types: 'types/touchscreen.d.ts', source: 'automation/touchscreen.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: ['tap'] },
  window: { docs: 'docs/api/window.md', types: 'types/window.d.ts', source: 'automation/window_manager.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: [
    'getCapabilities', 'getActiveWindow', 'getWindowByTitle', 'getFocusWindow', 'focus', 'setWindowBounds',
    'setWidth', 'setHeight', 'maximize', 'minimize', 'restore', 'restoreByPID',
    'minimizeByPID', 'maximizeByPID', 'closeWindow', 'closeActiveWindow', 'kill',
    'title', 'getTitle', 'content', 'getContent', 'list', 'setAlwaysOnTop',
    'unsetTopMost', 'bringToTop', 'js_beautify',
  ] },
  Screen: { docs: 'docs/api/screen.md', types: 'types/Screen.d.ts', source: 'automation/screen.go + automation/screen_capture.go', status: 'stable-with-experimental-capture', platforms: ['darwin', 'linux', 'windows'], methods: [
    'getWidth', 'getHeight', 'getDisplays', 'getPrimaryDisplay', 'getDisplay',
    'getDisplayCapabilities', 'getDisplayMode', 'listDisplayModes', 'setDisplayMode',
    'getVirtualBounds', 'pixel', 'pixels', 'screenshot', 'selectRegion', 'startRecording',
    'getCaptureCapabilities',
  ] },
  System: { docs: 'docs/api/system.md', types: 'types/System.d.ts', source: 'automation/system.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: [
    'delay', 'getPlatformInfo', 'getSessionCapabilities', 'getSessionState', 'lock', 'logout', 'startScreenSaver',
    'getSystemInfo', 'getProcessList', 'killProcess', 'getNetworkInterfaces',
    'getNetworkConnections', 'getPowerInfo', 'shutdown', 'restart', 'sleep',
    'getDirectoryContents', 'getExecutablePath', 'getWorkingDirectory', 'getUserInfo',
    'isAdministrator', 'getSystemMetrics', 'getFingerprint', 'toJSON',
  ] },
  Execution: { docs: 'docs/api/execution.md', types: 'types/Execution.d.ts', source: 'pkg/execution/runner.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: [], properties: [
    'id', 'executionId', 'input', 'workdir', 'env', 'stack', 'artifactDir', 'source', 'ext', 'scriptHash', 'activationSource',
  ] },
  Command: { docs: 'docs/api/command.md', types: 'types/Command.d.ts', source: 'automation/command.go + automation/command_*.go', status: 'local', platforms: ['darwin', 'linux', 'windows'], methods: ['getCapabilities', 'run'] },
  File: { docs: 'docs/api/file.md', types: 'types/File.d.ts', source: 'automation/file.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: [
    'path', 'cwd', 'create', 'createIfNotExists', 'createWithDirs', 'exists', 'ensureDir',
    'read', 'readBytes', 'write', 'append', 'writeBytes', 'appendBytes', 'copy',
    'renameWithoutExtension', 'rename', 'move', 'getExtension', 'getName',
    'getNameWithoutExtension', 'remove', 'removeDir', 'listDir', 'isFile', 'isDir',
    'isEmptyDir', 'getHumanReadableSize', 'getSimplifiedPath', 'join', 'open',
  ] },
  AppStorage: { docs: 'docs/api/storage.md', types: 'types/AppStorage.d.ts', source: 'automation/storage.go', status: 'secondary', platforms: ['darwin', 'linux', 'windows'], methods: ['getItem', 'setItem', 'removeItem', 'clear', 'getLength', 'key'] },
  clipboard: { docs: 'docs/api/clipboard.md', types: 'types/clipboard.d.ts', source: 'automation/clipboard.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: ['copy', 'paste', 'clear', 'read', 'write', 'getFormats', 'getCapabilities'] },
  console: { docs: 'docs/api/global-apis.md', types: 'types/console.d.ts', source: 'automation/console.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: [
    'log', 'info', 'warn', 'error', 'debug', 'table', 'group', 'groupEnd', 'time',
    'timeEnd', 'clear',
  ] },
  http: { docs: 'docs/api/http.md', types: 'types/http.d.ts', source: 'automation/http.go', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: ['request', 'get', 'post'] },
  NativeExtensions: {
    docs: 'docs/api/native-extension.md', types: 'types/NativeExtension.d.ts', source: 'automation/native_extensions.go',
    status: 'experimental', platforms: ['darwin', 'linux', 'windows'], optional: true,
    methods: ['list', 'get', 'diagnostics'],
    dynamicMethods: [
      { path: 'goBasic.hello', types: 'examples/native-extensions/go-basic/types/index.d.ts', platforms: ['darwin', 'linux', 'windows'], tiers: ['unit'] },
      { path: 'goBasic.add', types: 'examples/native-extensions/go-basic/types/index.d.ts', platforms: ['darwin', 'linux', 'windows'], tiers: ['unit'] },
      { path: 'macosVision.ocr', types: 'examples/native-extensions/macos-vision/types/index.d.ts', platforms: ['darwin'], tiers: [] },
    ],
  },
  axios: { docs: 'docs/api/http.md', types: 'types/axios.d.ts', source: 'polyfills/004-axios.js', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: ['request', 'get', 'post', 'put', 'delete', 'patch'] },
  Geometry: { docs: 'docs/api/geometry.md', types: 'types/Geometry.d.ts', source: 'polyfills/005-geometry.js + polyfills/007-geometry-layout.js', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: ['rect', 'center', 'pointOffset', 'pointPercent', 'regionOffset', 'regionPercent', 'regionByEdges', 'inset', 'anchorPoint', 'contains', 'intersect'] },
  UI: { docs: 'docs/api/desktop-ui.md', types: 'types/UI.d.ts', source: 'polyfills/006-ui.js', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: ['getCapabilities', 'findTexts', 'findText', 'hasText', 'tapText', 'tapTexts', 'waitText', 'waitTextGone', 'findImages', 'findImage', 'tapImage'] },
  OCR: { docs: 'docs/api/vision.md', types: 'types/Vision.d.ts', source: 'automation/ocr.go', status: 'secondary', platforms: ['darwin', 'linux', 'windows'], methods: ['extractText'] },
  Vision: { docs: 'docs/api/vision.md', types: 'types/Vision.d.ts', source: 'automation/vision.go', status: 'secondary', platforms: ['darwin', 'linux', 'windows'], methods: ['runOCR', 'detectUI', 'getCapabilities', 'analyzeLayout', 'annotateRegions'] },
  ImageColor: { docs: 'docs/api/image-color.md', types: 'types/ImageColor.d.ts', source: 'automation/imageColor.go', status: 'secondary', platforms: ['darwin', 'linux', 'windows'], methods: [
    'findPos', 'findImage', 'findImages', 'diff', 'loadBase64', 'resize', 'clip', 'pixel', 'findColor', 'findColorBlocks',
    'hasColor', 'isGray', 'getSize', 'save', 'findRedChannel', 'findGreenChannel',
    'findBlueChannel', 'toRGB', 'toRGBA', 'toHSL', 'toHSLA', 'isColorSimilar', 'analyzeLayout',
  ] },
  Sound: { docs: 'docs/api/sound.md', types: 'types/Sound.d.ts', source: 'automation/sound.go', status: 'secondary', platforms: ['darwin', 'linux', 'windows'], methods: ['playSuccess', 'playFail', 'playWarning', 'playError', 'playCaptcha', 'playSound', 'play', 'start', 'playAsync', 'stop', 'stopAll', 'getActive'] },
  Audio: { docs: 'docs/api/audio.md', types: 'types/Audio.d.ts', source: 'automation/audio.go', status: 'experimental', platforms: ['darwin'], methods: [
    'getVolume', 'setVolume', 'isMuted', 'mute', 'unmute', 'toggleMute', 'getOutputDevices',
    'getInputDevices', 'getDefaultOutput', 'getDefaultInput', 'getCapabilities',
  ] },
  Dialog: { docs: 'docs/api/dialog.md', types: 'types/dialog.d.ts', source: 'automation/dialog.go', status: 'conditional', platforms: ['darwin', 'linux', 'windows'], methods: ['alert', 'confirm', 'prompt', 'getCapabilities'] },
  ui: { docs: 'docs/api/custom-ui.md', types: 'types/custom-ui.d.ts', source: 'automation/custom_ui.go', status: 'conditional', platforms: ['darwin', 'linux', 'windows'], methods: ['getCapabilities', 'createWindow', 'closeAll', 'on'] },
  FloatingWindow: { docs: 'docs/api/custom-ui.md', types: 'types/FloatingWindow.d.ts', source: 'automation/floating_window.go', status: 'conditional', platforms: ['darwin', 'linux', 'windows'], optional: true, methods: ['constructor', 'addButton', 'addSeparator', 'addSpacer', 'removeButton', 'updateButton', 'getButtonState', 'getState', 'show', 'hide', 'close', 'setPosition', 'setPlacement', 'onButtonClick', 'onError', 'setAlwaysOnTop', 'setDraggable', 'on', 'waitUntilClosed', 'run'] },
  browser: { docs: 'docs/api/runtime.md', types: 'types/browser.d.ts', source: 'automation/browser.go', status: 'compatibility', platforms: ['darwin', 'linux', 'windows'], methods: ['newPage', 'newContext', 'defaultContext', 'contexts', 'pages', 'lastPage', 'close', 'isClosed'] },
  context: { docs: 'docs/api/runtime.md', types: 'types/browser.d.ts', source: 'automation/browser.go', status: 'compatibility', platforms: ['darwin', 'linux', 'windows'], methods: ['browser', 'newPage', 'adoptPage', 'pages', 'lastPage', 'close', 'isClosed', 'cookies', 'setCookies', 'clearCookies', 'storage', 'setStorage', 'getStorage', 'clearStorage', 'session', 'setSessionValue', 'getSessionValue', 'clearSession'] },
  global: { docs: 'docs/api/global-apis.md', types: 'types/global.d.ts', source: 'polyfills', status: 'stable', platforms: ['darwin', 'linux', 'windows'], methods: [
    'notify', 'alert', 'confirm', 'prompt', 'copyToClipboard', 'getClipboard', 'AbortController', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'delay', 'sleep', 'sleepSeconds', 'requestAnimationFrame',
    'cancelAnimationFrame', 'URL', 'URLSearchParams',
  ] },
};

const unitBehavior = new Set([
  ...RuntimeAPIObjects.page.methods.filter((method) => !['captureScreen', 'openMacOSPrivacySettings', 'requestMacAutomationPermission'].includes(method)).map((method) => 'page.' + method),
  ...RuntimeAPIObjects.mouse.methods.map((method) => 'mouse.' + method),
  ...RuntimeAPIObjects.keyboard.methods.map((method) => 'keyboard.' + method),
  ...RuntimeAPIObjects.Events.methods.map((method) => 'Events.' + method),
  ...RuntimeAPIObjects.App.methods.map((method) => 'App.' + method),
  ...RuntimeAPIObjects.Notifications.methods.map((method) => 'Notifications.' + method),
  'window.getCapabilities', 'window.list', 'window.setAlwaysOnTop', 'window.unsetTopMost', 'window.js_beautify',
  ...RuntimeAPIObjects.Screen.methods.filter((method) => method !== 'screenshot').map((method) => 'Screen.' + method),
  ...RuntimeAPIObjects.System.methods.filter((method) => !['killProcess', 'shutdown', 'restart', 'sleep'].includes(method)).map((method) => 'System.' + method),
  ...RuntimeAPIObjects.Execution.properties.map((property) => 'Execution.' + property),
  ...RuntimeAPIObjects.Command.methods.map((method) => 'Command.' + method),
  ...RuntimeAPIObjects.File.methods.map((method) => 'File.' + method),
  ...RuntimeAPIObjects.AppStorage.methods.filter((method) => method !== 'clear').map((method) => 'AppStorage.' + method),
  ...['read', 'write', 'getFormats', 'getCapabilities'].map((method) => 'clipboard.' + method),
  ...RuntimeAPIObjects.console.methods.map((method) => 'console.' + method),
  ...RuntimeAPIObjects.Geometry.methods.map((method) => 'Geometry.' + method),
  ...RuntimeAPIObjects.UI.methods.map((method) => 'UI.' + method),
  'http.request', 'NativeExtensions.list', 'NativeExtensions.get', 'NativeExtensions.diagnostics', 'OCR.extractText', 'Vision.getCapabilities', 'Vision.analyzeLayout', 'Vision.annotateRegions',
  ...RuntimeAPIObjects.ImageColor.methods.map((method) => 'ImageColor.' + method),
  'Sound.playSound', 'Sound.play', 'Sound.start', 'Sound.playAsync', 'Sound.stop', 'Sound.stopAll', 'Sound.getActive',
  'Audio.setVolume', 'Audio.getCapabilities',
  ...RuntimeAPIObjects.Dialog.methods.map((method) => 'Dialog.' + method),
  ...RuntimeAPIObjects.ui.methods.map((method) => 'ui.' + method),
  ...RuntimeAPIObjects.browser.methods.filter((method) => method !== 'close').map((method) => 'browser.' + method),
  ...RuntimeAPIObjects.context.methods.filter((method) => method !== 'close').map((method) => 'context.' + method),
  'global.notify', 'global.alert', 'global.confirm', 'global.prompt',
  ...['AbortController', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'delay', 'sleep', 'sleepSeconds', 'requestAnimationFrame', 'cancelAnimationFrame', 'URL', 'URLSearchParams'].map((method) => 'global.' + method),
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
  ...RuntimeAPIObjects.globalShortcut.methods.map((method) => 'globalShortcut.' + method),
  'global.copyToClipboard', 'global.getClipboard',
]);
const compositionBehavior = new Set([
  // These methods must prove their coordinate relationship in the relocated
  // Safari fixture, not merely return successfully in an isolated live call.
  'window.getActiveWindow', 'window.setWindowBounds',
]);
const customUIBehavior = new Set([
  ...RuntimeAPIObjects.ui.methods.map((method) => 'ui.' + method),
  ...RuntimeAPIObjects.FloatingWindow.methods.map((method) => 'FloatingWindow.' + method),
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
  'System.lock': 'locks or requests locking the interactive session and can end the current automation path',
  'System.logout': 'terminates the interactive session and may discard unsaved work when force=true',
  'System.startScreenSaver': 'may immediately require a password under host policy; dedicated disposable-session smoke is required',
  'AppStorage.clear': 'would delete the operator persistent store',
  'NativeExtensions.goBasic.hello': 'starts one manifest-bound repository-owned Go extension process',
  'NativeExtensions.goBasic.add': 'starts one manifest-bound repository-owned Go extension process',
  'NativeExtensions.macosVision.ocr': 'starts one manifest-bound Apple Vision extension process and requires macOS plus a representative fixture',
  'Vision.runOCR': 'requires a configured external or local provider and representative fixture',
  'Vision.detectUI': 'requires a configured external or local provider and representative fixture',
  'global.notify': 'creates a real operating-system notification',
  'browser.close': 'would close the singleton compatibility facade used by later tests',
  'context.close': 'would close the singleton compatibility context used by later tests',
};
restricted['Command.run'] = 'runs a host command and is available only to a local script execution';
for (const method of ['playSuccess', 'playFail', 'playWarning', 'playError', 'playCaptcha']) restricted['Sound.' + method] = 'plays audible system output';
for (const method of ['start', 'playAsync', 'stop', 'stopAll']) restricted['Sound.' + method] = 'starts or changes audible system output; use a dedicated playback lifecycle smoke';
for (const method of RuntimeAPIObjects.Audio.methods.filter((method) => method !== 'getCapabilities')) {
  restricted['Audio.' + method] = 'depends on or changes host audio device state; dedicated macOS smoke must restore control state and redact device names and UIDs';
}
for (const method of ['launch', 'terminate', 'restart']) restricted['App.' + method] = 'starts or terminates a real desktop application; dedicated fixture smoke owns the target lifecycle';
restricted['Notifications.list'] = 'may reveal own-app notification metadata or explicitly requested content; the formal unit gate validates arguments without reading host notifications';
restricted['Notifications.waitFor'] = 'waits on the own-app notification model and may explicitly return content; the formal unit gate validates arguments without reading host notifications';
restricted['Notifications.dismiss'] = 'removes an own-app notification; the formal unit gate validates arguments without changing host notification state';
for (const method of RuntimeAPIObjects.FloatingWindow.methods) restricted['FloatingWindow.' + method] = 'button-first facade is exposed only when Custom UI is explicitly authorized';
for (const method of RuntimeAPIObjects.window.methods) {
  const id = 'window.' + method;
  const hasSafeBehavior = ['getCapabilities', 'getActiveWindow', 'setWindowBounds', 'list', 'setAlwaysOnTop', 'unsetTopMost', 'js_beautify'].includes(method);
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
      ...(customUIBehavior.has(id) ? ['custom-ui'] : []),
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
  for (const property of definition.properties || []) {
    const id = family + '.' + property;
    const behaviorTiers = unitBehavior.has(id) ? ['unit'] : [];
    RuntimeAPIManifest.push({
      id,
      family,
      kind: 'property',
      source: { runtime: definition.source, docs: definition.docs, types: definition.types },
      status: definition.status,
      platforms: definition.platforms,
      requiredVerificationTiers: ['contract', ...behaviorTiers],
      riskClassification: 'safe',
      contractOnlyReason: null,
      evidenceRequirements: ['contract-result', ...behaviorTiers.map((tier) => tier + '-result')],
    });
  }
}

for (const entry of RuntimeAPIObjects.NativeExtensions.dynamicMethods) {
  RuntimeAPIManifest.push({
    id: 'NativeExtensions.' + entry.path,
    family: 'NativeExtensions',
    source: { runtime: 'automation/native_extensions.go', docs: 'docs/api/native-extension.md', types: entry.types },
    status: 'experimental',
    platforms: entry.platforms,
    requiredVerificationTiers: ['contract', ...entry.tiers],
    riskClassification: 'restricted',
    contractOnlyReason: entry.tiers.length === 0 ? restricted['NativeExtensions.' + entry.path] : null,
    evidenceRequirements: entry.tiers.length > 0 ? ['contract-result', ...entry.tiers.map((tier) => tier + '-result')] : ['contract-result', 'risk-rationale'],
  });
}

globalThis.RuntimeAPITestFiles = {
  async: [
    'tests/runtime-api/async-lifecycle.js',
  ],
  dialog: [
    'tests/runtime-api/dialog-no-ui.js',
    'tests/runtime-api/dialog-validation.js',
    'tests/runtime-api/dialog-lifecycle.js',
    'tests/runtime-api/dialog-unobserved.js',
    'tests/runtime-api/dialog-layout-probe.js',
    'tests/runtime-api/dialog-adaptive-layout-probe.js',
    'tests/runtime-api/dialog-ax-controller.js',
  ],
  unit: [
    'tests/runtime-api/unit/page.test.js',
    'tests/runtime-api/unit/mouse.test.js',
    'tests/runtime-api/unit/keyboard.test.js',
    'tests/runtime-api/unit/global-shortcut.test.js',
    'tests/runtime-api/unit/events.test.js',
    'tests/runtime-api/unit/app.test.js',
    'tests/runtime-api/unit/notifications.test.js',
    'tests/runtime-api/unit/touchscreen.test.js',
    'tests/runtime-api/unit/window.test.js',
    'tests/runtime-api/unit/screen.test.js',
    'tests/runtime-api/unit/system.test.js',
    'tests/runtime-api/unit/execution.test.js',
    'tests/runtime-api/unit/command.test.js',
    'tests/runtime-api/unit/file.test.js',
    'tests/runtime-api/unit/storage.test.js',
    'tests/runtime-api/unit/clipboard.test.js',
    'tests/runtime-api/unit/console.test.js',
    'tests/runtime-api/unit/http.test.js',
    'tests/runtime-api/unit/notify.test.js',
    'tests/runtime-api/unit/native-extension.test.js',
    'tests/runtime-api/unit/axios.test.js',
    'tests/runtime-api/unit/http-axios.test.js',
    'tests/runtime-api/unit/ocr.test.js',
    'tests/runtime-api/unit/vision.test.js',
    'tests/runtime-api/unit/vision-layout.test.js',
    'tests/runtime-api/unit/image-color.test.js',
    'tests/runtime-api/unit/sound.test.js',
    'tests/runtime-api/unit/audio.test.js',
    'tests/runtime-api/unit/dialog.test.js',
    'tests/runtime-api/unit/custom-ui.test.js',
    'tests/runtime-api/unit/floating-window.test.js',
    'tests/runtime-api/unit/browser.test.js',
    'tests/runtime-api/unit/context.test.js',
    'tests/runtime-api/unit/page-compat.test.js',
    'tests/runtime-api/unit/window-library.test.js',
    'tests/runtime-api/unit/globals.test.js',
    'tests/runtime-api/geometry.js',
    'tests/runtime-api/geometry-layout.js',
    'tests/runtime-api/ui.js',
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
    'tests/runtime-api/live/image-template-active-window.test.js',
    'tests/runtime-api/live/window.test.js',
    'tests/runtime-api/live/clipboard.test.js',
    'tests/runtime-api/live/http-axios.test.js',
    'tests/runtime-api/live/composition.test.js',
    'tests/runtime-api/live/composition-replay.test.js',
  ],
};

globalThis.RuntimeAPICatalog = {
  schemaVersion: '1.0.0',
  catalogVersion: '2026-09-05',
  entries: RuntimeAPIManifest,
};
