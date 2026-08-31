# WeChatWeb test fixture

This directory is a stable source fixture for the WeChatWeb UI tests.

## Role

- used during script development
- not a runtime dependency
- derived captures and analysis results are written to `.runtime/runs/`

## Files

- `index.html` — main sample entry
- `assets/` — local assets required by the sample
- `AGENT_MIN_CONTEXT.md` — low-noise context guidance for agents
- `manifest.json` — package metadata and provenance

## Open correctly

Prefer opening this sample over a local HTTP server, for example:

```bash
cd "$REPO_ROOT"
python3 -m http.server 4182 --bind 127.0.0.1
```

Then open:

`http://127.0.0.1:4182/test/wechat/fixtures/wechatweb/index.html`

Why:

- local fonts and relative assets are more reliable over HTTP than `file://`
- this avoids false alarms where icon fonts look broken only because of the open mode

## Provenance

- upstream frozen repo clone: `.runtime/cache/external/wechatweb/20260405/repo/`
- remote/runtime capture package: `.runtime/cache/external/wechatweb/20260405/demo/`

## Upstream links

For later lookup or refresh, this sample corresponds to:

- source project: https://github.com/RookieMasterrr/WeChatWeb
- live demo: https://rookiemasterrr.github.io/WeChatWeb/

Recommended mapping:

- `.runtime/cache/external/wechatweb/20260405/repo/` ↔ GitHub source project
- `.runtime/cache/external/wechatweb/20260405/demo/` ↔ online demo capture/reference
