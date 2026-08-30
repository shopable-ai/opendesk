# WeChat Desktop Automation V1 Implementation Plan

> For Hermes: Use subagent-driven-development skill to implement this plan task-by-task.

Goal: Make the macOS WeChat desktop flow reliable for the first guarded real-use case: open the target chat, verify the chat header, focus the input area, paste/verify a draft, and keep real send behind explicit safety gates.

Architecture: Keep the existing hybrid runtime direction already present in `examples/mac/wechat_steps/`: native macOS window/input primitives for act/focus, OCR/template relocation for observe/locate, and evidence-heavy guarded steps for verify/audit. Do not replace the current system. Tighten it into a stable V1 by upgrading config validation, step-level evidence, structured send safety, and search/input reliability.

Tech Stack: JS runtime inside `testMonkey-go`, macOS window/mouse/keyboard/clipboard/page/Vision/ImageColor primitives, artifact bundles under `.runtime/runs`, JSON/JSONL evidence in `.runtime/temp/mac`.

---

## 0. Current codebase diagnosis

These are the highest-value facts from the current implementation:

### What already exists
- `examples/mac/wechat_steps/main.js`
  - already composes a modular step pipeline
  - already supports `stepMode`
  - already applies artifact gate policy to runtime config
- `examples/mac/wechat_steps/00_window_guard.js`
  - already validates WeChat window presence/focus
  - already has send dedup helpers
  - already writes JSONL send audit lines
- `examples/mac/wechat_steps/10_capture_helpers.js`
  - already captures regions with Retina normalization
  - already supports OCR-based `verifyContainsText`
  - already prefers clipboard paste when `useClipboardForInput=true`
- `examples/mac/wechat_steps/30_search_flow.js`
  - already has search area locate/focus/type logic
  - already has OCR row clustering and search-result fallback
- `examples/mac/wechat_steps/40_open_chat.js`
  - already separates `open_chat` and `verify_chat_header`
  - already retries `open_chat`
- `examples/mac/wechat_steps/50_focus_input.js`
  - already focuses input area independently
- `examples/mac/wechat_steps/60_send_guard.js`
  - already separates draft typing, send click, draft cleared verification, and post-send message verification

### Main gaps blocking a stronger V1
1. Config is not normalized strongly enough before execution.
   - `targetChatName` / `replyMessage` checks happen too late and only in some steps.
2. Send safety is still mostly a boolean-shaped world.
   - There is `sendAllowed`, but not a first-class structured `sendSafety` object on runtime + report.
3. Search/open/input steps do not consistently emit step evidence JSONL.
   - audit logging is strong around send, weaker around non-send critical steps.
4. Verification helpers are too coarse.
   - `verifyContainsText` only does direct normalized inclusion; no explicit loose-match metadata.
5. `read_reply` is placeholder-quality.
   - it only checks for any OCR text (`verifyContainsText(..., '')`).
6. Window/capture protection exists, but the operator-facing report does not summarize safety decisions clearly enough.
7. There is no implementation plan in-repo for the next coding wave.

### V1 scope decision
V1 does not aim for “fully autonomous real send at all times”.

V1 success means:
1. reliably detect and focus the WeChat window
2. reliably search/open the target chat
3. reliably verify the chat header
4. reliably focus the input area
5. reliably paste and verify a draft when allowed
6. emit evidence and structured safety decisions
7. keep real send guarded/fail-close by default

Out of scope for V1:
- generalizing to other desktop apps
- replacing the current runtime with a new framework
- protocol-level WeChat integration
- high-risk “always send” automation

---

## 1. File map to use in this plan

### Core files to modify
- `examples/mac/wechat_steps/00_window_guard.js`
- `examples/mac/wechat_steps/10_capture_helpers.js`
- `examples/mac/wechat_steps/30_search_flow.js`
- `examples/mac/wechat_steps/40_open_chat.js`
- `examples/mac/wechat_steps/50_focus_input.js`
- `examples/mac/wechat_steps/60_send_guard.js`
- `examples/mac/wechat_steps/70_read_reply.js`
- `examples/mac/wechat_steps/main.js`

