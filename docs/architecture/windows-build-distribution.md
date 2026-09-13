---
title: Windows Build and Distribution Contract
description: Canonical Windows developer build, CI build, portable distribution, user launch role, architecture policy, and evidence boundaries.
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

## Product process model: one product, one user launch entry

The Windows distribution contains multiple executables because they have different operating-system roles. This does **not** mean the user must start multiple OpenDesk applications.

```text
User
  -> desktop entry                     # the one normal user launches
       -> OpenDesk Runtime/App Mode
            -> starts ui-host automatically when a host-backed UI is first needed

Developer / automation / terminal
  -> CLI entry                         # command-line tooling, not a second desktop product

ui-host
  -> child helper process              # implementation detail, never a user launch entry
```

The product contract is therefore:

- **Normal end user:** launch exactly one desktop entry from Explorer / shortcut.
- **Developer or scripted operator:** invoke the CLI entry from Terminal/PowerShell when command-line behavior is required.
- **Native UI Host:** Runtime-owned child process. OpenDesk starts and stops it; users must not launch it manually.
- **App Mode / Script Runner / Recorder / Scheduler Center / Runtime Log:** product capabilities inside the same OpenDesk product lifecycle. They are not separate applications merely because a helper process exists.

A future installer or packaged release should expose only the desktop entry as the normal Start Menu/Desktop shortcut. CLI may be installed for developers, but it is not another end-user app icon. `ui-host/` remains an internal payload directory.

## Current P0 naming blocker

Current source attempts to build:

```text
opendesk.exe   -> Console subsystem CLI
OpenDesk.exe   -> Windows GUI subsystem desktop entry
```

That distinction is invalid as a portable Windows file contract because ordinary Windows directories are case-insensitive: the two names can resolve to the same path. This is a **P0 correctness issue**, not a reason to remove either role.

The target naming decision is:

```text
opendesk.exe           -> CLI / developer entry
opendesk-desktop.exe   -> GUI / normal user entry
ui-host/               -> internal native UI helper closure
```

The production rename must land atomically across:

- `scripts/build_windows_app.ps1`;
- `scripts/build_windows_distribution.ps1` and provenance;
- Installed App Builder input/output checks;
- Windows distribution tests / hosted gates;
- user and maintainer documentation.

Until those production paths are changed and Windows CI/live launch evidence passes, the current `OpenDesk.exe`/`opendesk.exe` pair is not release-qualified. Do not solve the problem by deleting the CLI role or `ui-host`; fix the filename/layout contract.

## Trusted helper process model

Starting a bundled helper executable is a normal desktop-application process model. The security boundary is **not** “never create a child process”; it is “only execute release-owned, integrity-checked components through a narrow protocol”. The end user still performs one launch action.

```text
user launches desktop entry once
        ↓
OpenDesk Runtime
        ↓  direct child-process creation, fixed package-relative path
ui-host/opendesk-ui-host.exe
        ↓  inherited stdio / versioned protocol
native windows
```

Release requirements for the helper path are:

- `ui-host` is built and shipped as part of the same OpenDesk distribution. Runtime must not download it on demand, generate it in `%TEMP%`, or execute a helper from an App Mode/user-writable package path.
- Production Windows releases must Authenticode-sign the desktop entry, CLI entry, Native UI Host, and any other executable/native binary that Windows can load, using the same stable trusted publisher identity and timestamping policy. An unsigned portable directory is a development/CI artifact, not a consumer trust-qualified release.
- Runtime launches the helper by an absolute path derived from its own installed/distribution root. Do not route the launch through `cmd.exe`, PowerShell, shell file associations, PATH lookup, or a user-controlled working directory.
- The helper runs at the same user/integrity level as OpenDesk. It does not request elevation merely to render UI and must not create an additional UAC flow.
- Communication remains local and narrow: inherited stdin/stdout or an equivalently authenticated local IPC channel. Do not expose the UI helper as a general loopback/network service.
- The helper lifecycle is owned by the Runtime: lazy start, bounded startup handshake, protocol/version verification, one owned session according to the current Custom UI contract, graceful shutdown, and forced cleanup if the parent exits or the helper becomes unhealthy.
- Runtime must fail closed if the resolved helper path escapes the release-owned location, the expected helper is missing, the protocol handshake is incompatible, or future release integrity/signature checks fail. It must not silently fall back to an arbitrary same-named executable found elsewhere on a consumer machine.
- Product UX never asks the user to find or start `opendesk-ui-host.exe`; seeing a helper process in Task Manager is normal internal implementation, not a second OpenDesk application.

Windows security products can still warn on a newly distributed binary because reputation and publisher trust are independent from the parent/child relationship. Therefore release qualification must separately test SmartScreen / Smart App Control behavior for **all shipped executable code paths**, not only the desktop entry. Consistent code signing reduces trust ambiguity but does not guarantee that a brand-new release has already accumulated SmartScreen reputation.

This design intentionally avoids two worse alternatives:

