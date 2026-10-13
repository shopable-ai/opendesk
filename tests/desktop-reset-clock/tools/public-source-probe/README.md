# Reset Clock R2.4-A · independent public-source probe

**Scope**: developer-only Node.js 22+ tool; no npm dependencies, no integration with AppKit/Win32, no desktop scraper, no Cookie/X session, no feed publishing. The C3 HTML stays unchanged. It queries only four publicly documented JSON GET routes at `https://codex-reset.com` and preserves their source attribution.

From the **OpenDesk repository root**, run:

```bash
node --test tests/desktop-reset-clock/tools/public-source-probe/probe.test.mjs
node tests/desktop-reset-clock/tools/public-source-probe/probe.mjs --fixture
# Requires network/DNS; use only when you intend to contact the provider.
node tests/desktop-reset-clock/tools/public-source-probe/probe.mjs --live
```

`--fixture` is fully offline and replays a **minimal sample of field shapes and identifying values** observed on 2026-10-13 (paraphrased text, not source posts). This is NOT a live success. `--live` requests `/api/forecast`, `/api/timeline`, `/api/feed`, `/api/status-history` via Node `fetch` and records sanitized classifications and transport/header metadata. Read the results in the **repository root** `.runtime/tests/desktop-reset-clock/r24/`:

- `fixture-report.json` / `live-report.json`: per-endpoint health, timestamps, exact HTTP status and caching headers where available, categorized source-linked evidence; never any fabricated future reset time.
- `request-state.json`: persisted per-endpoint not-before timestamps (60s minimum + response cache headers + Retry-After). A second invocation within the interval skips the request. Concurrent `--live` processes are blocked by `.probe.lock` to avoid a rate-limit race. `--live` uses at most two attempts, waiting at least 60 seconds on retryable transport errors/5xx; 429 is deferred per Retry-After without an immediate retry.

The probe fails closed: `stale`, `invalid`, `unavailable` and `rate_limited` are distinct; upstream timestamps are not used as certainty of a specific user's quota. Source posts and confirmed announcements are deduplicated by upstream ID; conflicting publication/observation timestamps are logged, not silently overwritten. `official_signal` becomes a **non-actionable advance notice**; probabilities, tentative windows and history are never turned into `exact_next_reset_at` or a desktop notification. The probe intentionally outputs `can_publish_feed: false` until R2.4-B verifies actual evidence and implements a versioned OpenDesk Feed.

The provider's developer rules require: identifiable User-Agent, visible linked attribution where reused data is shown publicly, max one poll per minute, respect for `Cache-Control` and `Retry-After`, and GET only. Its forecasts and incident classifications are independent third-party estimates. **Attribution for downstream use: [Data: codex-reset.com](https://codex-reset.com/)**, on the same surface as the data. See [API docs](https://codex-reset.com/developers), [terms](https://codex-reset.com/terms), and [R2.4 research plan](../../../../docs/plans/desktop-reset-clock-public-source-r24.zh-CN.md).

The probe does **not** invent Go `events.Event`/`history.Record` fields (`verified_at`, `effective_at`, `revision`, `archive complete`, `source_type: official`) from these JSON responses; see [R2.4-A evidence report](../../../../docs/quality/desktop-reset-clock-r24-a-probe.zh-CN.md) for mappings and Bridge next steps.
