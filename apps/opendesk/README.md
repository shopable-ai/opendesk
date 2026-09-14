# OpenDesk product App Mode package

> **Audience: OpenDesk 官方源码维护者。** `apps/opendesk/**` 是 OpenDesk 官方桌面产品源码，不是第三方 App 作者需要复制或理解的模板。普通 App 开发者只需已安装 Runtime、自有 JavaScript/assets 和 `opendesk.app.json`；请从 [`docs/api/script-app-packaging.md`](../../docs/api/script-app-packaging.md) 与 [`docs/api/app-builder.md`](../../docs/api/app-builder.md) 开始。

`apps/opendesk` is the release-owned App Mode package. It is intentionally
separate from framework infrastructure in `pkg/appshell` and from developer
fixtures under `examples/`.

The product-level target contract is frozen in:

```text
docs/architecture/opendesk-desktop-product-shell.md
```

That document owns the official desktop-product decisions for bundled launch,
visible menu names, runtime-log UI, console presentation and Windows GUI/CLI
entry separation. `docs/architecture/app-shell-tray-menu.md` remains the
framework-level App Shell/manifest/single-instance contract.

## Product composition

OpenDesk no longer adds a Demo/welcome window in front of its main automation
UI. The implementation is still based on the existing Script Runner controller,
but **`Script Runner` is an internal engineering name, not a product-facing
name**.

The target product relationship is:

```text
OpenDesk Desktop App
        |
        v
OpenDesk main UI                       <- official default user UI
- OpenDesk logo / official project home
- Run / Stop
- current automation
- automation list (`window.id = "main"`)
- runtime-log entry
        |
        +-- Recorder
        +-- Scheduler Center
        +-- Runtime Log
        +-- Developer tools
        +-- Official Shell secondary actions
            - Customize
            - Help
```

User-visible target terminology:

```text
Tray / Menu:   显示主窗口
Window title:  OpenDesk
Main section:  自动化
```

The visible label describes the actual lifecycle semantics: the action shows
and focuses the already-existing `main` window. The stable internal action ID
remains `opendesk.open` for compatibility.

The internal names below remain valid compatibility/implementation seams and do
not need a repository-wide rename:

```text
runner.open
OpenDeskProductScriptRunner
apps/opendesk/script-runner/**
apps/opendesk/script-runner-simple.js
```

`apps/opendesk/main.js` remains the composition root. It loads product
components, registers App Shell action listeners and opens the main UI. It must
not create an intermediate Demo/welcome product window.

The generic learning/API compatibility entry remains separate from this product
package. It can reuse shared Runner behavior without receiving every OpenDesk
official/commercial action.

## Ownership

Source ownership, distribution payload and runtime materialization are separate
contracts. Do not move product source merely to make a release bundle smaller.

- `pkg/appshell`: native tray/menu, manifest dispatch, main-window lifecycle,
  single-instance behavior and framework-owned system actions.
- `apps/opendesk/recorder/**`: the single canonical Recorder product source for
  controller/history JavaScript and the runtime icon adapter.
  Development/example/workflow entries point here.
- `internal/recorderbundle/**`: runtime/release adapter only. It embeds and
  materializes the canonical Recorder source for the built-in same-process
  `opendesk.recorder` secondary execution; it does not own a second UI source
  tree.
- `workflows/human-to-recipe/**`: workflow orchestration, not Recorder product
  resource ownership.
- `examples/custom-ui/**`: standalone learning/debug entrypoints, not Recorder
  product resource ownership.
- `apps/opendesk/script-runner/controller.js`: shared generic Runner behavior
  (discovery, ordering, Run/Stop, list/empty/error state and child recipe
  execution).
- `apps/opendesk/script-runner-simple.js`: product composition seam. It maps the
  automation list to App Mode `main`, keeps one toolbar/main UI instance and
  appends Official Shell product actions.
- `apps/opendesk/scheduler-center.js`: product Scheduler Center UI.
- `apps/opendesk/scheduler-client.js`: Scheduler backend client used by the
  product UI.
- `apps/opendesk/official-shell.js`: Homepage/Help/Customize metadata, protected
  product configuration, HTTPS-only navigation and future hidden commercial
  actions.
- `apps/opendesk/main.js`: product composition root only.

Every normal recipe remains a child OpenDesk execution launched through the
existing Runtime path. The product does not claim that recipe execution is
in-process.

## Release payload boundary

The source tree intentionally contains runtime, build-time and documentation
files together. A release must not copy that tree wholesale.

OpenDesk opts into an explicit repository-internal allowlist:

```text
apps/opendesk/.release/app-mode-runtime-files.txt
```

Both macOS and Windows builders use the shared `internal/appmodepayload` stager.
For this product package the release payload is exactly the allowlist. The
policy itself is build metadata: it is not an `opendesk.app.json` field and is
not copied into the released App Mode directory.

