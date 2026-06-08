# Desktop Automation Architecture Review

## Scope

This review reframes the current macOS desktop automation work from a WeChat-specific send script problem into a reusable desktop automation framework problem.

Primary judgment:

- WeChat Desktop should not continue as the first validation target.
- Layout analysis should be treated as Layer B infrastructure, not as the whole solution.
- The framework should be validated first on a lower-risk app, then reconnected to WeChat through an adapter.

Recommended first validation target:

- Slack Desktop

Fallback first-stage target if Slack is unavailable in the environment:

- Telegram Desktop

Reason:

- Both retain chat-style structure, which keeps the adapter problem realistic.
- Both are lower risk than WeChat for accidental business-side effects.
- Both let the framework prove conversation list, header, content, input, and guarded actions without being dominated by send-risk policy.

## Current State Review

The current repo already contains useful partial building blocks, but they are not yet organized by stable boundaries.

Existing reusable assets:

- `examples/mac/wechat_steps/00_window_guard.js`: window discovery, focus, size normalization, and foreground checks.
- `examples/mac/wechat_region_map.js`: layout-to-region mapping attempt, separator band heuristics, region enrichment, and row clustering.
- `examples/mac/wechat_steps/10_capture_helpers.js`: screenshot normalization, coordinate translation, OCR verification helpers, artifact bundle loading.
- `examples/mac/wechat_steps/60_send_guard.js`: send gating, dedup, draft verification, post-send verification.
- `docs/OCR_PROVIDER_INTEGRATION.md`: provider abstraction and fallback chain for OCR.
- `docs-api/testmonkey-runtime-network-and-vision.md`: current `Vision.runOCR` and `Vision.detectUI` contracts.

Existing architectural problem:

- `examples/mac/wechat_structured_send.js` still mixes window acquisition, region loading, row targeting, OCR verification, input action, and send/report output in one linear script.
- `examples/mac/wechat_region_map.js` already contains both Layer B work and WeChat-specific semantic assumptions such as `conversation_list`, `chat_header`, `message_list`, and `input_area`.
- `examples/mac/wechat_steps/*` improves step granularity, but the step graph still assumes a WeChat-shaped world and leaks app semantics into common helpers.

Net result:

- A drift in one recognition stage can still stall the full chain.
- Layout logic is not portable enough to Slack, Telegram, DingTalk, Finder, or System Settings.
- OCR, detect-ui, template relocation, and business validation are still evaluated inside one app-specific battlefield.

## Why The Current WeChat-First Route Is Misleading

WeChat is a poor first framework benchmark because it overweights the hardest part of the problem too early.

WeChat-specific pressure:

- High business risk for mis-send.
- Dense sidebar and list-row structure increases false separators and false semantic matches.
- Current conversation verification and sent-message verification are safety-critical, not optional.
- The project starts optimizing around send safety instead of proving the generic layers.

This causes a framework mistake:

- Layer B gets shaped by WeChat row geometry.
- Layer C gets forced to carry safety concerns that belong in Layer D.
- OCR tuning is treated as main progress even when the real issue is missing separation of concerns.

## Target Four-Layer Architecture

### Layer A: Window / Surface

Responsibilities:

- Discover target app windows.
- Select one window deterministically.
- Bring it to front.
- Normalize bounds when needed.
- Capture a unified surface snapshot.
- Expose one stable coordinate system to upper layers.

Input:

- app identity
- optional process hints
- optional title match rules
- optional expected bounds policy

Output contract shape:

```json
{
  "appId": "slack-desktop",
  "windowId": "pid:1234:title:workspace",
  "title": "Slack | My Workspace",
  "bounds": { "x": 80, "y": 60, "width": 1280, "height": 860 },
  "scale": 1,
  "screenshotPath": ".runtime/temp/mac/surface/slack-123.png",
  "capturedAt": "2026-06-04T12:00:00.000Z",
  "source": "window.getActiveWindow"
}
```

Repo mapping:

- Move `wechat_steps/00_window_guard.js` concepts here.
- Move normalized screenshot and clip size guarantees from `wechat_steps/10_capture_helpers.js` here.

Non-goals:

- No chat targeting.
- No OCR provider choice beyond capture prerequisites.
- No business action.

### Layer B: Layout / Region

Responsibilities:

- Partition a surface into structural zones.
- Produce geometry and confidence, not business truth.
- Reduce search space for OCR and adapter logic.

Expected output types:

- `sidebar`
- `nav_list`
- `header`
- `content_main`
- `input_panel`
- `auxiliary_panel`
- `footer`
- `toolbar`

Recommended strategy order:

1. color-block and background partitioning
2. separator hints and band constraints
3. reusable layout templates
4. sparse OCR for labeling ambiguous zones
5. region schema override for known app classes

Repo mapping:

- Keep separator analysis and region generation ideas from `examples/mac/wechat_region_map.js`.
- Remove WeChat-specific region names from the common Layer B contract.

Important rule:

- Layer B must not output `send_button`, `chat_header`, or `message_sent` as core contract fields.
- Those are semantic or verification outcomes, not structure outcomes.

### Layer C: Semantic Adapter

Responsibilities:

- Interpret generic regions for one app.
- Resolve app-specific semantic targets inside a bounded region.
- Choose localized OCR or detect-ui calls only where needed.
- Validate app meaning, not just geometry.

Examples:

- `wechat-desktop-adapter`
- `slack-desktop-adapter`
- `telegram-desktop-adapter`
- `dingtalk-desktop-adapter`
- `finder-adapter`

