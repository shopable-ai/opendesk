'use strict';

const capabilities = automation.app.getCapabilities();
if (!capabilities.enabled || !capabilities.available) {
  throw new Error('OpenDesk App Mode is unavailable: ' + JSON.stringify(capabilities));
}

const officialShellFile = File.join(Execution.scriptDir, 'official-shell.js');
(0, eval)(File.read(officialShellFile) + '\n//# sourceURL=' + officialShellFile);
if (!globalThis.OpenDeskOfficialShell || typeof OpenDeskOfficialShell.create !== 'function') {
  throw new Error('OpenDesk Official Shell did not load');
}

const officialShell = OpenDeskOfficialShell.create({
  file: File,
  command: Command,
  execution: Execution,
  packageRoot: Execution.scriptDir,
});

const localizationEntry = File.join(Execution.scriptDir, 'localization.js');
(0, eval)(File.read(localizationEntry) + '\n//# sourceURL=' + localizationEntry);
if (!globalThis.OpenDeskProductI18n || !OpenDeskProductI18n.install()) {
  throw new Error('OpenDesk product Locale Core bridge did not initialize');
}

// Promotions are product-owned. Their integration adapters are loaded before
// Runner composition, but the concrete owner is assigned only after the Runner
// and private App local-services client exist. Every adapter dereferences this
// closure at interaction time, so startup has no owner/controller cycle.
for (const name of ['core.js', 'controller.js', 'integration.js', 'official-creative.js', 'owner.js']) {
  const entry = File.join(Execution.scriptDir, 'promotions', name);
  (0, eval)(File.read(entry) + '\n//# sourceURL=' + entry);
}
if (!globalThis.OpenDeskPromotionsCore
  || !globalThis.OpenDeskPromotionsController
  || !globalThis.OpenDeskPromotionsIntegration
  || !globalThis.OpenDeskOfficialPromotionCreative
  || !globalThis.OpenDeskPromotionsOwner) {
  throw new Error('OpenDesk Promotion product modules did not initialize');
}
let promotionOwner = null;
const promotionOwnerRef = () => promotionOwner;

// The low-frequency manager, ordering, batch execution and run lifecycle stay
// in the established Script Runner controller. Promotions decorate only the
// task boundary and surface lifecycle; the generic Runner never learns about
// advertisers, campaigns, frequency, or paid-placement policy.
const runnerControllerEntry = File.join(Execution.scriptDir, 'script-runner', 'controller.js');
(0, eval)(File.read(runnerControllerEntry) + '\n//# sourceURL=' + runnerControllerEntry);
if (!globalThis.OpenDeskScriptRunnerSimple
  || typeof OpenDeskScriptRunnerSimple.createApp !== 'function') {
  throw new Error('OpenDesk Script Runner base controller did not initialize');
}
const baseRunnerController = OpenDeskPromotionsIntegration.wrapRunnerController(
  OpenDeskScriptRunnerSimple,
  promotionOwnerRef,
);

const runnerPlayerEntry = File.join(Execution.scriptDir, 'script-runner', 'player-controller.js');
(0, eval)(File.read(runnerPlayerEntry) + '\n//# sourceURL=' + runnerPlayerEntry);
if (!globalThis.OpenDeskScriptRunnerPlayer
  || typeof OpenDeskScriptRunnerPlayer.wrapController !== 'function') {
  throw new Error('OpenDesk Script Runner player controller did not initialize');
}
globalThis.OpenDeskScriptRunnerSimple = OpenDeskScriptRunnerPlayer.wrapController(baseRunnerController, {
  playerUI: OpenDeskPromotionsIntegration.createPlayerUI(ui, promotionOwnerRef),
  previousIcon: {
    path: File.join(Execution.scriptDir, 'assets', 'script-previous.png'),
    renderingMode: 'template',
  },
  nextIcon: {
    path: File.join(Execution.scriptDir, 'assets', 'script-next.png'),
    renderingMode: 'template',
  },
});

