from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

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
SPEC = importlib.util.spec_from_file_location("application_engineer_review", REVIEW_PATH)
assert SPEC is not None and SPEC.loader is not None
review = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = review
SPEC.loader.exec_module(review)


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class ReviewToolTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        evidence_dir = self.root / "evidence"
        evidence_dir.mkdir()
        self.screenshot = evidence_dir / "calculator.png"
        Image.new("RGB", (240, 320), (35, 35, 38)).save(self.screenshot)
        self.screenshot_ref = {
            "id": "evidence.screenshot",
            "rootId": "fixture",
            "path": "evidence/calculator.png",
            "sha256": file_sha256(self.screenshot),
            "schemaVersion": "application-engineer/screenshot/png/v1",
        }
        self.profile = self._valid_profile()
        self.profile_path = self.root / "app-profile.json"
        self._write_json(self.profile_path, self.profile)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _write_json(self, path: Path, value: object) -> None:
        path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")

    def _valid_profile(self) -> dict:
        image_space = "observation-image"
        return {
            "schemaVersion": "agent-to-recipe/app-profile/v1.1",
            "revision": "r001",
            "applicationIdentity": {"name": "Calculator", "bundleId": "com.apple.calculator"},
            "environmentScope": {"platform": "macOS", "layout": "basic"},
            "states": [{"id": "state.basic", "name": "Basic calculator visible"}],
            "regions": [
                {
                    "id": "region.window",
                    "name": "window",
                    "observationId": "observation.current",
                    "coordinateSpace": image_space,
                    "parentRegionId": None,
                    "bounds": {"x": 0, "y": 0, "width": 240, "height": 320},
                },
                {
                    "id": "region.keypad",
                    "name": "keypad",
                    "observationId": "observation.current",
                    "coordinateSpace": image_space,
                    "parentRegionId": "region.window",
                    "bounds": {"x": 0, "y": 80, "width": 240, "height": 240},
                },
            ],
            "targets": [
                {
                    "id": "target.display",
                    "name": "36",
                    "type": "static-text",
                    "criticality": "critical",
                    "required": True,
                    "parentRegionId": "region.window",
                    "observationId": "observation.current",
                    "coordinateSpace": image_space,
                    "textBounds": {"x": 160, "y": 30, "width": 50, "height": 35},
                    "controlBounds": None,
                    "safeActionRegion": None,
                    "unknowns": {
                        "controlBounds": "display is read-only and no control rectangle was observed",
                        "safeActionRegion": "display is not an action target",
                    },
                    "state": {
                        "visible": True,
                        "enabled": None,
                        "unknownReasons": {"enabled": "the screenshot cannot prove enabled state"},
                    },
                },
                {
                    "id": "target.button.4",
                    "name": "4",
                    "type": "button",
                    "criticality": "critical",
                    "required": True,
                    "parentRegionId": "region.keypad",
                    "observationId": "observation.current",
                    "coordinateSpace": image_space,
                    "textBounds": {"x": 18, "y": 182, "width": 18, "height": 22},
                    "controlBounds": {"x": 0, "y": 176, "width": 58, "height": 48},
                    "safeActionRegion": {"x": 6, "y": 182, "width": 46, "height": 36},
                    "state": {"visible": True, "unknownReasons": {}},
                },
            ],
            "geometryRules": [
                {
                    "id": "rule.button.4",
                    "kind": "parent-and-name",
                    "dependsOn": ["region.keypad", "target.button.4"],
                    "validationStatus": "validated",
                }
            ],
            "operations": [
                {
                    "id": "operation.press.4",
                    "name": "press button 4",
                    "dependsOn": ["rule.button.4"],
                    "inputs": [],
                    "outputs": [],
                    "preconditions": ["unique target"],
                    "postconditions": ["display changes"],
                    "failureModes": ["ambiguous target"],
                    "apiBasis": "current OpenDesk UI API",
                    "validationStatus": "validated",
                }
            ],
            "verifiers": [
                {
                    "id": "verifier.display",
                    "kind": "strict-display-read",
                    "dependsOn": ["operation.press.4", "target.display"],
                    "validationStatus": "validated",
                }
            ],
            "preconditions": ["single Calculator window"],
            "limitations": ["basic layout only"],
            "evidenceRefs": [copy.deepcopy(self.screenshot_ref)],
            "maturity": {"recognition": "review-pending", "operation": "not-run"},
            "observationRefs": [
                {
                    "id": "observation.current",
                    "capturedAt": "2026-09-08T17:30:08+08:00",
                    "scope": {"application": "Calculator", "window": "frontmost basic window", "page": "basic keypad"},
                    "coordinateSpace": image_space,
                    "imageSize": {"width": 240, "height": 320},
                    "screenshotRef": copy.deepcopy(self.screenshot_ref),
                    "mapping": {
                        "kind": "identity",
                        "sourceCoordinateSpace": image_space,
                        "targetCoordinateSpace": image_space,
                    },
                }
            ],
            "relations": [
                {
                    "id": "relation.button.4.parent",
                    "kind": "child-of",
                    "from": "target.button.4",
                    "to": "region.keypad",
                    "source": {"type": "model-interpretation", "observationId": "observation.current"},
                }
            ],
            "claimSources": [
                {
                    "id": "claim.button.4.name",
                    "objectId": "target.button.4",
                    "fieldPath": "name",
                    "sourceType": "model-interpretation",
                    "basis": "visible glyph inside the observed keypad",
                    "evidenceRefs": ["evidence.screenshot"],
                },
                {
                    "id": "claim.display.enabled.unknown",
                    "objectId": "target.display",
                    "fieldPath": "state.enabled",
                    "sourceType": "observation-boundary",
                    "basis": "not observable in pixels",
                    "evidenceRefs": ["evidence.screenshot"],
                },
            ],
            "changeLog": [],
        }

    def _patch(self, changes: list[dict], new_revision: str = "r002") -> Path:
        patch = {
            "schemaVersion": "agent-to-recipe/app-profile-revision/v1",
            "baseline": {
                "schemaVersion": self.profile["schemaVersion"],
                "revision": self.profile["revision"],
                "sha256": file_sha256(self.profile_path),
            },
            "newRevision": new_revision,
            "modifiedBy": {"kind": "simulation", "id": "unit-test"},
            "changedAt": "2026-09-08T18:00:00+08:00",
            "changes": changes,
        }
        path = self.root / f"revision-{new_revision}.json"
        self._write_json(path, patch)
        return path

    def test_valid_profile_and_direct_object_coordinate_space(self) -> None:
        summary = review.validate_profile(self.profile)
        self.assertEqual(summary["schemaVersion"], "agent-to-recipe/app-profile/v1.1")
        self.assertEqual(summary["targetIds"], ["target.button.4", "target.display"])
        self.assertIn("target 'target.display'.state.enabled", summary["unknownPaths"])

    def test_unknown_mapping_is_recorded_and_cannot_keep_stale_reason(self) -> None:
        unknown = copy.deepcopy(self.profile)
        observation = unknown["observationRefs"][0]
        observation["mapping"] = None
        observation["mappingUnknownReason"] = "window-to-image mapping was not observed"
        summary = review.validate_profile(unknown)
        self.assertIn("observationRefs[observation.current].mapping", summary["unknownPaths"])

        stale = copy.deepcopy(self.profile)
        stale["observationRefs"][0]["mappingUnknownReason"] = "stale unknown marker"
        with self.assertRaisesRegex(review.ReviewError, "known but still has an unknown reason"):
            review.validate_profile(stale)

    def test_invalid_rectangle_is_rejected(self) -> None:
        broken = copy.deepcopy(self.profile)
        broken["targets"][1]["controlBounds"]["width"] = -4
        with self.assertRaisesRegex(review.ReviewError, "width and height"):
            review.validate_profile(broken)

        outside = copy.deepcopy(self.profile)
        outside["targets"][1]["controlBounds"]["x"] = 230
        with self.assertRaisesRegex(review.ReviewError, "outside the observation image"):
            review.validate_profile(outside)

    def test_dangling_reference_is_rejected(self) -> None:
        broken = copy.deepcopy(self.profile)
        broken["relations"][0]["to"] = "region.missing"
        with self.assertRaisesRegex(review.ReviewError, "missing object"):
            review.validate_profile(broken)

    def test_unknown_is_preserved_and_cannot_be_silently_falseified(self) -> None:
        patch_path = self._patch(
            [
                {
                    "op": "replace",
                    "path": "/targets/@target.button.4/name",
                    "oldValue": "4",
                    "newValue": "four",
                    "reason": "exercise unrelated textual revision",
                }
            ]
        )
        revised_path = self.root / "app-profile-r002.json"
        revised, _ = review.revise_profile(self.profile_path, patch_path, revised_path)
        self.assertIsNone(revised["targets"][0]["state"]["enabled"])
        self.assertIn("enabled", revised["targets"][0]["state"]["unknownReasons"])

        falseified = copy.deepcopy(self.profile)
        falseified["targets"][0]["state"]["enabled"] = False
        with self.assertRaisesRegex(review.ReviewError, "known but still has an unknown reason"):
            review.validate_profile(falseified)

        contradictory_geometry = copy.deepcopy(self.profile)
        contradictory_geometry["targets"][0]["controlBounds"] = {
            "x": 150,
            "y": 25,
            "width": 70,
            "height": 45,
        }
        with self.assertRaisesRegex(review.ReviewError, "known but still has an unknown reason"):
            review.validate_profile(contradictory_geometry)

    def test_resolved_unknown_requires_and_retains_evidence(self) -> None:
        bounds = {"x": 150, "y": 25, "width": 70, "height": 45}
        changes = [
            {
                "op": "replace",
                "path": "/targets/@target.display/controlBounds",
                "oldValue": None,
                "newValue": bounds,
                "reason": "native structure exposed the display control rectangle",
            },
            {
                "op": "remove",
                "path": "/targets/@target.display/unknowns/controlBounds",
                "oldValue": "display is read-only and no control rectangle was observed",
                "reason": "the prior observation boundary was resolved",
            },
        ]
        patch_path = self._patch(changes)
        with self.assertRaisesRegex(review.ReviewError, "resolutionEvidenceRefs"):
            review.revise_profile(
                self.profile_path,
                patch_path,
                self.root / "missing-provenance.json",
            )

        patch = review.load_json(patch_path)
        patch["changes"][0]["resolutionEvidenceRefs"] = [
            copy.deepcopy(self.screenshot_ref)
        ]
        self._write_json(patch_path, patch)
        revised, _ = review.revise_profile(
            self.profile_path,
            patch_path,
            self.root / "app-profile-r002.json",
        )
        logged = revised["changeLog"][-1]["changes"][0]
        self.assertEqual(
            logged["resolutionEvidenceRefs"], [self.screenshot_ref]
        )

    def test_stale_revision_and_hash_are_rejected(self) -> None:
        patch_path = self._patch(
            [
                {
                    "op": "replace",
                    "path": "/targets/@target.button.4/name",
                    "oldValue": "4",
                    "newValue": "four",
                    "reason": "stale baseline test",
                }
            ]
        )
        patch = json.loads(patch_path.read_text(encoding="utf-8"))
        patch["baseline"]["revision"] = "r000"
        self._write_json(patch_path, patch)
        with self.assertRaisesRegex(review.ReviewError, "baseline revision"):
            review.revise_profile(self.profile_path, patch_path, self.root / "should-not-exist.json")

        patch["baseline"]["revision"] = "r001"
        patch["baseline"]["sha256"] = "0" * 64
        self._write_json(patch_path, patch)
        with self.assertRaisesRegex(review.ReviewError, "baseline SHA-256"):
            review.revise_profile(self.profile_path, patch_path, self.root / "should-not-exist.json")

    def test_four_views_have_identical_source_metadata(self) -> None:
        bundle_dir = self.root / "views"
        result = review.render_views(self.profile_path, bundle_dir, {"fixture": self.root})
        verified = review.verify_view_bundle(self.profile_path, bundle_dir)
        self.assertEqual(result["bundle"], verified)
        metadata = verified["source"]
        raw = review.load_json(bundle_dir / "raw-evidence.json")["source"]
        overlay = review._png_metadata(bundle_dir / "overlay.png")
        simplified = review._png_metadata(bundle_dir / "simplified.png")
        html_metadata = review._html_metadata(bundle_dir / "review.html")
        self.assertEqual(metadata, raw)
        self.assertEqual(metadata, overlay)
        self.assertEqual(metadata, simplified)
        self.assertEqual(metadata, html_metadata)
        self.assertEqual(metadata["targetIds"], ["target.button.4", "target.display"])
        self.assertEqual(
            metadata["targetVisualLabels"],
            {"T01": "target.button.4", "T02": "target.display"},
        )
        html_text = (bundle_dir / "review.html").read_text(encoding="utf-8")
        self.assertIn("unknown — the screenshot cannot prove enabled state", html_text)
        self.assertIn("Semantic confirmation and human review are not inferred", html_text)
        self.assertIn("Visual label", html_text)
        self.assertIn("T01", html_text)

    def test_both_png_renderers_use_short_target_visual_labels(self) -> None:
        observation = self.profile["observationRefs"][0]
        targets = self.profile["targets"]
        regions = self.profile["regions"]
        labels_by_id = {
            "target.button.4": "T01",
            "target.display": "T02",
        }

        class DrawRecorder:
            def __init__(self) -> None:
                self.texts: list[str] = []
                self.lines: list[tuple[tuple, dict]] = []

            def rectangle(self, *args, **kwargs) -> None:
                pass

            def rounded_rectangle(self, *args, **kwargs) -> None:
                pass

            def line(self, *args, **kwargs) -> None:
                self.lines.append((args, kwargs))

            def text(self, position, value, **kwargs) -> None:
                self.texts.append(value)

            def multiline_text(self, position, value, **kwargs) -> None:
                self.texts.append(value)

        overlay_draw = DrawRecorder()
        with mock.patch("PIL.ImageDraw.Draw", return_value=overlay_draw):
            review._render_overlay(
                Image.new("RGB", (240, 320)),
                targets,
                regions,
                observation,
                labels_by_id,
            )
        self.assertIn("T01", overlay_draw.texts)
        self.assertIn("T02", overlay_draw.texts)
        self.assertNotIn("target.button.4", overlay_draw.texts)

        simplified_draw = DrawRecorder()
        with mock.patch("PIL.ImageDraw.Draw", return_value=simplified_draw):
            review._render_simplified(
                (240, 320),
                targets,
                regions,
                observation,
                labels_by_id,
            )
        self.assertIn("T01\n4", simplified_draw.texts)
        self.assertIn("T02\n36", simplified_draw.texts)
        self.assertNotIn("target.button.4\n4", simplified_draw.texts)
        self.assertEqual(
            simplified_draw.lines,
            [],
            "parent/relation lines must stay hidden in the default simplified view",
        )

    def test_review_scope_drives_displayed_and_hidden_targets(self) -> None:
        scoped = copy.deepcopy(self.profile)
        scoped["reviewScope"] = {
            "kind": "task-related-controls",
            "description": "Only the task button is annotated; the display remains listed as intentionally hidden.",
            "displayedTargetIds": ["target.button.4"],
            "hiddenTargetIds": ["target.display"],
            "hiddenReasons": {
                "target.display": "not part of this fixture's annotation focus"
            },
        }
        scoped_path = self.root / "scoped-profile.json"
        self._write_json(scoped_path, scoped)

        bundle_dir = self.root / "scoped-views"
        result = review.render_views(
            scoped_path,
            bundle_dir,
            {"fixture": self.root},
        )
        source = result["bundle"]["source"]
        self.assertEqual(source["targetIds"], ["target.button.4"])
        self.assertEqual(
            source["allTargetIds"], ["target.button.4", "target.display"]
        )
        self.assertEqual(source["hiddenTargetIds"], ["target.display"])
        self.assertEqual(source["relationDisplay"], "hidden-by-default")

        raw = review.load_json(bundle_dir / "raw-evidence.json")
        copied = bundle_dir / raw["evidence"][0]["copiedPath"]
        self.assertTrue(copied.is_file(), "render must preserve a local raw-image view")
        html_text = (bundle_dir / "review.html").read_text(encoding="utf-8")
        self.assertIn('data-view="original-evidence"', html_text)
        self.assertIn('data-view="overlay"', html_text)
        self.assertIn('data-view="simplified"', html_text)
        self.assertIn("task-related-controls", html_text)
        self.assertIn("target.display", html_text)
        self.assertIn("not part of this fixture&#x27;s annotation focus", html_text)

    def test_review_scope_rejects_missing_or_overlapping_target_ids(self) -> None:
        missing = copy.deepcopy(self.profile)
        missing["reviewScope"] = {
            "kind": "task-related-controls",
            "description": "invalid missing ID",
            "displayedTargetIds": ["target.missing"],
            "hiddenTargetIds": ["target.display"],
            "hiddenReasons": {"target.display": "fixture-only"},
        }
        with self.assertRaisesRegex(review.ReviewError, "unknown target"):
            review.validate_profile(missing)

        overlap = copy.deepcopy(self.profile)
        overlap["reviewScope"] = {
            "kind": "task-related-controls",
            "description": "invalid overlap",
            "displayedTargetIds": ["target.button.4", "target.display"],
            "hiddenTargetIds": ["target.display"],
            "hiddenReasons": {"target.display": "fixture-only"},
        }
        with self.assertRaisesRegex(review.ReviewError, "must not overlap"):
            review.validate_profile(overlap)

    def test_evidence_copy_and_html_treat_observation_id_as_data(self) -> None:
        old_id = "observation.current"
        hostile_id = "../../outside</script><img src=x onerror=1>"
        hostile = copy.deepcopy(self.profile)
        hostile["observationRefs"][0]["id"] = hostile_id
        for region in hostile["regions"]:
            region["observationId"] = hostile_id
        for target in hostile["targets"]:
            target["observationId"] = hostile_id
        for relation in hostile["relations"]:
            source = relation.get("source")
            if isinstance(source, dict) and source.get("observationId") == old_id:
                source["observationId"] = hostile_id
        hostile_path = self.root / "hostile-profile.json"
        self._write_json(hostile_path, hostile)

        bundle_dir = self.root / "hostile-views"
        result = review.render_views(
            hostile_path,
            bundle_dir,
            {"fixture": self.root},
            copy_evidence=True,
        )
        raw = review.load_json(bundle_dir / "raw-evidence.json")
        copied = (bundle_dir / raw["evidence"][0]["copiedPath"]).resolve()
        copied.relative_to(bundle_dir.resolve())
        self.assertTrue(copied.is_file())
        html_text = (bundle_dir / "review.html").read_text(encoding="utf-8")
        self.assertNotIn(hostile_id, html_text)
        self.assertEqual(result["bundle"], review.verify_view_bundle(hostile_path, bundle_dir))

    def test_critical_target_downgrade_requires_authorization(self) -> None:
        patch_path = self._patch(
            [
                {
                    "op": "replace",
                    "path": "/targets/@target.button.4/required",
                    "oldValue": True,
                    "newValue": False,
                    "reason": "simulated improper scope reduction",
                }
            ]
        )
        with self.assertRaisesRegex(review.ReviewError, "critical targets cannot be downgraded"):
            review.revise_profile(
                self.profile_path,
                patch_path,
                self.root / "downgraded.json",
                critical_target_ids=["target.button.4"],
            )

    def test_revision_marks_transitive_rule_operation_and_verifier_impact(self) -> None:
        patch_path = self._patch(
            [
                {
                    "op": "replace",
                    "path": "/targets/@target.button.4/name",
                    "oldValue": "4",
                    "newValue": "four",
                    "reason": "simulated reviewed correction",
                }
            ]
        )
        revised, impact = review.revise_profile(
            self.profile_path, patch_path, self.root / "app-profile-r002.json"
        )
        self.assertEqual(impact["affected"]["geometryRules"], ["rule.button.4"])
        self.assertEqual(impact["affected"]["operations"], ["operation.press.4"])
        self.assertEqual(impact["affected"]["verifiers"], ["verifier.display"])
        for section in ("geometryRules", "operations", "verifiers"):
            self.assertTrue(
                all(item["validationStatus"] == "needs-revalidation" for item in revised[section])
            )

    def test_fault_injection_is_isolated_and_validation_detects_it(self) -> None:
        before = self.profile_path.read_bytes()
        faulty_path = self.root / "faulty.json"
        review.inject_error(self.profile_path, "unknown-to-false", faulty_path)
        self.assertEqual(before, self.profile_path.read_bytes())
        faulty = review.load_json(faulty_path)
        self.assertEqual(faulty["testFaultInjection"]["sourceSha256"], file_sha256(self.profile_path))
        with self.assertRaisesRegex(review.ReviewError, "known but still has an unknown reason"):
            review.validate_profile(faulty)
        with self.assertRaisesRegex(review.ReviewError, "must not overwrite"):
            review.inject_error(self.profile_path, "invalid-rectangle", self.profile_path)

    def test_incomplete_or_tampered_bundle_is_rejected(self) -> None:
        bundle_dir = self.root / "views"
        review.render_views(self.profile_path, bundle_dir, {"fixture": self.root})
        (bundle_dir / "overlay.png").write_bytes(b"tampered")
        with self.assertRaisesRegex(review.ReviewError, "view hash mismatch"):
            review.verify_view_bundle(self.profile_path, bundle_dir)

    def test_bundle_source_targets_and_duplicate_entries_are_rejected(self) -> None:
        bundle_dir = self.root / "views"
        review.render_views(self.profile_path, bundle_dir, {"fixture": self.root})
        manifest_path = bundle_dir / "view-manifest.json"
        manifest = review.load_json(manifest_path)
        original = copy.deepcopy(manifest)
        manifest["source"]["targetIds"] = []
        self._write_json(manifest_path, manifest)
        with self.assertRaisesRegex(review.ReviewError, "source metadata"):
            review.verify_view_bundle(self.profile_path, bundle_dir)

        original["views"].append(copy.deepcopy(original["views"][0]))
        self._write_json(manifest_path, original)
        with self.assertRaisesRegex(review.ReviewError, "exactly once"):
            review.verify_view_bundle(self.profile_path, bundle_dir)

    def test_revision_output_cannot_destroy_patch_input(self) -> None:
        patch_path = self._patch(
            [
                {
                    "op": "replace",
                    "path": "/targets/@target.button.4/name",
                    "oldValue": "4",
                    "newValue": "four",
                    "reason": "output collision safety test",
                }
            ]
        )
        before = patch_path.read_bytes()
        with self.assertRaisesRegex(review.ReviewError, "must not overwrite its revision patch"):
            review.revise_profile(self.profile_path, patch_path, patch_path)
        self.assertEqual(before, patch_path.read_bytes())

    def test_affine_crop_scale_preserves_a_wide_zero_button(self) -> None:
        transformed = copy.deepcopy(self.profile)
        observation = transformed["observationRefs"][0]
        observation["mapping"] = {
            "kind": "affine",
            "sourceCoordinateSpace": "uncropped-source-image",
            "targetCoordinateSpace": "observation-image",
            "scale": {"x": 0.5, "y": 0.5},
            "offset": {"x": -10, "y": -20},
        }
        zero = transformed["targets"][1]
        zero["name"] = "0"
        zero["controlBounds"] = {
            "x": 20,
            "y": 400,
            "width": 200,
            "height": 80,
            "coordinateSpace": "uncropped-source-image",
        }
        zero["textBounds"] = {
            "x": 100,
            "y": 420,
            "width": 40,
            "height": 40,
            "coordinateSpace": "uncropped-source-image",
        }
        zero["safeActionRegion"] = {
            "x": 40,
            "y": 410,
            "width": 160,
            "height": 60,
            "coordinateSpace": "uncropped-source-image",
        }
        review.validate_profile(transformed)
        drawn = review._rect_for_draw(zero, observation, "controlBounds")
        self.assertEqual(
            drawn,
            {"x": 0.0, "y": 180.0, "width": 100.0, "height": 40.0},
        )
        ordinary_width = self.profile["targets"][1]["controlBounds"]["width"]
        self.assertGreater(drawn["width"], ordinary_width)

    def test_unicode_symbols_are_preserved_in_the_review(self) -> None:
        symbolic = copy.deepcopy(self.profile)
        symbolic["targets"][1]["name"] = "× ÷ − +/−"
        symbolic_path = self.root / "symbolic-profile.json"
        self._write_json(symbolic_path, symbolic)
        bundle = self.root / "symbolic-views"
        review.render_views(symbolic_path, bundle, {"fixture": self.root})
        html_text = (bundle / "review.html").read_text(encoding="utf-8")
        self.assertIn("× ÷ − +/−", html_text)
        font = review._review_font(10)
        self.assertIsNotNone(font.getbbox("× ÷ − +/−"))

    def test_frozen_render_is_byte_deterministic(self) -> None:
        first = self.root / "first-views"
        second = self.root / "second-views"
        review.render_views(self.profile_path, first, {"fixture": self.root})
        review.render_views(self.profile_path, second, {"fixture": self.root})
        names = [
            "raw-evidence.json",
            "overlay.png",
            "simplified.png",
            "review.html",
            "view-manifest.json",
        ]
        self.assertEqual(
            {name: file_sha256(first / name) for name in names},
            {name: file_sha256(second / name) for name in names},
        )

    def test_revision_updates_data_and_all_related_views_without_overwriting_old(self) -> None:
        before = self.profile_path.read_bytes()
        patch_path = self._patch(
            [
                {
                    "op": "replace",
                    "path": "/targets/@target.button.4/name",
                    "oldValue": "4",
                    "newValue": "four",
                    "reason": "controlled review-flow correction",
                }
            ]
        )
        revised_path = self.root / "app-profile.r002.json"
        review.revise_profile(self.profile_path, patch_path, revised_path)
        self.assertEqual(before, self.profile_path.read_bytes())

        old_views = self.root / "old-views"
        new_views = self.root / "new-views"
        review.render_views(self.profile_path, old_views, {"fixture": self.root})
        review.render_views(
            revised_path,
            new_views,
            {"fixture": self.root},
            previous_profile_path=self.profile_path,
        )
        old_html = (old_views / "review.html").read_text(encoding="utf-8")
        new_html = (new_views / "review.html").read_text(encoding="utf-8")
        self.assertNotIn("<pre>four</pre>", old_html)
        self.assertIn("<pre>four</pre>", new_html)
        self.assertIn("/targets/1/name", new_html)
        for name in ("raw-evidence.json", "overlay.png", "simplified.png", "review.html"):
            self.assertNotEqual(file_sha256(old_views / name), file_sha256(new_views / name))


if __name__ == "__main__":
    unittest.main()
