# Docs Migration Map

## Purpose

This file is the execution map for cleaning the current `docs/` root.

Current baseline on `master`:

- `docs/` root contains **61 direct files** before this P0 governance batch.
- long-lived documentation, research, reports, prompts, versioned drafts and scenario-specific material are mixed together.
- this file assigns every one of those 61 files a target lifecycle and destination.

P0 only establishes the map. **Do not infer that a MOVE/MERGE/ARCHIVE below has already happened.** Physical moves begin in P1 after reference checks.

## Action meanings

| Action | Meaning |
|---|---|
| `MOVE` | content is still useful and should move/rename into a canonical docs category |
| `MERGE` | useful content must be merged into one canonical document; duplicate source is removed afterwards |
| `REPORT` | preserved evidence/report; move out of `docs/` into `artifacts/reports/` |
| `PROMPT` | reusable AI prompt; move out of `docs/` into `prompts/` if still maintained |
| `ARCHIVE` | superseded but worth preserving for history |
| `DELETE_AFTER_MERGE` | extract any unique value, then delete; Git history is sufficient |

Priority:

- `P1`: mostly structural move/rename; lower semantic risk.
- `P2`: requires content comparison, deduplication, staleness judgment or lifecycle verification before removal.

## Summary

| Action | Count |
|---|---:|
| MOVE | 41 |
| REPORT | 9 |
| MERGE | 5 |
| PROMPT | 3 |
| ARCHIVE | 2 |
| DELETE_AFTER_MERGE | 1 |
| **Total** | **61** |

Priority split:

- P1: 45
- P2: 16

## 61 root files

