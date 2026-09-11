'use strict';

const controllerFile = File.join(Execution.workdir, 'apps', 'opendesk', 'script-runner', 'controller.js');
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

async function within(pending, label, timeout = 15000) {
  let timer;
  try {
    return await Promise.race([
      pending,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ': timed out')), timeout); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitUntil(predicate, label) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    assert(Date.now() < deadline, label + ': timed out');
    await System.delay(25);
  }
}

function processExists(pid) {
  return System.getProcessList().some(process => process.pid === pid);
}

// Presentation is an injected seam; Command, AbortController, files and child
// OpenDesk processes are real. Native window/visual acceptance is separate.
function listUI() {
  return {
    async createWindow() {
      const controls = new Map();
      return {
        control(id) {
          if (!controls.has(id)) controls.set(id, {
            state: {}, handlers: {},
            on(type, callback) { this.handlers[type] = callback; },
            async update(patch) { Object.assign(this.state, patch); },
            async getState() { return this.state; },
          });
          return controls.get(id);
        },
        on() {}, async show() {}, async close() {},
      };
    },
  };
}

async function runScenario(name) {
  const stopImmediately = name === 'immediate-stop';
  const stopRunning = name === 'running-child-stop';
  const root = File.join(evidenceRoot, name);
  const recipes = File.join(root, 'recipes');
  const marker = File.join(root, 'child-started.marker');
  const remainingMarker = File.join(root, 'remaining-started.marker');
  const restartMarker = File.join(root, 'restarted.marker');
  const childPath = File.join(recipes, 'child.js');
  File.ensureDir(recipes);
  File.write(
    childPath,
    `File.write(${JSON.stringify(marker)}, JSON.stringify({pid: System.getPlatformInfo().processId}));\n`
      + (stopRunning ? 'while (true) { await System.delay(100); }\n' : ''),
  );
  File.write(File.join(root, 'child-source.js'), File.read(childPath));
  if (stopRunning) File.write(File.join(recipes, 'remaining.js'), `File.write(${JSON.stringify(remainingMarker)}, 'started');\n`);

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

  const commandCalls = [];
  const app = OpenDeskScriptRunnerSimple.createApp({
    scriptRoot: recipes,
    file: File,
    command: {
      async run(executable, args, options) {
        const call = {script: args[1], logDir: args[args.indexOf('-log-dir') + 1], settled: false};
        commandCalls.push(call);
        try {
          return await Command.run(executable, args, options);
        } catch (error) {
          call.errorCode = error.code;
          throw error;
        } finally {
          call.signalAborted = options.signal.aborted;
          call.settled = true;
        }
      },
    },
    execution: Execution,
    system: System,
    ui: listUI(),
    FloatingWindow: FakeToolbar,
    AbortController,
    logger: console,
  });

  const appRun = app.run();
  try {
    assert(toolbar !== null, `${name}: toolbar was not created`);
    let pending;
    if (stopRunning) {
      const window = await app.openList();
      for (let index = 0; index < app.scripts().length; index++) window.control(`select${index}`).state.checked = true;
      pending = window.control('runSelected').handlers.click();
    } else {
      pending = toolbar.buttons.get('run').callback();
    }
    let stopped = null;
    let childPID = null;
    let childObservedRunning = false;
    if (stopImmediately) stopped = await within(app.stopRun(), name + ' Stop');
    if (stopRunning) {
      await waitUntil(() => File.exists(marker) && File.read(marker).endsWith('}'), 'child start marker');
      childPID = JSON.parse(File.read(marker)).pid;
      childObservedRunning = processExists(childPID);
      assert(childObservedRunning, 'running child PID must be alive before Stop');
      stopped = await within(app.stopRun(), name + ' Stop');
    }
    const outcome = await within(pending, name + ' completion');
    const markerExists = File.exists(marker);
    if (markerExists) childPID = JSON.parse(File.read(marker)).pid;
    if (childPID !== null) await waitUntil(() => !processExists(childPID), 'child exit');
    const stateReleased = !app.state().running && app.state().activeRun === null;
    assert(stateReleased, name + ': run state was not released');
    assert(!toolbar.buttons.get('run').disabled && toolbar.buttons.get('stop').disabled, name + ': idle buttons were not restored');
    assert(!File.exists(remainingMarker), name + ': remaining queue unexpectedly started');
    const firstRunCalls = commandCalls.slice();
    let restart = null;
    if (stopImmediately || stopRunning) {
      assert(stopped === true && outcome.status === 'canceled' && outcome.completed === 0, name + ': cancellation failed');
      if (stopRunning) {
        assert(outcome.total === 2 && firstRunCalls.length === 1, 'Stop must cancel the remaining selected queue');
        assert(firstRunCalls[0].signalAborted && firstRunCalls[0].errorCode === 'CANCELED' && firstRunCalls[0].settled, 'real Command must settle with CANCELED');
      } else {
        assert(!markerExists && firstRunCalls.length === 0, 'immediate Stop unexpectedly launched a child');
      }
      File.write(childPath, `File.write(${JSON.stringify(restartMarker)}, JSON.stringify({pid: System.getPlatformInfo().processId}));\n`);
      const restartOutcome = await within(toolbar.buttons.get('run').callback(), name + ' restart');
      assert(restartOutcome.status === 'succeeded' && restartOutcome.completed === 1 && File.exists(restartMarker), name + ': restart must succeed');
      const restartPID = JSON.parse(File.read(restartMarker)).pid;
      await waitUntil(() => !processExists(restartPID), 'restarted child exit');
      assert(!app.state().running && app.state().activeRun === null, 'restart state was not released');
      assert(await app.stopRun() === false, 'Stop after completion must be a no-op');
      assert(!File.exists(remainingMarker), 'restart must not revive the canceled queue');
      assert(File.exists(marker) === markerExists, 'the canceled child must not start late');
      restart = {outcome: restartOutcome, marker: restartMarker, markerExists: true, pid: restartPID, childExited: true};
    }
    return {
      name, stopped, outcome, marker, markerExists, childPID, childObservedRunning,
      childExited: childPID === null ? null : !processExists(childPID),
      remainingMarkerExists: File.exists(remainingMarker), stateReleased,
      commandCalls: firstRunCalls, restart,
    };
  } finally {
    await toolbar.close();
    await within(appRun, name + ' app cleanup');
  }
}

const normal = await runScenario('normal-child');
assert(normal.outcome.status === 'succeeded', `normal child should succeed: ${JSON.stringify(normal)}`);
assert(normal.markerExists === true, 'normal child did not write its start marker');

const canceled = await runScenario('immediate-stop');
assert(canceled.stopped === true, `Stop should accept the pending run: ${JSON.stringify(canceled)}`);
assert(canceled.outcome.status === 'canceled', `pending run should be canceled: ${JSON.stringify(canceled)}`);
assert(canceled.outcome.completed === 0, `canceled run must complete zero scripts: ${JSON.stringify(canceled)}`);
assert(canceled.markerExists === false, 'pre-canceled child unexpectedly started and wrote its marker');

const running = await runScenario('running-child-stop');
assert(running.markerExists && running.childObservedRunning && running.childExited, 'running child lifecycle evidence incomplete');

const result = {
  schemaVersion: 2,
  executable: System.getExecutablePath(),
  platform: System.getPlatformInfo().os,
  normal,
  canceled,
  running,
};
const resultFile = File.join(evidenceRoot, 'result.json');
File.write(resultFile, JSON.stringify(result, null, 2) + '\n');
console.log('SCRIPT_RUNNER_SIMPLE_RUNTIME_OK=' + JSON.stringify({resultFile, result}));