// Product Analytics observes the logical Player boundary. It is intentionally
// outside the generic Runner controller but inside the shortcut decorator, so
// pointer and keyboard actions each have one owner and screen_viewed follows a
// successful native show() rather than a menu click or window-create request.
for (const name of ['client.js', 'integration.js']) {
  const entry = File.join(Execution.scriptDir, 'product-analytics', name);
  (0, eval)(File.read(entry) + '\n//# sourceURL=' + entry);
}
if (!globalThis.OpenDeskProductAnalytics
  || !globalThis.OpenDeskProductAnalyticsIntegration
  || typeof OpenDeskProductAnalyticsIntegration.wrapController !== 'function') {
  throw new Error('OpenDesk Product Analytics client/integration did not initialize');
}
globalThis.OpenDeskScriptRunnerSimple = OpenDeskProductAnalyticsIntegration.wrapController(
  OpenDeskScriptRunnerSimple,
  {client: OpenDeskProductAnalytics},
);

// Add state-scoped keyboard control only after the player surface has been
// composed. Idle exposes Run; while a recipe is executing it releases Run and
// owns Stop instead, so both accelerators are never reserved at the same time.
const runnerShortcutEntry = File.join(Execution.scriptDir, 'script-runner', 'shortcut-controller.js');
(0, eval)(File.read(runnerShortcutEntry) + '\n//# sourceURL=' + runnerShortcutEntry);
if (!globalThis.OpenDeskScriptRunnerShortcuts
  || typeof OpenDeskScriptRunnerShortcuts.wrapController !== 'function') {
  throw new Error('OpenDesk Script Runner shortcut controller did not initialize');
}
globalThis.OpenDeskScriptRunnerSimple = OpenDeskScriptRunnerShortcuts.wrapController(
  OpenDeskScriptRunnerSimple,
  {
    globalShortcut: globalThis.globalShortcut,
      console: globalThis.console,
  },
);

// script-runner-simple captures FloatingWindow during module installation. Give
// only that module a promotion-aware wrapper, then immediately restore the
// process global so unrelated product windows remain ordinary Custom UI.
const nativeFloatingWindow = globalThis.FloatingWindow;
const promotionAwareFloatingWindow = OpenDeskPromotionsIntegration.createRunnerFloatingWindow(
  nativeFloatingWindow,
  promotionOwnerRef,
);
const runnerEntry = File.join(Execution.scriptDir, 'script-runner-simple.js');
globalThis.FloatingWindow = promotionAwareFloatingWindow;
try {
  (0, eval)(File.read(runnerEntry) + '\n//# sourceURL=' + runnerEntry);
} finally {
  globalThis.FloatingWindow = nativeFloatingWindow;
}
if (!globalThis.OpenDeskProductScriptRunner
  || typeof OpenDeskProductScriptRunner.create !== 'function') {
  throw new Error('OpenDesk product Script Runner did not initialize');
}

const runner = OpenDeskProductScriptRunner.create({officialShell});

const calculatorCapabilityEntry = File.join(Execution.scriptDir, 'capabilities', 'calculator.js');
(0, eval)(File.read(calculatorCapabilityEntry) + '\n//# sourceURL=' + calculatorCapabilityEntry);
if (!globalThis.OpenDeskCalculatorCapability
  || typeof OpenDeskCalculatorCapability.execute !== 'function') {
  throw new Error('OpenDesk Calculator capability did not initialize');
}
const promotionAwareCalculator = OpenDeskPromotionsIntegration.wrapCalculator(
  OpenDeskCalculatorCapability,
  promotionOwnerRef,
);
const promotionAwareAgent = OpenDeskPromotionsIntegration.wrapAgent(
  globalThis.Agent,
  promotionOwnerRef,
);

