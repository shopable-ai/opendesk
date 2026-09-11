'use strict';

const controllerFile = File.join(Execution.workdir, 'examples', 'custom-ui', 'script-runner-simple', 'controller.js');
(0, eval)(File.read(controllerFile) + '\n//# sourceURL=' + controllerFile);

if (!globalThis.OpenDeskScriptRunnerSimple || typeof OpenDeskScriptRunnerSimple.createApp !== 'function') {
  throw new Error('OpenDesk Script Runner Simple controller did not load');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const evidenceRoot = File.join(
  Execution.workdir,
  '.runtime',
  'tests',
  'script-runner-simple',
  String(Date.now()),
);
File.ensureDir(evidenceRoot);

async function runScenario(name, stopImmediately) {
  const root = File.join(evidenceRoot, name);
  const recipes = File.join(root, 'recipes');
  const marker = File.join(root, 'child-started.marker');
  File.ensureDir(recipes);
  File.write(
    File.join(recipes, 'child.js'),
    `'use strict';\nFile.write(${JSON.stringify(marker)}, 'started\\n');\n`,
  );

  let toolbar = null;
  class FakeToolbar {
    constructor() {
      toolbar = this;
      this.id = `script-runner-runtime-${name}`;
      this.buttons = new Map();
      this.labels = new Map();
      this.handlers = new Map();
      this.closed = false;
      this.closedPromise = new Promise(resolve => { this.resolveClosed = resolve; });
    }
    addButton(id, label, icon, callback) {
      this.buttons.set(id, {id, label, icon, callback, disabled: false});
    }
    addLabel(id, text, options) {
      this.labels.set(id, Object.assign({id, text}, options || {}));
    }
    async updateButton(id, patch) {
      Object.assign(this.buttons.get(id), patch);
    }
    async updateLabel(id, patch) {
      Object.assign(this.labels.get(id), patch);
    }
    on(type, callback) {
      this.handlers.set(type, callback);
    }
    onError(callback) {
      this.errorHandler = callback;
    }
    async show() {
      return {bounds: null};
    }
    waitUntilClosed() {
      return this.closedPromise;
    }
    async close() {
      if (this.closed) return;
      this.closed = true;
      const callback = this.handlers.get('close');
      if (callback) callback({type: 'close'});
      this.resolveClosed();
    }
  }

  const app = OpenDeskScriptRunnerSimple.createApp({
    scriptRoot: recipes,
    openListOnStart: false,
    file: File,
    command: Command,
    execution: Execution,
    system: System,
    ui: {async createWindow() { throw new Error('list window is disabled by this runtime test'); }},
    FloatingWindow: FakeToolbar,
    AbortController,
    logger: console,
  });

  const appRun = app.run();
  assert(toolbar !== null, `${name}: toolbar was not created`);
  const pending = toolbar.buttons.get('run').callback();
  let stopped = null;
  if (stopImmediately) stopped = await toolbar.buttons.get('stop').callback();
  const outcome = await pending;
  const markerExists = File.stat(marker) !== null;
  await toolbar.close();
  await appRun;

  return {name, stopped, outcome, markerExists};
}

const normal = await runScenario('normal-child', false);
assert(normal.outcome.status === 'succeeded', `normal child should succeed: ${JSON.stringify(normal)}`);
assert(normal.markerExists === true, 'normal child did not write its start marker');

const canceled = await runScenario('immediate-stop', true);
assert(canceled.stopped === true, `Stop should accept the pending run: ${JSON.stringify(canceled)}`);
assert(canceled.outcome.status === 'canceled', `pending run should be canceled: ${JSON.stringify(canceled)}`);
assert(canceled.outcome.completed === 0, `canceled run must complete zero scripts: ${JSON.stringify(canceled)}`);
assert(canceled.markerExists === false, 'pre-canceled child unexpectedly started and wrote its marker');

const result = {
  schemaVersion: 1,
  executable: System.getExecutablePath(),
  platform: System.getPlatformInfo().os,
  normal,
  canceled,
};
const resultFile = File.join(evidenceRoot, 'result.json');
File.write(resultFile, JSON.stringify(result, null, 2) + '\n');
console.log('SCRIPT_RUNNER_SIMPLE_RUNTIME_OK=' + JSON.stringify({resultFile, result}));