| # | Current file | Action | Target | Priority | Notes |
|---:|---|---|---|---|---|
| 1 | `ACTION_TARGET_MODEL.md` | MOVE | `docs/architecture/desktop-automation/action-target-model.md` | P1 | desktop action-target model |
| 2 | `ACTIVE_CONTEXT.md` | MOVE | `docs/project/current-context.md` | P1 | active project context; keep current-only content |
| 3 | `AGENT_TEXT_DRIVEN_DEVELOPMENT.md` | MOVE | `docs/architecture/execution/agent-text-driven-development.md` | P1 | execution/development model |
| 4 | `ALGORITHM_VALIDATION_REPORT.md` | REPORT | `artifacts/reports/layout/algorithm-validation-report.md` | P1 | validation evidence, not canonical docs |
| 5 | `APP_CLASSIFICATION_POLICY.md` | MOVE | `docs/architecture/desktop-automation/app-classification-policy.md` | P1 | active classification policy |
| 6 | `BLINDSPOT_AUDIT.md` | REPORT | `artifacts/reports/reviews/blindspot-audit.md` | P2 | verify whether any reusable checklist must first be extracted to `docs/quality/review/` |
| 7 | `DESKTOP_AUTOMATION_FRAMEWORK_EXPERIENCE.md` | MOVE | `docs/research/desktop-automation/framework-experience.md` | P1 | research/experience input, not final architecture |
| 8 | `DESKTOP_AUTOMATION_SOLUTION_OPTIONS.md` | MOVE | `docs/research/desktop-automation/solution-options.md` | P1 | option exploration |
| 9 | `DRAWING_SYSTEM.md` | MOVE | `docs/implementation/runtime/drawing-system.md` | P1 | implementation reference |
| 10 | `EXECUTION_FAILURE_CASES.md` | MOVE | `docs/quality/failure-cases.md` | P1 | reusable quality knowledge |
| 11 | `EXECUTION_RUNTIME_NOTES.md` | MOVE | `docs/implementation/runtime/execution-runtime-notes.md` | P1 | runtime implementation notes |
| 12 | `EXPERT_ATTACK_DEFENSE_REVIEW.md` | REPORT | `artifacts/reports/reviews/expert-attack-defense-review.md` | P2 | one-time review result; extract reusable rules first |
| 13 | `EXPERT_REVIEW_RUBRIC.md` | MOVE | `docs/quality/review/expert-review-rubric.md` | P1 | reusable review rubric |
| 14 | `FAILURE_TAXONOMY.md` | MOVE | `docs/quality/failure-taxonomy.md` | P1 | canonical quality taxonomy |
| 15 | `FINAL_STATUS_REPORT.md` | MERGE | `.archive/reports/2026-layout-improvement-summary.md` | P2 | duplicate layout-project completion material |
| 16 | `FINAL_SUMMARY.md` | MERGE | `.archive/reports/2026-layout-improvement-summary.md` | P2 | merge with other layout completion summaries |
| 17 | `GATES_AND_EVIDENCE.md` | ARCHIVE | `.archive/legacy-docs/gates-and-evidence-bootstrap.md` | P1 | file is explicitly superseded by V2 |
| 18 | `GATES_AND_EVIDENCE_V2.md` | MOVE | `docs/quality/gates-and-evidence.md` | P1 | becomes the unversioned current Source of Truth |
| 19 | `GOLDEN_GATES.md` | MERGE | `docs/quality/gates-and-evidence.md` | P2 | compare overlaps and retain only unique gate rules |
| 20 | `GOLDEN_SAMPLE_STRATEGY.md` | MOVE | `docs/quality/golden-sample-strategy.md` | P1 | reusable quality strategy |
| 21 | `GOLDEN_SAMPLE_STRATEGY_REVIEW_20260405.md` | REPORT | `artifacts/reports/reviews/2026-04-05-golden-sample-strategy-review.md` | P2 | historical review evidence |
| 22 | `IMPROVEMENT_PLAN.md` | MOVE | `docs/plans/layout/layout-improvement-plan.md` | P2 | verify whether still active; archive instead if completed |
| 23 | `LANGGRAPH_EXECUTION_GRAPH.md` | MOVE | `docs/architecture/execution/langgraph-execution-graph.md` | P1 | execution architecture |
| 24 | `LANGGRAPH_GOLDEN_SAMPLE_GRAPH_20260405.md` | ARCHIVE | `.archive/legacy-docs/golden-sample-strategy/2026-04-05-langgraph-golden-sample-graph.md` | P2 | compare with `docs/golden_sample_strategy/` before archiving |
| 25 | `LAYOUT_IMPROVEMENTS.md` | MOVE | `docs/implementation/layout/layout-recognition.md` | P1 | canonical base for current layout implementation |
| 26 | `OCR_PROVIDER_INTEGRATION.md` | MOVE | `docs/implementation/ocr/provider-integration.md` | P1 | implementation/integration reference |
| 27 | `PROGRESSIVE_TEST_RESULTS.md` | REPORT | `artifacts/reports/layout/progressive-test-results.md` | P1 | test evidence |
| 28 | `PROJECT_CAPABILITY_BRIEF.md` | MOVE | `docs/project/overview.md` | P1 | canonical project capability overview candidate |
| 29 | `PROJECT_COMPLETE_SUMMARY.md` | MERGE | `.archive/reports/2026-layout-improvement-summary.md` | P2 | merge with layout final summaries |
| 30 | `REAL_APP_TEST_RESULTS.md` | REPORT | `artifacts/reports/layout/real-app-test-results.md` | P1 | test evidence |
| 31 | `RED_TEAM_ATTACKS.md` | MOVE | `docs/quality/review/red-team.md` | P1 | reusable red-team cases/rules |
| 32 | `RUNBOOK.md` | MOVE | `docs/project/runbook.md` | P1 | active operator entrypoint; verify references |
| 33 | `SOLUTION_OPTIONS.md` | MOVE | `docs/research/execution/bootstrap-solution-options.md` | P2 | option history; confirm scope before rename |
| 34 | `STRUCTURE_FIRST_EXECUTION.md` | MOVE | `docs/architecture/execution/structure-first-execution.md` | P1 | execution architecture/principles |
| 35 | `TASK_PROMPT_FOR_NEW_SESSION.md` | PROMPT | `prompts/handoffs/new-session.md` | P2 | keep only if actively reusable |
| 36 | `TESTING_GUIDE.md` | MOVE | `docs/quality/testing-guide.md` | P1 | canonical test guidance |
| 37 | `WECHAT_COMPLETE_SOLUTION_FRAMEWORK.md` | MOVE | `docs/scenarios/wechat/architecture.md` | P1 | WeChat scenario architecture basis |
| 38 | `WECHAT_EXECUTION_MASTER_PROMPT.md` | PROMPT | `prompts/wechat/execution-master.md` | P2 | prompt is not project documentation |
| 39 | `WECHAT_STRUCTURED_SEND_V2.md` | MOVE | `docs/scenarios/wechat/structured-send.md` | P1 | remove version suffix; Git owns history |
| 40 | `WECHAT_WX4PY_BORROWING_GUIDE.md` | MOVE | `docs/research/wechat/wx4py-borrowing-analysis.md` | P1 | external-solution research input |
| 41 | `browser-automation-capability-boundaries.md` | MOVE | `docs/architecture/browser-automation/capabilities.md` | P1 | canonical capability boundary candidate |
| 42 | `browser-automation-capability-evidence-manifest.json` | REPORT | `artifacts/reports/browser-automation/capability-evidence-manifest.json` | P2 | if generated evidence; if hand-maintained contract, reassess before move |
| 43 | `browser-automation-http-smoke-guide.md` | MOVE | `docs/quality/browser-automation/http-smoke.md` | P1 | verification guide |
| 44 | `browser-automation-legacy-escape-hatches.md` | MOVE | `docs/architecture/browser-automation/legacy-compatibility.md` | P1 | compatibility architecture |
| 45 | `browser-automation-next-phase-roadmap.md` | MOVE | `docs/plans/browser-automation/roadmap.md` | P1 | active plan/roadmap |
| 46 | `browser-automation-stacks.md` | MOVE | `docs/architecture/browser-automation/stack.md` | P1 | architecture stack |
| 47 | `browser-automation-test-matrix.md` | MOVE | `docs/quality/browser-automation/test-matrix.md` | P1 | quality/test matrix |
| 48 | `desktop-automation-solution-research.md` | MOVE | `docs/research/desktop-automation/solution-research.md` | P1 | solution research |
| 49 | `layout_improvement_analysis.md` | MOVE | `docs/research/layout/layout-improvement-analysis.md` | P1 | research analysis |
| 50 | `layout_improvement_implementation.md` | MERGE | `docs/implementation/layout/layout-recognition.md` | P2 | merge current facts into canonical layout doc |
| 51 | `layout_improvement_prompt.md` | PROMPT | `prompts/layout/layout-improvement.md` | P2 | keep only if reusable; otherwise delete after extraction |
| 52 | `layout_improvement_results.md` | REPORT | `artifacts/reports/layout/layout-improvement-results.md` | P1 | experiment/test results |
| 53 | `macos-gocv-build-guide.md` | MOVE | `docs/implementation/macos/gocv-build-guide.md` | P1 | macOS implementation guide |
| 54 | `macos-screenshot-troubleshooting.md` | MOVE | `docs/implementation/macos/screenshot-troubleshooting.md` | P1 | troubleshooting guide |
| 55 | `macos_automation_config.md` | MOVE | `docs/implementation/macos/automation-config.md` | P1 | normalize underscore naming |
| 56 | `param_tuning_analysis.md` | MOVE | `docs/research/layout/parameter-tuning-analysis.md` | P1 | parameter research |
| 57 | `test_results_wechat.md` | REPORT | `artifacts/reports/wechat/test-results.md` | P1 | test evidence, not scenario documentation |
| 58 | `think.md` | DELETE_AFTER_MERGE | Git history only | P2 | raw thought/workpad should not remain canonical |
| 59 | `wechat_baseline_compare_spec.md` | MOVE | `docs/scenarios/wechat/baseline-compare-spec.md` | P1 | scenario verification spec |
| 60 | `wechat_desktop_requirements.md` | MOVE | `docs/scenarios/wechat/requirements.md` | P1 | scenario requirements |
| 61 | `wechat_frozen_desktop_golden_template.md` | MOVE | `docs/scenarios/wechat/golden-template.md` | P1 | scenario golden template |