### Docs/config files to create
- `docs/plans/2026-05-18-wechat-desktop-v1-implementation-plan.md`
- `config/wechat_structured_send_v2.config.example.json`

### Optional future test/docs targets
- `docs/research/2026-05-18-wechat-desktop-automation-open-source-options.md` (reference only, no edit required)
- `docs/wechat_desktop_requirements.md` (reference only unless behavior changes materially)

---

## 2. Implementation order

Execute in this order only:

1. Config normalization and runtime safety object
2. Step-level evidence logging for non-send critical path
3. Verification helper upgrades
4. Search/open/header/input hardening
5. Draft verification hardening
6. Report/output shaping
7. Read-reply cleanup
8. Example config and docs

---

## Task 1: Add explicit runtime config normalization

Objective: Fail early when required inputs are missing or inconsistent, instead of discovering them halfway through execution.

Files:
- Modify: `examples/mac/wechat_steps/00_window_guard.js`
- Modify: `examples/mac/wechat_steps/main.js`

### Step 1: Add failing expectations in plan comments / target behavior notes

Expected normalized behavior:
- `targetChatName` must be non-empty for any mode that touches search/open/header
- `replyMessage` must be non-empty for any mode that touches draft/send verification
- `enableSend=true` must not silently bypass gate restrictions
- `allowDraftInputWithoutSend=true` must still require non-empty `replyMessage`

### Step 2: Implement config validation helpers in `00_window_guard.js`

Add helpers with this shape:

```javascript
shared.requiresTargetChat = function requiresTargetChat(stepMode) {
  const mode = String(stepMode || 'full_non_send');
  return mode !== 'none';
};

shared.requiresReplyMessage = function requiresReplyMessage(stepMode, cfg) {
  const mode = String(stepMode || 'full_non_send');
  return Boolean(cfg.enableSend || cfg.allowDraftInputWithoutSend || mode === 'type_draft' || mode === 'bundle_send_guarded' || mode === 'full_send_guarded');
};

shared.validateRuntimeConfig = function validateRuntimeConfig(cfg) {
  const errors = [];
  if (shared.requiresTargetChat(cfg.stepMode) && !shared.normalizeText(cfg.targetChatName)) {
    errors.push('targetChatName 不能为空');
  }
  if (shared.requiresReplyMessage(cfg.stepMode, cfg) && !shared.normalizeText(cfg.replyMessage)) {
    errors.push('replyMessage 不能为空');
  }
  if (cfg.enableSend && !cfg.sendAuditPath) {
    errors.push('enableSend=true 时 sendAuditPath 不能为空');
  }
  if (errors.length > 0) {
    throw new Error(`运行配置校验失败: ${errors.join('；')}`);
  }
  return cfg;
};
```

### Step 3: Run a quick syntax-only verification

Run:
`go test ./...`

Expected:
- existing Go tests still pass
- JS files remain loadable as plain source artifacts

### Step 4: Call validation from runtime bootstrap in `main.js`

After merged/discovered config is applied, validate it before use:

```javascript
const finalized = shared.applyGatePolicyToRuntimeConfig(merged, discovered);
return shared.validateRuntimeConfig(finalized);
```

### Step 5: Commit

```bash
git add examples/mac/wechat_steps/00_window_guard.js examples/mac/wechat_steps/main.js
git commit -m "feat: validate wechat runtime config before execution"
```

---

## Task 2: Introduce a first-class structured sendSafety object

Objective: Stop relying on scattered booleans and produce one operator-readable safety decision object.

Files:
- Modify: `examples/mac/wechat_steps/00_window_guard.js`
- Modify: `examples/mac/wechat_steps/60_send_guard.js`
- Modify: `examples/mac/wechat_steps/main.js`

### Step 1: Define the object shape in `00_window_guard.js`