const assistantEntries = [
  ['store.js', 'OpenDeskAssistantStore'],
  ['task-contract.js', 'OpenDeskAssistantTaskContract'],
  ['model-channel.js', 'OpenDeskAssistantModelChannel'],
  ['task-runtime.js', 'OpenDeskAssistantTaskRuntime'],
  ['task-service.js', 'OpenDeskAssistantTaskService'],
  ['session.js', 'OpenDeskAssistantSession'],
  ['controller.js', 'OpenDeskAssistantController'],
];
for (const [name, globalName] of assistantEntries) {
  const entry = File.join(Execution.scriptDir, 'assistant', name);
  (0, eval)(File.read(entry) + '\n//# sourceURL=' + entry);
  if (!globalThis[globalName]) throw new Error(`OpenDesk AI assistant module did not initialize: ${name}`);
}
const assistantTaskService = OpenDeskAssistantTaskService.create({
  agent: promotionAwareAgent,
  calculator: promotionAwareCalculator,
});
const assistant = OpenDeskAssistantController.create({
  appDataRoot: globalThis.OpenDeskProductPaths.appDataRoot,
  taskService: assistantTaskService,
  runnerAssetProvider: () => runner.currentAsset(),
});

const schedulerClientEntry = File.join(Execution.scriptDir, 'scheduler-client.js');
(0, eval)(File.read(schedulerClientEntry) + '\n//# sourceURL=' + schedulerClientEntry);
if (!globalThis.OpenDeskSchedulerClient
  || typeof OpenDeskSchedulerClient.listJobs !== 'function'
  || typeof OpenDeskSchedulerClient.productActivity !== 'function'
  || typeof OpenDeskSchedulerClient.acknowledgeProductActivity !== 'function') {
  throw new Error('OpenDesk Scheduler/product-activity client did not initialize');
}
const nativeSchedulerClient = OpenDeskSchedulerClient;

promotionOwner = OpenDeskPromotionsOwner.create({
  file: File,
  ui,
  appRuntime: automation.app,
  appDataRoot: globalThis.OpenDeskProductPaths.appDataRoot,
  officialShell,
  schedulerClient: nativeSchedulerClient,
  creative: OpenDeskOfficialPromotionCreative.create(),
  getRunnerState: () => runner.state(),
  // Script Runner has no product fullscreen or presentation mode. The native
  // surface state still supplies visible/onScreen/bounds; unknown automation,
  // Recorder, Measurement and Scheduler activity fails closed separately.
  getForegroundIdle: () => true,
  getFullscreen: () => false,
  getPresentationMode: () => false,
  logger: globalThis.console,
});
// Scheduler UI actions are guarded by the same owner. Background scheduler
// execution is independently guarded in cmd/opendesk by the native activity
// coordinator, so neither path depends on polling alone.
globalThis.OpenDeskSchedulerClient = promotionOwner.wrapSchedulerClient(nativeSchedulerClient);

const schedulerCenterEntry = File.join(Execution.scriptDir, 'scheduler-center.js');
(0, eval)(File.read(schedulerCenterEntry) + '\n//# sourceURL=' + schedulerCenterEntry);
if (!globalThis.OpenDeskSchedulerCenter
  || typeof OpenDeskSchedulerCenter.create !== 'function') {
  throw new Error('OpenDesk Scheduler Center did not initialize');
}

const runtimeLogEntry = File.join(Execution.scriptDir, 'runtime-log.js');
(0, eval)(File.read(runtimeLogEntry) + '\n//# sourceURL=' + runtimeLogEntry);
if (!globalThis.OpenDeskRuntimeLog
  || typeof OpenDeskRuntimeLog.create !== 'function') {
  throw new Error('OpenDesk Runtime Log did not initialize');
}
const permissionsCenterEntry = File.join(Execution.scriptDir, 'permissions-center.js');
(0, eval)(File.read(permissionsCenterEntry) + '\n//# sourceURL=' + permissionsCenterEntry);
if (!globalThis.OpenDeskPermissionsCenter
  || typeof OpenDeskPermissionsCenter.create !== 'function') {
  throw new Error('OpenDesk Permissions Center did not initialize');
}
const aboutEntry = File.join(Execution.scriptDir, 'about.js');
(0, eval)(File.read(aboutEntry) + '\n//# sourceURL=' + aboutEntry);
if (!globalThis.OpenDeskAbout || typeof OpenDeskAbout.create !== 'function') {
  throw new Error('OpenDesk About did not initialize');
}
const inspectorLauncherEntry = File.join(Execution.scriptDir, 'inspector-launcher.js');
(0, eval)(File.read(inspectorLauncherEntry) + '\n//# sourceURL=' + inspectorLauncherEntry);
if (!globalThis.OpenDeskInspectorLauncher
  || typeof OpenDeskInspectorLauncher.create !== 'function') {
  throw new Error('OpenDesk Inspector launcher did not initialize');
}

