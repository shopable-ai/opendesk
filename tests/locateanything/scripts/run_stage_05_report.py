#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
ROOT = REPO_ROOT / "test" / "locateanything"
RUNTIME_ROOT = REPO_ROOT / ".runtime" / "test" / "locateanything"
FINAL_REPORT_PATH = RUNTIME_ROOT / "reports" / "FINAL_REPORT.md"


def load_json(path: Path):
    if not path.exists():
        return None
    return json.loads(path.read_text())


def summarize_stage(path: Path):
    data = load_json(path)
    if not data:
        return None
    return {
        "path": str(path.relative_to(REPO_ROOT)),
        "total": data.get("totalCases", 0),
        "passed": data.get("passedCases", 0),
        "failed": data.get("failedCases", 0),
        "data": data,
    }


def stage_backend_label(stage):
    if not stage:
        return "unknown"
    data = stage.get("data", {})
    backend = (
        data.get("bridgeBackend")
        or data.get("health", {}).get("data", {}).get("backend")
        or ""
    )
    service_url = data.get("serviceUrl", "")
    if not backend:
        return service_url or "unknown"
    return f"{backend} @ {service_url}"


def main() -> int:
    env_summary = load_json(RUNTIME_ROOT / "output" / "stage_01_env" / "summary.json")
    stage2 = summarize_stage(RUNTIME_ROOT / "output" / "stage_02_model_only" / "summary.json")
    stage3 = summarize_stage(RUNTIME_ROOT / "output" / "stage_03_script_assisted" / "summary.json")
    stage3b = load_json(RUNTIME_ROOT / "output" / "stage_03b_browser_smoke" / "summary.json")
    stage4 = summarize_stage(RUNTIME_ROOT / "output" / "stage_04_boundary_stress" / "summary.json")
    region_map_source = REPO_ROOT / "temp" / "mac" / "wechat_region_map_source.png"
    region_map_report = REPO_ROOT / ".runtime" / "temp" / "mac" / "wechat_region_map_latest.json"

    lines = [
        "# Final Report",
        "",
        "## Conclusion",
        "",
    ]

    if env_summary:
        controller = env_summary.get("controller", {})
        lines.extend(
            [
                f"- Controller machine: `{controller.get('hostname', '')}` / `{controller.get('machine', '')}` / `{controller.get('localIpv4', '')}`",
                f"- Real MLX path on current controller: `{env_summary.get('mlxReady', False)}`",
                f"- Configured service URL: `{env_summary.get('config', {}).get('serviceUrl', '')}`",
            ]
        )
    lines.extend(
        [
            "- Recommended integration layer: `fallback + hybrid assist`, not default model-first for every WeChat automation step.",
            "- Default profile recommendation: `8bit/daily` for normal GUI pointing and coarse regions.",
            "- Upgrade to `bf16/quality` for tiny targets, multi-instance grounding, text regions, and ambiguous prompts.",
            "",
            "## Stage Summaries",
            "",
        ]
    )

    for label, stage in [
        ("Stage 02", stage2),
        ("Stage 03", stage3),
        ("Stage 04", stage4),
    ]:
        if not stage:
            lines.append(f"- {label}: not executed")
            continue
        lines.append(
            f"- {label}: passed {stage['passed']}/{stage['total']} (failed {stage['failed']}), backend `{stage_backend_label(stage)}`"
        )

    if region_map_report.exists():
        lines.extend(
            [
                "",
                "## Live Workflow Status",
                "",
                "- `.runtime/temp/mac/wechat_region_map_latest.json` was generated and is available for Stage 03 preflight.",
                f"- Stage 03 backend provenance: `{stage_backend_label(stage3)}`.",
            ]
        )
    elif region_map_source.exists() and not region_map_report.exists():
        lines.extend(
            [
                "",
                "## Live Workflow Blocker",
                "",
                "- A real WeChat window screenshot was captured at `.runtime/temp/mac/wechat_region_map_source.png`.",
                "- `examples/mac/wechat_region_map.js` still failed to derive enough semantic layout regions, so `.runtime/temp/mac/wechat_region_map_latest.json` was never produced.",
                "- That missing region report is the immediate blocker for full Stage 03 WeChat workflow execution on this controller.",
            ]
        )

    lines.extend(
        [
            "",
            "## Evidence Provenance",
            "",
            f"- Stage 02 current summary source: `{stage_backend_label(stage2)}`.",
            f"- Stage 03 current summary source: `{stage_backend_label(stage3)}`.",
            (
                f"- Stage 03B browser smoke source: `{stage3b.get('health', {}).get('data', {}).get('backend', 'unknown')} @ {stage3b.get('serviceUrl', '')}`."
                if stage3b
                else "- Stage 03B browser smoke source: not executed."
            ),
            f"- Stage 04 current summary source: `{stage_backend_label(stage4)}`.",
            "",
            "## Recommended Calling Strategy",
            "",
            "- Remote `mac24` MLX bridge should be the default model path; send screenshots as inline image payloads from the controller.",
            "- Keep existing region/template/OCR path as the baseline controller workflow.",
            "- Use local mock only as an explicit fallback when the remote bridge is unavailable.",
            "- Use `L10` fallback when baseline boxes are missing, low-confidence, or click targets are untrusted.",
            "- Use `L50` hybrid for search-driven chat opening and input focusing.",
            "- Reserve `L70/L90` for stress tests, difficult prompts, or controlled high-recall runs.",
            "- Extend the same surface policy to common desktop apps such as Safari and Finder before treating WeChat-specific wins as general automation proof.",
            "",
            "## Generality Note",
            "",
            "- The current executed evidence is WeChat-centric plus static GUI images, with an added Safari smoke when WeChat live flow remains constrained.",
            "- The repo already contains Safari/browser automation probes; those are the next best generic-app smoke targets for LocateAnything-assisted automation.",
        ]
    )

    if stage3b:
        checks = stage3b.get("checks", {})
        lines.extend(
            [
                "",
                "## Browser Smoke",
                "",
                f"- Safari frontmost: `{checks.get('safariFrontmost', False)}`",
                f"- Title verified: `{checks.get('titleLooksRight', False)}`",
                f"- LocateAnything text grounding on Safari: `{checks.get('textGrounded', False)}`",
                f"- LocateAnything address-bar grounding on Safari: `{checks.get('addressBarGrounded', False)}`",
            ]
        )

    lines.extend(
        [
            "",
            "## Replay Commands",
            "",
            "```bash",
            "cd /Users/mac/Documents/workspace/clawdesk",
            "python3 tests/locateanything/scripts/run_stage_01_env.py",
            "./dist/clawdesk -script tests/locateanything/scripts/run_stage_02_model_only.js -timeout 5",
            "./dist/Clawdesk.app/Contents/MacOS/Clawdesk -script tests/locateanything/scripts/run_stage_03_script_assisted.js -timeout 8",
            "./dist/clawdesk -script tests/locateanything/scripts/run_stage_04_boundary_stress.js -timeout 5",
            "python3 tests/locateanything/scripts/run_stage_05_report.py",
            "```",
        ]
    )

    FINAL_REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(FINAL_REPORT_PATH)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
