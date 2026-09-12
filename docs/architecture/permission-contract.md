# OpenDesk Permission Contract

## Status

P0 implements one permission contract shared by the OpenDesk product App and CLI. The App manifest may declare product/runtime capabilities, but `opendesk.app.json` is not an operating-system security boundary and does not define a second macOS/Windows permission schema.

```text
Permission Contract
       │
Runtime Permission Service
       │
 ┌─────┴─────┐
 │           │
App Mode     CLI
```

The native owner is `automation/permissions*.go`. Product UI and CLI are adapters over that owner; they do not maintain separate permission truth.

## Domain model

Each permission exposes:

- `id`, `platform`, `displayName`, `description`
- `requirement`: `required`, `optional`, `on-demand`
- `status`: `granted`, `denied`, `not_determined`, `restricted`, `unsupported`, `unavailable`, `unknown`, `not_required`
- `canRequest`, `canOpenSettings`, `settingsTarget`, `remediation`, `evidence`

Aggregate readiness is:

- `BLOCKED`: a required permission is explicitly denied/restricted/unavailable/unsupported.
- `UNKNOWN`: a required permission cannot be determined reliably.
- `LIMITED`: required permissions are ready but an optional permission is missing or unknown.
- `READY`: every required permission is granted or not required and optional permissions are ready.

An on-demand permission never blocks startup by itself.

The model intentionally does not translate a negative macOS preflight result into a fabricated `denied` state when the native API cannot distinguish denial from first-use/not-determined state.

## Current-process identity

Every report includes the current PID, executable path, detected `.app` bundle path when present, and launch kind. Status always belongs to the process that performed the native query.

Therefore:

```text
OpenDesk.app permission status
!= automatically
./dist/opendesk permission status
```

The App bridge queries the Permission Service in the App host process. The Permissions Center must not shell out to `opendesk permissions status`, because that would query a child CLI identity and could report the wrong macOS TCC state.

## macOS provider

P0 uses native system APIs already owned by the runtime:

- Accessibility: `AXIsProcessTrusted`; explicit request uses `AXIsProcessTrustedWithOptions` with the prompt option.
- Screen capture: `CGPreflightScreenCaptureAccess`; explicit request uses `CGRequestScreenCaptureAccess`.
- Input Monitoring: `IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)`; explicit request uses `IOHIDRequestAccess`.
- Automation / Apple Events: on-demand and target-scoped (`automation:<target-app>`). OpenDesk does not probe Apple Events at startup because a probe can itself trigger consent.

Silent status/preflight never invokes request APIs. A request is reserved for an explicit user action or the first real protected operation.

System Settings navigation first uses the permission deep link and falls back to the Privacy & Security pane when the deep link cannot be opened. Opening Settings is guidance, never evidence that consent was granted.

The historical macOS permission bootstrap/helper remains a diagnostic/bootstrap utility; it is not the source of truth for the product Permission Service.

## Windows provider

Windows is not forced into a macOS TCC model. P0 reports the equivalent consent entries as `not_required` and does not present fake Accessibility/Screen Recording permission toggles.

The important Windows security limitation is process integrity: a normal-integrity OpenDesk process may not reliably inspect/control a higher-integrity elevated target process. That is feature availability/security context, not a pretend TCC permission.

## Feature requirements

P0 requirement mapping is intentionally feature-specific:

| Feature | Accessibility | Screen capture | Input monitoring | Automation |
| --- | --- | --- | --- | --- |
| desktop automation | required | required | optional | on-demand |
| Recorder | required | required | optional | on-demand |
| screenshot | on-demand | required | on-demand | on-demand |
| UI automation | required | on-demand | on-demand | on-demand |
| Script Runner | on-demand | on-demand | on-demand | on-demand |
| Scheduler | on-demand | on-demand | on-demand | on-demand |
| Inspector | on-demand | on-demand | on-demand | on-demand |

Script Runner does not require desktop consent merely to exist; a recipe changes readiness only when it actually uses a protected desktop capability.

## Product App behavior

OpenDesk App Mode exposes the shared service through its internal `automation.app` product bridge. The bundled Permissions Center:

- opens from the tray `权限管理…` action;
- reuses/focuses an existing window and recreates it after close;
- shows current overall and per-permission state plus the current process identity;
- refreshes without prompting;
- requests one permission only after the user clicks its request action;
- opens the corresponding System Settings page when meaningful;
- performs a silent startup preflight and only updates tray status text.

Startup never chains Accessibility, Screen Recording, Input Monitoring, Automation, or notification dialogs.

## CLI

The same service backs:

```bash
opendesk permissions status
opendesk permissions status --json
opendesk permissions doctor
opendesk permissions open accessibility
opendesk permissions open screen-capture
```

`status --json` serializes the same domain model used by App Mode. `doctor` returns a non-zero status when required readiness is blocked or unknown. `open` is only navigation; it never claims that the permission became granted.

## Capability, permission, availability and configuration

These concepts remain separate:

```text
Feature readiness
= capability availability
+ permission readiness
+ runtime/config readiness
```

For example, Recorder code being present does not prove Input Monitoring consent; screen capture implementation being present does not prove macOS Screen Recording consent.

## Distribution and signing

TCC, entitlements, App Sandbox and Hardened Runtime are separate mechanisms. This P0 does not enable App Sandbox and does not add unrelated entitlements. Release validation must continue to inspect the real bundle identifier, code-signing identity and nested executables/helpers.

## Script Runner child-process validation gate

The current product Script Runner records `child-opendesk-process` as its recipe process model. Source-level unification does not prove that a child recipe inherits the signed App's macOS TCC authorization.

Before closing the macOS identity gate, validate a real packaged/signed flow:

```text
OpenDesk.app
  -> Script Runner
  -> child opendesk recipe
  -> screenshot / Accessibility-protected operation
```

Record which identities macOS shows under Privacy & Security. If the child needs independent consent, do not report this gate as PASS. Prefer a future App-owned protected-operation broker when the duplication cannot be fixed safely as a small P0 change.
