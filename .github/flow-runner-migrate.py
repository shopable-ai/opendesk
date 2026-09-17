#!/usr/bin/env python3
from pathlib import Path
import re
import subprocess

WORKFLOW = '.github/workflows/flow-runner-migration.yml'
SELF = '.github/flow-runner-migrate.py'


def run(*args):
    subprocess.run(args, check=True)


def tracked_files():
    raw = subprocess.check_output(['git', 'ls-files', '-z'])
    return [item.decode() for item in raw.split(b'\0') if item]


def read_text(path):
    try:
        return Path(path).read_text(encoding='utf-8')
    except (OSError, UnicodeDecodeError):
        return None


def write_if_changed(path, before, after):
    if after != before:
        Path(path).write_text(after, encoding='utf-8')


def move(src, dst):
    src_path = Path(src)
    dst_path = Path(dst)
    if not src_path.exists():
        return
    if dst_path.exists():
        raise RuntimeError(f'migration destination already exists: {dst}')
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    run('git', 'mv', src, dst)


def historical(path):
    if path in {WORKFLOW, SELF}:
        return True
    value = path.lower()
    if path.startswith('apps/opendesk/script-runner-v1/'):
        return True
    if value.startswith(('docs/archive/', 'docs/archives/', 'docs/history/', 'docs/research/', 'prompts/archive/')):
        return True
    name = Path(path).name.lower()
    return name.startswith('changelog') or name == 'history.md'


def transform_current_text():
    # These tokens are deliberate compatibility/history references even in current files.
    protected = {
        'OPENDESK_SCRIPT_RUNNER_DIR': '__OD_LEGACY_RUNNER_ENV__',
        'script-runner-v1': '__OD_FROZEN_RUNNER_V1__',
        'ScriptRunnerV1': '__OD_FROZEN_RUNNER_V1_CAMEL__',
        'Script Runner v1': '__OD_FROZEN_RUNNER_V1_LABEL__',
    }
    replacements = [
        ('installOpenDeskScriptRunnerSimple', 'installOpenDeskFlowRunner'),
        ('OpenDeskScriptRunnerSimple', 'OpenDeskFlowRunner'),
        ('installOpenDeskScriptRunnerPlayer', 'installOpenDeskFlowRunnerPlayerController'),
        ('OpenDeskScriptRunnerPlayer', 'OpenDeskFlowRunnerPlayerController'),
        ('installOpenDeskScriptRunnerShortcuts', 'installOpenDeskFlowRunnerShortcutController'),
        ('OpenDeskScriptRunnerShortcuts', 'OpenDeskFlowRunnerShortcutController'),
        ('installOpenDeskProductScriptRunner', 'installOpenDeskProductFlowRunner'),
        ('OpenDeskProductScriptRunner', 'OpenDeskProductFlowRunner'),
        ('wrapRunnerController', 'wrapFlowRunnerController'),
        ('createRunnerFloatingWindow', 'createFlowRunnerFloatingWindow'),
        ('getRunnerState', 'getFlowRunnerState'),
        ('script-runner-simple.md', 'flow-runner.md'),
        ('script-runner-simple.js', 'flow-runner.js'),
        ('script-runner-simple', 'flow-runner'),
        ('Script Runner Simple', 'Flow Runner'),
    ]
    for path in tracked_files():
        if historical(path):
            continue
        before = read_text(path)
        if before is None:
            continue
        text = before
        for old, marker in protected.items():
            text = text.replace(old, marker)
        for old, new in replacements:
            text = text.replace(old, new)
        text = text.replace('ScriptRunner', 'FlowRunner')
        text = text.replace('scriptRunner', 'flowRunner')
        text = text.replace('Script Runner', 'Flow Runner')
        text = text.replace('script runner', 'flow runner')
        text = text.replace('script-runner', 'flow-runner')
        text = re.sub(r'SCRIPT_RUNNER_', 'FLOW_RUNNER_', text)
        for old, marker in protected.items():
            text = text.replace(marker, old)
        write_if_changed(path, before, text)


