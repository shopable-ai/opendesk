# OpenDesk product App Mode package

`apps/opendesk` is the release-owned App Mode package. It is intentionally
separate from framework infrastructure in `pkg/appshell` and from developer
fixtures under `examples/`.

## Ownership

- `pkg/appshell`: native tray/menu, manifest dispatch, App Shell lifecycle.
- `internal/recorderbundle`: framework-internal Go bundler whose `ui/` subtree
  contains the canonical JavaScript Recorder UI. The Go code only embeds and
  materializes those assets; it does not replace the JS implementation. `opendesk.recorder` is injected by the framework and is therefore
  not declared in this package manifest.
- `apps/opendesk`: product window, Script Runner and product menu actions.

The Script Runner UI executes in the main App Mode execution, but every normal
recipe remains a child OpenDesk process launched through `Command.run()` with
`System.getExecutablePath()` and `-script`. The package does not claim that
recipe execution is in-process.

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
./dist/opendesk -app apps/opendesk -console-mode script
```

The built-in Recorder is a trusted framework action. For an explicit source
package invocation that needs capture during development, keep using the
existing Recorder capture authorization rules/flags.

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

## macOS live acceptance evidence

Store local acceptance artifacts outside Git-tracked source, for example:

```text
.runtime/evidence/app-mode-product/<timestamp>/
```

Acceptance should cover one `opendesk` App Mode process/App Shell/Tray,
primary-click menu opening, built-in Recorder open/reopen, Recorder History and
generation actions, product `runner.open`, Runner recipe Run/Stop, and
screenshots plus console/runtime logs. `.runtime` evidence must not be
committed.