# Desktop Automation App Target Priority Matrix

## Scoring Model

Scale:

- `1` = weak / unfavorable
- `5` = strong / favorable

Dimensions:

- `Structure Stability`: how predictable the visible layout stays across runs
- `Business Risk`: cost of a mistaken action. Higher score means safer.
- `Automation Value`: usefulness as a real automation target
- `Observability`: how easy it is to infer state from window, regions, and local OCR
- `Low OCR Dependence`: higher score means less dependence on brittle OCR-heavy flows
- `Framework Sample Fit`: usefulness as a stage-one framework validation sample

## Matrix

| App | Structure Stability | Business Risk | Automation Value | Observability | Low OCR Dependence | Framework Sample Fit | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Slack Desktop | 4 | 3 | 5 | 4 | 3 | 5 | Best first-stage sample. Chat-app semantics without WeChat-level send pressure. |
| Telegram Desktop | 4 | 4 | 4 | 4 | 3 | 5 | Strong fallback sample. Similar semantic shape, lower operational risk. |
| Finder | 5 | 5 | 3 | 4 | 5 | 4 | Excellent Layer A/B validation target, weaker than Slack for chat-adapter proving. |
| System Settings | 4 | 5 | 3 | 3 | 4 | 3 | Good for surface/layout discipline and action gating, less useful for reusable list-to-content chat semantics. |
| WeChat Desktop | 3 | 1 | 5 | 2 | 1 | 2 | High value but bad first proving ground. Must return in phase two through adapter + guard. |
| DingTalk Desktop | 3 | 2 | 4 | 2 | 1 | 2 | Similar risk shape to WeChat, not suitable as first framework sample. |

## Ranking By Phase Use

### Stage 1: First Framework Sample

1. Slack Desktop
2. Telegram Desktop
3. Finder

Interpretation:

- Slack is the best balance between realistic adapter demands and manageable risk.
- Telegram is nearly as strong and may be easier to operate in some environments.
- Finder is valuable, but it validates a different app class and should not be the only stage-one proof.

### Stage 2: Cross-App Structural Reuse Check

1. Telegram Desktop
2. Finder
3. System Settings

Interpretation:

- Telegram checks whether the chat-app abstraction generalizes.
- Finder checks whether Layer A/B remain reusable beyond messaging apps.
- System Settings checks guarded action behavior in a non-chat tree/detail app.

### Stage 3: High-Risk Semantic Adapter Re-entry

1. WeChat Desktop
2. DingTalk Desktop

Interpretation:

- Only after generic contracts and a lower-risk adapter are stable should the project re-enter WeChat.

## Why WeChat Is Not First

WeChat scores poorly as a stage-one sample because:

- business risk is the highest among listed apps
- strong send-guard concerns distort base abstractions
- OCR dependence is high when the framework is still immature
- observability is weaker than Slack or Telegram for a first adapter pass

WeChat remains important because:

- automation value is high
- it is still the right phase-two stress target for semantic verification and guarded send flows

## Recommended Validation Sequence

1. Slack Desktop
2. Telegram Desktop
3. Finder
4. WeChat Desktop
5. DingTalk Desktop

Reasoning:

- Validate the four-layer framework first on a realistic but lower-risk chat app.
- Prove that the same Layer A/B and most Layer D machinery can survive a second chat app.
- Prove that the framework also survives a non-chat desktop surface.
- Then reconnect WeChat and DingTalk as high-risk semantic adapters with dedicated guard policy.

## Final Decision

- WeChat should not continue as the first validation object.
- Slack Desktop should replace it as the first-stage sample app.
- Telegram Desktop should be the immediate fallback if Slack cannot be used.