const appControllerEntry = File.join(Execution.scriptDir, 'app-controller.js');
(0, eval)(File.read(appControllerEntry) + '\n//# sourceURL=' + appControllerEntry);
if (!globalThis.OpenDeskProductAppController
  || typeof OpenDeskProductAppController.create !== 'function') {
  throw new Error('OpenDesk product App controller did not initialize');
}

const schedulerCenter = OpenDeskSchedulerCenter.create();
const runtimeLog = OpenDeskRuntimeLog.create({runner});
const permissionsCenter = OpenDeskPermissionsCenter.create();
const about = OpenDeskAbout.create({
  file: File,
  packageRoot: Execution.scriptDir,
  officialShell,
});
const inspectorLauncher = OpenDeskInspectorLauncher.create({
  system: System,
  command: Command,
  execution: Execution,
  ui: automation.ui,
});
const developerToolsEntry = File.join(Execution.scriptDir, 'developer-tools.js');
(0, eval)(File.read(developerToolsEntry) + '\n//# sourceURL=' + developerToolsEntry);
if (!globalThis.OpenDeskDeveloperTools
  || typeof OpenDeskDeveloperTools.create !== 'function') {
  throw new Error('OpenDesk developer tools did not initialize');
}
const developerTools = OpenDeskDeveloperTools.create({
  appRuntime: automation.app,
  runner,
  schedulerClient: OpenDeskSchedulerClient,
  runtimeLog,
  inspectorLauncher,
  system: System,
});
const appController = OpenDeskProductAppController.create({
  appRuntime: automation.app,
  runner,
  assistant,
  schedulerCenter,
  runtimeLog,
  permissionsCenter,
  about,
  inspectorLauncher,
  developerTools,
  officialShell,
  promotions: promotionOwner,
  productActivityClient: OpenDeskSchedulerClient,
});
appController.start();
// Developer-tools state is auxiliary product metadata. It must never serialize the
// primary desktop launch path behind a loopback request or native menu update.
void developerTools.initialize();

// Silent startup preflight is deliberately status-only. Native permission
// prompts are reserved for an explicit Permissions Center action or the first
// real protected operation.
await permissionsCenter.preflight('startup');
const initialState = await runner.launch();
// Promotion startup is deliberately after the real Runner surface exists.
// The owner will still suppress itself if any required lifecycle source is
// unknown, active, hidden, list-open, or otherwise unsafe.
await promotionOwner.start();

console.log('OPENDESK_PRODUCT_APP_READY=' + JSON.stringify({
  executionId: Execution.id,
  packageId: capabilities.packageId,
  packageRoot: Execution.workdir,
  scriptDir: Execution.scriptDir,
  executable: System.getExecutablePath(),
  appDataRoot: globalThis.OpenDeskProductPaths.appDataRoot,
  scriptRoot: globalThis.OpenDeskProductPaths.scriptRoot,
  mainWindowId: initialState.mainWindowId,
  toolbarMaxWidth: initialState.toolbarMaxWidth,
  recipeProcessModel: 'app-owned-separate-execution',
  assistant: assistant.state(),
  scheduler: OpenDeskSchedulerClient.getCapabilities(),
  analytics: OpenDeskProductAnalytics.getCapabilities(),
  promotions: promotionOwner.state(),
  inspector: inspectorLauncher.getCapabilities(),
  permissions: permissionsCenter.state(),
  about: about.state(),
  appController: appController.state(),
  runtimeLog: runtimeLog.state(),
  developerTools: developerTools.state(),
  officialShell: officialShell.state(),
}));