Add a builder like:

```javascript
shared.buildSendSafety = function buildSendSafety(context, overrides = {}) {
  const gateStatus = shared.runtimeConfig.gateStatus || null;
  const artifactSafety = context?.artifactBundle?.sendSafety || null;
  const blockingRisks = [];

  const targetChatVerified = Boolean(context?.headerCheck?.ok);
  const frontmostWechatConfirmed = Boolean(context?.windowGuard?.frontmostWechatConfirmed);
  const windowBoundsStable = Boolean(context?.windowGuard?.windowBoundsStable);
  const dedupPassed = !shared.wasSentRecently(shared.runtimeConfig.targetChatName, shared.runtimeConfig.replyMessage);
  const draftVerified = Boolean(context?.draftCheck?.ok);

  if (!targetChatVerified) blockingRisks.push('target_chat_not_verified');
  if (!frontmostWechatConfirmed) blockingRisks.push('frontmost_wechat_not_confirmed');
  if (!windowBoundsStable) blockingRisks.push('window_bounds_not_stable');
  if (!dedupPassed) blockingRisks.push('dedup_blocked');
  if (shared.runtimeConfig.enableSend && gateStatus && !gateStatus.sendAllowed) blockingRisks.push('gate_send_not_allowed');
  if (artifactSafety && artifactSafety.allowed === false) blockingRisks.push('artifact_send_safety_blocked');

  const decision = blockingRisks.length > 0 ? 'block' : 'allow';

  return {
    enabled: Boolean(shared.runtimeConfig.enableSend),
    gatePassed: Boolean(gateStatus?.sendAllowed),
    targetChatVerified,
    draftVerified,
    dedupPassed,
    frontmostWechatConfirmed,
    windowBoundsStable,
    manualOverrideRequired: Boolean(shared.runtimeConfig.allowUnsafeSendOverride),
    artifactSafetyAllowed: artifactSafety ? Boolean(artifactSafety.allowed) : null,
    blockingRisks,
    decision,
    ...overrides,
  };
};
```

### Step 2: Track window guard state in context

In `main.js` initial context, add:

```javascript
windowGuard: {
  frontmostWechatConfirmed: true,
  windowBoundsStable: true,
},
sendSafety: null,
```

Update window guard refresh helpers to set these flags on context at key checkpoints.

### Step 3: Build/send the object before real send in `60_send_guard.js`

Before `click_send`, compute `context.sendSafety = shared.buildSendSafety(context)`.

Block when:
- `decision !== 'allow'`
- unless explicit override policy is intentionally permitted

### Step 4: Persist `sendSafety` into final report in `main.js`

Add:

```javascript
sendSafety: context.sendSafety || null,
```

### Step 5: Commit

```bash
git add examples/mac/wechat_steps/00_window_guard.js examples/mac/wechat_steps/60_send_guard.js examples/mac/wechat_steps/main.js
git commit -m "feat: add structured send safety decision object"
```

---

## Task 3: Add generic step-evidence JSONL logging for non-send critical steps

Objective: Make open/search/focus/header failures auditable the same way send phases already are.

Files:
- Modify: `examples/mac/wechat_steps/00_window_guard.js`
- Modify: `examples/mac/wechat_steps/30_search_flow.js`
- Modify: `examples/mac/wechat_steps/40_open_chat.js`
- Modify: `examples/mac/wechat_steps/50_focus_input.js`
- Modify: `examples/mac/wechat_steps/main.js`

### Step 1: Add a general step logger helper

In `00_window_guard.js`, add:

```javascript
shared.logStepEvidence = async function logStepEvidence(context, stepId, success, extra) {
  return shared.appendAuditLog({
    kind: 'step',
    stepId,
    success: Boolean(success),
    targetChatName: shared.runtimeConfig.targetChatName,
    openChatPoint: context?.openChatPoint || null,
    focusPoint: context?.focusPoint || null,
    extra: extra || {},
  });
};
```

