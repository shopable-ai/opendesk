// Single source of mode routing and suite ownership. No filesystem glob discovery.
(function createRegistry() {
'use strict';
const modules = {
  'core': { file: 'suites/core.js', exports: ["contract", "unit", "coverage", "smokeCase", "negative", "failureExit", "cleanup", "quality", "asyncStacks"] },
  'http-download': { file: 'suites/http-download.js', exports: ["httpDownload"] },
  'language': { file: 'suites/language.js', exports: ["language"] },
  'sqlite': { file: 'suites/sqlite.js', exports: ["sqlite"] },
  'accessibility': { file: 'suites/accessibility.js', exports: ["accessibility"] },
  'page-wait': { file: 'suites/page-wait.js', exports: ["pageWait"] },
  'file-json': { file: 'suites/file-json.js', exports: ["fileJSON"] },
  'environment': { file: 'suites/environment.js', exports: ["environment"] },
  'path': { file: 'suites/path.js', exports: ["pathContext"] },
  'custom-ui-config': { file: 'suites/custom-ui-config.js', exports: ["customUIConfig"] },
  'command': { file: 'suites/command.js', exports: ["commandGate"] },
  'sound': { file: 'suites/sound.js', exports: ["soundCancel"] },
  'notifications': { file: 'suites/notifications.js', exports: ["notifyIconLive"] },
  'live': { file: 'suites/live.js', exports: ["runLiveSeam", "liveOnly", "customUI", "dialog"] },
  'catalog': { file: 'suites/catalog.js', exports: ["liveSuite", "smokeSuite"] },
  'native-extension': { file: 'suites/native-extension.js', exports: ["prepareAppleVisionExtension", "prepareNativeExtension"] },
  'unit-selected': { file: 'suites/unit-selected.js', exports: ["unitSelected"] },
};
const modes = {
  "contract": "contract",
  "unit": "unit",
  "smoke": "smokeSuite",
  "live": "liveSuite",
  "live-only": "liveOnly",
  "coverage": "coverage",
  "negative": "negative",
  "sound-cancel": "soundCancel",
  "notify-icon-live": "notifyIconLive",
  "custom-ui": "customUI",
  "custom-ui-config": "customUIConfig",
  "dialog": "dialog",
  "command": "commandGate",
  "environment": "environment",
  "file-json": "fileJSON",
  "path": "pathContext",
  "language": "language",
  "sqlite": "sqlite",
  "accessibility": "accessibility",
  "page-wait": "pageWait",
  "unit-selected": "unitSelected",
  "http-download": "httpDownload"
};
const owners = Object.create(null);
for (const [name, definition] of Object.entries(modules)) {
  for (const entry of definition.exports) {
    if (Object.prototype.hasOwnProperty.call(owners, entry)) throw new Error(`duplicate suite entry: ${entry}`);
    owners[entry] = name;
  }
  Object.freeze(definition.exports);
  Object.freeze(definition);
}
for (const [mode, entry] of Object.entries(modes)) {
  if (!Object.prototype.hasOwnProperty.call(owners, entry)) throw new Error(`unregistered mode entry: ${mode} -> ${entry}`);
}
return Object.freeze({ modules: Object.freeze(modules), modes: Object.freeze(modes), owners: Object.freeze(owners) });
})
