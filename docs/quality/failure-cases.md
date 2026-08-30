# Failure Cases

本文件记录可复用的实际失败案例，不承担 taxonomy 定义。没有当前 Evidence 的历史案例只能标记为 historical / not revalidated，不能写成当前仍然存在的问题。

## Required record

```text
ID:
Date:
Scope:
Environment:
Trigger:
Expected:
Observed:
Evidence:
Global Failure Class:
Domain Failure Code:
Root Cause:
Fix:
Regression Test:
Status:
```

Status 建议值：`open` / `fixed-not-revalidated` / `verified` / `historical-not-revalidated` / `invalidated`。

## Historical records migrated from the previous quality file

### FC-20260407-01 — activeWindow screenshot target drift

- Date: 2026-04-07
- Scope: WeChat desktop observation
- Environment: historical desktop run; exact current environment not preserved in this file
- Trigger: local screenshot taken after another window became active
- Expected: capture target remained WeChat
- Observed: OCR read browser title/content instead
- Evidence: historical narrative only; no current replay artifact located during the 2026-08-31 audit
- Global Failure Class: primary `F1 Acquisition / Observation`; secondary `F4 Target Resolution`
- Domain Failure Code: `WECHAT_ACTIVE_WINDOW_DRIFT`
- Root Cause: active-window identity was not guarded at capture time
- Fix: historical fix proposed/added a window stability guard
- Regression Test: no current dedicated regression test located
- Status: `historical-not-revalidated`

### FC-20260407-02 — secondary-display / negative-coordinate capture drift

- Date: 2026-04-07
- Scope: desktop screenshot geometry
- Environment: historical multi-display run
- Trigger: target window located on secondary display / negative coordinates
- Expected: local clip matched requested window bounds
- Observed: clip dimensions/position drifted and template matching became unreliable
- Evidence: historical narrative only; no current replay artifact located during this audit
- Global Failure Class: primary `F1 Acquisition / Observation`; secondary `F0 Environment / Precondition`
- Domain Failure Code: `DESKTOP_NEGATIVE_COORDINATE_CAPTURE_DRIFT`
- Root Cause: coordinate conversion across displays was unstable in the historical path
- Fix: prefer one fresh screenshot and fail fast on abnormal geometry
- Regression Test: no current dedicated regression test located
- Status: `historical-not-revalidated`

### FC-20260407-03 — targetChatName did not strongly constrain candidate row

- Date: 2026-04-07
- Scope: historical WeChat `open_chat`
- Environment: historical desktop run
- Trigger: multiple candidate rows matched a weak template path
- Expected: explicit target chat name constrained the selected row before click
- Observed: a non-target candidate could be clicked before header verification rejected it
- Evidence: historical narrative only; no current runtime artifact/test located during this audit
- Global Failure Class: primary `F4 Target Resolution`; secondary `F6 Verification / Postcondition`
- Domain Failure Code: `WECHAT_CHAT_CANDIDATE_MISMATCH`
- Root Cause: target identity was not a hard precondition for candidate selection
- Fix: historical rule changed toward target-name filtering + post-click header verification
- Regression Test: no current dedicated regression test located
- Status: `historical-not-revalidated`

### FC-20260407-04 — old region-map heuristic became brittle after UI/window change

- Date: 2026-04-07
- Scope: historical WeChat region mapping
- Environment: historical desktop run
- Trigger: changed window/layout state
- Expected: semantic regions could still be mapped
- Observed: heuristic rejected the layout because required separator assumptions no longer held
- Evidence: historical narrative only; referenced fresh-screenshot validation artifacts are not part of the current repository evidence set
- Global Failure Class: primary `F3 Semantic Inference`; secondary `F2 Perception / Detection`
- Domain Failure Code: `WECHAT_REGION_MAP_HEURISTIC_DRIFT`
- Root Cause: app-specific semantic inference depended on rigid separator assumptions
- Fix: historical workflow moved toward a unified validation path and treated region-map as auxiliary
- Regression Test: no current dedicated regression test located
- Status: `historical-not-revalidated`

## Adding a new case

A new case should not be added until there is enough information to reproduce or audit it. If Evidence cannot be retained for privacy/environment reasons, record that limitation explicitly and do not upgrade the case to `verified`.
