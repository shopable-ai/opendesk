# Desktop App Adapter Contract

## Purpose

This document defines the contracts between the four desktop automation layers.

Goals:

- keep structural contracts app-agnostic
- constrain where app semantics may appear
- let adapters reuse the same Window, Layout, and Action substrates
- make verification a first-class output, not an afterthought

## 1. Surface Snapshot Contract

Owned by:

- Layer A Window / Surface

Input:

```json
{
  "appId": "slack-desktop",
  "windowMatch": {
    "titleIncludes": ["Slack"],
    "exeIncludes": ["slack"]
  },
  "focusPolicy": "frontmost-or-bring-to-top",
  "normalizeBounds": { "width": 1280, "height": 860 }
}
```

Output:

```json
{
  "appId": "slack-desktop",
  "windowId": "pid:1234:title:Slack",
  "title": "Slack | Workspace",
  "process": {
    "pid": 1234,
    "exeName": "Slack"
  },
  "bounds": { "x": 80, "y": 60, "width": 1280, "height": 860 },
  "scale": 1,
  "screenshotPath": ".runtime/temp/mac/surface/slack-latest.png",
  "capturedAt": "2026-06-04T12:00:00.000Z",
  "captureSource": "page.screenshot",
  "windowSource": "window.getActiveWindow"
}
```

Required guarantees:

- screenshot coordinates align with `bounds`
- screenshot size equals normalized bounds after any scaling correction
- `windowId` is stable enough for the current run

Disallowed fields:

- conversation names
- selected row claims
- action readiness

## 2. Layout Region Contract

Owned by:

- Layer B Layout / Region

Input:

- `surfaceSnapshot`
- optional layout hints
- optional app class hints such as `chat-app`, `document-app`, `settings-app`

Output:

```json
{
  "surfaceRef": "pid:1234:title:Slack",
  "layoutVersion": "v1",
  "strategy": {
    "colorPartition": true,
    "separatorHints": true,
    "templateClass": "chat-app",
    "ocrAssist": false
  },
  "regions": [
    {
      "id": "sidebar",
      "role": "sidebar",
      "bbox": { "x": 0, "y": 0, "width": 72, "height": 860 },
      "confidence": 0.91
    },
    {
      "id": "nav_list",
      "role": "nav_list",
      "bbox": { "x": 72, "y": 0, "width": 280, "height": 860 },
      "confidence": 0.88
    },
    {
      "id": "header",
      "role": "header",
      "bbox": { "x": 352, "y": 0, "width": 928, "height": 64 },
      "confidence": 0.86
    },
    {
      "id": "content_main",
      "role": "content_main",
      "bbox": { "x": 352, "y": 64, "width": 928, "height": 636 },
      "confidence": 0.84
    },
    {
      "id": "input_panel",
      "role": "input_panel",
      "bbox": { "x": 352, "y": 700, "width": 928, "height": 160 },
      "confidence": 0.83
    }
  ],
  "warnings": []
}
```

Required guarantees:

- region coordinates are relative to the surface, not absolute screen coordinates
- output names remain structural
- confidence is about geometry confidence, not business correctness

Disallowed outputs in the shared contract:

- `chat_header`
- `message_list`
- `send_button`
- `selected_chat_row`
- `message_sent`

Those belong in adapter or verification output.

## 3. Semantic Adapter Contract

Owned by:

- Layer C Semantic Adapter

Purpose:

- map generic structural regions into app meaning
- run localized OCR / detect-ui / template matching inside chosen zones

Input:

```json
{
  "adapterId": "slack-desktop-adapter",
  "surface": "surfaceSnapshot",
  "layout": "layoutRegionResult",
  "intent": {
    "kind": "resolve-conversation-and-input",
    "targetConversation": "qa-bot",
    "expectedHeader": "qa-bot"
  }
}
```

Output:

```json
{
  "adapterId": "slack-desktop-adapter",
  "appSemantics": {
    "conversationListRegionId": "nav_list",
    "conversationHeaderRegionId": "header",
    "messageRegionId": "content_main",
    "inputRegionId": "input_panel"
  },
  "resolvedTargets": {
    "conversationCandidate": {
      "text": "qa-bot",
      "bbox": { "x": 84, "y": 148, "width": 248, "height": 34 },
      "score": 0.89,
      "source": "detect-ui"
    },
    "headerVerification": {
      "text": "qa-bot",
      "ok": true,
      "source": "ocr"
    },
    "inputAnchor": {
      "bbox": { "x": 380, "y": 724, "width": 860, "height": 112 },
      "source": "region+template"
    }
  },
  "warnings": []
}
```

Required guarantees:

- adapter outputs must reference source region ids or source evidence
- candidate provenance must be explicit: `ocr`, `detect-ui`, `template`, `hint`, `manual-schema`
- every semantic claim must carry either confidence or boolean verification status

Allowed app-specific names here:

- `conversationListRegionId`
- `messageRegionId`
- `inputRegionId`
- `selectedConversation`
- `draftAnchor`

## 4. Action Contract

Owned by:

- Layer D Action / Guard

Every action must expose:

- action id
- risk level
- preconditions
- effect
- postconditions
- evidence

Canonical action request shape:

```json
{
  "actionId": "write_draft",
  "riskLevel": "medium",
  "target": {
    "regionId": "input_panel",
    "bbox": { "x": 380, "y": 724, "width": 860, "height": 112 }
  },
  "payload": {
    "text": "hello from clawdesk"
  },
  "preconditions": [
    "window_frontmost",
    "input_anchor_resolved"
  ],
  "postconditions": [
    "draft_visible"
  ]
}
```

Canonical action result shape:

```json
{
  "actionId": "write_draft",
  "ok": true,
  "performedAt": "2026-06-04T12:00:01.000Z",
  "method": "clipboard-paste",
  "evidence": {
    "beforeShot": ".runtime/temp/mac/actions/input-before.png",
    "afterShot": ".runtime/temp/mac/actions/input-after.png",
    "verification": "draft_visible"
  },
  "warnings": []
}
```

## 5. Verification Contract

Verification is not a side note in logs. It is its own contract.

Verification request:

```json
{
  "verificationId": "verify_draft",
  "scope": "input_panel",
  "expected": {
    "containsText": "hello from clawdesk"
  },
  "strategy": {
    "kind": "ocr",
    "zoneAware": true,
    "providerFallback": ["local", "openai"]
  }
}
```

Verification result:

```json
{
  "verificationId": "verify_draft",
  "ok": true,
  "source": "ocr",
  "matchType": "contains",
  "observedText": "hello from clawdesk",
  "confidence": 0.93,
  "artifacts": {
    "shotPath": ".runtime/temp/mac/verify/draft-shot.png"
  }
}
```

Verification modes:

- `none`
- `geometry`
- `ocr`
- `detect-ui`
- `template`
- `multi-source`
- `manual-gated`

Recommended mapping:

- low-risk actions may accept `geometry`
- medium-risk actions should prefer local OCR or detect-ui
- high-risk actions should require `multi-source` or explicit block

## 6. Send Guard Contract

This is an app-policy contract layered on top of generic actions.

Request:

```json
{
  "guardId": "message-send-guard",
  "appId": "wechat-desktop",
  "intent": {
    "targetConversation": "customer-a",
    "draftText": "hello"
  },
  "inputs": {
    "headerVerified": true,
    "draftVerified": true,
    "dedupPassed": true,
    "artifactPolicyPassed": false
  }
}
```

Response:

```json
{
  "decision": "block",
  "manualOverrideAllowed": true,
  "blockingRisks": [
    "artifact-policy-failed"
  ],
  "requiredEvidence": [
    "header_verified",
    "draft_verified",
    "dedup_passed"
  ]
}
```

Important boundary:

- this contract is not generic for every app
- the framework should provide the guard machinery
- each app adapter may define its own high-risk guard policy

## 7. Provider Strategy Contract

Provider choice should remain pluggable and runtime-owned.

The adapter should request capability class, not business-flow branching by provider name.

Suggested shape:

```json
{
  "capability": "ocr-localized-text",
  "runtimeProfile": {
    "primary": "paddle",
    "fallback": ["local", "openai"],
    "language": "ch",
    "timeoutMs": 15000
  }
}
```

## 8. Error Contract

All layers should emit structured failures.

```json
{
  "ok": false,
  "layer": "semantic-adapter",
  "code": "conversation-target-not-found",
  "message": "target conversation was not found inside nav_list",
  "retryable": true,
  "evidence": {
    "shotPath": ".runtime/temp/mac/errors/nav-list.png"
  }
}
```

Error classes to standardize:

- `window-not-found`
- `surface-capture-failed`
- `layout-insufficient`
- `semantic-target-not-found`
- `precondition-failed`
- `verification-failed`
- `high-risk-action-blocked`

## 9. Contract Ownership Summary

- Layer A owns surface discovery and normalized capture.
- Layer B owns structural regions.
- Layer C owns app meaning.
- Layer D owns execution, evidence, and guard enforcement.

Rule of thumb:

- if a field only makes sense in one app, it does not belong in Layer A or B
- if a field describes a business consequence, it does not belong in Layer B
- if an operation is dangerous, verification and guard must be explicit before execution