def semantic_component_transform(path):
    before = read_text(path)
    if before is None:
        return
    text = before
    pairs = [
        ('resolveSelectedScriptName', 'resolveSelectedEntryName'),
        ('selectedScriptName', 'selectedEntryName'),
        ('scriptDisplayName', 'entryDisplayName'),
        ('displayScriptName', 'displayEntryName'),
        ('displayScript', 'displayEntry'),
        ('scriptNames', 'entryNames'),
        ('selectedScript', 'selectedEntry'),
        ('selectScriptByName', 'selectEntryByName'),
        ('selectScript', 'selectEntry'),
        ('setScriptsFromEntries', 'setEntries'),
        ('setScriptsFromNames', 'setEntriesFromNames'),
        ('loadAllScripts', 'loadAllEntries'),
        ('loadScripts', 'loadEntries'),
        ('refreshScripts', 'refreshEntries'),
        ('isDirectScriptName', 'isDirectRunnableName'),
        ('directScriptEntry', 'directRunnableEntry'),
        ('scriptCount', 'entryCount'),
        ('scriptKey', 'entryKey'),
        ('failedScript', 'failedEntry'),
        ('compactScript', 'compactEntry'),
        ('panelScript', 'panelEntry'),
    ]
    for old, new in pairs:
        text = text.replace(old, new)
    text = re.sub(r'\bscripts\b', 'entries', text)

    # Local singular `script` in the component often holds any Runnable Entry.
    # Preserve literal Runtime protocol/kind values while renaming those identifiers.
    literal_protect = {
        "'-script'": '__OD_ARG_SCRIPT__',
        '"-script"': '__OD_ARG_SCRIPT_DQ__',
        "'script'": '__OD_LITERAL_SCRIPT__',
        '"script"': '__OD_LITERAL_SCRIPT_DQ__',
    }
    for old, marker in literal_protect.items():
        text = text.replace(old, marker)
    text = re.sub(r'\bscript\b', 'entry', text)
    for old, marker in literal_protect.items():
        text = text.replace(marker, old)

    text = text.replace('script-row', 'entry-row')
    text = text.replace('script-name', 'entry-name')
    text = text.replace('script-list', 'entry-list')
    write_if_changed(path, before, text)


def transform_flow_runner_tests():
    pairs = [
        ('resolveSelectedScriptName', 'resolveSelectedEntryName'),
        ('selectedScriptName', 'selectedEntryName'),
        ('scriptDisplayName', 'entryDisplayName'),
        ('displayScriptName', 'displayEntryName'),
        ('displayScript', 'displayEntry'),
        ('scriptNames', 'entryNames'),
        ('selectedScript', 'selectedEntry'),
        ('selectScriptByName', 'selectEntryByName'),
        ('selectScript', 'selectEntry'),
        ('setScriptsFromEntries', 'setEntries'),
        ('setScriptsFromNames', 'setEntriesFromNames'),
        ('loadAllScripts', 'loadAllEntries'),
        ('loadScripts', 'loadEntries'),
        ('refreshScripts', 'refreshEntries'),
        ('isDirectScriptName', 'isDirectRunnableName'),
        ('directScriptEntry', 'directRunnableEntry'),
        ('scriptCount', 'entryCount'),
        ('compactScript', 'compactEntry'),
        ('panelScript', 'panelEntry'),
    ]
    ui_pairs = [
        ('Script Runner', 'Flow Runner'),
        ('上一个脚本', '上一个流程'),
        ('下一个脚本', '下一个流程'),
        ('当前脚本', '当前流程'),
        ('选择脚本', '选择流程'),
        ('脚本列表', '流程列表'),
        ('管理脚本', '管理流程'),
        ('暂无可运行脚本', '暂无可运行的流程'),
        ('当前没有可运行脚本', '暂无可运行的流程'),
        ('暂无脚本', '暂无流程'),
    ]
    for path in tracked_files():
        if not path.startswith('tests/'):
            continue
        before = read_text(path)
        if before is None:
            continue
        if 'flow-runner' not in path and 'FlowRunner' not in before and 'flowRunner' not in before:
            continue
        text = before
        for old, new in pairs + ui_pairs:
            text = text.replace(old, new)
        text = re.sub(r'\bscripts\b', 'entries', text)
        text = text.replace('script-row', 'entry-row').replace('script-name', 'entry-name').replace('script-list', 'entry-list')
        write_if_changed(path, before, text)


