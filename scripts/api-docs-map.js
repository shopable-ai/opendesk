'use strict';

// 这里只维护导航/正文依赖，不维护参数、错误或方法合同。
// 文档正文归 docs/api；精确重载归 types。新 namespace 必须进入一个语义组。
const groups = [
  ['targets', '应用、窗口与几何', '识别应用/窗口、等待就绪、截图入口与坐标换算', ['app', 'window', 'page', 'geometry']],
  ['elements', '桌面目标与取值', '按文字、图片或原生语义发现目标、读值、等待和操作', ['desktop-ui', 'accessibility']],
  ['vision', '图像、OCR 与显示器', '已有图片分析、OCR、颜色、屏幕和录屏', ['vision', 'image-color', 'screen']],
  ['input-events', '输入、剪贴板与事件', '键鼠触摸、剪贴板、快捷键、桌面事件与通知观察', ['mouse', 'input', 'clipboard', 'global-shortcut', 'events', 'notifications']],
  ['data', '文件、路径与数据', '本地文件、JSON、路径、键值、SQL 与内置数据处理库', ['file', 'path', 'storage', 'sqlite', 'libs']],
  ['runtime', '执行、系统与进程', '执行上下文、计时取消、系统信息、子进程与音频', ['execution', 'global-apis', 'system', 'command', 'audio', 'sound']],
  ['presentation', 'OpenDesk 界面与交互', '提示、确认、自定义窗口、工具栏和 App Mode 生命周期', ['ui', 'dialog', 'notify', 'automation-app']],
  ['network-ai', '网络、回调与模型', 'HTTP 请求、当前 execution 的回调、模型及 CLI Agent', ['http', 'webhook', 'llm', 'agent']],
  ['authoring', '录制、扩展与 Flow', '人工录制、原生扩展发现、已安装 Flow 的资源路径', ['recorder-runtime', 'native-extension', 'flow']],
  ['entrypoints', '外部入口、计划与分发', '现有 CLI/HTTP/MCP、计划、安装和打包；不是 JS 全局对象', ['ai-cli', 'http-server', 'recorder', 'scheduler-api', 'scheduler-cli', 'flow-cli', 'app-package-cli', 'protected-packages']],
].map(([id, title, purpose, docs]) => ({id, title, purpose, docs}));

