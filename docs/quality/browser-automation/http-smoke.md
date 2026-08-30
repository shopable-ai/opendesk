# Browser automation HTTP smoke guide

Purpose
- make the real `/executions` verification path easy to discover from higher-level docs
- separate payload-example proof from real HTTP execution proof
- keep capability language honest: upgraded/playwright over HTTP are still facade/shim verification unless a deeper runtime proof is provided

Related entrypoints
- overview and boundaries: `docs/browser-automation-stacks.md`
- test inventory: `docs/browser-automation-test-matrix.md`
- legacy/private-path boundaries: `docs/browser-automation-legacy-escape-hatches.md`
- payload templates:
  - `examples/browser_stack_http_upgraded_smoke.js`
  - `examples/browser_stack_http_playwright_smoke.js`
- macOS minimal real desktop smoke:
  - `examples/browser_stack_macos_app_smoke.js`

## 1. What each HTTP artifact proves

Payload templates only
- `examples/browser_stack_http_upgraded_smoke.js`
- `examples/browser_stack_http_playwright_smoke.js`
- prove: canonical request-body shape for selecting stack via `/executions`
- do not prove: server is running, request succeeds, summary endpoint is reachable

Real E2E smoke
- `examples/browser_stack_http_e2e_smoke.py`
- proves:
  - `POST /executions` accepts the request
  - response returns `executionId`, `statusUrl`, `summaryUrl`, `streamUrl`
  - polling `/executions/{id}` reaches a terminal state
  - `/summary` is readable
- does not prove:
  - full Playwright runtime semantics
  - full DOM/tab/session behavior

## 2. Start server

From repo root:

```bash
go run . -http -port 60844
```

Optional: use another port, then pass it into the smoke script URL.

## 3. Run upgraded smoke

```bash
python3 examples/browser_stack_http_e2e_smoke.py http://127.0.0.1:60844 upgraded
```

Expected evidence fields in stdout JSON
- `executionId`
- `statusUrl`
- `summaryUrl`
- `streamUrl`
- `finalStatus`
- `statusPayload`
- `summaryPayload`

## 4. Run playwright smoke

```bash
python3 examples/browser_stack_http_e2e_smoke.py http://127.0.0.1:60844 playwright
```

Interpretation rule
- report this as playwright-shaped facade/shim execution over HTTP
- do not report it as complete Playwright runtime support

## 5. Optional direct POST using payload templates

Inspect templates:
- `examples/browser_stack_http_upgraded_smoke.js`
- `examples/browser_stack_http_playwright_smoke.js`

Then send your own request body to `/executions`.

## 6. Optional artifact persistence

If request JSON includes `logDir`, verify generated artifacts there:
- `stdout.log`
- `stderr.log`
- `summary.json`
- `agent_summary.json`
- `events.ndjson`

These artifacts are useful when turning one smoke run into reviewable evidence.

## 7. Reporting language checklist

Allowed
- upgraded HTTP stack selection passed
- playwright-shaped HTTP shim passed
- `/executions` end-to-end route verified
- summary/status endpoints verified

Not allowed without extra evidence
- full Playwright support passed
- real browser-process lifecycle fully verified
- DOM selector semantics fully verified