def patch_controller():
    path = 'apps/opendesk/flow-runner/controller.js'
    before = read_text(path)
    if before is None:
        raise RuntimeError('missing Flow Runner controller')
    text = before
    text = text.replace("const RUN_LOG_ROOT = ['.runtime', 'examples', 'custom-ui', 'flow-runner', 'runs'];",
                        "const RUN_LOG_ROOT = ['.runtime', 'flow-runner', 'runs'];")
    ui_pairs = [
        ("title: 'OpenDesk Flow Runner'", "title: 'OpenDesk — 自动化'"),
        ('>Flow Runner</strong>', '>自动化</strong>'),
        ('暂无可运行脚本', '暂无可运行的流程'),
        ('当前没有可运行脚本', '暂无可运行的流程'),
        ('当前脚本', '当前流程'),
        ('选择脚本', '选择流程'),
        ('上一个脚本', '上一个流程'),
        ('下一个脚本', '下一个流程'),
        ('脚本列表加载失败', '流程列表加载失败'),
        ('脚本列表', '流程列表'),
        ('管理脚本', '管理流程'),
        ('正在加载脚本', '正在加载流程'),
        ('正在读取脚本目录', '正在读取自动化目录'),
        ('脚本目录不可用', '自动化目录不可用'),
        ('脚本目录', '自动化目录'),
        ('脚本根路径', '自动化根路径'),
        ('暂无脚本', '暂无流程'),
        ('个脚本', '个流程'),
        ('脚本名', '流程条目名'),
        ('脚本已不存在', '自动化条目已不存在'),
        ('没有可运行的脚本', '暂无可运行的流程'),
        ('请先勾选至少一个脚本', '请先勾选至少一个流程'),
        ('剩余脚本不会继续执行', '剩余流程不会继续执行'),
        ('正在停止当前脚本', '正在停止当前流程'),
        ('已完成 ${outcome.completed}/${outcome.total} 个脚本成功', '已完成 ${outcome.completed}/${outcome.total} 个流程'),
    ]
    for old, new in ui_pairs:
        text = text.replace(old, new)
    text = text.replace("toolbar.addLabel('script'", "toolbar.addLabel('entry'")
    text = text.replace("toolbar.updateLabel('script'", "toolbar.updateLabel('entry'")
    text = text.replace("logRecord('FLOW_RUNNER_SCRIPT_DELETED'", "logRecord('FLOW_RUNNER_ENTRY_DELETED'")
    write_if_changed(path, before, text)


def patch_player():
    path = 'apps/opendesk/flow-runner/player-controller.js'
    before = read_text(path)
    if before is None:
        raise RuntimeError('missing Flow Runner player controller')
    text = before
    for old, new in [
        ("title: 'OpenDesk Flow Runner'", "title: 'OpenDesk — 自动化'"),
        ('脚本列表', '流程列表'),
        ('管理脚本', '管理流程'),
        ('暂无可运行脚本', '暂无可运行的流程'),
        ('暂无脚本', '暂无流程'),
        ('当前脚本已不存在', '当前流程已不存在'),
        ('没有可运行的脚本', '暂无可运行的流程'),
        ('上一个脚本', '上一个流程'),
        ('下一个脚本', '下一个流程'),
    ]:
        text = text.replace(old, new)
    text = text.replace("updateLabel', 'script'", "updateLabel', 'entry'")
    text = text.replace("addLabel('script'", "addLabel('entry'")
    text = text.replace("interactionGroup: 'flowRunnerPlayer'", "interactionGroup: 'flowRunnerPlayer'")
    write_if_changed(path, before, text)


def patch_entry():
    path = 'apps/opendesk/flow-runner.js'
    before = read_text(path)
    if before is None:
        raise RuntimeError('missing Flow Runner entry')
    text = before
    text = text.replace('const RunnerController = global.OpenDeskFlowRunner;', 'const FlowRunnerController = global.OpenDeskFlowRunner;')
    text = text.replace('if (!RunnerController || typeof RunnerController.createApp', 'if (!FlowRunnerController || typeof FlowRunnerController.createApp')
    text = text.replace('RunnerController.createApp', 'FlowRunnerController.createApp')
    text = text.replace("const configuredRoot = readEnv('OPENDESK_SCRIPT_RUNNER_DIR');",
                        "const configuredRoot = readEnv('OPENDESK_FLOW_RUNNER_DIR') || readEnv('OPENDESK_SCRIPT_RUNNER_DIR');")
    text = text.replace('runnerExecution', 'flowRunnerExecution')
    text = text.replace("const DEFAULT_WINDOW_TITLE = 'OpenDesk — Flow Runner';", "const DEFAULT_WINDOW_TITLE = 'OpenDesk — 自动化';")
    text = text.replace('isScriptManagerWindowSpec', 'isFlowManagerWindowSpec')
    text = text.replace('createRunnerUI', 'createFlowRunnerUI')
    text = text.replace('createProductRunner', 'createProductFlowRunner')
    text = text.replace('createProductFloatingWindow', 'createProductFlowRunnerFloatingWindow')
    text = text.replace('剩余脚本不会继续执行', '剩余流程不会继续执行')
    text = text.replace("id === 'script'", "id === 'entry'")
    text = text.replace("id === 'script' &&", "id === 'entry' &&")
    text = text.replace('Script Runner failed', 'Flow Runner failed')
    text = text.replace('product Flow Runner requires Official Shell', 'product Flow Runner requires Official Shell')
    text = text.replace('runner-status', 'flow-runner-status')
    # Product wrapper state uses component identity; recipe/script fields remain technical.
    text = text.replace('runner: app ? app.state() : null,', 'flowRunner: app ? app.state() : null,')
    write_if_changed(path, before, text)


