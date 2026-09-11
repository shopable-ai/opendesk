---
title: Windows Build and Distribution Contract
description: Canonical Windows developer build, CI build, portable distribution, architecture policy, and evidence boundaries.
---

# Windows Build and Distribution Contract

## Decision

```text
Developer Build:       scripts/build_windows_app.ps1
CI Build:              .github/workflows/windows-core.yml calls the canonical distribution build and then runs gates
Distribution Build:    scripts/build_windows_distribution.ps1
Release Packaging:     portable directory only for P0; installer/signing are deferred
Canonical Entry Point: pwsh -NoProfile -File scripts/build_windows_distribution.ps1 -Runtime win-x64
Windows orchestration: PowerShell
Architecture policy:   win-x64 supported/verified; win-arm64 whole application unverified
```

PowerShell is retained because the Windows artifact is a composition of the Go runtime and a self-contained .NET Windows sidecar. The repository script owns that Windows-native orchestration, path layout, architecture checks, and provenance. GitHub Actions does not duplicate the composition rules; it calls the canonical repository command and runs evidence gates against its staging directory.

A Go release driver is intentionally not introduced in P0. It would still shell out to `go` and `dotnet`, while adding another build layer before there is a cross-platform release-composition problem that justifies it. GoReleaser is also deferred: the immediate requirement is one portable Windows application directory with a .NET sidecar closure, not a multi-platform archive/signing pipeline. The existing `Makefile` is not a Windows canonical entry point because it explicitly uses `/bin/zsh` and Unix-oriented commands.

## Four separate levels

| Level | P0 contract |
| --- | --- |
| Developer Build | Build the complete Windows application pair for local development with `scripts/build_windows_app.ps1`. |
| CI Build | Compile/test on `windows-latest`, build the canonical portable distribution once, and run Windows gates against that staged distribution. |
| Distribution Bundle | A copyable `dist/windows/win-x64/` directory that does not depend on the repository root, `.runtime/`, source checkout, or the caller's current directory. |
| Installer / Release Package | Not part of Windows P0. ZIP/MSI/MSIX/NSIS/Inno Setup and code signing are a later release-engineering phase. |

## Portable layout

The canonical P0 layout follows the Runtime's existing Native UI Host discovery rule:

```text
dist/windows/win-x64/
├── opendesk.exe
├── distribution-provenance.json
├── polyfills/
│   └── ... Runtime bootstrap and compatibility JavaScript ...
├── jslibs/
│   └── ... Runtime JavaScript library closure ...
├── resources/
│   └── opendesk-notification.png
├── sounds/
│   └── public/
│       └── ... predefined Runtime sounds ...
└── ui-host/
    ├── opendesk-ui-host.exe
    ├── build-provenance.json
    └── ... self-contained dotnet publish closure ...
```

`pkg/customui/process_driver.go` already looks for `ui-host/opendesk-ui-host.exe` relative to the running Runtime executable on Windows. The production bundle therefore needs no repository-relative fallback and no development-machine absolute path.

`automation/utils.go` likewise resolves `polyfills/` and `jslibs/` from the Runtime executable before using repository/development fallbacks. The distribution builder owns the matching asset layout and records every staged Runtime asset with its SHA-256 digest. Default notification and sound resources follow their existing executable-relative discovery paths; application scripts, project Custom UI files, Native Extensions, and App Mode package assets remain application/user inputs and are not copied from the source tree.

The UI host publish directory is replaced, not merged, on every build so stale files from another RID cannot survive into the bundle.

## Architecture policy

The UI host project can be published independently for `win-x64` or `win-arm64`. That does **not** establish whole-application ARM64 support.

For the complete P0 application:

- `win-x64` is the only supported distribution target.
- the Go runtime is built with `GOOS=windows` and `GOARCH=amd64`;
- the UI host is published as `win-x64`;
- both PE machine fields are checked for AMD64 (`0x8664`);
- UI host provenance must also say `win-x64`;
- an x64 distribution build is rejected on a non-x64 builder until the Go/CGO/native dependency chain has been validated there;
- requesting a whole-app `win-arm64` distribution fails explicitly instead of producing a mixed package.

`build_windows_ui.ps1 -Runtime win-arm64` remains available as a host-only experiment and prints an explicit warning that it does not declare OpenDesk ARM64 support.

## Distribution provenance

`distribution-provenance.json` records the source commit, dirty flag, target/runtime architecture, executable SHA-256 hashes, PE machine values, UI host closure count, every Runtime asset path and SHA-256 digest, Go/.NET toolchain versions, canonical build command, and build timestamp.

This is build provenance for the portable directory. It is not code signing or an installer trust chain.

## Windows Core evidence

The Windows Core workflow consumes the final staging directory for:

- public Runtime Window contract;
- repository-owned Win32 window fixture contract;
- hosted-deterministic Native UI Host protocol smoke;
- portable Runtime launch from a copied Unicode + space path;
- non-repository current working directory;
- manifest/hash closure for packaged polyfills, JavaScript libraries, notification icon, and predefined sounds;
- real initialization of both the UI polyfill and a bundled JavaScript library;
- Runtime-to-Native-UI-Host discovery through the bundled `ui-host/` path;
- explicit failure after the bundled host is removed;
- x64 PE/provenance consistency.

The hosted GitHub runner is real Windows, but these gates remain **Hosted Deterministic** evidence. They do not promote DPI, mixed-DPI multi-display behavior, real global input capture, Recorder, foreground switching, GlobalShortcut callbacks, visual Custom UI/Dialog/notification UX, or long-lived user-session lifecycle to verified status.

Those items require an interactive Windows 11 VM, physical machine, or self-hosted runner with a real user desktop session.

## P1 boundary

The next release-engineering step is not an installer by default. First establish repeatable interactive Windows evidence. Installer selection and code signing should be a separate decision once distribution/channel requirements exist.