## Existing `docs/` directories

The root-file cleanup also needs directory normalization. These directory actions are separate from the 61-file count.

| Current directory | Direction | Notes |
|---|---|---|
| `docs/architecture/` | KEEP + EXPAND | canonical architecture root |
| `docs/desktop-automation/` | MERGE | converge into `docs/architecture/desktop-automation/` plus research/quality where appropriate |
| `docs/discuz/` | SPLIT | scenario-owned material to `docs/scenarios/discuz/`; research/roadmaps to their lifecycle roots |
| `docs/golden_sample_strategy/` | SPLIT / ARCHIVE | reusable rules to quality; dated experiments/reviews to reports/archive |
| `docs/implementation/` | KEEP + EXPAND | canonical implementation root |
| `docs/maintenance/` | KEEP | repository/documentation governance |
| `docs/mcp/` | MERGE | converge into `docs/integrations/mcp/`; prompts/reports move out separately |
| `docs/optimization/` | EXTRACT + ARCHIVE | process history; extract surviving decisions then archive/remove the round-by-round worklog |
| `docs/plans/` | KEEP + ORGANIZE | active plans only |
| `docs/research/` | KEEP + ORGANIZE | research inputs, preferably topic subdirectories |
| `docs/strategy/` | SPLIT | decisions to architecture/decisions, active roadmaps to plans, one-time work to research/archive |