def patch_main():
    path = 'apps/opendesk/main.js'
    before = read_text(path)
    if before is None:
        raise RuntimeError('missing main.js')
    text = before
    pairs = [
        ('runnerControllerEntry', 'flowRunnerControllerEntry'),
        ('baseRunnerController', 'baseFlowRunnerController'),
        ('runnerPlayerEntry', 'flowRunnerPlayerEntry'),
        ('runnerShortcutEntry', 'flowRunnerShortcutEntry'),
        ('runnerEntry', 'flowRunnerEntry'),
        ('const runner = OpenDeskProductFlowRunner.create', 'const flowRunner = OpenDeskProductFlowRunner.create'),
        ('getFlowRunnerState: () => runner.state()', 'getFlowRunnerState: () => flowRunner.state()'),
        ('const runtimeLog = OpenDeskRuntimeLog.create({runner});', 'const runtimeLog = OpenDeskRuntimeLog.create({flowRunner});'),
        ('  runner,\n  schedulerClient:', '  flowRunner,\n  schedulerClient:'),
        ('  runner,\n  assistant,', '  flowRunner,\n  assistant,'),
        ('await runner.launch()', 'await flowRunner.launch()'),
    ]
    for old, new in pairs:
        text = text.replace(old, new)
    text = text.replace("'assets', 'script-previous.png'", "'assets', 'flow-previous.png'")
    text = text.replace("'assets', 'script-next.png'", "'assets', 'flow-next.png'")
    write_if_changed(path, before, text)


def patch_app_controller():
    path = 'apps/opendesk/app-controller.js'
    before = read_text(path)
    if before is None:
        return
    text = before
    text = text.replace('const runner = settings.runner;', 'const flowRunner = settings.flowRunner || settings.runner;')
    text = text.replace('if (!runner || typeof runner.open', 'if (!flowRunner || typeof flowRunner.open')
    text = text.replace('await runner.open(source);', 'await flowRunner.open(source);')
    write_if_changed(path, before, text)


def patch_developer_tools():
    path = 'apps/opendesk/developer-tools.js'
    before = read_text(path)
    if before is None:
        return
    text = before
    text = text.replace('const runner = settings.runner;', 'const flowRunner = settings.flowRunner || settings.runner;')
    text = text.replace("const runnerState = runner && typeof runner.state === 'function' ? runner.state() : {};",
                        "const flowRunnerState = flowRunner && typeof flowRunner.state === 'function' ? flowRunner.state() : {};")
    text = text.replace('id="runner"', 'id="flowRunner"')
    text = text.replace("runner: runnerState.active ? (runnerState.runner && runnerState.runner.listVisible ? '已显示' : '运行中 / 已隐藏') : '未启动',",
                        "flowRunner: flowRunnerState.active ? (flowRunnerState.flowRunner && flowRunnerState.flowRunner.listVisible ? '已显示' : '运行中 / 已隐藏') : '未启动',")
    write_if_changed(path, before, text)


