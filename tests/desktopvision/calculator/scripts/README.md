# Calculator desktop-vision scripts

Only scripts with a successful real runtime execution for their exact SHA are stored here. Raw generated scripts and blocked diagnostics remain under `.runtime/`.

| Script | Status | Provider / model | Last real run (Asia/Shanghai) | SHA-256 | Evidence |
| --- | --- | --- | --- | --- | --- |
| `level1-locate-dry-run.js` | `known-good` | `openai` / `gpt-5.6-sol` | 2026-08-30 21:59:19 | `de34a97a10835f53cadf57db2a6c1108fff87f4568da3555f57ea25f14e098d7` | `.runtime/runs/calculator-level1-locate-dry-run/run-20260830135919006` and runtime summary `.runtime/runs/direct-20260830-215918-576000` |
| `level2-digit-clear.js` | `blocked`, not promoted | — | — | — | `.runtime/runs/calculator-level2-permission-blocked-20260830T214000+0800` |
| `level2-arithmetic-smoke.js` | `blocked`, not promoted | — | — | — | Same Accessibility blocker; no action run was started. |
| `level2-moved-window-replay.js` | `blocked`, not promoted | — | — | — | Same Accessibility blocker; the Calculator window was not moved. |

The Level 1 script captures a fresh active-window screenshot, calls the audited `DesktopVision` bridge with an explicit official provider/model, requires the response screenshot SHA to match, derives coordinates from normalized model boxes, and performs no action. Each invocation creates a timestamped evidence directory beneath `.runtime/runs/calculator-level1-locate-dry-run/`.

Current Level 2 blocker: `screenCapture=true`, `accessibility=false`. The fail-closed preflight recorded `stop_without_action`; therefore no Level 2 script can be classified as known-good yet.
