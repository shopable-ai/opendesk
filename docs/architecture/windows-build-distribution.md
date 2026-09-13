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
Release Packaging:     portable directory for P0; consumer signing / installer are separate release gates
Canonical Entry Point: pwsh -NoProfile -File scripts/build_windows_distribution.ps1 -Runtime win-x64
Windows orchestration: PowerShell
Architecture policy:   win-x64 supported/verified target; win-arm64 whole application unverified
```

PowerShell is retained because the Windows artifact is a composition of the Go runtime and a self-contained .NET Windows sidecar. The repository script owns that Windows-native orchestration, path layout, architecture checks, and provenance. GitHub Actions does not duplicate the composition rules; it calls the canonical repository command and runs evidence gates against its staging directory.

A Go release driver is intentionally not introduced in P0. It would still shell out to `go` and `dotnet`, while adding another build layer before there is a cross-platform release-composition problem that justifies it. GoReleaser is also deferred: the immediate requirement is one portable Windows application directory with a .NET sidecar closure, not a multi-platform archive/signing pipeline. The existing `Makefile` is not a Windows canonical entry point because it explicitly uses `/bin/zsh` and Unix-oriented commands.

## Product process model: one product, one user launch entry

The Windows distribution contains multiple executables because they have different operating-system roles. This does **not** mean the user must start multiple OpenDesk applications.

```text
User
  -> opendesk-desktop.exe              # the one normal user launches
       -> OpenDesk Runtime/App Mode
            -> starts ui-host automatically when a host-backed UI is first needed

Developer / automation / terminal
  -> opendesk.exe                      # command-line tooling, not a second desktop product

ui-host/opendesk-ui-host.exe
  -> child helper process              # implementation detail, never a user launch entry
```

The product contract is therefore:

- **Normal end user:** launch exactly one desktop entry from Explorer / shortcut.
- **Developer or scripted operator:** invoke the CLI entry from Terminal/PowerShell when command-line behavior is required.
- **Native UI Host:** Runtime-owned child process. OpenDesk starts and stops it; users must not launch it manually.
- **App Mode / Script Runner / Recorder / Scheduler Center / Runtime Log:** product capabilities inside the same OpenDesk product lifecycle. They are not separate applications merely because a helper process exists.

A future installer or packaged release should expose only the desktop entry as the normal Start Menu/Desktop shortcut. CLI may be installed for developers, but it is not another end-user app icon. `ui-host/` remains an internal payload directory.

## Executable-count decision: do not optimize for a single EXE

The current Windows target is intentionally:

```text
logical end-user product entry      = 1
Runtime entry binaries              = 2
  opendesk-desktop.exe              = GUI subsystem / normal desktop launch
  opendesk.exe                      = Console subsystem / CLI and automation
internal Native UI helper           = 1
  ui-host/opendesk-ui-host.exe      = Runtime-owned sidecar