Keep `logSendPhase` as-is for send-specific semantics.

### Step 2: Emit evidence from search/open/header/focus steps

Add logging after success/failure-relevant points:
- `focus_search_input`
- `type_search_query`
- `locate_search_result_row`
- `open_chat`
- `verify_chat_header`
- `focus_input`

Include useful fields such as:
- `inputMode`
- OCR text preview
- selected row score
- fallback used or not
- template-match quality

### Step 3: Add explicit try/catch only where needed for enriched failure evidence

Do not wrap the entire program in a blanket catcher. Add local catch blocks only when they add evidence before rethrow.

### Step 4: Verify output file shape manually

Run an example execution path after implementation and inspect:
- `.runtime/temp/mac/wechat_structured_send_v2_audit.jsonl`

Expected:
- both `kind: "step"` and send phase entries exist
- step entries appear for non-send critical path

### Step 5: Commit

```bash
git add examples/mac/wechat_steps/00_window_guard.js examples/mac/wechat_steps/30_search_flow.js examples/mac/wechat_steps/40_open_chat.js examples/mac/wechat_steps/50_focus_input.js examples/mac/wechat_steps/main.js
git commit -m "feat: log step evidence for wechat non-send critical path"
```

---

## Task 4: Upgrade OCR verification helpers to carry loose-match metadata

Objective: Make verification results more useful than a simple boolean/text pair.

Files:
- Modify: `examples/mac/wechat_steps/10_capture_helpers.js`
- Modify: `examples/mac/wechat_steps/60_send_guard.js`
- Modify: `examples/mac/wechat_steps/70_read_reply.js`

### Step 1: Replace `verifyContainsText` result shape

Current shape:
- `ok`
- `text`
- `lineCount`

Upgrade to:

```javascript
{
  ok,
  matchType: 'exact_contains' | 'compact_contains' | 'non_empty' | 'not_found',
  expectedText,
  normalizedExpectedText,
  text,
  compactText,
  lineCount,
}
```

Implementation idea:
- compute `text` and `compactText`
- if expected empty: `ok = text.length > 0`, `matchType = 'non_empty'`
- if `text.includes(expected)`: exact_contains
- else if `compactText.includes(compactExpected)`: compact_contains
- else not_found

### Step 2: Keep `verifyNotContainsText` compatible

Update it to preserve the richer fields instead of discarding them.

### Step 3: Use richer result data in send/read errors

Error text should include:
- match type
- OCR preview
- expected text preview

### Step 4: Commit

```bash
git add examples/mac/wechat_steps/10_capture_helpers.js examples/mac/wechat_steps/60_send_guard.js examples/mac/wechat_steps/70_read_reply.js
git commit -m "feat: enrich wechat OCR verification metadata"
```

---

## Task 5: Harden search result selection and make fallback explicit

Objective: Make search/open behavior more deterministic and easier to debug.

Files:
- Modify: `examples/mac/wechat_steps/30_search_flow.js`
- Modify: `examples/mac/wechat_steps/40_open_chat.js`

### Step 1: Enrich `locate_search_result_row`

Add metadata fields:
- `selectionSource`
- `score`
- `fallback`
- `reason`
- `rankedCandidatesPreview`

For ranked preview, keep only top 3 rows with:
- text preview
- score
- bbox

### Step 2: Log row selection

After row selection, call `shared.logStepEvidence` with details.

### Step 3: Tighten open-chat fallback policy

Current fallback can click the first visible result row when OCR match is missing. Keep this behavior only when:
- the user explicitly searched by exact target name in the same run
- header verification remains mandatory immediately after

Document this in code comments and make the returned metadata obvious.

### Step 4: Commit

```bash
git add examples/mac/wechat_steps/30_search_flow.js examples/mac/wechat_steps/40_open_chat.js
git commit -m "feat: harden wechat search-result selection metadata"
```

---

## Task 6: Make draft input verification explicitly clipboard-first and operator-visible