def patch_runtime_log():
    path = 'apps/opendesk/runtime-log.js'
    before = read_text(path)
    if before is None:
        return
    text = before
    text = text.replace("const RUN_LOG_ROOT = ['.runtime', 'examples', 'custom-ui', 'flow-runner', 'runs'];",
                        "const RUN_LOG_ROOT = ['.runtime', 'flow-runner', 'runs'];\n  const LEGACY_RUN_LOG_ROOT = ['.runtime', 'examples', 'custom-ui', 'script-runner-simple', 'runs'];")
    pattern = re.compile(r"  function runRoot\(\) \{.*?\n  \}\n\n  function latestRunDirectory\(\) \{.*?\n  \}\n\n  async function readTail", re.S)
    replacement = '''  function rootPath(parts) {
    return file.join.apply(file, [productPaths.appDataRoot].concat(parts));
  }

  function runRoot() {
    return rootPath(RUN_LOG_ROOT);
  }

  function legacyRunRoot() {
    return rootPath(LEGACY_RUN_LOG_ROOT);
  }

  function runDirectories(root) {
    const rootInfo = file.stat(root);
    if (!rootInfo || rootInfo.type !== 'directory') return [];
    return file.listDir(root)
      .filter(name => {
        const info = file.stat(file.join(root, name));
        return info && info.type === 'directory';
      })
      .map(name => {
        const directory = file.join(root, name);
        const info = file.stat(directory) || {};
        const summary = safeJSON(file.join(directory, 'summary.json')) || {};
        const agentSummary = safeJSON(file.join(directory, 'agent_summary.json')) || {};
        const timestamp = Date.parse(summary.started_at || agentSummary.startedAt || info.modifiedAt || '') || 0;
        return {directory, name, timestamp};
      });
  }

  function latestRunDirectory() {
    const candidates = runDirectories(runRoot()).concat(runDirectories(legacyRunRoot()))
      .sort((left, right) => right.timestamp - left.timestamp || right.name.localeCompare(left.name));
    return candidates.length ? candidates[0].directory : '';
  }

  async function readTail'''
    text, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise RuntimeError('runtime-log run root block did not match')
    text = text.replace('const runner = settings.runner || null;', 'const flowRunner = settings.flowRunner || settings.runner || null;')
    text = text.replace('function runnerState()', 'function flowRunnerState()')
    text = text.replace("return runner && typeof runner.state === 'function' ? runner.state() : null;",
                        "return flowRunner && typeof flowRunner.state === 'function' ? flowRunner.state() : null;")
    text = text.replace('runnerState()', 'flowRunnerState()')
    text = text.replace('currentRunner', 'currentFlowRunner')
    text = text.replace('selectedIsRunner', 'selectedIsFlowRunner')
    write_if_changed(path, before, text)