```

This is the frozen P0/P1 architecture unless measured evidence justifies reopening it. The release-quality metric is **one ordinary user launch entry with correct ownership**, not “only one `.exe` exists in the installation directory” and not “Task Manager shows only one process”.

The two Runtime entries are link variants of the same `./cmd/opendesk` source. They must not grow separate App Mode, Scheduler, Recorder, Script Runner or automation implementations. Their difference is Windows launch/presentation behavior: GUI subsystem for the ordinary desktop entry, Console semantics for developer/automation CLI use.

The Native UI Host remains a separate process because the current implementation is a .NET/WinForms/WebView2 sidecar with its own native UI lifecycle and failure boundary. Forcing it into the Go Runtime merely to reduce executable count would redesign Custom UI ownership, threading, deployment and crash isolation without solving a current product requirement.

Therefore P0/P1 explicitly does **not**:

- add a new launcher EXE in front of the existing Desktop Runtime;
- make `opendesk-desktop.exe` spawn `opendesk.exe` as the normal product Runtime merely to centralize the binary name;
- ask ordinary users to choose between Desktop, CLI and UI Host;
- extract or download an executable helper into `%TEMP%` and run it there to simulate a single-file product;
- merge the .NET Native UI Host into Go solely to reduce process count;
- change the Installed App Builder to capability-aware/minimal packaging just to remove one of these binaries.

The preferred product presentation is still one application: installer/portable UX exposes one normal **OpenDesk** shortcut backed by `opendesk-desktop.exe`; CLI is a developer capability; `ui-host/` is internal payload.

A future “single Runtime entry binary” investigation is allowed only as a separate optimization project after the existing release is measured. Reopen the decision only when at least one material benefit is demonstrated, for example:

- duplicate Runtime binary size or update bandwidth is a meaningful part of the distribution cost;
- support policy can rely on a Windows launch/console mechanism that preserves Explorer no-console behavior **and** terminal stdin/stdout/stderr, pipes, exit codes and automation compatibility in one entry;
- real maintenance data shows two Runtime link variants create defects rather than simply two release artifacts;
- the Native UI technology is migrated so an in-process host has a clear reliability/deployment advantage;
- startup, servicing or security measurements show a concrete improvement large enough to justify compatibility regression risk.

Any such proposal must compare artifact size, startup behavior, CLI compatibility, Explorer behavior, failure isolation and release complexity before changing this contract. File count alone is not sufficient evidence.

The Windows UI Host publish shape is likewise an implementation choice rather than a “single EXE” product requirement. The distribution must preserve the **actual `dotnet publish` closure**. If single-file/self-extract publishing creates measurable startup, extraction, security or servicing problems, a self-contained folder publish may be chosen without changing the product process model. `.NET self-contained` also does not prove WebView2 Runtime availability; WebView2 remains a separately checked system/deployment prerequisite for HTML/WebSurface features.

## P0 naming closure

The former design attempted to represent the two Windows entry roles using only case:

```text
opendesk.exe   -> Console subsystem CLI
OpenDesk.exe   -> Windows GUI subsystem desktop entry
```

That contract was invalid for ordinary case-insensitive Windows directories. The production source contract is now:

```text
opendesk.exe           -> CLI / developer entry
opendesk-desktop.exe   -> GUI / normal user entry
ui-host/               -> internal native UI helper closure
```

The rename has been synchronized across the Windows application builder, portable distribution/provenance, Installed App Builder input/output validation, App Builder fixtures, portable distribution tests, payload checker, Windows Core workflow and user-facing launch documentation.

This closes the **source/artifact naming contract**. It does not by itself prove the target Windows release: Windows-native CI must build the PE files and verify GUI subsystem `2` vs Console subsystem `3`, and an interactive Windows environment must still prove the ordinary user launch path.

## Trusted helper process model

Starting a bundled helper executable is a normal desktop-application process model. The security boundary is **not** “never create a child process”; it is “only execute release-owned, integrity-checked components through a narrow protocol”. The end user still performs one launch action.

```text
user launches opendesk-desktop.exe once
        ↓
OpenDesk Runtime
        ↓  direct child-process creation from the bundled Runtime layout
ui-host/opendesk-ui-host.exe
        ↓  inherited stdio / versioned protocol