Objective: Turn clipboard paste into the default and make the chosen input path visible in reports and audit logs.

Files:
- Modify: `examples/mac/wechat_steps/10_capture_helpers.js`
- Modify: `examples/mac/wechat_steps/60_send_guard.js`
- Modify: `examples/mac/wechat_steps/main.js`

### Step 1: Keep clipboard-first input, but make the fallback explicit

Refine `inputMessage` to return one of:
- `clipboard`
- `keyboardType`
- `clipboard_failed_keyboard_fallback`

Example:

```javascript
shared.inputMessage = async function inputMessage(message) {
  if (shared.runtimeConfig.useClipboardForInput) {
    try {
      await clipboard.copy(message);
      await shared.wait(120);
      await keyboard.combination('Meta', 'v');
      return 'clipboard';
    } catch (err) {
      await keyboard.type(message);
      return 'clipboard_failed_keyboard_fallback';
    }
  }
  await keyboard.type(message);
  return 'keyboardType';
};
```

### Step 2: Add `inputStrategy` to final report

Persist:
- `searchInputMode`
- `inputMode`

### Step 3: Include input mode in draft evidence

Already partly present; ensure it is in:
- audit JSONL
- final report JSON

### Step 4: Commit

```bash
git add examples/mac/wechat_steps/10_capture_helpers.js examples/mac/wechat_steps/60_send_guard.js examples/mac/wechat_steps/main.js
git commit -m "feat: expose clipboard-first input strategy in wechat reports"
```

---

## Task 7: Strengthen final report into an operator-facing execution artifact

Objective: Make the JSON report useful without replaying the full terminal session.

Files:
- Modify: `examples/mac/wechat_steps/main.js`

### Step 1: Expand report fields

Add these top-level fields:
- `statusSummary`
- `stepModeResolved`
- `searchInputMode`
- `windowGuard`
- `sendSafety`
- `stepEvidenceSummary`

`statusSummary` should look like:

```javascript
statusSummary: {
  openChatSucceeded: Boolean(context.openChatPoint),
  headerVerified: Boolean(context.headerCheck?.ok),
  inputFocused: Boolean(context.focusPoint),
  draftVerified: Boolean(context.draftCheck?.ok),
  sendAttempted: Array.isArray(context.sendActions) && context.sendActions.length > 0,
  draftCleared: Boolean(context.draftCleared),
  selfMessageObserved: Boolean(context.selfMessageObserved),
}
```

### Step 2: Include safety/gate reasoning clearly

Keep both:
- raw `gateStatus`
- derived `sendSafety`

### Step 3: Commit

```bash
git add examples/mac/wechat_steps/main.js
git commit -m "feat: improve wechat execution report summary"
```

---

## Task 8: Clean up `read_reply` so it is not placeholder-grade

Objective: Stop treating “any OCR text exists” as enough for reply readback.

Files:
- Modify: `examples/mac/wechat_steps/70_read_reply.js`

### Step 1: Preserve current V1 scope

Do not over-engineer semantic reply understanding yet.

### Step 2: Replace the empty-string verification pattern

Current code:

```javascript
const result = await shared.verifyContainsText(replyReadbackShot.image, '');
```

Replace with either:
- verify `expectedIncomingText` still exists when in read-context mode, or
- return a richer OCR readback object without claiming semantic success

Recommended V1 shape:

```javascript
const ocr = await Vision.runOCR({
  visionProfile: shared.runtimeConfig.visionProfile,
  image: replyReadbackShot.image,
});
const text = shared.normalizeText(ocr?.text || '');
const result = {
  ok: text.length > 0,
  text,
  lineCount: Number(ocr?.lineCount || 0),
  mode: 'raw_readback',
};
```

This is more honest than pretending an empty expected string is a real check.

### Step 3: Commit

```bash
git add examples/mac/wechat_steps/70_read_reply.js
git commit -m "fix: make wechat read_reply report honest raw OCR readback"
```