// 仅声明公开接收者与其类型拥有者。实例名是文档称呼，不是新全局对象。
const surfaces = {
  app: ['App'], window: ['window'], page: ['page'], geometry: ['Geometry'],
  'desktop-ui': ['UI', 'scope', 'Locator'], accessibility: ['Accessibility'],
  vision: ['Vision', 'OCR'], 'image-color': ['ImageColor'], screen: ['Screen'],
  mouse: ['mouse'], input: ['keyboard', 'touchscreen'], clipboard: ['clipboard'],
  'global-shortcut': ['globalShortcut'], events: ['Events'], notifications: ['Notifications'],
  file: ['File', 'FileHandle'], path: ['path'], storage: ['AppStorage'], sqlite: ['SQLite', 'db'],
  libs: ['queryString', '_', 'moment', 'cheerio', 'beautify', 'js_beautify', 'window.js_beautify'],
  execution: ['Execution'], 'global-apis': ['console', 'crypto', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask', 'delay', 'sleep', 'sleepSeconds', 'copyToClipboard', 'getClipboard', 'AbortController', 'AbortSignal', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'ReadableStream', 'WritableStream', 'TransformStream', 'notify', 'alert', 'confirm', 'prompt'], system: ['System'], command: ['Command'],
  audio: ['Audio'], sound: ['Sound', 'playback'],
  ui: ['ui', 'ToastHandle', 'WindowHandle', 'ControlHandle', 'FloatingWindow'],
  dialog: ['Dialog', 'alert', 'confirm', 'prompt'], notify: ['notify'], 'automation-app': ['automation.app'],
  http: ['http', 'axios'], webhook: ['Webhook', 'handle'], llm: ['LLM'], agent: ['Agent'],
  'recorder-runtime': ['Recorder', 'RecorderSession'], 'native-extension': ['NativeExtensions', 'NativeExtension'], flow: ['Flow'],
};
const types = {
  app: ['App'], window: ['window'], page: ['page'], geometry: ['Geometry'], 'desktop-ui': ['UI'],
  accessibility: ['Accessibility'], vision: ['Vision'], 'image-color': ['ImageColor'], screen: ['Screen'],
  mouse: ['mouse'], input: ['keyboard', 'touchscreen'], clipboard: ['clipboard'], 'global-shortcut': ['globalShortcut'],
  events: ['Events'], notifications: ['Notifications'], file: ['File'], path: ['path'], storage: ['AppStorage'],
  sqlite: ['sqlite'], execution: ['Execution'], 'global-apis': ['global', 'console'], system: ['System'],
  command: ['Command'], audio: ['Audio'], sound: ['Sound'], ui: ['FloatingWindow'], dialog: ['dialog'],
  'automation-app': ['automation-app'], http: ['http', 'axios'], webhook: ['Webhook'], llm: ['LLM'], agent: ['Agent'],
  'recorder-runtime': ['recorder'], 'native-extension': ['NativeExtension'],
};
const instances = {
  FileHandle: 'OpenDeskFileHandle', scope: 'OpenDeskUIWindowScope', Locator: 'OpenDeskUILocator',
  db: 'OpenDeskSQLiteDatabase', playback: 'OpenDeskSoundPlayback', handle: 'OpenDeskWebhookHandle',
  RecorderSession: 'OpenDeskRecorderSession', FloatingWindow: 'ClawdeskFloatingWindow',
  'automation.app': 'OpenDeskAutomationApp',
};
// 这些历史页没有独立方法合同；使用当前整页兜底，明确标记，不伪造精确小片段。
const wholePages = new Set(['sound', 'libs', 'native-extension']);
// 不把导航、示例总集和实现历史当成共享合同。
const navigation = /^(.*实现来源|.*Polyfill 的关系|相关|参见|更多|可复制示例|.*实战示例|.*常用方法|.*基本使用|.*验收|.*内部实现|.*谁负责编译|.*使用建议|.*选型建议|.*方法总表|API 一览|全局接口一览|.*主要方法|.*库总表)/;
// UI 的公共约定按当前方法族选择，其余 API 默认保守保留所有非方法 H2 正文。
const uiShared = ['Capture mapping 与 DPI', '新鲜度与副作用', '错误', '平台与能力'];
const dependencies = [
  // 跨页/委托依赖只记录位置；正文仍由 canonical Reference 唯一维护。
  {doc: 'global-apis', method: /^notify$/, contracts: [['notify', 'notify']]},
  {doc: 'global-apis', method: /^copyToClipboard$/, contracts: [['clipboard', 'clipboard.copy']]},
  {doc: 'global-apis', method: /^getClipboard$/, contracts: [['clipboard', 'clipboard.paste']]},
  ...['alert', 'confirm', 'prompt'].flatMap(name => [
    {doc: 'global-apis', method: new RegExp(`^${name}$`), contracts: [['dialog', name]]},
    {doc: 'dialog', method: new RegExp(`^${name}$`), delegate: () => `Dialog.${name}`},
  ]),
  {doc: 'desktop-ui', method: /^Locator\.waitFor$/, delegate: () => 'Locator.find'},
  {doc: 'desktop-ui', method: /^Locator\.(getValue|setValue)$/, delegate: name => `UI.${name.split('.').pop()}`},
  {doc: 'desktop-ui', method: /^Locator\.tap$/, contracts: [['desktop-ui', 'UI.tapTargets'], ['desktop-ui', 'UI.tapText'], ['desktop-ui', 'UI.tapImage']]},
  {doc: 'desktop-ui', method: /^Locator\.find$/, sections: ['accessibility#公共约定', 'accessibility#错误', 'accessibility#平台与能力']},
  {doc: 'window', method: /^window\.wait$/, delegate: () => 'window.get'},
  {doc: 'window', method: /^window\.activate$/, delegate: () => 'window.current'},
  {doc: 'http', method: /^http\.(get|post)$/, delegate: () => 'http.request'},
  {doc: 'http', method: /^(http|axios)\./, sections: ['http#http--axios错误行为', 'http#axios实现边界']},
  {doc: 'ui', method: /^ui\.notify$/, delegate: () => 'ui.toast'},
  {doc: 'ui', method: /^ToastHandle\./, delegate: () => 'ui.toast'},
  {doc: 'ui', method: /^(WindowHandle|ControlHandle)\./, delegate: () => 'ui.createWindow'},
  {doc: 'desktop-ui', method: /^UI\.(getValue|setValue|tapTargets|getMenuItems|findMenuItem|tapMenuItem)$/, sections: ['accessibility#公共约定', 'accessibility#错误', 'accessibility#平台与能力']},
  {doc: 'desktop-ui', method: /^UI\.tapTargets$/, delegate: () => 'UI.tapTexts'},

  {doc: 'file', method: /^File\.(readJSON|writeJSON)$/, sections: ['file#写入提交取消与并发', 'file#错误']},
  {doc: 'storage', method: /^AppStorage\.getItem$/, sections: ['storage#appstorage基本使用']},
  {doc: 'window', method: /^window\.(get|wait|list)$/, sections: ['app#公共约定']},
  {doc: 'desktop-ui', method: /^(scope\.|Locator\.)/, sections: ['desktop-ui#uiwithinwin', 'desktop-ui#ui-scope-locatortarget']},
  {doc: 'desktop-ui', method: /^scope\.(?!locator)/, delegate: name => `UI.${name.split('.').pop()}`},
  {doc: 'desktop-ui', method: /^(UI|Locator)\.(getValue|setValue)$/, sections: ['desktop-ui#原生文本值选项']},
  {doc: 'desktop-ui', method: /^UI\.tapTargets$/, sections: ['desktop-ui#原生-target-序列选项']},
  {doc: 'desktop-ui', method: /^UI\.(getMenuItems|findMenuItem|tapMenuItem)$/, sections: ['desktop-ui#原生菜单选项', 'desktop-ui#原生菜单-path']},
  {doc: 'desktop-ui', method: /^UI\.(findImages|findImage|tapImage)$/, sections: ['desktop-ui#图片选项', 'desktop-ui#scopewithin', 'desktop-ui#region', 'desktop-ui#relativeto']},
  {doc: 'desktop-ui', method: /^(UI\.(findTexts|findTextMatches|findText|hasText|readText|tapText|tapTexts|waitText|waitTextGone)|Locator\.(find|waitFor|tap))$/, sections: ['desktop-ui#文本选项', 'desktop-ui#scopewithin', 'desktop-ui#region', 'desktop-ui#relativeto']},
  {doc: 'desktop-ui', method: /^Locator\./, sections: ['desktop-ui#图片选项', 'desktop-ui#原生-target-序列选项']},
];
module.exports = {groups, surfaces, types, instances, wholePages, navigation, uiShared, dependencies};
