---
title: App Mode desktop launch contract
description: Development and released desktop launch paths for App Mode packages.
---

# App Mode desktop launch contract

> **Audience: OpenDesk 官方源码维护者 / distribution maintainer.** 这页描述 Runtime、bundled App Mode、`apps/opendesk` 与 macOS/Windows release staging 的内部启动契约。普通第三方 App 开发者不需要 checkout OpenDesk 源码或使用 repository build scripts；请从 [Script App Packaging](../api/script-app-packaging.md) 和 [Installed Runtime App Builder](../api/app-builder.md) 开始。

## Boundary

`-app <directory>` remains the explicit development and portable CLI entry point. The official OpenDesk desktop distribution
always stages its first-party default App Mode package beside the executable. The executable discovers that package only when
launched with no user arguments. A developer can still build a generic Runtime template explicitly, but that is not an
official OpenDesk product artifact.

`examples/app-mode/basic` is a development fixture and must not be described as the product released to end users.

App Mode does not create a TCP execution Runtime endpoint. Its `singleInstance` control uses the platform App Shell lease
(Unix socket on macOS, named mutex/named pipe on Windows); Runtime HTTP endpoint allocation belongs to the separate
Framework/HTTP startup path. The official OpenDesk product may start an auxiliary Inspector/Workbench server in that same App
Mode process. It uses a random port, begins with loopback-only access policy, and does not create another Runtime, App Shell,
Tray/Menu, Scheduler, Recorder, or main App Mode execution.

## Development launch

Run these commands from the repository root after `make build`:

```bash
./dist/opendesk -app examples/app-mode/basic -console-mode script
```

For real Recorder capture, use the explicit trusted-local gate:

```bash
./dist/opendesk -app examples/app-mode/basic -allow-recorder-capture -console-mode script
```

After the process is ready, the normal user action is the real system menu item **打开 Recorder**. The capture flag is not
needed merely to show the toolbar, but without it the global-input controls are correctly disabled.

## macOS released app

With `APP_MODE_PACKAGE` unset, `scripts/build_macos_app.sh` uses the repository-owned `apps/opendesk` product package. That
package must contain `opendesk.app.json`; the script stages its contents at
`OpenDesk.app/Contents/Resources/AppMode/` before the bundle is signed.

From the repository root, a maintainer can assemble the mechanism with:

```bash
SKIP_CODESIGN=1 ./scripts/build_macos_app.sh
```

The command above is a packaging/verification example, not an end-user command. After the signed artifact is delivered, the
user launches `OpenDesk.app` from Finder or Launchpad. Launch Services supplies no App Mode arguments; the current executable
finds `Contents/Resources/AppMode/opendesk.app.json`, starts that package in the same process, and exposes the package's
single App Shell / Menu Bar item. The user then chooses **录制自动化** from that real menu.

An explicit absolute `APP_MODE_PACKAGE=/absolute/path/to/product-app` stages a custom product package. An explicit empty
`APP_MODE_PACKAGE=` builds the generic Runtime template for framework development; its no-argument legacy behavior is not an
official OpenDesk desktop distribution. This explicit opt-out prevents an omitted release variable from silently producing a
legacy HTTP-only `OpenDesk.app`.

## Windows released portable directory

P0 currently publishes a portable `win-x64` directory rather than an installer or MSIX registration. The canonical builder
can optionally stage the real product package beside the two Runtime entries:

```powershell
pwsh -NoProfile -File scripts/build_windows_distribution.ps1 -Runtime win-x64 -AppModePackage C:\absolute\path\to\product-app
```

The resulting `app-mode\opendesk.app.json` is discovered only for a no-argument launch. An end user runs GUI-subsystem
`opendesk-desktop.exe` from Explorer or a future Start Menu shortcut; it launches the desktop product without a Console.
Console-subsystem `opendesk.exe` is the CLI entry and inherits the caller's Terminal/PowerShell Console. Both binaries are
built from `./cmd/opendesk`, share the same Runtime/App Mode/App Shell/Scheduler/Recorder/Execution implementation, and use
the same single-instance policy. They are different Windows entry roles, not two user-facing OpenDesk products.

When a host-backed Custom UI is first required, Runtime starts the bundled
`ui-host\opendesk-ui-host.exe` automatically. This helper is an internal sidecar: the user does not launch it, it is not a
second product entry, and a future installer must not create a shortcut for it.

Without `-AppModePackage`, the portable executable has no default App Mode package and must be started with an explicit
`-app` path (or follows its existing no-argument behavior).

The Windows directory is a portable release artifact, not an installer: current repository scope does not create a Start Menu
shortcut, register file associations, or claim MSI/MSIX behavior. Windows live desktop interaction, including Recorder
capture and Start Menu launch, requires a real Windows user session and is not covered by macOS validation. Consumer release
qualification additionally needs Authenticode/signing, SmartScreen/Smart App Control/Defender, WebView2 clean-machine, UAC,
and helper lifecycle evidence; static layout checks are not substitutes for those gates.

## Source package and release payload closure

Source ownership, distribution payload, and runtime materialization are separate contracts:

```text
Source package
apps/opendesk/**
        |
        | repository-internal release policy
        v
Distribution payload
OpenDesk.app/Contents/Resources/AppMode/ | app-mode/
        |
        | runtime discovery / Recorder materialization
        v
Runtime execution
```

The repository-owned product package opts into explicit release closure with
`apps/opendesk/.release/app-mode-runtime-files.txt`. This file is build metadata, not an
`opendesk.app.json` schema field and not a runtime resource. Both macOS and Windows builders call the same
`internal/appmodepayload` staging implementation, so the selected runtime files and symlink/path checks cannot drift by platform.
Packages that do not contain this repository-internal policy keep the existing whole-package staging behavior.

For `apps/opendesk`, the current classification is:

| Class | Files | Release behavior |
| --- | --- | --- |
| A. Runtime Required | `opendesk.app.json`, product JS composition, Scheduler JS, `script-runner/controller.js`, tray/product-logo assets, Recorder controller/history JS, countdown PNGs and Recorder logo | explicitly staged |
| B. Runtime Optional / product configuration | `assets/official-actions.odcfg` | explicitly staged; runtime still has built-in fallback defaults |
| C. Build-time Only | `.release/**` | never staged |
| D. Documentation / Development Only | `README.md` | never staged |
| E. Unknown | none after the current runtime-closure audit | must be investigated before adding to the policy |

The policy fails closed if it lists `README.md`, `*.go`, `*.swift`, an absolute/escaping path, a missing/non-regular file, or
a symlink. The released product App Mode payload therefore remains self-contained without reading `examples/**`, `workflows/**`,
or the source repository at runtime. Development usage such as `./dist/opendesk -app apps/opendesk ...` continues to use the
source package directly and is intentionally unaffected by release staging.

## Verification evidence

For a desktop launch claim, record separately:

- the exact package staging command and bundle/portable layout;
- matching runtime/UI-host build provenance and hashes;
- the ordinary real desktop launch followed by the menu click that opens Recorder;
- confirmation that the user did not manually start CLI or Native UI Host;
- Recorder button state changes, generated/copy/Finder or Explorer results, and cleanup counts;
- the target OS live result, including no unexpected Console/UAC prompt;
- consumer security evidence for the signed release when that release channel exists.

A cross-compile, static package layout check, or hosted non-interactive build is not Windows live evidence.
