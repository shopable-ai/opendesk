# OpenDesk product App Mode package

`apps/opendesk` is the release-owned App Mode package. It is intentionally
separate from framework infrastructure in `pkg/appshell` and from developer
fixtures under `examples/`.

## Product composition

OpenDesk no longer adds a Demo/welcome window in front of the Script Runner.
The product relationship is:

```text
OpenDesk App Mode
        |
        v
Product Script Runner                 <- official default user UI
- OpenDesk logo / official project home
- Run / Stop
- current script
- script list (`window.id = "main"`)
        |
        +-- Official Shell secondary actions
            - Customize
            - Help
```

`apps/opendesk/main.js` is only the composition root: it loads Official Shell,
creates the Product Script Runner, registers the App Shell action listener and
opens the Runner list at startup. Its top-level script then completes while the
App Shell keeps the execution alive. It does not create another product window.

The generic learning/API compatibility entry remains separate from this
product package. It uses the same shared Runner controller but does not receive
OpenDesk commercial/official actions.

## Ownership

- `pkg/appshell`: native tray/menu, manifest dispatch, main-window lifecycle and
  single-instance behavior.
- `internal/recorderbundle/ui/**`: the single canonical Recorder UI JavaScript
  and icon implementation. `bundle.go` only embeds and materializes those bytes
  for the built-in same-process `opendesk.recorder` secondary execution. The
  action is injected by the framework and is not declared in this package
  manifest.
- `apps/opendesk/script-runner/controller.js`: shared generic Script Runner
  behavior (discovery, ordering, Run/Stop, list/empty/error state and child
  recipe execution).
- `apps/opendesk/script-runner-simple.js`: product composition seam. It maps the
  Runner list to App Mode `main`, keeps one Runner/toolbar instance, and appends
  Official Shell secondary actions to the same FloatingWindow.
- `apps/opendesk/official-shell.js`: Homepage/Help/Customize metadata, protected product
  configuration, HTTPS-only navigation and future hidden commercial actions.
- `apps/opendesk/main.js`: composition root only.

The Script Runner UI executes in the main App Mode execution, but every normal
recipe remains a child OpenDesk process launched through `Command.run()` with
`System.getExecutablePath()` and `-script`. The package does not claim that
recipe execution is in-process.

## Official Shell

The first Product Script Runner control is the OpenDesk logo. It is a real
native image button, preserves the original brand colors, exposes the tooltip
and Accessibility name `打开 OpenDesk 官网`, and opens the canonical public
project page. P0 also keeps two core secondary actions visible on the right:

- `opendesk.customize` -> **定制**
- `opendesk.help` -> **帮助**

The core Runner controls remain primary. The actual FloatingWindow is one
shared toolbar, conceptually:

```text
[OpenDesk] | [Run] [Stop] [current script] [List] | [Customize] [Help]
```

`opendesk.marketplace` and `opendesk.upgrade` are reserved for future product
stages and remain hidden until there is a real marketplace or Premium feature
set. Official actions are independent of recipe execution state, so Help and
Customize remain usable while a recipe is running.

Configuration is loaded from:

```text
apps/opendesk/assets/official-shell.odcfg
```

The P0 file is a low-cost obfuscated, checksummed product configuration. It is
not a secret store or DRM boundary. If it is missing, corrupt, or attempts to
hide a core action, `official-shell.js` falls back to built-in defaults.

The homepage target is currently the canonical public repository
`https://github.com/shopable-ai/opendesk`; repository metadata does not yet
declare a separate product website. Help and Customize URLs remain empty
placeholders. In that state Product Runner calls the formal `ui.notify()` API
and shows:

```text
帮助中心待开放。
定制自动化服务待开放。
```

It does not create a window just to display those messages. If notification
presentation itself fails, Product Runner falls back to its existing list/status
surface. When production URLs are configured, Official Shell accepts HTTPS
targets only.

See `docs/architecture/official-shell-commercial-entrypoints.md` for ownership,
commercialization and future signed-config/OEM boundaries.

## P0 status

Implemented and locally verified on macOS: the main App Mode window keeps Help
and Customize visible with pending feedback when URLs are empty, Script Runner
can be opened, closed, and reopened, and the Quit action ends the OpenDesk
process. Marketplace, Pro, signed remote configuration, `Shell.openExternal()`,
and OEM/white-label behavior remain reserved or future work; Windows live UI is
not claimed by this repository.

## Main window and Tray lifecycle

`opendesk.app.json` keeps:

```text
window.mainId = "main"
window.closeBehavior = "hide"
tray.primaryAction = "opendesk.open"
```

The Product Script Runner list is the window with ID `main`. Therefore the App
Shell built-in Open/Show action shows and focuses the existing Runner list. It
does not start another Execution, another Runner or another toolbar.

With `menuMode = "merge"`, the system-owned Open/Show, Recorder and Quit
behavior stays with App Shell. The product's `runner.open` menu item and the
system `opendesk.open` action both resolve to the same Runner instance and the
same `main` window; neither creates another Runtime, toolbar or window.

## Writable data

Released bundles are read-only application assets. Product recipes, Runner
logs and built-in Recorder recordings use:

```text
~/.opendesk/apps/com.opendesk.desktop/
```

Set `OPENDESK_APP_DATA_DIR` to override that root. Set
`OPENDESK_SCRIPT_RUNNER_DIR` to use an existing recipe directory without
making it Runner-managed.

## Development

Run the package explicitly from the repository root:

```bash
./dist/opendesk -app apps/opendesk -allow-recorder-capture -console-mode script
```

Expected startup UI is Product Script Runner itself: its Floating toolbar plus
its list main window. The toolbar starts with the clickable OpenDesk logo. No
intermediate welcome/Demo panel should appear.

The built-in Recorder is a trusted framework action. The development command
above includes `-allow-recorder-capture`, so its **开始录制** control is enabled
when macOS Input Monitoring permission is available. Do not remove that flag
when recording is needed; without it the toolbar intentionally keeps capture
disabled and explains the missing authorization in **查看详情**.
The Recorder toolbar uses the same first-position logo affordance and official
target as Script Runner.

## macOS release staging

```bash
APP_MODE_PACKAGE="$PWD/apps/opendesk" ./scripts/build_macos_app.sh
```

The builder stages this directory at
`OpenDesk.app/Contents/Resources/AppMode/`. A Finder/Launchpad launch with no
`-app` argument discovers that package automatically.

## Windows portable staging

On a supported Windows x64 builder:

```powershell
pwsh -NoProfile -File scripts/build_windows_distribution.ps1 `
  -Runtime win-x64 `
  -AppModePackage apps/opendesk
```

The package is staged at `app-mode/` beside `opendesk.exe`. This is a portable
distribution; the repository does not claim an MSI/MSIX installer or Windows
live verification from non-Windows cross-build evidence.

## Live acceptance evidence

Store local acceptance artifacts outside Git-tracked source, for example:

```text
.runtime/evidence/app-mode-product/<timestamp>/
```

Acceptance should cover one `opendesk` App Mode process/App Shell/Tray,
startup directly into Runner toolbar + list, homepage navigation, Run/Stop,
Help/Customize notify,
OS close-to-hide followed by system Open/Show restoring the same `main` window,
no duplicate toolbar/Execution, built-in Recorder coexistence, Quit and
single-instance activation. `.runtime` evidence must not be committed.