1. **Runtime-dropped helper:** writing a new EXE into a temporary/cache directory and immediately executing it creates unnecessary reputation, integrity, and endpoint-security risk.
2. **Forced single-process rewrite:** embedding the current .NET/WinForms/WebView2 host into the Go process would materially redesign Custom UI ownership and failure isolation merely to reduce Task Manager process count. That is not justified by the current threat model.

The preferred long-term presentation is still one visible product entry. A future installer may hide CLI/helper payloads under an internal installation directory and publish only one Start Menu/Desktop shortcut, while preserving the separate process roles internally.

## Four separate levels

| Level | P0 contract |
| --- | --- |
| Developer Build | Build the complete Windows desktop + CLI + native-helper payload for local development with `scripts/build_windows_app.ps1`. |
| CI Build | Compile/test on `windows-latest`, build the canonical portable distribution once, and run Windows gates against that staged distribution. |
| Distribution Bundle | A copyable `dist/windows/win-x64/` directory that does not depend on the repository root, `.runtime/`, source checkout, or the caller's current directory. |
| Installer / Release Package | Not part of Windows P0. ZIP/MSI/MSIX/NSIS/Inno Setup and code signing are a later release-engineering phase. |

## Portable layout

After the P0 naming fix, the intended role-oriented layout is:

```text
dist/windows/win-x64/
├── opendesk-desktop.exe              # normal user launch entry
├── opendesk.exe                      # CLI / developer entry
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
    ├── opendesk-ui-host.exe          # automatic child helper
    ├── build-provenance.json
    └── ... actual self-contained dotnet publish closure ...
```

Both user/CLI entries are link variants of the same `./cmd/opendesk` source and therefore do not create two independent business products or duplicate App Mode/Scheduler/Recorder implementations at the source level. They exist because Windows GUI and Console subsystem launch semantics differ.

Product-owned child executions started from the desktop entry explicitly request hidden-console behavior where appropriate. CLI calls retain normal terminal semantics.

`pkg/customui/process_driver.go` looks for `ui-host/opendesk-ui-host.exe` relative to the running Runtime executable on Windows. The production bundle therefore needs no repository-relative fallback and no development-machine absolute path. `ui-host` is started lazily by Runtime when a host-backed Custom UI operation needs it.

`automation/utils.go` likewise resolves `polyfills/` and `jslibs/` from the Runtime executable before using repository/development fallbacks. The distribution builder owns the matching asset layout and records staged Runtime assets with SHA-256 digests. Default notification and sound resources follow their existing executable-relative discovery paths; application scripts, project Custom UI files, Native Extensions, and App Mode package assets remain application/user inputs and are not copied from the source tree merely for directory symmetry.

The UI host publish directory is replaced, not merged, on every build so stale files from another RID cannot survive into the bundle.

## Architecture policy

The UI host project can be published independently for `win-x64` or `win-arm64`. That does **not** establish whole-application ARM64 support.

For the complete P0 application:

- `win-x64` is the only supported distribution target;
- the Go runtime is built with `GOOS=windows` and `GOARCH=amd64`;
- the UI host is published as `win-x64`;
- both Runtime entry PE machine fields and the UI host are checked for AMD64 (`0x8664`);
- desktop/CLI PE subsystems must be checked as GUI `2` and Console `3` respectively;
- UI host provenance must also say `win-x64`;
- an x64 distribution build is rejected on a non-x64 builder until the Go/CGO/native dependency chain has been validated there;
- requesting a whole-app `win-arm64` distribution fails explicitly instead of producing a mixed package.

`build_windows_ui.ps1 -Runtime win-arm64` remains available as a host-only experiment and prints an explicit warning that it does not declare OpenDesk ARM64 support.

## Distribution provenance

`distribution-provenance.json` records the source commit, dirty flag, injected Runtime compatibility version, target/runtime architecture, executable SHA-256 hashes, PE machine values, UI host closure count, Runtime asset paths and SHA-256 digests, Go/.NET toolchain versions, canonical build command, and build timestamp. The compatibility version comes from the repository-root `VERSION` file unless the same value is explicitly overridden through `-Version` or environment variable `VERSION`.

Provenance must describe **roles**, not infer role identity from case-only filenames. After the P0 rename, `layout.cliEntry` and `layout.desktopEntry` must resolve to two distinct Windows paths.

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
- x64 PE/provenance consistency and GUI/Console entry subsystem separation;
- no case-insensitive collision between the desktop and CLI entry paths.

The hosted GitHub runner is real Windows, but these gates remain **Hosted Deterministic** evidence. They do not promote DPI, mixed-DPI multi-display behavior, real global input capture, Recorder, foreground switching, GlobalShortcut callbacks, visual Custom UI/Dialog/notification UX, or long-lived user-session lifecycle to verified status.

Those items require an interactive Windows 11 VM, physical machine, or self-hosted runner with a real user desktop session.

## P1 boundary

The next release-engineering step is not an installer by default. First establish repeatable interactive Windows evidence and the one-user-entry contract. Installer selection and code signing should be a separate decision once distribution/channel requirements exist.