## API documentation exception

Do **not** apply the general directory-normalization idea by moving `docs-user-api/` under `docs/`.

Current canonical rule:

```text
docs/          -> project and engineering docs
docs-user-api/ -> sole maintained user API docs
```

Retired and must not be recreated as parallel authorities:

```text
docs-api/
docs-api-user/
docs/api/
```

## P1 execution order

To reduce link breakage, execute structural migration in topic batches rather than alphabetically:

1. Quality core
   - `GATES_AND_EVIDENCE*`
   - `FAILURE_TAXONOMY.md`
   - `EXECUTION_FAILURE_CASES.md`
   - `TESTING_GUIDE.md`
   - review/rubric files
2. Browser automation
3. macOS implementation
4. Desktop automation architecture/research
5. WeChat scenario
6. Layout implementation/research/reports
7. MCP integration directory
8. remaining project/execution docs
9. historical summaries, prompts and raw notes

For every batch:

```text
search references
-> create target path
-> update links
-> verify target content
-> remove old path
-> search old path again
```

## P2 semantic cleanup rules

P2 is not a blind move operation.

Before MERGE / ARCHIVE / DELETE:

- compare overlapping documents;
- identify unique facts and decisions;
- validate facts against current source/tests where relevant;
- merge only still-valid content into the canonical file;
- preserve important historical evidence in `artifacts/reports/` or `.archive/`;
- remove low-value duplicate AI work products instead of creating an archive dump.

Especially review these clusters as one unit:

```text
GATES_AND_EVIDENCE.md
GATES_AND_EVIDENCE_V2.md
GOLDEN_GATES.md

FINAL_SUMMARY.md
FINAL_STATUS_REPORT.md
PROJECT_COMPLETE_SUMMARY.md
LAYOUT_IMPROVEMENTS.md
layout_improvement_implementation.md

GOLDEN_SAMPLE_STRATEGY.md
GOLDEN_SAMPLE_STRATEGY_REVIEW_20260405.md
LANGGRAPH_GOLDEN_SAMPLE_GRAPH_20260405.md
docs/golden_sample_strategy/
```

## Completion criteria

The docs-root migration is complete when:

- `docs/` root contains only `README.md` plus classified directories;
- no current canonical document uses `_V2`, `_V3`, `FINAL`, `COMPLETE_SUMMARY` style version-history naming;
- current architecture, implementation and quality docs have one clear Source of Truth per topic;
- prompts, generated evidence and historical reports no longer compete with canonical docs;
- `docs-user-api/` remains the sole maintained user API documentation root;
- repository search finds no live references to removed documentation paths.
