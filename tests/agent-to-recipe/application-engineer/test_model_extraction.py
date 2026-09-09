from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[3]
REVIEW_PATH = (
    REPO_ROOT
    / "workflows"
    / "agent-to-recipe"
    / "skills"
    / "application-engineer"
    / "scripts"
    / "review.py"
)
SPEC = importlib.util.spec_from_file_location("application_engineer_review_extraction", REVIEW_PATH)
assert SPEC is not None and SPEC.loader is not None
review = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = review
SPEC.loader.exec_module(review)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class ActualModelExtractionIngestionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.image = self.root / "actual.png"
        Image.new("RGB", (100, 100), (30, 30, 32)).save(self.image)
        self.screenshot_ref = {
            "rootId": "fixture",
            "path": "actual.png",
            "sha256": sha256(self.image),
            "schemaVersion": "application-engineer/screenshot/png/v1",
        }
        self.profile = self._profile()
        self.profile_path = self.root / "app-profile.json"
        self._write(self.profile_path, self.profile)
        self.extraction = self._extraction()
        self.extraction_path = self.root / "model-extraction.raw.json"
        self._write(self.extraction_path, self.extraction)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _write(self, path: Path, value: object) -> None:
        path.write_text(
            json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )

    def _target(self, target_id: str, name: str, x: int, *, required: bool) -> dict:
        return {
            "id": target_id,
            "name": name,
            "type": "button",
            "parentRegionId": "region.keypad",
            "observationId": "observation.actual",
            "coordinateSpace": "observation-image",
            "textBounds": None,
            "controlBounds": {"x": x, "y": 50, "width": 25, "height": 25},
            "safeActionRegion": None,
            "unknowns": {
                "textBounds": "glyph-tight bounds were not extracted",
                "safeActionRegion": "pixels do not prove a safe action area",
            },
            "state": {
                "visible": True,
                "enabled": None,
                "unknownReasons": {"enabled": "pixels do not prove enabled state"},
            },
            "required": required,
        }

    def _profile(self) -> dict:
        button = self._target("target.button.4", "4", 0, required=True)
        display = {
            "id": "target.display",
            "name": "visible display text",
            "type": "static-text",
            "parentRegionId": "region.window",
            "observationId": "observation.actual",
            "coordinateSpace": "observation-image",
            "textBounds": {"x": 60, "y": 10, "width": 30, "height": 20},
            "controlBounds": None,
            "safeActionRegion": None,
            "unknowns": {
                "controlBounds": "no full control boundary was visible",
                "safeActionRegion": "display is not an action target",
            },
            "state": {
                "visible": True,
                "value": "36",
                "unknownReasons": {},
            },
            "required": True,
        }
        return {
            "schemaVersion": "agent-to-recipe/app-profile/v1.1",
            "revision": "r001",
            "taskId": "model-ingestion-test",
            "applicationIdentity": {"name": "Calculator", "bundleId": None},
            "environmentScope": {"platform": "macOS", "layout": "fixture"},
            "states": [],
            "regions": [
                {
                    "id": "region.window",
                    "name": "window",
                    "observationId": "observation.actual",
                    "coordinateSpace": "observation-image",
                    "parentRegionId": None,
                    "bounds": {"x": 0, "y": 0, "width": 100, "height": 100},
                },
                {
                    "id": "region.keypad",
                    "name": "keypad",
                    "observationId": "observation.actual",
                    "coordinateSpace": "observation-image",
                    "parentRegionId": "region.window",
                    "bounds": {"x": 0, "y": 50, "width": 100, "height": 50},
                },
            ],
            "targets": [display, button],
            "geometryRules": [],
            "operations": [],
            "verifiers": [],
            "preconditions": [],
            "limitations": ["fixture only"],
            "evidenceRefs": [dict(self.screenshot_ref, id="evidence.screenshot")],
            "maturity": {
                "modelExtraction": "pending",
                "normalization": "pending",
                "semanticReview": "pending",
                "humanReview": "not-run",
            },
            "observationRefs": [
                {
                    "id": "observation.actual",
                    "scope": {"application": "Calculator", "window": "fixture", "page": "keypad"},
                    "coordinateSpace": "observation-image",
                    "imageSize": {"width": 100, "height": 100},
                    "screenshotRef": copy.deepcopy(self.screenshot_ref),
                    "mapping": {
                        "kind": "identity",
                        "sourceCoordinateSpace": "observation-image",
                        "targetCoordinateSpace": "observation-image",
                    },
                }
            ],
            "relations": [],
            "claimSources": [],
            "changeLog": [],
        }

    def _extraction_target(self, target: dict, visibility: str, reason: str | None) -> dict:
        return dict(
            copy.deepcopy(target),
            reviewVisibility=visibility,
            hiddenReason=reason,
            claimBasis="directly visible glyph and rectangle in the supplied image",
        )

    def _extraction(self) -> dict:
        hidden = self._target("target.button.7", "7", 25, required=False)
        return {
            "schemaVersion": "application-engineer/model-extraction-raw/v2",
            "taskId": "model-ingestion-test",
            "attemptId": "application-extract-001",
            "extractedAt": "2026-09-08T20:00:00+08:00",
            "producer": {
                "host": "Codex desktop conversation",
                "method": "view_image original-detail visual inspection",
                "actualImageConsumed": True,
                "blindness": "fixture answer not provided to producer",
            },
            "instruction": {
                "version": "application-engineer/real-image-extraction/2026-09-08",
                "text": "Analyze the supplied real screenshot; preserve unknowns and do not operate the UI.",
            },
            "input": {
                "observationId": "observation.actual",
                "screenshotRef": copy.deepcopy(self.screenshot_ref),
                "imageSize": {"width": 100, "height": 100},
            },
            "rawOutput": {
                "scope": {
                    "kind": "task-related-controls",
                    "description": "Display the required target and its display dependency; list 7 as intentionally hidden.",
                },
                "targets": [
                    self._extraction_target(self.profile["targets"][0], "displayed", None),
                    self._extraction_target(self.profile["targets"][1], "displayed", None),
                    self._extraction_target(hidden, "hidden", "visible but outside the task scope"),
                ],
                "relations": [
                    {
                        "id": "relation.button.7.parent",
                        "kind": "child-of",
                        "from": "target.button.7",
                        "to": "region.keypad",
                        "basis": "the 7 rectangle lies inside the keypad region",
                    }
                ],
                "unknowns": ["enabled and safe action areas are not visible facts"],
            },
        }

    def _ingest(self, output_name: str = "app-profile.r002.json") -> tuple[dict, dict]:
        return review.ingest_model_extraction(
            self.profile_path,
            self.extraction_path,
            self.root / output_name,
            extraction_root_id="attempt",
            extraction_root=self.root,
            new_revision="r002",
            changed_at="2026-09-08T20:01:00+08:00",
            actor_id="unit-test-agent",
        )

    def test_actual_output_is_consumed_without_dropping_hidden_targets(self) -> None:
        baseline = self.profile_path.read_bytes()
        revised, report = self._ingest()
        self.assertEqual(baseline, self.profile_path.read_bytes())
        self.assertEqual(report["targetCount"], 3)
        self.assertEqual(report["addedTargetIds"], ["target.button.7"])
        self.assertEqual(revised["reviewScope"]["hiddenTargetIds"], ["target.button.7"])
        self.assertEqual(
            revised["reviewScope"]["displayedTargetIds"],
            ["target.button.4", "target.display"],
        )
        added = next(target for target in revised["targets"] if target["id"] == "target.button.7")
        self.assertEqual(added["controlBounds"]["width"], 25)
        self.assertIsNone(added["safeActionRegion"])
        self.assertEqual(revised["maturity"]["humanReview"], "not-run")
        self.assertEqual(
            revised["changeLog"][-1]["modifiedBy"]["approval"],
            "not-human-approval",
        )
        review.validate_profile(revised)

    def test_ingestion_is_deterministic_for_a_frozen_input(self) -> None:
        self._ingest("first.json")
        self._ingest("second.json")
        self.assertEqual(sha256(self.root / "first.json"), sha256(self.root / "second.json"))

    def test_non_image_or_mismatched_output_is_rejected(self) -> None:
        no_image = copy.deepcopy(self.extraction)
        no_image["producer"]["actualImageConsumed"] = False
        self._write(self.extraction_path, no_image)
        with self.assertRaisesRegex(review.ReviewError, "actual image bytes"):
            self._ingest()

        mismatch = copy.deepcopy(self.extraction)
        mismatch["input"]["screenshotRef"]["sha256"] = "0" * 64
        self._write(self.extraction_path, mismatch)
        with self.assertRaisesRegex(review.ReviewError, "screenshot ref"):
            self._ingest()

    def test_existing_semantic_conflict_requires_explicit_revision(self) -> None:
        conflict = copy.deepcopy(self.extraction)
        conflict["rawOutput"]["targets"][1]["name"] = "four"
        self._write(self.extraction_path, conflict)
        with self.assertRaisesRegex(review.ReviewError, "use an explicit revision: name"):
            self._ingest()


