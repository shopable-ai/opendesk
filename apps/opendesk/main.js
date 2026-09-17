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
  system: System,
  execution: Execution,
  packageRoot: Execution.scriptDir,
});

const localizationEntry = File.join(Execution.scriptDir, 'localization.js');
(0, eval)(File.read(localizationEntry) + '\n//# sourceURL=' + localizationEntry);
if (!globalThis.OpenDeskProductI18n || !OpenDeskProductI18n.install()) {
  throw new Error('OpenDesk product Locale Core bridge did not initialize');
}

// Promotions are product-owned. Their integration adapters are loaded before
// Flow Runner composition, but the concrete owner is assigned only after the Flow Runner
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
// in the established Flow Runner controller. Promotions decorate only the
// task boundary and surface lifecycle; the generic Flow Runner never learns about
// advertisers, campaigns, frequency, or paid-placement policy.
const flowRunnerControllerEntry = File.join(Execution.scriptDir, 'flow-runner', 'controller.js');
(0, eval)(File.read(flowRunnerControllerEntry) + '\n//# sourceURL=' + flowRunnerControllerEntry);
if (!globalThis.OpenDeskFlowRunner
  || typeof OpenDeskFlowRunner.createApp !== 'function') {
  throw new Error('OpenDesk Flow Runner base controller did not initialize');
}
const baseFlowRunnerController = OpenDeskPromotionsIntegration.wrapFlowRunnerController(
  OpenDeskFlowRunner,
  promotionOwnerRef,
);

const flowRunnerPlayerEntry = File.join(Execution.scriptDir, 'flow-runner', 'player-controller.js');
(0, eval)(File.read(flowRunnerPlayerEntry) + '\n//# sourceURL=' + flowRunnerPlayerEntry);
if (!globalThis.OpenDeskFlowRunnerPlayerController
  || typeof OpenDeskFlowRunnerPlayerController.wrapController !== 'function') {
  throw new Error('OpenDesk Flow Runner player controller did not initialize');
}
globalThis.OpenDeskFlowRunner = OpenDeskFlowRunnerPlayerController.wrapController(baseFlowRunnerController, {
  playerUI: OpenDeskPromotionsIntegration.createPlayerUI(ui, promotionOwnerRef),
  previousIcon: {
    path: File.join(Execution.scriptDir, 'assets', 'flow-previous.png'),
    renderingMode: 'template',
  },
  nextIcon: {
    path: File.join(Execution.scriptDir, 'assets', 'flow-next.png'),
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
const flowRunnerShortcutEntry = File.join(Execution.scriptDir, 'flow-runner', 'shortcut-controller.js');
(0, eval)(File.read(flowRunnerShortcutEntry) + '\n//# sourceURL=' + flowRunnerShortcutEntry);
if (!globalThis.OpenDeskFlowRunnerShortcutController
  || typeof OpenDeskFlowRunnerShortcutController.wrapController !== 'function') {
  throw new Error('OpenDesk Flow Runner shortcut controller did not initialize');
}
globalThis.OpenDeskFlowRunner = OpenDeskFlowRunnerShortcutController.wrapController(
  OpenDeskFlowRunner,
  {
    globalShortcut: globalThis.globalShortcut,
    system: System,
    console: globalThis.console,
  },
);

// flow-runner captures FloatingWindow during module installation. Give
// only that module a promotion-aware wrapper, then immediately restore the
// process global so unrelated product windows remain ordinary Custom UI.
const nativeFloatingWindow = globalThis.FloatingWindow;
const promotionAwareFloatingWindow = OpenDeskPromotionsIntegration.createFlowRunnerFloatingWindow(
  nativeFloatingWindow,
  promotionOwnerRef,
);
const flowRunnerEntry = File.join(Execution.scriptDir, 'flow-runner.js');
globalThis.FloatingWindow = promotionAwareFloatingWindow;
try {
  (0, eval)(File.read(flowRunnerEntry) + '\n//# sourceURL=' + flowRunnerEntry);
} finally {
  globalThis.FloatingWindow = nativeFloatingWindow;
}
if (!globalThis.OpenDeskProductFlowRunner
  || typeof OpenDeskProductFlowRunner.create !== 'function') {
  throw new Error('OpenDesk product Flow Runner did not initialize');
}

const flowRunner = OpenDeskProductFlowRunner.create({officialShell});

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
  ['model-channel.js', 'OpenDeskAssistantModelChannel'],
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
  getFlowRunnerState: () => flowRunner.state(),
  // Flow Runner has no product fullscreen or presentation mode. The native
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
const analyticsSettingsEntry = File.join(Execution.scriptDir, 'product-analytics', 'settings.js');
(0, eval)(File.read(analyticsSettingsEntry) + '\n//# sourceURL=' + analyticsSettingsEntry);
if (!globalThis.OpenDeskAnalyticsSettings
  || typeof OpenDeskAnalyticsSettings.create !== 'function') {
  throw new Error('OpenDesk Analytics Settings did not initialize');
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
const runtimeLog = OpenDeskRuntimeLog.create({flowRunner});
const permissionsCenter = OpenDeskPermissionsCenter.create();
const analyticsSettings = OpenDeskAnalyticsSettings.create({client: OpenDeskProductAnalytics});
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
  flowRunner,
  schedulerClient: OpenDeskSchedulerClient,
  runtimeLog,
  inspectorLauncher,
});
const appController = OpenDeskProductAppController.create({
  appRuntime: automation.app,
  flowRunner,
  assistant,
  schedulerCenter,
  runtimeLog,
  permissionsCenter,
  analyticsSettings,
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
const initialState = await flowRunner.launch();
// Promotion startup is deliberately after the real Flow Runner surface exists.
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
  runnableRoot: globalThis.OpenDeskProductPaths.runnableRoot,
  mainWindowId: initialState.mainWindowId,
  toolbarMaxWidth: initialState.toolbarMaxWidth,
  recipeProcessModel: 'app-owned-separate-execution',
  assistant: assistant.state(),
  scheduler: OpenDeskSchedulerClient.getCapabilities(),
  analytics: OpenDeskProductAnalytics.getCapabilities(),
  analyticsSettings: analyticsSettings.state(),
  promotions: promotionOwner.state(),
  inspector: inspectorLauncher.getCapabilities(),
  permissions: permissionsCenter.state(),
  about: about.state(),
  appController: appController.state(),
  runtimeLog: runtimeLog.state(),
  developerTools: developerTools.state(),
  officialShell: officialShell.state(),
}));
