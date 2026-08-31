# LocateAnything staged LAN test kit

This directory now treats `LocateAnything` as a LAN-served model layer:

- current machine: runs `clawdesk`, WeChat automation, stage orchestration
- model machine: runs `locateanything_bridge.py` with `mock` or `mlx`
- current default real-model target: `mac24` over LAN, using `teaderMac.local:18777`
- note: `mac24` is an SSH alias; HTTP calls should use `teaderMac.local` or the current resolved LAN IP, not the SSH alias itself

The test harness is split into five stages plus lane-based model participation:

| Lane | Target share | Max model steps | Default use |
| --- | --- | ---: | --- |
| `L10` | ~10% | 1 | fallback only |
| `L30` | ~30% | 2 | search + input/send surfaces |
| `L50` | ~50% | 3 | search + conversation/search result + input |
| `L70` | ~70% | 5 | five GUI surfaces |
| `L90` | ~90% | 7 | stress / retry / boundary work |

This is WeChat-first today, but the surfaces are intentionally generic enough to extend to Safari, Finder, Notes, Mail, and other common desktop apps. See `plan/GENERAL_AUTOMATION_TARGETS.md`.

## Layout

- `config/`
  - `default.config.json`
  - `local.override.example.json`
- `manifests/`
  - static cases for Stage 02 and Stage 04
  - workflow cases for Stage 03
- `scripts/`
  - `run_stage_01_env.py`
  - `run_stage_02_model_only.js`
  - `run_stage_03_script_assisted.js`
  - `run_stage_04_boundary_stress.js`
  - `run_stage_05_report.py`
- `.runtime/tests/locateanything/reports/`
  - generated stage markdown reports
  - `FINAL_REPORT.md`
- `.runtime/tests/locateanything/`
  - generated per-stage artifacts and summaries

## Config

Copy `local.override.example.json` to one of these live override paths when you want to point at a real LAN model machine:

- `tests/locateanything/config/local.override.json`
- `.runtime/temp/locateanything.config.json`

Required fields are fixed:

- `serviceUrl`
- `workflowLane`
- `targetChatName`
- `replyMessage`
- `enableSend`
- `sendGuardMode`
- `requestTimeoutMs`
- `profilePolicy`

Remote-first defaults:

- `serviceUrl`: `http://teaderMac.local:18777`
- `remoteModelServiceUrl`: `http://teaderMac.local:18777`
- `localMockServiceUrl`: `http://127.0.0.1:18777`

Transport note:

- the controller now sends screenshots to the bridge as inline `imageBase64`
- `imagePath` remains in the payload only as controller-side provenance/debug context
- this is required because the real MLX bridge runs on `mac24`, not on the controller filesystem

## Profiles

| Profile | Model | Mode | Use |
| --- | --- | --- | --- |
| `daily` | `LocateAnything-3B-8bit` | `fast` | coarse GUI point/box |
| `quality` | `LocateAnything-3B-bf16` | `hybrid` | text, small targets, multi-instance |
| `verify` | `LocateAnything-3B-bf16` | `slow` | final retry only |

## Commands

Environment and controller checks:

```bash
cd /Users/mac/Documents/workspace/clawdesk
python3 tests/locateanything/scripts/run_stage_01_env.py
```

Model-only static cases:

```bash
cd /Users/mac/Documents/workspace/clawdesk
./dist/clawdesk -script tests/locateanything/scripts/run_stage_02_model_only.js -timeout 5
```

Script-assisted WeChat workflow:

```bash
cd /Users/mac/Documents/workspace/clawdesk
./dist/Clawdesk.app/Contents/MacOS/Clawdesk -script tests/locateanything/scripts/run_stage_03_script_assisted.js -timeout 8
```

Boundary matrix:

```bash
cd /Users/mac/Documents/workspace/clawdesk
./dist/clawdesk -script tests/locateanything/scripts/run_stage_04_boundary_stress.js -timeout 5
```

Final report aggregation:

```bash
cd /Users/mac/Documents/workspace/clawdesk
python3 tests/locateanything/scripts/run_stage_05_report.py
```

## Demo

`demo_grounding.js` is still kept as a thin smoke test. It now reads `serviceUrl` from the shared config instead of hardcoding `127.0.0.1:18777`.

## Mode Split

- remote real model: `serviceUrl = http://teaderMac.local:18777`, backend `mlx`
- local mock fallback: `serviceUrl = http://127.0.0.1:18777`, backend `mock`
- recommended default: remote `mlx` for Stage 02/03/04 validation, local mock only when the remote bridge is down or intentionally bypassed