@unittest.skipUnless(
    os.environ.get("OPENDESK_REAL_MODEL_EXTRACTION")
    and os.environ.get("OPENDESK_REAL_MODEL_STANDARD"),
    "set OPENDESK_REAL_MODEL_EXTRACTION and OPENDESK_REAL_MODEL_STANDARD to compare preserved real evidence",
)
class PreservedRealExtractionComparisonTest(unittest.TestCase):
    def test_preserved_real_output_matches_the_separate_standard(self) -> None:
        extraction_path = Path(os.environ["OPENDESK_REAL_MODEL_EXTRACTION"])
        standard_path = Path(os.environ["OPENDESK_REAL_MODEL_STANDARD"])
        extraction = json.loads(extraction_path.read_text(encoding="utf-8"))
        standard = json.loads(standard_path.read_text(encoding="utf-8"))

        self.assertTrue(extraction["producer"]["actualImageConsumed"])
        self.assertEqual(
            extraction["input"]["screenshotRef"]["sha256"],
            standard["source"]["imageSha256"],
        )
        self.assertEqual(extraction["input"]["imageSize"], standard["imageSize"])

        actual_regions = {
            region["id"]: region["bounds"]
            for region in extraction["rawOutput"]["regions"]
        }
        self.assertEqual(actual_regions, standard["regions"])

        actual_targets = {
            target["id"]: target for target in extraction["rawOutput"]["targets"]
        }
        self.assertEqual(set(actual_targets), set(standard["targets"]))
        for target_id, expected in standard["targets"].items():
            actual = actual_targets[target_id]
            for field, expected_value in expected.items():
                self.assertEqual(
                    actual.get(field),
                    expected_value,
                    f"{target_id}.{field}",
                )

        actual_relations = {
            (relation["kind"], relation["from"], relation["to"])
            for relation in extraction["rawOutput"]["relations"]
        }
        expected_relations = {
            (relation["kind"], relation["from"], relation["to"])
            for relation in standard["requiredRelations"]
        }
        self.assertTrue(expected_relations.issubset(actual_relations))

        unknown_text = " ".join(extraction["rawOutput"]["unknowns"]).lower()
        for topic in standard["requiredUnknownTopics"]:
            self.assertIn(topic.lower(), unknown_text)


if __name__ == "__main__":
    unittest.main()
