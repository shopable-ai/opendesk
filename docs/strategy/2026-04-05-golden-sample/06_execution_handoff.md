# Execution Handoff

## 1. Preconditions satisfied
- strategy review completed
- expert debate log completed
- gate design completed
- durable graph completed
- golden sample spec completed
- prompt pack completed
- external reference environment captured

## 2. Phase 1
### Current goal
Promote semantic/layout contracts into the main artifact chain.

### Inputs
- capture/source.png
- detect/regions.json
- detect/layout_model.json
- infer/app_classification.json
- infer/zones.json
- existing mirror/index.html, mirror/semantic.html, mirror/semantic_model.json
- external reference screenshot/runtime DOM as bootstrap aids

### Outputs
- infer/semantic_model.json
- mirror/layout.html
- mirror/semantic.html
- mirror/dom_validation_report.json

### Completion standard
- canonical files exist at required paths
- all are JSON-driven
- semantic_model becomes source of truth
- DOM validation covers required nodes and uniqueness checks
- send stays disabled

## 3. Phase 2
### Outputs
- infer/chat_candidates.json
- verify/actionability_report.json
- verify/send_safety_report.json

### Completion standard
- candidate ambiguity explicit
- actionability consistent with target coverage
- send safety fail-closes on identity/focus/post-send uncertainty

## 4. Phase 3
### Required capability
- find chat
- open chat
- verify header
- verify context
- focus input
- type text
- send
- verify post-send
- read reply
- record replay and memory

### Hard rules
- no direct send until Phase 2 passes
- no blind retry of send
- every failure gets taxonomy + stop/retry/escalate

## 5. Isolation rules
- run ids like gs-20260405-codex-phase1-*
- do not rewrite shared baseline docs
- do not reuse another agent's run directory
- keep references under artifacts/external and future frozen samples under artifacts/golden-samples