native windows
```

Consumer-release requirements for the helper path are:

- `ui-host` is built and shipped as part of the same OpenDesk distribution. Runtime must not download it on demand, generate it in `%TEMP%`, or execute a helper from an App Mode/user-writable package path.
- Production Windows releases must Authenticode-sign the desktop entry, CLI entry, Native UI Host, and other executable/native payload using one stable publisher identity and a timestamping policy. An unsigned portable directory is development/CI evidence, not a consumer trust-qualified release.
- Runtime resolves the helper from its installed/distribution root. Consumer release must not depend on `cmd.exe`, PowerShell, shell file associations, PATH lookup, or a user-controlled working directory to locate the helper.
- The helper runs at the same user/integrity level as OpenDesk. Rendering UI must not create a second UAC flow.
- Communication remains local and narrow: inherited stdin/stdout or an equivalently authenticated local IPC channel. The UI helper is not a general network service.
- The helper lifecycle is Runtime-owned: lazy start, bounded startup handshake, protocol/version verification, graceful shutdown and failure cleanup.
- Product UX never asks the user to find or start `opendesk-ui-host.exe`; seeing a helper process in Task Manager is normal internal implementation, not a second OpenDesk application.

The repository currently has protocol/version handshake and packaged host discovery. Publisher signing, consumer install ACLs and cryptographic helper identity enforcement are separate release-hardening work; the architecture document must not imply those gates already exist.

This design intentionally avoids two worse alternatives:

1. **Runtime-dropped helper:** writing a new EXE into a temporary/cache directory and immediately executing it creates unnecessary reputation, integrity and endpoint-security risk.
2. **Forced single-process rewrite:** embedding the current .NET/WinForms/WebView2 host into the Go process would materially redesign Custom UI ownership and failure isolation merely to reduce Task Manager process count. That is not justified by the current requirement.

The preferred long-term presentation remains one visible product entry. A future installer may place CLI/helper payloads under an internal installation directory and publish only one Start Menu/Desktop shortcut while preserving the separate process roles internally.

## Four separate levels

| Level | P0 contract |
| --- | --- |
| Developer Build | Build the complete Windows desktop + CLI + native-helper payload for local development with `scripts/build_windows_app.ps1`. |
| CI Build | Compile/test on `windows-latest`, build the canonical portable distribution once, and run Windows gates against that staged distribution. |
| Distribution Bundle | A copyable `dist/windows/win-x64/` directory that does not depend on the repository root, `.runtime/`, source checkout, or the caller's current directory. |
| Consumer Release | Requires publisher signing/trust and real Windows evidence in addition to the portable layout. Installer/MSI/MSIX selection is a separate channel decision. |

## Portable layout

The current role-oriented source contract is:

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

Both user/CLI entries are link variants of the same `./cmd/opendesk` source and therefore do not create two independent business products or duplicate App Mode/Scheduler/Recorder implementations at source level. They exist because Windows GUI and Console subsystem launch semantics differ.

Product-owned child executions started from the desktop entry explicitly request hidden-console behavior where appropriate. CLI calls retain normal terminal semantics.

`pkg/customui/process_driver.go` can resolve `ui-host/opendesk-ui-host.exe` relative to the running Runtime executable on Windows. The production bundle therefore has a self-contained package-local host path and does not need a development-machine absolute path. Compatibility sibling candidates still exist in Runtime discovery for development/legacy use; consumer-release hardening should reject/avoid ambiguous helper identity rather than treating compatibility lookup as trust proof.

`automation/utils.go` likewise resolves `polyfills/` and `jslibs/` from the Runtime executable before using repository/development fallbacks. The distribution builder owns the matching asset layout and records staged Runtime assets with SHA-256 digests. Default notification and sound resources follow their existing executable-relative discovery paths; application scripts, project Custom UI files, Native Extensions and App Mode package assets remain application/user inputs and are not copied from the source tree merely for directory symmetry.

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

`build_windows_ui.ps1 -Runtime win-arm64` remains available as a host-only experiment and does not declare OpenDesk ARM64 support.

## Distribution provenance

`distribution-provenance.json` records source commit, dirty flag, injected Runtime compatibility version, target/runtime architecture, executable SHA-256 hashes, PE machine values, UI host closure count, Runtime asset paths and SHA-256 digests, Go/.NET toolchain versions, canonical build command and build timestamp. The compatibility version comes from the repository-root `VERSION` file unless the same value is explicitly overridden through `-Version` or environment variable `VERSION`.

`layout.cliEntry` must be `opendesk.exe`; `layout.desktopEntry` must be `opendesk-desktop.exe`. They must resolve to two distinct Windows paths. File hashes/provenance prove build identity, not publisher trust or runtime signature enforcement.

## Windows Core evidence

The Windows Core workflow consumes the final staging directory for:

- public Runtime Window contract;
- repository-owned Win32 window fixture contract;
- hosted-deterministic Native UI Host protocol smoke;
- portable Runtime launch from a copied Unicode + space path;
- non-repository current working directory;
- manifest/hash closure for packaged polyfills, JavaScript libraries, notification icon and predefined sounds;
- real initialization of both the UI polyfill and a bundled JavaScript library;
- Runtime-to-Native-UI-Host discovery through the bundled `ui-host/` path;
- explicit failure after the bundled host is removed;
- x64 PE/provenance consistency and GUI/Console entry subsystem separation;
- no case-insensitive collision between the desktop and CLI entry paths;
- Installed App Builder preservation of Desktop, CLI and Native UI Host roles.

The hosted GitHub runner is real Windows, but these gates remain **Hosted Deterministic** evidence. They do not promote DPI, mixed-DPI multi-display behavior, real global input capture, Recorder, foreground switching, GlobalShortcut callbacks, visual Custom UI/Dialog/notification UX, long-lived user-session lifecycle, SmartScreen reputation, Defender/EDR behavior or UAC to verified status.

Those items require an interactive Windows 11 VM, physical machine, or self-hosted runner with a real user desktop session.

## Remaining release gates

The naming and role model are now defined, but a consumer release still needs these separate closures:

1. **Authenticode and publisher identity** — sign/timestamp every executable/native component that Windows loads; verify signatures in the release pipeline. Certificate provisioning/rotation and secret storage are release infrastructure, not source-tree placeholders.
2. **Install-location integrity** — portable user-writable directories are useful for P0 validation but weaker as a trust boundary. A consumer installer should normally place product binaries in an ACL-protected install location and expose only one user shortcut.
3. **Helper identity** — current protocol/version handshake is not a cryptographic signer check. Decide whether package hash/provenance verification is sufficient at install/update time or whether Runtime also verifies Authenticode/signer identity before helper launch. Do not hard-pin a certificate without a rotation/update design.
4. **Parent/child lifecycle** — prove parent exit, crash and logout do not leave a long-lived orphan helper. If current process ownership cannot guarantee this on Windows, evaluate a Windows Job Object / kill-on-close policy as an implementation detail.
5. **Crash/restart policy** — helper failure must fail clearly or restart with a bounded policy; never introduce an infinite respawn loop.
6. **WebView2** — choose and document the supported Evergreen/Fixed Version deployment policy and test clean machines. .NET self-contained publishing does not by itself establish the WebView2 Runtime prerequisite.
7. **Security reputation** — validate signed consumer builds with SmartScreen, Smart App Control, Defender and representative enterprise EDR. Reputation is external evidence, not something unit tests can guarantee.
8. **No unexpected elevation** — ordinary launch and helper creation must not request administrator rights unless a separately designed protected operation explicitly requires it.
9. **Update chain** — any future updater must authenticate downloaded updates and preserve the same publisher/helper trust chain; do not regress to downloading and immediately executing unsigned helpers.
10. **Interactive product acceptance** — Explorer/shortcut launch once; no Console; Script Runner, Recorder, Scheduler Center, Runtime Log and Permissions Center work; Native UI Host starts automatically; single-instance behavior remains coherent across Desktop and CLI.

## Next execution order

```text
source/artifact naming + executable-role decision            # frozen architecture
→ source/build/CI closure                                     # docs/plans/runtime/windows-distribution-source-ci-closure-prompt.md
→ hosted Windows build + Installed App Builder artifact gates
→ Source / Build / CI readiness = READY
→ Windows interactive desktop acceptance                     # docs/plans/runtime/windows-desktop-release-acceptance-prompt.md
→ publisher signing / clean-machine security qualification
→ installer/channel decision
→ optional stronger helper-integrity enforcement
→ only with measured benefit: reconsider single Runtime entry/minimal packaging
```

Do not merge signing, installer selection and helper protocol redesign into the source/CI closure merely because all belong to Windows distribution. Each has a different owner and evidence standard. Do not reopen the executable-count decision during implementation unless new measured evidence satisfies the criteria above.