The following remain valid source files but are deliberately excluded from the
runtime distribution:

```text
README.md
.release/**
.runtime/**
*.go
*.swift
```

A third-party App Mode package without `.release/app-mode-runtime-files.txt`
keeps generic whole-package staging compatibility (while `.runtime/**` remains
development state and is skipped). This product-specific closure therefore does
not redefine the public App Package schema.

The detailed staging contract is documented in
`docs/architecture/app-mode-desktop-launch.md`.

## Official Shell

The first main-toolbar control is the OpenDesk logo. It is a real native image
button, preserves the original brand colors, exposes the tooltip and
Accessibility name `打开 OpenDesk 官网`, and opens the canonical public project
page. P0 also keeps two core secondary actions visible:

- `opendesk.customize` -> **定制**
- `opendesk.help` -> **帮助**

The target toolbar is conceptually:

```text
[OpenDesk] | [Run] [Stop] [current automation] [List] [Logs] | [Customize] [Help]
```

`opendesk.marketplace` and `opendesk.upgrade` are reserved for future product
stages and remain hidden until there is a real marketplace or Premium feature
set. Official actions remain independent of recipe execution state.

Configuration is loaded from:

```text
apps/opendesk/assets/product.odcfg
```

The P0 file is a low-cost obfuscated, checksummed operational-action
configuration. It is not a secret store or DRM boundary. A valid `.odcfg` wins
over a sibling `product.json`. A corrupt protected file fails closed
to built-in defaults and is never downgraded to plaintext; plaintext is only
considered when the protected file is absent.

The homepage target and every other official action URL come from the single
maintained source `configs/product.json`, compiled into this package's
`assets/product.odcfg`. Runtime `System.product.website` is derived
from the embedded generated asset and is not a second editable source. Help and Customize URLs can remain empty
placeholders. In that state the product uses `ui.toast()` rather than creating
another window just to display a message.

The sole plaintext maintenance source is `configs/product.json`.
The release caller explicitly runs
`opendesk config compile --input configs/product.json --output apps/opendesk/assets/product.odcfg`
to transform that one JSON file into the generated `.odcfg`; the compiler has
no product-specific default paths. `opendesk config inspect --input ...` shows
the validated effective payload and `opendesk config verify --input ... --output ...`
rejects corrupt or stale pairs. Runtime loading and release staging are
separate validation stages.

See `docs/architecture/official-shell-commercial-entrypoints.md` for ownership,
commercialization and future signed-config/OEM boundaries.

## Unified Tray target

The official OpenDesk desktop product target is one App Shell and one system
Tray/Menu owner:

```text
显示主窗口
----------------
录制自动化
AI 助手
----------------
计划中心
新建计划…
----------------
系统权限
运行日志
----------------
示例代码
API 文档
----------------
开发者 >
    运行状态
    桌面测量
    打开 Inspector
    打开日志目录
    调试信息 > 普通 / 详细
----------------
帮助与服务 >
    OpenDesk 官网
    帮助
    定制
----------------
退出
```

Menu labels follow the desktop convention that an ellipsis means the command
still requires additional input or selection before it can complete. Direct
window/page/mode entry points therefore do not use an ellipsis. `新建计划…` is
the intentional exception because creating a schedule continues into a data-entry
flow.

Ownership is intentionally split:

- Show Main Window/Recorder/Quit are App Shell/framework-owned;
- AI Assistant, Scheduler Center/New Schedule, System Permissions, Runtime Log,
  Examples and API Docs are package-declared product actions;
- Developer and Help/Services are OpenDesk product-shell composition;
- Recorder is not duplicated in `opendesk.app.json`;
- `打开 Script Runner` must disappear from the visible product menu, while the
  internal `runner.open` action can remain as a compatibility route to the same
  `main` window;
- the old `Open Scheduler` Web entry and the new Scheduler Center must not both
  appear as normal-user menu choices.

Scheduler Center creation supports both a `.js` path under the displayed
recipe root and inline JavaScript text. The file and inline example buttons
fill a ready-to-create `notify-and-log.js` plan or an explicit `ui.toast()` +
`console.log()` smoke template. Product-created jobs run with
execution-owned Custom UI enabled through the App Mode shared UI driver, while
their working directory remains the writable recipe root; generic HTTP
Scheduler executions keep their narrower capability policy.

The detailed target and acceptance rules live in
`docs/architecture/opendesk-desktop-product-shell.md`.

## Main window and lifecycle

The package keeps the lifecycle contract:

```text
window.mainId = "main"
window.closeBehavior = "hide"
tray.primaryAction = "opendesk.open"
```

`main` is the OpenDesk main UI. The App Shell built-in Open/Show action shows
and focuses the existing window. It does not start another App execution,
another toolbar or another Runtime.

Closing/hiding the main UI is not Quit. Recorder, AI Assistant, Scheduler Center,
System Permissions, Runtime Log, Examples/API Docs, Help/Customize and background
scheduled/running automation must remain usable while the main UI is hidden.
`退出` owns the actual app teardown.

