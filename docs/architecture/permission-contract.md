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

The existing P0 contract answers **OS consent state for the current OpenDesk identity**. The next closure step must not overload that model with every automation failure. Instead OpenDesk keeps three layers distinct:

```text
OS permission / consent
        +
process / target / session security context
        +
runtime implementation and configuration
        ↓
Effective Capability / Feature Readiness
```

This document therefore defines both:

- the implemented P0 Permission Contract; and
- the required Effective Capability / Automation Readiness contract that future runtime, App and CLI work must converge on.

The second part is a contract and implementation target unless explicitly marked as already implemented below. It must not be presented in UI or docs as completed merely because this document defines it.

## Design rules

The permission/readiness subsystem follows these rules:

1. **Permission is not capability.** A permission can be `granted` while the requested operation is still impossible because of target integrity, session, platform, runtime implementation or configuration.
2. **Capability is not feature readiness.** A feature can depend on several capabilities and may be `LIMITED` even when its critical path is usable.
3. **Status is identity-scoped.** The result belongs to the process identity that actually performs the protected native operation.
4. **Target-dependent restrictions are target-scoped.** Windows integrity/UIPI and macOS Apple Events cannot be represented accurately as one machine-wide boolean.
5. **Silent checks never trigger consent.** Prompting is reserved for explicit user actions or the first real protected operation.
6. **Navigation is not authorization.** Opening System Settings or another configuration surface never means access was granted.
7. **No cached grant is permanent truth.** Permissions and security context can change while OpenDesk is running.
8. **Remediation is explicit and safe.** OpenDesk may explain or route the user to a repair action, but must not silently elevate itself or bypass OS policy.
9. **Windows is not modeled as fake macOS TCC.** Windows failures must use Windows security semantics.
10. **Do not add public API surface without a consumer.** Internal readiness types may evolve before exposing new JavaScript APIs.

## Domain model

Each implemented P0 permission exposes:

- `id`, `platform`, `displayName`, `description`
- `requirement`: `required`, `optional`, `on-demand`
- `status`: `granted`, `denied`, `not_determined`, `restricted`, `unsupported`, `unavailable`, `unknown`, `not_required`
- `canRequest`, `canOpenSettings`, `settingsTarget`, `remediation`, `evidence`

Aggregate permission readiness is:

- `BLOCKED`: a required permission is explicitly denied/restricted/unavailable/unsupported.
- `UNKNOWN`: a required permission cannot be determined reliably.
- `LIMITED`: required permissions are ready but an optional permission is missing or unknown.
- `READY`: every required permission is granted or not required and optional permissions are ready.

An on-demand permission never blocks startup by itself.

The model intentionally does not translate a negative macOS preflight result into a fabricated `denied` state when the native API cannot distinguish denial from first-use/not-determined state.

### Effective capability model

The next-layer model must describe whether OpenDesk can perform a concrete protected operation **now**, optionally against a specific target.

Recommended internal shape:

```text
EffectiveCapabilityReport
- capability
- platform
- feature
- status
- reasonCodes[]
- currentIdentity
- targetContext?
- sessionContext?
- permissions[]
- remediationActions[]
- checkedAt
```

Recommended effective status values:

- `READY`: the operation is expected to work under the current identity and target/session context.
- `LIMITED`: the critical operation is available, but a non-critical dependency or optional path is unavailable.
- `BLOCKED`: a known condition prevents the requested operation.
- `UNSUPPORTED`: OpenDesk or the platform does not support this capability/path.
- `UNKNOWN`: OpenDesk cannot determine readiness safely without attempting the real operation.

The effective status must be derived; it must not mutate the underlying permission status.

For example:

```text
Windows Accessibility permission = not_required
Target process integrity = high
OpenDesk integrity = medium
UI automation effective capability = BLOCKED
reason = target_higher_integrity
```

This preserves the truth that Windows has no equivalent TCC toggle while still telling the user why automation cannot proceed.

### Stable reason codes

Human-readable remediation text may change. Machine-readable reason codes should remain stable so App Mode, CLI, logs, tests and future workflow tooling can share behavior.

Initial reason-code vocabulary should include, when relevant:

```text
permission_denied
permission_not_determined
permission_restricted
permission_unknown
permission_unavailable
permission_revoked
identity_mismatch
target_higher_integrity
target_unavailable
target_not_automatable
session_mismatch
interactive_session_unavailable
secure_desktop_active
screen_locked
policy_blocked
runtime_capability_missing
runtime_configuration_missing
unsupported_platform
unsupported_target
helper_unavailable
helper_not_authorized
```

Do not create a new reason code for every platform-native error string. Native errors belong in bounded diagnostic evidence; reason codes represent stable product semantics.

### Remediation actions

Remediation should be structured rather than encoded only as prose. Recommended action vocabulary:

```text
refresh
retry_operation
request_permission
open_system_settings
open_permission_center
restart_opendesk
restart_target
run_target_non_elevated
launch_elevated_helper
contact_admin
show_guidance
```

A remediation action describes what the product may offer. It does **not** mean the runtime is allowed to perform that action automatically.

## Current-process identity

Every report includes the current PID, executable path, detected `.app` bundle path when present, and launch kind. Status always belongs to the process that performed the native query.

Therefore:

```text
OpenDesk.app permission status
!= automatically
./dist/opendesk permission status
```

The App bridge queries the Permission Service in the App host process. The Permissions Center must not shell out to `opendesk permissions status`, because that would query a child CLI identity and could report the wrong macOS TCC state.

Effective capability evaluation extends the same principle: the evaluator must use the identity that will perform the protected operation, not whichever process is most convenient to query.

## macOS provider

P0 uses native system APIs already owned by the runtime:

- Accessibility: `AXIsProcessTrusted`; explicit request uses `AXIsProcessTrustedWithOptions` with the prompt option.
- Screen capture: `CGPreflightScreenCaptureAccess`; explicit request uses `CGRequestScreenCaptureAccess`.
- Input Monitoring: `IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)`; explicit request uses `IOHIDRequestAccess`.
- Automation / Apple Events: on-demand and target-scoped (`automation:<target-app>`). OpenDesk does not probe Apple Events at startup because a probe can itself trigger consent.

Silent status/preflight never invokes request APIs. A request is reserved for an explicit user action or the first real protected operation.

System Settings navigation first uses the permission deep link and falls back to the Privacy & Security pane when the deep link cannot be opened. Opening Settings is guidance, never evidence that consent was granted.

The historical macOS permission bootstrap/helper remains a diagnostic/bootstrap utility; it is not the source of truth for the product Permission Service.

### macOS target and runtime invalidation

macOS readiness must account for conditions that can change after startup:

- the user can revoke Accessibility, Screen Recording or Input Monitoring while OpenDesk remains running;
- Apple Events authorization is target-scoped rather than a single OpenDesk-wide boolean;
- a different executable/bundle identity may have different TCC state;
- a packaged App, CLI binary and child process must not be assumed to share authorization.

Therefore protected operation boundaries should fail closed on native authorization errors and trigger a **silent recheck** before presenting remediation. A stale cached `granted` result must never override a new native denial.

Do not poll TCC aggressively. Refresh on user action, Permission Center activation, feature preflight, real protected-operation failure, and other explicit lifecycle events where the result is needed.

## Windows provider

Windows is not forced into a macOS TCC model. P0 reports the equivalent consent entries as `not_required` and does not present fake Accessibility/Screen Recording permission toggles.

The important Windows security limitation is process integrity: a normal-integrity OpenDesk process may not reliably inspect/control a higher-integrity elevated target process. That is feature availability/security context, not a pretend TCC permission.

### Windows effective capability evaluation

Windows readiness must become target-aware. A meaningful UI automation preflight should be able to compare, when obtainable without unsafe side effects:

```text
OpenDesk process
- PID
- session ID
- elevation state
- integrity level

Target process
- PID
- session ID
- elevation state
- integrity level
```

The evaluator should then classify at least these cases:

- same-session, compatible integrity target: normally `READY` subject to implementation/runtime availability;
- higher-integrity target than OpenDesk: `BLOCKED`, reason `target_higher_integrity`;
- target in a different interactive session: `BLOCKED` or `UNSUPPORTED`, reason `session_mismatch`;
- no usable interactive desktop/session: `BLOCKED`, reason `interactive_session_unavailable`;
- UAC secure desktop or similar protected desktop: `BLOCKED`, reason `secure_desktop_active`;
- machine or enterprise policy prevents the operation: `BLOCKED`, reason `policy_blocked`;
- state cannot be determined safely: `UNKNOWN`, not fabricated `READY`.