Typical duties:

- Determine which region acts as conversation list.
- Determine current selected row and selected header.
- Resolve input region semantics.
- Resolve candidate rows for a target conversation.
- Produce app-specific preconditions for actions.

Repo mapping:

- Row clustering and row matching ideas in `wechat_region_map.js` belong here, not in shared layout code.
- Header verification and conversation targeting in `wechat_steps/30_search_flow.js` and `40_open_chat.js` belong here.

### Layer D: Action / Guard

Responsibilities:

- Execute clicks, type, paste, scroll, submit, and keyboard shortcuts.
- Enforce preconditions and postconditions per action.
- Gate high-risk actions with explicit safety decisions.
- Emit machine-readable evidence and audit logs.

Example decomposition for send:

1. `focus_input`
2. `write_draft`
3. `verify_draft`
4. `trigger_send`
5. `verify_sent_or_block`

Repo mapping:

- `examples/mac/wechat_steps/60_send_guard.js` is the clearest Layer D seed in the current repo.

Design rule:

- No action is a black box.
- Every action must declare precondition, effect, verification, and failure semantics.

## Generic Layer vs App Layer Boundary

Generic, reusable layers:

- Layer A Window / Surface
- Layer B Layout / Region
- Layer D action primitives, evidence logging, and generic guard framework

App-owned layers:

- Layer C Semantic Adapter
- App-specific Layer D policies, such as send guards or destructive-action guards

Boundary rules:

- Generic code may know `header` and `sidebar`, but not `chat row selected`.
- Adapters may use OCR, detect-ui, templates, or hints, but only inside adapter-owned regions.
- Send safety must not shape Layer A or Layer B contracts.

## OCR, Detect-UI, Layout, and Vision Role Split

### Layout analysis

Use for:

- coarse region partitioning
- separator detection
- stable clipping coordinates
- narrowing search space

Do not use as sole source for:

- unique conversation targeting
- sent-message proof
- exact business-state verification

### OCR

Use as region-aware recognition, not full-screen scanning.

Correct pattern:

1. resolve region
2. capture local image
3. OCR local image
4. perform semantic verification

Wrong pattern:

- full-window OCR as default mainline on every step

### detect-ui

Current contract is OCR-derived candidate extraction with click-point inference.

Best role:

- local candidate enhancer inside a known zone
- row text extraction in bounded panels
- fallback when template or pure OCR matching is weak

Not suitable as:

- global truth source for whole-app semantics

### AI vision / LLM vision

Best role:

- low-frequency arbitration
- failure analysis
- region naming proposal for unknown apps
- operator-facing diagnostics

Not suitable as:

- high-frequency execution backbone

### OCR provider choice

Current provider abstraction is useful, but provider choice belongs below the adapter contract.

Design implication:

- provider selection and fallback are runtime concerns
- adapter logic should ask for `text evidence` or `candidate extraction`, not hard-code business logic around one provider

## Guard Model For High-Risk Actions

The repo already shows why guard logic must be first-class.

Current useful behaviors in `60_send_guard.js`:

- send enable flag
- unsafe override gate
- dedup window
- draft verification
- draft cleared verification
- post-send readback verification
- audit logging

Required generalized guard model:

- `riskLevel`: low, medium, high
- `preconditions`: evidence required before action
- `manualOverrideAllowed`: yes or no
- `verificationMode`: none, local, strong, strong-with-audit
- `postcondition`: what must become true
- `blockReason`: structured error when action is blocked

Example guarded action categories:

- low: focus sidebar, open a folder
- medium: switch conversation, clear input draft
- high: send message, delete item, submit form, confirm system dialog

## Recommended First-Stage Validation Route

Stage 1 sample app decision:

- Use Slack Desktop as the first validation object.

Why Slack over WeChat:

- Preserves the chat-app structure needed to validate conversation list, content, and input semantics.
- Lower accidental-send risk pressure for framework bring-up.
- Better fit for validating adapter boundaries without prematurely hard-coding WeChat guard policy into the framework.

Why Telegram is the second choice:

- Similar structural benefits.
- Usually lighter operational risk than WeChat.
- Good backup if Slack is unavailable.

Why Finder and System Settings are not first despite lower risk:

- They are useful Layer A/B validation targets.
- They are weaker than Slack/Telegram for validating the app-adapter pattern needed later for chat automation.

## Minimum Refactor Direction In Repo Terms

Recommended directory direction:

```text
examples/mac/desktop_automation/
  README.md
  surface/
  layout/
  adapters/
  actions/
```

Suggested migration intent:

- keep `examples/mac/wechat_steps/*` as legacy reference while extracting reusable pieces
- create new generic contracts first
- let WeChat adapter consume those contracts later instead of redefining them inline

## Exit Criteria For This Refactor Phase

This phase is successful when:

- WeChat is no longer treated as the only proving ground.
- Layer A/B/C/D boundaries are explicit and documented.
- Slack Desktop can be used as the first adapter validation target.
- Layout output is standardized around structural regions.
- Action and guard contracts are separated from app semantics.
- WeChat re-entry is defined as an adapter integration step, not as the main architecture driver.

## Decision Summary

- WeChat should not continue as the first validation object.
- Slack Desktop should replace it as the first-stage sample app.
- Telegram Desktop should be the immediate fallback sample app.
- The reason is architectural: these apps validate the framework shape without letting high-risk send logic dominate the base abstractions.