---

## Task 9: Add an example config file for operators

Objective: Make the runtime easier to configure safely without editing source defaults.

Files:
- Create: `config/wechat_structured_send_v2.config.example.json`

### Step 1: Create the example file

Suggested content:

```json
{
  "targetChatName": "示例联系人",
  "expectedIncomingText": "示例问题",
  "replyMessage": "示例回复",
  "enableSend": false,
  "allowUnsafeSendOverride": false,
  "allowDraftInputWithoutSend": true,
  "useClipboardForInput": true,
  "stepMode": "open_chat_verify_header_focus_input",
  "sendRetryCount": 2,
  "sendRetryDelayMinMs": 600,
  "sendRetryDelayMaxMs": 1400,
  "sendDedupWindowMs": 60000,
  "sendAuditPath": ".runtime/temp/mac/wechat_structured_send_v2_audit.jsonl"
}
```

### Step 2: Verify the file is discoverable by humans

Do not add it to override paths automatically unless you want live behavior change. Keep it as documentation/example only.

### Step 3: Commit

```bash
git add config/wechat_structured_send_v2.config.example.json
git commit -m "docs: add example config for wechat desktop runtime"
```

---

## Task 10: Save this implementation plan into the repo

Objective: Persist the execution plan in a canonical place for later implementation.

Files:
- Create: `docs/plans/2026-05-18-wechat-desktop-v1-implementation-plan.md`

### Step 1: Create `docs/plans/`

If missing, create the directory.

### Step 2: Save this plan file there

Use this document as the saved artifact.

### Step 3: Commit

```bash
git add docs/plans/2026-05-18-wechat-desktop-v1-implementation-plan.md
git commit -m "docs: add wechat desktop automation v1 implementation plan"
```

---

## 3. Verification checklist after implementation

Run these in order after the coding tasks are done.

### Verification A: repository tests
Run:
`go test ./...`

Expected:
- Go tests pass
- no regressions from JS source edits

### Verification B: non-send V1 flow
Prepare config:
- `enableSend=false`
- `allowDraftInputWithoutSend=true`
- `stepMode="open_chat_verify_header_focus_input"` first

Then progress to:
- `stepMode="bundle_open_and_focus_input"`
- `stepMode="type_draft"` or equivalent draft-only path

Expected:
- chat opens
- header verifies
- input focuses
- draft verifies
- no real send occurs

### Verification C: audit artifact quality
Inspect:
- `.runtime/temp/mac/wechat_structured_send_v2_audit.jsonl`
- latest `.runtime/temp/mac/wechat_structured_send_v2_*.json`

Expected:
- step evidence exists for search/open/header/focus
- send safety is visible in final report
- input mode is visible
- blocking risks are explicit when send is disallowed

### Verification D: guarded send path
Only if deliberately enabled:
- `enableSend=true`
- gate says send allowed
- target header verified
- dedup clear

Expected:
- send only proceeds when `sendSafety.decision === "allow"`
- draft-cleared and self-message-observed checks both run

---

## 4. Highest-priority next coding actions

If we implement only the top 3 items first, do these:

1. Task 1 — runtime config normalization
2. Task 2 — structured sendSafety object
3. Task 3 — non-send step evidence logging

Why these 3 first:
- they improve safety before adding complexity
- they make failures diagnosable
- they strengthen the current V1 path without changing the architecture

---

## 5. Recommended execution mode

Recommended implementation sequence for the next coding session:

```text
Phase 1
├─ config validation
├─ sendSafety object
└─ step evidence logging

Phase 2
├─ OCR verification metadata
├─ search/open fallback hardening
└─ clipboard-first input reporting

Phase 3
├─ final report shaping
├─ read_reply cleanup
└─ example config/doc cleanup
```

---

Plan complete and saved. Ready to execute using subagent-driven-development — I'll dispatch a fresh subagent per task with two-stage review (spec compliance then code quality). Shall I proceed?