The Windows provider should not tell users to "enable Accessibility" because no such Windows consent setting exists.

### Locked screen, desktop and remote-session boundaries

OpenDesk must treat the interactive desktop as part of automation readiness. A process being alive does not mean desktop automation is currently possible.

Windows implementations should distinguish normal interactive-session failures from permission failures, including:

- workstation locked;
- no interactive user session;
- target in another Terminal Services/RDP session;
- UAC secure desktop;
- desktop/session transition while a task is running.

The product should surface these as capability/readiness reasons rather than repeatedly requesting nonexistent permissions.

### Elevated helper boundary

If OpenDesk later introduces a Windows elevated helper, it must be a narrow privileged broker, not a general administrator shell.

Required constraints:

- elevation must be explicit and user-visible;
- the helper exposes an allow-listed protocol of required desktop automation operations;
- no arbitrary command, script, JavaScript, shell, executable path or `eval` passthrough;
- caller identity and request schema are validated;
- requests are bounded in size and operation type;
- privileged operations produce auditable diagnostics without recording secrets;
- helper lifetime should be limited to the minimum product need;
- the non-elevated App remains the normal product/UI process;
- failure to authorize/start the helper returns `helper_unavailable` or `helper_not_authorized`, not a generic permission denial.

The preferred first remediation for an elevated target should remain `run_target_non_elevated` when that is a valid user workflow. Elevating all of OpenDesk by default is not the baseline design.

## Enterprise policy and managed devices

A user-correctable denial and an administrator-enforced restriction are different product states.

When platform APIs allow OpenDesk to determine that access is policy-managed, report a stable `policy_blocked` reason and prefer `contact_admin` remediation. Do not loop permission requests or repeatedly send the user to Settings when the current user cannot change the state.

Where the platform does not expose enough information, use `UNKNOWN` plus bounded diagnostic evidence instead of guessing that policy is the cause.

## Feature requirements

P0 permission requirement mapping is intentionally feature-specific:

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

Future effective readiness must be calculated from the actual requested operation rather than from the product surface alone. For example, Scheduler itself may be ready while a scheduled desktop recipe is blocked because the current session is locked or a target is elevated.

## Capability dependency graph

Feature readiness should be modeled as a dependency graph rather than copied switch statements across App, CLI and scripts.

Conceptually:

```text
feature:recorder
  ├─ capability:screen-capture
  │    ├─ runtime implementation
  │    └─ permission:screen-capture (macOS)
  ├─ capability:ui-automation
  │    ├─ runtime implementation
  │    ├─ permission:accessibility (macOS)
  │    └─ target/session integrity compatibility (Windows)
  └─ capability:global-input-listen [optional]
       ├─ runtime implementation
       └─ permission:input-monitoring (macOS)
```

The graph owner belongs in runtime code. App Mode and CLI consume its report; they do not independently encode readiness policy.

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

As effective capability reporting is implemented, the Permissions Center may evolve into a broader **Permissions & Automation Readiness** view, but it must preserve the distinction between:

- OS permission state;
- target/session restrictions;
- runtime/configuration problems.

A Windows `target_higher_integrity` problem must not be rendered as a red "permission denied" toggle.

## CLI

The same P0 service backs:

```bash
opendesk permissions status
opendesk permissions status --json
opendesk permissions doctor
opendesk permissions open accessibility
opendesk permissions open screen-capture
```

`status --json` serializes the same domain model used by App Mode. `doctor` returns a non-zero status when required permission readiness is blocked or unknown. `open` is only navigation; it never claims that the permission became granted.

When effective capability reporting is added, prefer extending diagnostics through a clearly named capability/readiness command or structured section rather than changing the meaning of existing permission statuses. Backward-compatible permission JSON consumers must continue to receive permission truth, not target-integrity truth disguised as consent state.

## Capability, permission, availability and configuration

These concepts remain separate:

```text
Feature readiness
= capability availability
+ permission readiness
+ target/security-context readiness
+ runtime/config readiness
```

For example, Recorder code being present does not prove Input Monitoring consent; screen capture implementation being present does not prove macOS Screen Recording consent; Windows consent being `not_required` does not prove OpenDesk can control an elevated target.

## Request deduplication and prompt discipline

The runtime already owns request coordination and must remain the only place that decides whether a native permission request is dispatched.

Required behavior:

- recheck before requesting;
- single-flight concurrent requests for the same permission/target;
- short retry cooldown rather than permanent "already requested" memory;
- `force` may bypass cooldown but never bypass an already-ready check or concurrent-request guard;
- App UI, CLI and feature code must not implement their own independent prompt loops;
- target-scoped permission requests must include the target in their deduplication key.

A failed real operation may cause a silent status refresh, but it must not automatically create a new OS prompt loop.

## Dynamic invalidation and caching

Permission and readiness reports are observations, not durable grants.

If caching is introduced for performance, the cache key must include the dimensions that materially affect truth, such as:

```text
platform
current execution identity
target identity/PID when applicable
session/desktop when applicable
permission/capability id
```

Caches should be short-lived or explicitly invalidated. Invalidation triggers include:

- application activation / Permission Center refresh;
- target process restart or PID change;
- session/desktop transition;
- explicit permission request completion;
- protected-operation authorization failure;
- helper lifecycle change;
- executable/bundle identity change after update/relaunch.

Never persist `granted` as a substitute for querying native state on the next process launch.

## Distribution, signing and stable identity

TCC, entitlements, App Sandbox and Hardened Runtime are separate mechanisms. P0 does not enable App Sandbox and does not add unrelated entitlements. Release validation must continue to inspect the real bundle identifier, code-signing identity and nested executables/helpers.

Permission/readiness correctness depends on stable distribution identity. Release validation should treat these as contract inputs:

- stable macOS bundle identifier;
- expected code-signing identity;
- nested helper signing consistency;
- stable Windows product executable/helper identity;
- no accidental development binary used as the product permission-query owner.

A release that changes the protected-operation owner may effectively change the OS authorization identity even if the JavaScript API is unchanged.

## Script Runner App-owned execution identity

Packaged macOS validation proved that a Recipe launched by executing the bundle binary as a command-line child receives a different effective TCC state: the App host was Accessibility-authorized while the child reported `AXIsProcessTrusted=false` and its mouse input was silently discarded. The product therefore no longer launches normal Recipes through `Command.run(System.getExecutablePath(), ...)`.

The bundled Script Runner now keeps process ownership in the App and creates a fresh `pkg/execution` JavaScript Runtime for every Recipe. This is not `eval()` in the App entry Runtime: each run retains its own Execution ID, context, cancellation, resource teardown and artifact directory. The private source-controlled host bridge is absent from ordinary scripts and remote transports.

Release validation must exercise the real packaged/signed flow:

```text
OpenDesk.app
  -> Script Runner
  -> App-owned separate Recipe Execution
  -> screenshot / Accessibility-protected operation
```

Record the current-process identity and permission state at the protected operation. A reintroduction of an external Recipe process must fail this gate unless that real process independently proves the intended stable authorization identity. The generic standalone Script Runner example may continue to demonstrate `Command.run`; it is not the installed product execution owner.

The same identity principle applies to any future Windows elevated helper: the product must document which process performs the privileged operation and evaluate readiness for that real owner.

## Diagnostic evidence and privacy

Permission/readiness evidence exists for debugging and product explanations, not for collecting unnecessary machine data.

Rules:

- expose only evidence needed to explain or test the decision;
- do not include environment variables, command lines, window contents, clipboard contents, credentials or arbitrary user files;
- avoid full process enumeration in normal reports;
- target executable paths may be included only when required for diagnosis and should not become telemetry by default;
- redact or hash user-specific identifiers in telemetry/log export when the raw value is not needed;
- native error text is supplementary evidence, never the stable API contract.

## App / CLI / Runtime consistency invariant

For the same process identity, feature, target and session context, all product surfaces must derive the same readiness decision:

```text
Runtime evaluator
      ↓
shared report
 ┌────┼─────────┐
App   CLI   diagnostics/tests
```

No tray menu, Permission Center JavaScript, CLI command or recipe helper may independently reinterpret `granted`, elevation, integrity or session state into a conflicting readiness result.

## Implementation boundary

The implemented P0 permission source of truth remains `automation/permissions*.go`.

Effective capability/readiness should be added as a small runtime-owned companion layer rather than expanding `PermissionStatus` to contain unrelated states. A reasonable code split is:

```text
automation/permissions.go
  - permission IDs/status/requirements
  - native permission reports
  - request coordination

automation/permissions_darwin.go
  - macOS native permission provider

automation/capability_readiness.go        # proposed
  - effective status/reason/remediation model
  - feature dependency evaluation

automation/capability_readiness_darwin.go # proposed only if platform logic is needed

automation/capability_readiness_windows.go
  - process integrity/elevation/session/desktop checks
```

Exact filenames are implementation details, not public API. The important constraint is ownership: App/CLI must consume runtime-owned evaluation.

Do not add a new JavaScript global only to expose this design. First wire internal product consumers and tests; expose public API later only when normal OpenDesk scripts have a concrete need.

## Closure priorities

Implementation should close the contract in this order:

### P0.5 — correctness before new UI

1. Target-aware Windows integrity/elevation comparison for UI automation.
2. Stable effective status + reason-code model.
3. Session/interactive-desktop classification where reliable.
4. Runtime-owned remediation action mapping.
5. Dynamic recheck on protected-operation authorization/security-context failures.
6. Shared App/CLI diagnostic consumption without changing P0 permission truth.

### P1 — privileged and managed environments

1. Elevated helper only if real customer cases require it.
2. Narrow allow-listed helper protocol and authorization boundary.
3. Managed-device/policy classification where platform APIs make it reliable.
4. Packaged/signed identity qualification across macOS App/child process and Windows App/helper.
5. Multi-user/RDP/session qualification tests.

### Not required merely to close the contract

- enabling App Sandbox;
- making OpenDesk always run elevated;
- inventing Windows permission toggles;
- creating a second App-specific permission schema;
- adding a broad public JavaScript security API;
- persisting permission grants in OpenDesk configuration.

## Qualification matrix

The implementation is not complete until automated/unit coverage and targeted real-system qualification agree with the contract.

Minimum matrix:

| Platform/context | Expected classification |
| --- | --- |
| macOS required permission granted | permission `READY` |
| macOS required permission unknown/not determined | permission `UNKNOWN` |
| macOS permission revoked while running | protected operation fails, silent recheck reflects new state |
| macOS Apple Events target A vs target B | target-scoped results remain independent |
| macOS packaged App vs CLI/child | identity reported explicitly; no assumed inheritance |
| Windows normal OpenDesk -> normal target, same session | no fake consent block; evaluate capability normally |
| Windows normal OpenDesk -> elevated target | capability `BLOCKED`, `target_higher_integrity` |
| Windows target unavailable/restarted | target-specific report invalidated/recomputed |
| Windows different interactive session | `BLOCKED`/`UNSUPPORTED` with session reason |
| Windows secure desktop | `BLOCKED`, `secure_desktop_active` where detectable |
| managed restriction detectable | `BLOCKED`, `policy_blocked`, remediation `contact_admin` |
| unsupported platform/runtime path | `UNSUPPORTED`, not permission `denied` |

Real-system tests must not trigger a permission prompt as a side effect of a command documented as status/preflight-only.

## Definition of done

Permission/readiness architecture is considered closed when all of the following are true:

- Permission Contract still reports real OS consent truth.
- Effective capability can explain target/security-context blocks without corrupting permission state.
- Windows elevated-target failure is classified before or immediately at protected operation with a stable reason.
- App Mode and CLI consume the same runtime-owned decision model.
- repeated checks do not repeatedly open permission/request windows.
- revoked permissions/security context are not hidden by stale caches.
- privileged remediation cannot execute arbitrary user-supplied code as administrator.
- process/bundle/helper identity is explicit in qualification evidence.
- diagnostics contain enough evidence to debug decisions without leaking unrelated user data.
- cross-platform tests cover the qualification matrix above.