def write_readmes_and_contracts():
    Path('apps/opendesk/flow-runner/README.md').write_text('''# Flow Runner

Flow Runner 是 OpenDesk 用于**发现、选择、运行和停止可运行自动化条目**的正式产品组件。

Canonical naming：

- 产品界面：`自动化`
- 架构组件：`Flow Runner`
- JavaScript 标识：`FlowRunner` / `flowRunner`
- 目录：`apps/opendesk/flow-runner/`
- 产品入口：`apps/opendesk/flow-runner.js`

Flow Runner 的 Runnable Entry 可以是：

- JavaScript：`.js` / `.mjs`
- Protected Package：`.odpkg`
- Installed Flow：由 `.odflow` 安装后进入 Flow Catalog 的 Flow

Flow Runner 不定义新的 JavaScript Runtime。普通 JavaScript 继续通过现有 OpenDesk execution/runtime 执行；受保护 Package 和 Installed Flow 继续使用已经存在的验证、授权和执行链路。

持久排序/选择配置继续使用 `.opendesk-runner.json`，避免产品升级破坏已有用户状态。新运行证据写入 `.runtime/flow-runner/runs/`；Runtime Log 同时读取旧 `.runtime/examples/custom-ui/script-runner-simple/runs/`，但不会搬迁或删除旧证据。

Recorder 仍然是独立的 `Recorder` 组件。Recorder 负责记录/生成自动化资产，Flow Runner 负责运行；两者不合并命名。
''', encoding='utf-8')

    Path('docs/architecture/execution/flow-runner.md').write_text('''# Flow Runner

## 1. 定位

Flow Runner 是 OpenDesk 中用于发现、选择、运行和停止**可运行自动化条目**的正式产品组件。产品界面统一显示为「自动化」。

它可以承载普通 JavaScript、受保护 Package 和已安装 Flow，但**不定义新的 JavaScript Runtime**。

```text
自动化（产品界面）
  ↓
Flow Runner（架构组件）
  ↓
Runnable Entry
  ├─ JavaScript (.js / .mjs)
  ├─ Protected Package (.odpkg)
  └─ Installed Flow (Flow Catalog)
  ↓
现有 OpenDesk execution / package / flow runtime
```

## 2. Canonical naming

| 层级 | 正式名称 |
| --- | --- |
| 用户界面 | 自动化 |
| 架构组件 | Flow Runner |
| JavaScript | `FlowRunner` / `flowRunner` |
| 目录 | `apps/opendesk/flow-runner/` |
| 产品入口 | `apps/opendesk/flow-runner.js` |
| 录制组件 | Recorder |

`JavaScript`、`script path`、`script source`、`.js`、`.mjs` 仍然是真实技术概念，不因为组件改名而改写。

## 3. 发现与选择

Flow Runner 合并两类来源：

1. recipes root 中的直接可运行文件：`.js`、`.mjs`、`.odpkg`；
2. Flow Catalog 中的 Installed Flow。

界面和状态模型以 runnable entry / entry 为主语，不再假设集合里只有脚本。

## 4. 运行与停止

Run / Stop / Previous / Next / List 均作用于当前 runnable entry。JavaScript 继续使用 `-script` execution；`.odpkg` 沿现有 Package 执行；Installed Flow 使用现有 `flow run` 链路。

Stop 保持既有 Abort/取消语义，不创建第二套 Runtime，也不因为命名迁移改变快捷键：

- Run：`CommandOrControl+Alt+R`
- Stop：`CommandOrControl+Alt+X`

## 5. 持久状态与运行证据

`.opendesk-runner.json` 是既有用户持久状态，文件名保持不变。

新运行记录写入：

```text
.runtime/flow-runner/runs/
```

旧证据不删除、不搬迁。Runtime Log 同时读取 legacy root：

```text
.runtime/examples/custom-ui/script-runner-simple/runs/
```

环境变量 canonical 名称为 `OPENDESK_FLOW_RUNNER_DIR`；为兼容已有部署，`OPENDESK_SCRIPT_RUNNER_DIR` 继续作为 fallback 读取。

## 6. Recorder 关系

Recorder 保持独立组件与目录：

```text
Recorder
  ↓
记录操作 / 生成 flow.js 或自动化资产
  ↓
Flow Runner
  ↓
运行
```

Recorder 不改名为 Flow Recorder / Workflow Recorder / Automation Recorder。

## 7. 兼容边界

`Script Runner` 是旧产品/组件名称，仅在 frozen v1、历史材料、legacy 环境变量和 legacy runtime-log 路径中保留。当前生产实现、正式入口、UI、错误码和新文档均以 Flow Runner 为 canonical 名称。

Flow 的 `.odflow`、`flow.json`、`flow.sig`、`flowId`、`flows/`、`flow-data/`、`flow-state/`、`main.odpkg`、`assets/`、`trust/` 均不因本迁移改变。
''', encoding='utf-8')

    flow_dist = Path('docs/architecture/execution/flow-distribution-installation.md')
    if flow_dist.exists():
        before = flow_dist.read_text(encoding='utf-8')
        note = '> Naming: 本文中的 **Flow Runner** 对应产品界面「**自动化**」。\n\n'
        if note not in before:
            lines = before.splitlines(keepends=True)
            at = 1 if lines and lines[0].startswith('#') else 0
            lines.insert(at, '\n' + note)
            flow_dist.write_text(''.join(lines), encoding='utf-8')


