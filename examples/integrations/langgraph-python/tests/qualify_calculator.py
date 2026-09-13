#!/usr/bin/env python3
"""Live qualification gate for the frozen Calculator bridge Recipes."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from opendesk_bridge import OpenDeskBridge, OpenDeskBridgeError


REPO_ROOT = Path(__file__).resolve().parents[4]
INTEGRATION_ROOT = Path(__file__).resolve().parents[1]
BASE_RECIPE = INTEGRATION_ROOT / "recipes" / "calculator-base.js"
ADD_RECIPE = INTEGRATION_ROOT / "recipes" / "calculator-add.js"
OBSERVER = Path(__file__).resolve().with_name("observe-calculator.js")
PERTURBER = Path(__file__).resolve().with_name("perturb-calculator.js")
CONFIRM_VALUE = "authorized-calculator-qualification"
BASE_INPUT = {"expression": "25 × 4", "expectedResult": 100}
BASE_RESPONSE = {
    "expression": "25 × 4",
    "baseResult": 100,
    "baseDisplay": "100",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolved_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else REPO_ROOT / path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--opendesk", default="./dist/opendesk")
    parser.add_argument("--timeout", type=float, default=60.0)
    parser.add_argument(
        "--phase",
        choices=("increments", "state-drift"),
        required=True,
        help="Run one bounded serial desktop qualification phase",
    )
    parser.add_argument(
        "--increment",
        type=int,
        choices=range(5, 16),
        help="Qualify one increment in an isolated sub-30-second desktop phase",
    )
    return parser.parse_args()


def main() -> int:
    if os.environ.get("OPENDESK_LANGGRAPH_LIVE_CALCULATOR") != CONFIRM_VALUE:
        raise SystemExit(
            "set OPENDESK_LANGGRAPH_LIVE_CALCULATOR=" + CONFIRM_VALUE
            + " to authorize real Calculator qualification"
        )

    args = parse_args()
    if args.phase != "increments" and args.increment is not None:
        raise SystemExit("--increment is only valid with --phase increments")
    started_at = datetime.now(timezone.utc)
    run_id = started_at.strftime("qualification-%Y%m%dT%H%M%SZ-") + args.phase
    if args.increment is not None:
        run_id += "-" + str(args.increment)
    evidence_dir = REPO_ROOT / ".runtime" / "tests" / "langgraph-python" / run_id
    evidence_dir.mkdir(parents=True, exist_ok=False)
    record_path = evidence_dir / "qualification.json"

    bridge = OpenDeskBridge(
        opendesk=args.opendesk,
        workdir=REPO_ROOT,
        timeout_seconds=args.timeout,
    )
    candidate_hashes = {
        str(BASE_RECIPE.relative_to(REPO_ROOT)): sha256(BASE_RECIPE),
        str(ADD_RECIPE.relative_to(REPO_ROOT)): sha256(ADD_RECIPE),
    }
    opendesk_path = bridge.opendesk
    observed_results: list[dict[str, Any]] = []
    execution_refs: list[dict[str, Any]] = []
    failures: list[str] = []

    def remember(kind: str, run: Any) -> None:
        result = run.cli_envelope.get("result")
        artifacts = result.get("artifacts") if isinstance(result, dict) else None
        execution_refs.append(
            {
                "kind": kind,
                "requestId": run.request_id,
                "executionId": run.execution_id,
                "resultPath": str(run.result_path.relative_to(REPO_ROOT)),
                "artifacts": artifacts,
            }
        )

    def remember_failed(kind: str, error: OpenDeskBridgeError) -> None:
        try:
            envelope = json.loads(error.stdout)
        except (TypeError, json.JSONDecodeError):
            return
        result = envelope.get("result") if isinstance(envelope, dict) else None
        if not isinstance(result, dict):
            return
        execution_refs.append(
            {
                "kind": kind,
                "requestId": None,
                "executionId": result.get("executionId"),
                "resultPath": None,
                "artifacts": result.get("artifacts"),
            }
        )

    def observe(label: str) -> dict[str, Any]:
        run = bridge.run_recipe(OBSERVER, {"label": label})
        remember("observer", run)
        display = run.data.get("display")
        screenshot = run.data.get("screenshot")
        require(isinstance(display, str), "observer display must be a string")
        require(isinstance(screenshot, dict), "observer screenshot must be an object")
        require(screenshot.get("width") == 232 and screenshot.get("height") == 321,
                "observer screenshot must be the 232x321 Calculator window")
        source = resolved_path(str(screenshot.get("path", ""))).resolve()
        require(source.is_file(), "observer screenshot artifact is missing")
        destination = evidence_dir / (label + ".png")
        shutil.copy2(source, destination)
        return {
            "display": display,
            "screenshot": str(destination.relative_to(REPO_ROOT)),
            "sourceScreenshot": str(source.relative_to(REPO_ROOT)),
        }

    try:
        if args.phase == "increments":
            base_run = bridge.run_recipe(BASE_RECIPE, BASE_INPUT)
            remember("calculator-base", base_run)
            require(base_run.data == BASE_RESPONSE,
                    "calculator-base did not return the actual UI value 100")
            if args.increment is None:
                before = observe("increments-base")
                require(before["display"] == "100", "independent base observer did not read 100")
            else:
                before = {
                    "display": base_run.data["baseDisplay"],
                    "executionId": base_run.execution_id,
                    "businessResultPath": str(base_run.result_path.relative_to(REPO_ROOT)),
                }
            current_result = 100
            increments = [args.increment] if args.increment is not None else range(5, 16)
            for increment in increments:
                prior_result = current_result
                expected = prior_result + increment
                add_run = bridge.run_recipe(
                    ADD_RECIPE,
                    {"baseResult": prior_result, "increment": increment},
                )
                remember("calculator-add", add_run)
                require(add_run.data.get("baseResult") == prior_result,
                        "calculator-add baseResult mismatch")
                require(add_run.data.get("increment") == increment,
                        "calculator-add increment mismatch")
                require(add_run.data.get("finalResult") == expected,
                        "calculator-add finalResult mismatch")
                require(add_run.data.get("finalDisplay") == str(expected),
                        "calculator-add finalDisplay mismatch")
                observed_results.append(
                    {
                        "scenario": "increment-" + str(increment),
                        "status": "pass",
                        "baseResult": prior_result,
                        "increment": increment,
                        "finalResult": expected,
                        "finalExecutionId": add_run.execution_id,
                        "businessResultPath": str(add_run.result_path.relative_to(REPO_ROOT)),
                    }
                )
                current_result = expected
                print(
                    "PASS increment=" + str(increment)
                    + " base=" + str(prior_result) + " final=" + str(expected),
                    flush=True,
                )
            after = observe("increments-final")
            require(after["display"] == str(current_result),
                    "independent final observer did not read the chained Calculator result")
            observed_results.append(
                {
                    "scenario": "increment-range-independent-observation",
                    "status": "pass",
                    "baseEvidence": before,
                    "finalEvidence": after,
                    "expectedFinalResult": current_result,
                }
            )

        if args.phase == "state-drift":
            add_run = bridge.run_recipe(
                BASE_RECIPE,
                BASE_INPUT,
            )
            remember("calculator-base", add_run)
            require(add_run.data == BASE_RESPONSE,
                    "state-drift setup did not establish 100")
            perturbed = bridge.run_recipe(PERTURBER, {"button": "9"})
            remember("external-perturbation", perturbed)
            require(perturbed.data.get("display") == "9",
                    "external perturbation did not change Calculator display to 9")

            try:
                bridge.run_recipe(ADD_RECIPE, {"baseResult": 100, "increment": 5})
            except OpenDeskBridgeError as exc:
                remember_failed("calculator-add-rejected", exc)
                require(
                    "Calculator state changed before continuation" in str(exc),
                    "calculator-add failed for an unexpected reason after state drift",
                )
                drift_error = {"code": exc.code, "message": str(exc)}
            else:
                raise RuntimeError("calculator-add did not stop after external state drift")

            drift_observation = observe("state-drift-after-rejection")
            require(drift_observation["display"] == "9",
                    "calculator-add changed the display after rejecting state drift")
            observed_results.append(
                {
                    "scenario": "external-state-drift",
                    "status": "pass",
                    "expectedBaseResult": 100,
                    "externallyChangedDisplay": "9",
                    "displayAfterRejection": drift_observation["display"],
                    "error": drift_error,
                    "evidence": drift_observation,
                }
            )
            print("PASS external-state-drift display-remained=9", flush=True)

        for relative, original_hash in candidate_hashes.items():
            require(sha256(REPO_ROOT / relative) == original_hash,
                    "production candidate changed during qualification: " + relative)
    except Exception as exc:
        failures.append(str(exc))

    finished_at = datetime.now(timezone.utc)
    increment_scope = (
        "calculator-add increment " + str(args.increment)
        if args.increment is not None
        else "calculator-add increments 5 through 15"
    )
    record = {
        "schemaVersion": "agent-to-recipe/qualification/v1",
        "candidateRef": {
            "paths": candidate_hashes,
            "frozenDuringRun": not failures,
        },
        "contractRef": str(
            (REPO_ROOT / "docs/architecture/external-workflow-runtime-integration.md")
            .relative_to(REPO_ROOT)
        ),
        "scenarios": [result["scenario"] for result in observed_results],
        "actualCommands": [
            "OPENDESK_LANGGRAPH_LIVE_CALCULATOR=" + CONFIRM_VALUE
            + " examples/integrations/langgraph-python/.venv/bin/python "
            + "examples/integrations/langgraph-python/tests/qualify_calculator.py "
            + "--opendesk ./dist/opendesk --phase " + args.phase
            + (" --increment " + str(args.increment) if args.increment is not None else "")
        ],
        "workingDirectories": [str(REPO_ROOT)],
        "executionRefs": execution_refs,
        "buildProvenance": {
            "opendesk": str(opendesk_path),
            "sha256": sha256(opendesk_path),
            "modifiedAt": datetime.fromtimestamp(
                opendesk_path.stat().st_mtime, timezone.utc
            ).isoformat(),
            "gitHead": subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, text=True
            ).strip(),
        },
        "environmentScope": {
            "platform": "macOS",
            "calculatorExecutable": "/System/Applications/Calculator.app/Contents/MacOS/Calculator",
            "calculatorTitle": "Calculator",
            "calculatorLayout": {"width": 232, "height": 321},
            "incrementRange": {
                "minimum": args.increment if args.increment is not None else 5,
                "maximum": args.increment if args.increment is not None else 15,
            },
        },
        "observedResults": observed_results,
        "evidenceRefs": [
            str(path.relative_to(REPO_ROOT))
            for path in sorted(evidence_dir.glob("*.png"))
        ],
        "failedCriteria": failures,
        "skipped": [],
        "verdict": "pass" if not failures else "fail",
        "qualificationScope": {
            "lineage": "continuation-chain",
            "requested": ([
                "calculator-base actual UI result 100",
                increment_scope,
                "pre-mutation state recheck",
                "independent UI observation",
                "Calculator window visual evidence",
            ] if args.phase == "increments" else [
                "calculator-base actual UI result 100",
                "external state drift rejection",
                "independent UI observation",
                "Calculator window visual evidence",
            ]),
            "exercised": ([
                "calculator-base actual UI result 100",
                increment_scope,
                "pre-mutation state recheck",
                "independent UI observation",
                "Calculator window visual evidence",
            ] if args.phase == "increments" else [
                "calculator-base actual UI result 100",
                "external state drift rejection",
                "independent UI observation",
                "Calculator window visual evidence",
            ]),
            "qualified": [] if failures else ([
                "calculator-base actual UI result 100",
                increment_scope,
                "pre-mutation state recheck",
                "independent UI observation",
                "Calculator window visual evidence",
            ] if args.phase == "increments" else [
                "calculator-base actual UI result 100",
                "external state drift rejection",
                "independent UI observation",
                "Calculator window visual evidence",
            ]),
            "excluded": [],
        },
        "startedAt": started_at.isoformat(),
        "finishedAt": finished_at.isoformat(),
    }
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    print("qualification=" + str(record_path.relative_to(REPO_ROOT)), flush=True)
    if failures:
        for failure in failures:
            print("FAIL " + failure, flush=True)
        return 1
    print("PASS Calculator qualification", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
