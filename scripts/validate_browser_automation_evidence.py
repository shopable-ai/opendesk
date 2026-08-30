#!/usr/bin/env python3
"""Validate browser capability evidence references without judging semantics."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

KNOWN_PROOF_LEVELS = {"E0", "E1", "E2", "E3", "E4", "E5"}
KNOWN_EVIDENCE_KINDS = {"contains", "go_test_name"}
GO_TEST_RE = re.compile(r"^Test[A-Za-z0-9_]+$")


def _inside_root(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _load_json(path: Path, errors: list[str]) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append(f"manifest does not exist: {path}")
    except json.JSONDecodeError as exc:
        errors.append(f"manifest is not valid JSON: {exc}")
    except OSError as exc:
        errors.append(f"cannot read manifest {path}: {exc}")
    return None


def validate(root: Path, manifest_path: Path) -> tuple[list[str], int, int]:
    errors: list[str] = []
    claim_count = 0
    evidence_count = 0
    data = _load_json(manifest_path, errors)
    if data is None:
        return errors, claim_count, evidence_count
    if not isinstance(data, dict):
        return ["manifest root must be a JSON object"], claim_count, evidence_count

    if not isinstance(data.get("version"), int):
        errors.append("manifest.version must be an integer")
    if not isinstance(data.get("purpose"), str) or not data.get("purpose", "").strip():
        errors.append("manifest.purpose must be a non-empty string")

    levels = data.get("evidenceLevels")
    if not isinstance(levels, dict) or not levels:
        errors.append("manifest.evidenceLevels must be a non-empty object")
    else:
        unknown_declared = sorted(set(levels) - KNOWN_PROOF_LEVELS)
        if unknown_declared:
            errors.append(f"unknown declared proof level(s): {', '.join(unknown_declared)}")

    claims = data.get("claims")
    if not isinstance(claims, list):
        errors.append("manifest.claims must be an array")
        return errors, claim_count, evidence_count
    if not claims:
        errors.append("manifest.claims must not be empty")

    seen_ids: set[str] = set()
    text_cache: dict[Path, str] = {}

    for index, claim in enumerate(claims):
        label = f"claims[{index}]"
        if not isinstance(claim, dict):
            errors.append(f"{label} must be an object")
            continue
        claim_count += 1

        claim_id = claim.get("id")
        if not isinstance(claim_id, str) or not claim_id.strip():
            errors.append(f"{label}.id must be a non-empty string")
            claim_id = f"<index:{index}>"
        elif claim_id in seen_ids:
            errors.append(f"duplicate claim id: {claim_id}")
        else:
            seen_ids.add(claim_id)

        if not isinstance(claim.get("claim"), str) or not claim.get("claim", "").strip():
            errors.append(f"claim {claim_id}: claim text must be non-empty")

        proof_levels = claim.get("proofLevels")
        if not isinstance(proof_levels, list) or not proof_levels:
            errors.append(f"claim {claim_id}: proofLevels must be a non-empty array")
        else:
            for level in proof_levels:
                if level not in KNOWN_PROOF_LEVELS:
                    errors.append(f"claim {claim_id}: unknown proof level {level!r}")

        evidence = claim.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            errors.append(f"claim {claim_id}: evidence must be a non-empty array")
            continue

        for evidence_index, item in enumerate(evidence):
            evidence_count += 1
            item_label = f"claim {claim_id} evidence[{evidence_index}]"
            if not isinstance(item, dict):
                errors.append(f"{item_label}: must be an object")
                continue

            kind = item.get("kind")
            if kind not in KNOWN_EVIDENCE_KINDS:
                errors.append(f"{item_label}: unknown evidence kind {kind!r}")
                continue

            raw_path = item.get("path")
            if not isinstance(raw_path, str) or not raw_path.strip():
                errors.append(f"{item_label}: path must be a non-empty string")
                continue
            target = (root / raw_path).resolve()
            if not _inside_root(target, root):
                errors.append(f"{item_label}: path escapes repository root: {raw_path}")
                continue
            if not target.is_file():
                errors.append(f"{item_label}: evidence path does not exist: {raw_path}")
                continue

            if target not in text_cache:
                try:
                    text_cache[target] = target.read_text(encoding="utf-8")
                except (OSError, UnicodeDecodeError) as exc:
                    errors.append(f"{item_label}: cannot read {raw_path}: {exc}")
                    continue
            text = text_cache[target]

            if kind == "contains":
                needle = item.get("contains")
                if not isinstance(needle, str) or not needle:
                    errors.append(f"{item_label}: contains must be a non-empty string")
                elif needle not in text:
                    errors.append(f"{item_label}: contains string not found in {raw_path}: {needle!r}")
            elif kind == "go_test_name":
                test_name = item.get("go_test_name")
                if not isinstance(test_name, str) or not GO_TEST_RE.fullmatch(test_name):
                    errors.append(f"{item_label}: invalid go_test_name {test_name!r}")
                else:
                    pattern = re.compile(r"(?m)^\s*func\s+" + re.escape(test_name) + r"\s*\(")
                    if not pattern.search(text):
                        errors.append(f"{item_label}: Go test {test_name} not found in {raw_path}")

    return errors, claim_count, evidence_count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest",
        default="docs/quality/browser-automation/capability-evidence-manifest.json",
        help="manifest path relative to repository root",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    manifest_path = (root / args.manifest).resolve()
    if not _inside_root(manifest_path, root):
        print(f"ERROR: manifest path escapes repository root: {args.manifest}", file=sys.stderr)
        return 1

    errors, claim_count, evidence_count = validate(root, manifest_path)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(
            f"FAILED: {claim_count} claim(s), {evidence_count} evidence reference(s), {len(errors)} error(s)",
            file=sys.stderr,
        )
        return 1

    print(f"OK: {claim_count} claims, {evidence_count} evidence references validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