def write_migration_test():
    Path('tests/custom-ui/flow-runner-migration-contract.test.js').write_text(r'''\'use strict\';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));

test('Flow Runner owns canonical production paths', () => {
  assert.equal(exists('apps/opendesk/flow-runner.js'), true);
  assert.equal(exists('apps/opendesk/flow-runner/controller.js'), true);
  assert.equal(exists('apps/opendesk/flow-runner/player-controller.js'), true);
  assert.equal(exists('apps/opendesk/flow-runner/shortcut-controller.js'), true);
  assert.equal(exists('apps/opendesk/script-runner-simple.js'), false);
  assert.equal(exists('apps/opendesk/script-runner'), false);
  assert.equal(exists('apps/opendesk/script-runner-v1'), true);
});

test('main composes canonical Flow Runner globals and paths', () => {
  const source = read('apps/opendesk/main.js');
  assert.match(source, /flow-runner/);
  assert.match(source, /flow-runner\\.js/);
  assert.match(source, /OpenDeskFlowRunner/);
  assert.match(source, /OpenDeskProductFlowRunner/);
  assert.match(source, /const flowRunner =/);
  assert.doesNotMatch(source, /OpenDeskScriptRunner/);
  assert.doesNotMatch(source, /script-runner-simple/);
});

test('Runnable Entry discovery retains JavaScript, package and Installed Flow support', () => {
  const source = read('apps/opendesk/flow-runner/controller.js');
  assert.match(source, /\\.mjs/);
  assert.match(source, /\\.odpkg/);
  assert.match(source, /flowCatalogEnabled/);
  assert.match(source, /kind: 'flow'/);
  assert.match(source, /isDirectJavaScriptName/);
  assert.match(source, /isDirectRunnableName/);
  assert.match(source, /entries: \\(\\) =>/);
});

test('legacy config, env and runtime evidence remain compatible', () => {
  const controller = read('apps/opendesk/flow-runner/controller.js');
  const runtimeLog = read('apps/opendesk/runtime-log.js');
  const entry = read('apps/opendesk/flow-runner.js');
  assert.match(controller, /\\.opendesk-runner\\.json/);
  assert.match(controller, /\\['\\.runtime', 'flow-runner', 'runs'\\]/);
  assert.match(runtimeLog, /LEGACY_RUN_LOG_ROOT/);
  assert.match(runtimeLog, /script-runner-simple/);
  assert.match(entry, /OPENDESK_FLOW_RUNNER_DIR/);
  assert.match(entry, /OPENDESK_SCRIPT_RUNNER_DIR/);
});

test('user-visible Runner controls use automation/flow vocabulary', () => {
  const controller = read('apps/opendesk/flow-runner/controller.js');
  const player = read('apps/opendesk/flow-runner/player-controller.js');
  assert.match(controller, /自动化/);
  assert.match(controller, /当前流程/);
  assert.match(player, /上一个流程/);
  assert.match(player, /下一个流程/);
  assert.match(player, /流程列表/);
});

test('Recorder remains a separate canonical component', () => {
  assert.equal(exists('apps/opendesk/recorder'), true);
  assert.match(read('apps/opendesk/flow-runner/README.md'), /Recorder/);
});
''', encoding='utf-8')


def main():
    # Canonical source moves.
    move('apps/opendesk/script-runner', 'apps/opendesk/flow-runner')
    move('apps/opendesk/script-runner-simple.js', 'apps/opendesk/flow-runner.js')
    move('docs/architecture/execution/script-runner-simple.md', 'docs/architecture/execution/flow-runner.md')
    move('apps/opendesk/assets/script-previous.png', 'apps/opendesk/assets/flow-previous.png')
    move('apps/opendesk/assets/script-next.png', 'apps/opendesk/assets/flow-next.png')

    # Rename current test/example/doc paths containing the legacy component slug.
    allowed = ('tests/', 'docs/architecture/', 'docs/api/', 'docs/plans/', 'prompts/', 'examples/', 'apps/opendesk/')
    for old in sorted(tracked_files(), key=lambda p: (p.count('/'), len(p)), reverse=True):
        if 'script-runner' not in old or historical(old) or not old.startswith(allowed):
            continue
        new = old.replace('script-runner-simple', 'flow-runner').replace('script-runner', 'flow-runner')
        if old == new or not Path(old).exists():
            continue
        if Path(new).exists():
            raise RuntimeError(f'cannot rename {old}: {new} exists')
        Path(new).parent.mkdir(parents=True, exist_ok=True)
        run('git', 'mv', old, new)

    transform_current_text()

    for path in [
        'apps/opendesk/flow-runner/controller.js',
        'apps/opendesk/flow-runner/player-controller.js',
        'apps/opendesk/flow-runner/shortcut-controller.js',
    ]:
        semantic_component_transform(path)

    patch_controller()
    patch_player()
    patch_entry()
    patch_main()
    patch_app_controller()
    patch_developer_tools()
    patch_runtime_log()
    write_readmes_and_contracts()
    write_migration_test()
    transform_flow_runner_tests()

    print('FLOW_RUNNER_MIGRATION_STATUS')
    subprocess.run(['git', 'status', '--short'], check=True)


if __name__ == '__main__':
    main()
