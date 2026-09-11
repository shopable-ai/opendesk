---
title: App Mode desktop launch contract
description: Development and released desktop launch paths for App Mode packages.
---

# App Mode desktop launch contract

## Boundary

`-app <directory>` remains the explicit development and portable CLI entry point. A released desktop artifact can opt in to
one default App Mode package by staging it beside the executable. The executable discovers that package only when launched
with no user arguments; an artifact without the package keeps its historical no-argument HTTP service behavior.

`examples/app-mode/basic` is a development fixture and must not be described as the product released to end users.

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

`scripts/build_macos_app.sh` now accepts an optional absolute `APP_MODE_PACKAGE`. The release pipeline supplies the real
product package directory, which must contain `opendesk.app.json`; the script stages its contents at
`OpenDesk.app/Contents/Resources/AppMode/` before the bundle is signed.

From the repository root, a maintainer can assemble the mechanism with:

```bash
APP_MODE_PACKAGE=/absolute/path/to/product-app SKIP_CODESIGN=1 ./scripts/build_macos_app.sh
```

The command above is a packaging/verification example, not an end-user command. After the signed artifact is delivered, the
user launches `OpenDesk.app` from Finder or Launchpad. Launch Services supplies no App Mode arguments; the current executable
finds `Contents/Resources/AppMode/opendesk.app.json`, starts that package in the same process, and exposes the package's
single App Shell / Menu Bar item. The user then chooses **打开 Recorder** from that real menu.

If `APP_MODE_PACKAGE` was omitted, double-clicking the bundle starts the existing no-argument HTTP service instead. It does not
guess a repository package and does not turn the example into a released application.

## Windows released portable directory

P0 currently publishes a portable `win-x64` directory rather than an installer or MSIX registration. The canonical builder
can optionally stage the real product package beside `opendesk.exe`:

```powershell
pwsh -NoProfile -File scripts/build_windows_distribution.ps1 -Runtime win-x64 -AppModePackage C:\absolute\path\to\product-app
```

The resulting `app-mode\opendesk.app.json` is discovered only for a no-argument launch. An end user can run
`opendesk.exe` from Explorer or create a Start Menu shortcut to that executable; the existing Windows single-instance
policy remains in force. Without `-AppModePackage`, the portable executable has no default App Mode package and must be
started with an explicit `-app` path (or follows its existing no-argument behavior).

The Windows directory is a portable release artifact, not an installer: current repository scope does not create a Start Menu
shortcut, register file associations, or claim MSI/MSIX behavior. Windows live desktop interaction, including Recorder
capture and Start Menu launch, requires a real Windows user session and is not covered by macOS validation.

## Verification evidence

For a desktop launch claim, record separately:

- the exact package staging command and bundle/portable layout;
- matching runtime/UI-host build provenance and hashes;
- the ordinary real menu click that opens Recorder;
- Recorder button state changes, generated/copy/Finder results, and cleanup counts;
- the target OS live result. A cross-compile or package layout check is not Windows live evidence.