## Runtime Log and console policy

The product target explicitly separates:

```text
Launch Mode
Console Presentation
Log Selection / Persistence
```

Formal desktop launch defaults to:

```text
System Terminal window: OFF
Persistent execution logs: ON
OpenDesk Runtime Log UI: on demand
```

CLI/development launch keeps the caller's Terminal and can use the existing
console modes/debug settings.

The planned `运行日志` window is a single-instance OpenDesk UI surface, not an
embedded system Terminal and not a second Runtime. P0 should reuse existing
execution artifacts such as:

```text
stdout.log
stderr.log
events.ndjson
summary.json
agent_summary.json
script_snapshot.js
```

Closing the log window must never stop the execution that produced those logs.

## Writable data

Released bundles are read-only application assets. Product recipes, execution
artifacts and built-in Recorder recordings use the writable application data
root, currently conceptually:

```text
~/.opendesk/apps/com.opendesk.desktop/
```

Set `OPENDESK_APP_DATA_DIR` to override that root. Set
`OPENDESK_SCRIPT_RUNNER_DIR` to use an existing recipe directory without making
it Runner-managed.

## Development

Run the package explicitly from the repository root:

```bash
./dist/opendesk -app apps/opendesk -allow-recorder-capture -console-mode script
```

This is a **development/verification command**. Its use of the caller Terminal
and `-console-mode script` does not define the product's desktop-launch UX.

The built-in Recorder is a trusted framework action. Explicit development
launch can use `-allow-recorder-capture`; a bundled official App Mode launch is
also trusted by the Runtime's bundled-package path, while OS-level permission
gates remain enforced by the Recorder backend.

## macOS release staging

```bash
./scripts/build_macos_app.sh
```

With `APP_MODE_PACKAGE` unset, the official builder selects this package by
default, validates it, and stages only its release-closed runtime
payload at:

```text
OpenDesk.app/Contents/Resources/AppMode/
```

For `apps/opendesk`, that file set must exactly match
`.release/app-mode-runtime-files.txt`; source-only files are not copied. Finder/
Launchpad launch with no `-app` argument discovers the bundled package
automatically. Formal desktop launch should not create a Terminal. CLI can
continue to call the signed bundle executable and inherit the caller Terminal.

## Windows distribution target

The portable Windows staging applies the same shared App Mode payload contract
beside the runtime under `app-mode/`; it must not maintain a second PowerShell
copy/filter implementation.

The longer-term product target remains:

```text
opendesk-desktop.exe -> desktop GUI entry, no console window
opendesk.exe         -> CLI/developer entry, console subsystem
```

Both entries must share one Runtime core and App Mode contract. Child recipe
execution from the product UI must not create extra console windows; its
stdout/stderr must continue through pipes/artifacts.

Windows GUI/CLI filenames and subsystem roles are now distinct in source and
release validation. Windows live launch remains unverified until exercised in
a real Windows desktop session; a non-Windows contract check does not replace it.

## Current implementation status vs target

Already present in the repository:

- App Mode package and bundled-package discovery;
- one main App Shell/Tray owner;
- built-in Recorder action and shared UI process driver;
- canonical Recorder product source under `apps/opendesk/recorder/**` with
  `internal/recorderbundle` as its runtime adapter;
- main automation UI implemented through the current Script Runner code;
- Scheduler Center/client composition;
- Official Shell homepage/help/customize support;
- single-instance/main-window lifecycle;
- persistent execution artifacts;
- one explicit App Mode runtime payload policy shared by macOS and Windows
  staging.

Still to close for the broader desktop product contract:

- remove remaining user-visible `Script Runner` terminology where applicable;
- remove duplicate visible `打开 Script Runner` menu choices while preserving
  internal compatibility routing;
- merge/preserve the required Developer/legacy product capabilities in the one
  App Mode Tray;
- add/complete the single-instance `运行日志` window and product menu entry;
- ensure formal desktop launch has no system Terminal/Console window;
- ensure child recipe execution never creates extra console windows;
- implement/verify the Windows GUI entry + CLI console entry split;
- perform click-level acceptance across OpenDesk, Recorder, Scheduler, Runtime
  Log, Developer, Help/Customize and Quit.

## Live acceptance evidence

Store local acceptance artifacts outside Git-tracked source, for example:

```text
.runtime/evidence/app-mode-product/<timestamp>/
```

Acceptance must cover the checklist in
`docs/architecture/opendesk-desktop-product-shell.md`, especially bundled
icon-launch behavior, no desktop Terminal, one Tray owner, `显示主窗口`,
Recorder coexistence, Scheduler backend connectivity, Runtime Log lifecycle,
child-recipe console suppression, Help/Customize, Quit, single-instance and
Windows/macOS platform-specific distribution behavior. `.runtime` evidence
must not be committed.
