---
title: File JSON Runtime API quality record
---

# File JSON Runtime API quality record

## Scope

This record covers native `File.readJSON()` and `File.writeJSON()` only. It does not add path, fs,
child_process, `Execution.run`, `Execution.setResult`, or `Execution.signal`.

## Support matrix

| Platform | Build state | Runtime replacement state |
| --- | --- | --- |
| macOS 12.7.6 / x86_64 | Current source build passed | Evaluated by the File JSON gate and direct `ai run`; same-directory Unix replacement backend |
| Linux amd64 | Not Evaluated: package cross-build exited 1 before this backend due existing `oto` / `robotgo` target dependency errors | No Linux target Runtime evidence |
| Windows amd64 | Not Evaluated: package cross-build exited 1 before this backend due existing `robotgo` target dependency errors | Source is explicitly fail-closed with `ATOMIC_REPLACE_UNSUPPORTED`; no Windows target Runtime evidence |

Raw commands, binary hash, HEAD, dirty status, exit codes and current machine evidence are written under
`.runtime/tests/runtime-api/<runId>/`; `opendesk ai run` keeps its own execution evidence under
`.runtime/ai/<executionId>/`. This document never upgrades a compilation result into target live Runtime proof.

## Current quality rubric

The final implementation report records the current-run score against: architecture/workdir (20), data semantics
(20), replacement/cancellation (20), lifecycle (15), direct API/defaults (10), and types/docs/tests/evidence (15).
The hard gates are old-file preservation, no fallback on parse/permission errors, no WorkDir cross-talk, honest
method coverage, normal-cancel temporary-resource cleanup, current-build `ai run`, and truthful platform claims.

## 2026-09-05 evidence and assessment

- Final source HEAD: `1eebf6860a5e7750ce95a38e1856a13fdb2ec0d4`; the worktree was already dirty (102 paths) and was not reset.
- Current binary: `dist/opendesk`, SHA-256 `acf5a0b98ed3b46214413342a73604682a0e000207e05a8957c37facb20ac7de`.
- `file-json` gate passed 35/35 tests and recorded zero File JSON workers, callbacks, and temporary resources at
  `.runtime/tests/runtime-api/file-json-final4-20260905/`.
- The same source build passed `./dist/opendesk ai run tests/runtime-api/acceptance/file-json.js` at
  `.runtime/ai/ai-20260905-183410-997000/` and passed the ordinary example at
  `.runtime/ai/ai-20260905-183410-636000/`.
- Focused Go tests and focused race tests passed. They include deterministic short-write/disk/close/replacement
  failures, cancellation/commit ordering, a blocked worker while an EventLoop timer fires, resource drain, and two
  distinct execution work directories.
- Contract, unit, and smoke Runtime gates passed. Full `go test ./... -count=1 -timeout=60s` exited 1 solely at the
  pre-existing `TestJSMethodAllowlistReferencesRealExportedMethods` check for non-public
  `Mouse.PressButtonForPID`; its raw output is in the run directory below.
- Linux and Windows package cross-build attempts both exited 1 before File JSON code because of pre-existing
  target dependency compilation errors; their logs are retained rather than being reported as platform support.

| Dimension | Score | Evidence / deduction |
| --- | ---: | --- |
| Architecture, compatibility, WorkDir | 20/20 | Shared normalized FileSystem instance; two-workdir integration test |
| JSON semantics and limits | 20/20 | Public 35-test gate plus bounded/depth tests |
| Replacement and cancellation | 20/20 | Failure injection, symlink refusal, commit-state race and temp cleanup |
| Lifecycle and concurrency | 15/15 | Bounded in-flight owner, unawaited write, blocked-worker timer/drain, focused race tests |
| Direct API and defaults | 10/10 | Auto injection, Promise signatures, defaults, direct `ai run` acceptance/example |
| Types, docs, formal tests and evidence | 11/15 | Deduct 4: Linux/Windows package cross-builds are blocked and neither target has live Runtime evidence |
| **Total** | **96/100** | All File JSON hard gates passed on the evaluated macOS target |

The evidence root is `.runtime/tests/runtime-api/file-json-final4-20260905/`; the full-suite failure log is
`.runtime/tests/runtime-api/file-json-final-20260905/full-go-test.log`; cross-build logs are under its `cross/`
subdirectory. These are local, cleanable artifacts and are not versioned.
