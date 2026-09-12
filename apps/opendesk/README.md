# OpenDesk product App Mode package

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
Tray / Menu:   打开 OpenDesk
Window title:  OpenDesk
Main section:  自动化
```

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

- `pkg/appshell`: native tray/menu, manifest dispatch, main-window lifecycle,
  single-instance behavior and framework-owned system actions.
- `internal/recorderbundle/ui/**`: the single canonical Recorder UI JavaScript
  and icon implementation. `bundle.go` embeds/materializes those bytes for the
  built-in same-process `opendesk.recorder` secondary execution. Recorder is
  injected by the framework and is not declared in this package manifest.
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
apps/opendesk/assets/official-shell.odcfg
```

The P0 file is a low-cost obfuscated, checksummed product configuration. It is
not a secret store or DRM boundary. If it is missing, corrupt, or attempts to
hide a core action, `official-shell.js` falls back to built-in defaults.

The homepage target is currently the canonical public repository
`https://github.com/shopable-ai/opendesk`; repository metadata does not yet
declare a separate product website. Help and Customize URLs can remain empty
placeholders. In that state the product uses `ui.notify()` rather than creating
another window just to display a message.

See `docs/architecture/official-shell-commercial-entrypoints.md` for ownership,
commercialization and future signed-config/OEM boundaries.

## Unified Tray target

The official OpenDesk desktop product target is one App Shell and one system
Tray/Menu owner:

```text
打开 OpenDesk
----------------
录制自动化
计划中心
新建计划…
运行日志…
----------------
开发者 >
    运行状态…
    打开 Inspector
    允许 Inspector 从局域网访问
    复制 Inspector LAN 地址
    打开日志目录
    调试信息 > 普通 / 详细
----------------
帮助与服务 >
    OpenDesk 官网
    帮助
    定制
----------------
退出 OpenDesk
```

Ownership is intentionally split:

- Open/Recorder/Developer/Quit are App Shell/framework-owned;
- Scheduler Center/New Schedule are package business actions;
- Runtime Log and Help/Services are OpenDesk product-shell composition;
- Recorder is not duplicated in `opendesk.app.json`;
- `打开 Script Runner` must disappear from the visible product menu, while the
  internal `runner.open` action can remain as a compatibility route to the same
  `main` window;
- the old `Open Scheduler` Web entry and the new Scheduler Center must not both
  appear as normal-user menu choices.

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

Closing/hiding the main UI is not Quit. Recorder, Scheduler Center, Runtime Log,
Help/Customize and background scheduled/running automation must remain usable
while the main UI is hidden. `Quit OpenDesk` owns the actual app teardown.

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
APP_MODE_PACKAGE="$PWD/apps/opendesk" ./scripts/build_macos_app.sh
```

The builder stages this directory at:

```text
OpenDesk.app/Contents/Resources/AppMode/
```

Finder/Launchpad launch with no `-app` argument discovers the bundled package
automatically. Formal desktop launch should not create a Terminal. CLI can
continue to call the signed bundle executable and inherit the caller Terminal.

## Windows distribution target

The current portable Windows staging places the App Mode package beside the
runtime under `app-mode/`. The product target is stronger than the current
packaging baseline:

```text
OpenDesk.exe   -> desktop GUI entry, no console window
opendesk.exe   -> CLI/developer entry, console subsystem
```

Both entries must share one Runtime core and App Mode contract. Child recipe
execution from the product UI must not create extra console windows; its
stdout/stderr must continue through pipes/artifacts.

Windows GUI/CLI entry separation is a target until it has real Windows build
and live evidence. Do not mark it implemented from a non-Windows cross-build.

## Current implementation status vs target

Already present in the repository:

- App Mode package and bundled-package discovery;
- one main App Shell/Tray owner;
- built-in Recorder action and shared UI process driver;
- main automation UI implemented through the current Script Runner code;
- Scheduler Center/client composition;
- Official Shell homepage/help/customize support;
- single-instance/main-window lifecycle;
- persistent execution artifacts;
- macOS bundle staging of `Resources/AppMode` and Windows staging of `app-mode`.

Still to close for the new product contract:

- remove user-visible `Script Runner` terminology;
- remove the duplicate visible `打开 Script Runner` menu item while preserving
  internal compatibility routing;
- merge/preserve the required Developer/legacy product capabilities in the one
  App Mode Tray;
- add the single-instance `运行日志` window and product menu entry;
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
icon-launch behavior, no desktop Terminal, one Tray owner, `打开 OpenDesk`,
Recorder coexistence, Scheduler backend connectivity, Runtime Log lifecycle,
child-recipe console suppression, Help/Customize, Quit, single-instance and
Windows/macOS platform-specific distribution behavior. `.runtime` evidence
must not be committed.
