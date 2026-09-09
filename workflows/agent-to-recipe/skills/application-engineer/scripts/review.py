#!/usr/bin/env python3
"""Validate, review, and revise AppProfile v1.1 artifacts.

This is a deterministic host-side helper. It can strictly ingest a separately
preserved, actual image-consuming Agent/model extraction, but it does not call a
model, grant human approval, produce desktop input, or execute OpenDesk Runtime.

The renderer consumes an immutable AppProfile and a root map (``--root ID=DIR``).
Each observation embeds a ``screenshotRef`` using the shared root-relative ref
shape.  Geometry uses ``x/y/width/height/coordinateSpace`` and may name its
``observationId``.  Unknown target bounds are represented by ``null`` plus an
entry in the target's ``unknowns`` object.  Unknown state values use ``null``
plus ``state.unknownReasons``.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import html
import json
import math
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Mapping, Sequence


PROFILE_VERSION_RE = re.compile(r"^agent-to-recipe/app-profile/v1\.(\d+)$")
MODEL_EXTRACTION_VERSION = "application-engineer/model-extraction-raw/v2"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
REQUIRED_PROFILE_FIELDS = (
    "schemaVersion",
    "revision",
    "applicationIdentity",
    "environmentScope",
    "states",
    "regions",
    "targets",
    "geometryRules",
    "operations",
    "verifiers",
    "preconditions",
    "limitations",
    "evidenceRefs",
    "maturity",
    "observationRefs",
    "relations",
    "claimSources",
    "changeLog",
)
OBJECT_SECTIONS = (
    "observationRefs",
    "states",
    "regions",
    "targets",
    "geometryRules",
    "operations",
    "verifiers",
    "relations",
    "claimSources",
)
DEPENDENT_SECTIONS = ("geometryRules", "operations", "verifiers")
GEOMETRY_FIELDS = ("textBounds", "controlBounds", "safeActionRegion", "bounds")
IMAGE_SPACES = {"observation-image", "image-pixel", "screenshot-pixel"}
DOWNGRADED_VALUES = {
    "deferred",
    "excluded",
    "optional",
    "secondary",
    "skipped",
    "not-required",
    "not_required",
}
REQUIRED_VIEW_NAMES = (
    "raw-evidence.json",
    "overlay.png",
    "simplified.png",
    "review.html",
)


class ReviewError(ValueError):
    """Raised when review input or output violates the artifact contract."""


def _reject_json_constant(value: str) -> None:
    raise ReviewError(f"non-finite JSON number is not allowed: {value}")


def load_json(path: Path | str) -> Any:
    source = Path(path)
    try:
        return json.loads(
            source.read_text(encoding="utf-8"), parse_constant=_reject_json_constant
        )
    except ReviewError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ReviewError(f"cannot read valid JSON from {source}: {exc}") from exc


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path | str) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ReviewError(message)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _require_nonempty_string(value: Any, label: str) -> str:
    _require(isinstance(value, str) and bool(value.strip()), f"{label} must be a non-empty string")
    return value


def _validate_schema_version(value: Any) -> str:
    version = _require_nonempty_string(value, "schemaVersion")
    match = PROFILE_VERSION_RE.fullmatch(version)
    _require(match is not None, f"unsupported AppProfile schemaVersion: {version!r}")
    _require(int(match.group(1)) >= 1, "AppProfile schema minor version must be v1.1 or newer")
    return version


def validate_external_ref(ref: Any, label: str) -> None:
    _require(isinstance(ref, dict), f"{label} must be an object ref")
    for key in ("rootId", "path", "sha256", "schemaVersion"):
        _require_nonempty_string(ref.get(key), f"{label}.{key}")
    rel = PurePosixPath(ref["path"])
    _require(not rel.is_absolute(), f"{label}.path must be root-relative")
    _require(".." not in rel.parts, f"{label}.path escapes its declared root")
    _require(SHA256_RE.fullmatch(ref["sha256"]) is not None, f"{label}.sha256 must be lowercase SHA-256")


def _validate_image_size(value: Any, label: str) -> None:
    _require(isinstance(value, dict), f"{label} must be an object")
    for key in ("width", "height"):
        _require(_is_number(value.get(key)) and value[key] > 0, f"{label}.{key} must be finite and > 0")


def _validate_mapping(mapping: Any, label: str) -> None:
    _require(isinstance(mapping, dict), f"{label} must be null or an object")
    kind = mapping.get("kind", "affine")
    _require(kind in ("identity", "affine"), f"{label}.kind must be identity or affine")
    _require_nonempty_string(mapping.get("sourceCoordinateSpace"), f"{label}.sourceCoordinateSpace")
    _require_nonempty_string(mapping.get("targetCoordinateSpace"), f"{label}.targetCoordinateSpace")
    if kind == "affine":
        for object_name in ("scale", "offset"):
            obj = mapping.get(object_name)
            _require(isinstance(obj, dict), f"{label}.{object_name} must be an object")
            for axis in ("x", "y"):
                _require(_is_number(obj.get(axis)), f"{label}.{object_name}.{axis} must be finite")
        _require(mapping["scale"]["x"] != 0 and mapping["scale"]["y"] != 0, f"{label}.scale must be invertible")


def _mapping_for_space(observation: Mapping[str, Any], source_space: str) -> Mapping[str, Any] | None:
    image_space = observation.get("coordinateSpace", "observation-image")
    if source_space == image_space or source_space in IMAGE_SPACES and image_space in IMAGE_SPACES:
        return None
    mapping = observation.get("mapping")
    _require(mapping is not None, f"observation {observation['id']!r} has no mapping from {source_space!r}")
    _require(mapping.get("sourceCoordinateSpace") == source_space, f"observation {observation['id']!r} mapping source does not match {source_space!r}")
    _require(mapping.get("targetCoordinateSpace") == image_space, f"observation {observation['id']!r} mapping target is not its image space")
    return mapping


def rect_to_image(rect: Mapping[str, Any], observation: Mapping[str, Any]) -> dict[str, float]:
    mapping = _mapping_for_space(observation, rect["coordinateSpace"])
    values = {key: float(rect[key]) for key in ("x", "y", "width", "height")}
    if mapping is None or mapping.get("kind", "affine") == "identity":
        return values
    sx = float(mapping["scale"]["x"])
    sy = float(mapping["scale"]["y"])
    ox = float(mapping["offset"]["x"])
    oy = float(mapping["offset"]["y"])
    x1 = values["x"] * sx + ox
    y1 = values["y"] * sy + oy
    x2 = (values["x"] + values["width"]) * sx + ox
    y2 = (values["y"] + values["height"]) * sy + oy
    return {
        "x": min(x1, x2),
        "y": min(y1, y2),
        "width": abs(x2 - x1),
        "height": abs(y2 - y1),
    }


def _validate_rect(
    rect: Any,
    label: str,
    owner_observation_id: str | None,
    observations: Mapping[str, Mapping[str, Any]],
    owner_coordinate_space: str | None = None,
) -> dict[str, float]:
    _require(isinstance(rect, dict), f"{label} must be null or a rectangle object")
    for key in ("x", "y", "width", "height"):
        _require(_is_number(rect.get(key)), f"{label}.{key} must be finite")
    _require(rect["width"] > 0 and rect["height"] > 0, f"{label} width and height must be > 0")
    space = _require_nonempty_string(
        rect.get("coordinateSpace", owner_coordinate_space), f"{label}.coordinateSpace"
    )
    if "coordinateSpace" not in rect:
        rect = dict(rect)
        rect["coordinateSpace"] = space
    observation_id = rect.get("observationId", owner_observation_id)
    _require_nonempty_string(observation_id, f"{label}.observationId")
    _require(observation_id in observations, f"{label} references missing observation {observation_id!r}")
    if "observationId" in rect:
        _require(owner_observation_id in (None, observation_id), f"{label}.observationId conflicts with its owner")

    if space == "normalized":
        _require(
            rect["x"] >= 0
            and rect["y"] >= 0
            and rect["x"] + rect["width"] <= 1
            and rect["y"] + rect["height"] <= 1,
            f"{label} normalized rectangle is outside [0, 1]",
        )
        image_size = observations[observation_id]["imageSize"]
        return {
            "x": rect["x"] * image_size["width"],
            "y": rect["y"] * image_size["height"],
            "width": rect["width"] * image_size["width"],
            "height": rect["height"] * image_size["height"],
        }

    image_rect = rect_to_image(rect, observations[observation_id])
    size = observations[observation_id]["imageSize"]
    epsilon = 1e-6
    _require(image_rect["x"] >= -epsilon and image_rect["y"] >= -epsilon, f"{label} starts outside the observation image")
    _require(
        image_rect["x"] + image_rect["width"] <= size["width"] + epsilon
        and image_rect["y"] + image_rect["height"] <= size["height"] + epsilon,
        f"{label} extends outside the observation image",
    )
    return image_rect


def _unknown_reason(owner: Mapping[str, Any], field: str) -> str | None:
    direct = owner.get(f"{field}UnknownReason")
    if isinstance(direct, str) and direct.strip():
        return direct
    unknowns = owner.get("unknowns")
    if isinstance(unknowns, dict):
        reason = unknowns.get(field)
        if isinstance(reason, str) and reason.strip():
            return reason
    return None


def _validate_target_state(target: Mapping[str, Any], label: str) -> list[str]:
    unknown_paths: list[str] = []
    state = target.get("state")
    if state is None:
        _require(_unknown_reason(target, "state") is not None, f"{label}.state is unknown but has no reason")
        return [f"{label}.state"]
    _require(isinstance(state, dict), f"{label}.state must be null or an object")
    reasons = state.get("unknownReasons", {})
    _require(isinstance(reasons, dict), f"{label}.state.unknownReasons must be an object")
    for key, value in state.items():
        if key == "unknownReasons":
            continue
        if value is None:
            reason = reasons.get(key) or _unknown_reason(target, f"state.{key}")
            _require(isinstance(reason, str) and bool(reason.strip()), f"{label}.state.{key} is unknown but has no reason")
            unknown_paths.append(f"{label}.state.{key}")
        elif key in reasons:
            raise ReviewError(
                f"{label}.state.{key} is known but still has an unknown reason; "
                "do not turn unknown into false without revising its provenance"
            )
        elif isinstance(value, dict) and "value" in value and value["value"] is None:
            reason = value.get("unknownReason")
            _require(isinstance(reason, str) and bool(reason.strip()), f"{label}.state.{key}.value is unknown but has no reason")
            unknown_paths.append(f"{label}.state.{key}.value")
    return unknown_paths


def _contains(outer: Mapping[str, float], inner: Mapping[str, float], epsilon: float = 1e-6) -> bool:
    return (
        inner["x"] >= outer["x"] - epsilon
        and inner["y"] >= outer["y"] - epsilon
        and inner["x"] + inner["width"] <= outer["x"] + outer["width"] + epsilon
        and inner["y"] + inner["height"] <= outer["y"] + outer["height"] + epsilon
    )


def validate_profile(profile: Any) -> dict[str, Any]:
    """Validate a loaded AppProfile and return deterministic summary metadata."""

    _require(isinstance(profile, dict), "AppProfile must be a JSON object")
    missing = [field for field in REQUIRED_PROFILE_FIELDS if field not in profile]
    _require(not missing, f"AppProfile is missing required fields: {', '.join(missing)}")
    schema_version = _validate_schema_version(profile["schemaVersion"])
    revision = profile["revision"]
    _require(
        (isinstance(revision, str) and bool(revision.strip()))
        or (isinstance(revision, int) and not isinstance(revision, bool) and revision >= 0),
        "revision must be a non-empty string or non-negative integer",
    )
    for key in ("applicationIdentity", "environmentScope"):
        _require(isinstance(profile[key], dict), f"{key} must be an object")
    for key in (
        "states",
        "regions",
        "targets",
        "geometryRules",
        "operations",
        "verifiers",
        "preconditions",
        "limitations",
        "evidenceRefs",
        "observationRefs",
        "relations",
        "claimSources",
        "changeLog",
    ):
        _require(isinstance(profile[key], list), f"{key} must be an array")

    evidence_ids: set[str] = set()
    for index, ref in enumerate(profile["evidenceRefs"]):
        validate_external_ref(ref, f"evidenceRefs[{index}]")
        if "id" in ref:
            evidence_id = _require_nonempty_string(ref["id"], f"evidenceRefs[{index}].id")
            _require(evidence_id not in evidence_ids, f"duplicate evidence ref id {evidence_id!r}")
            evidence_ids.add(evidence_id)

    all_objects: dict[str, tuple[str, Mapping[str, Any]]] = {}
    section_objects: dict[str, dict[str, Mapping[str, Any]]] = {}
    for section in OBJECT_SECTIONS:
        indexed: dict[str, Mapping[str, Any]] = {}
        for index, item in enumerate(profile[section]):
            _require(isinstance(item, dict), f"{section}[{index}] must be an object")
            object_id = _require_nonempty_string(item.get("id"), f"{section}[{index}].id")
            _require(object_id not in all_objects, f"duplicate local object id {object_id!r}")
            indexed[object_id] = item
            all_objects[object_id] = (section, item)
        section_objects[section] = indexed

    unknown_paths: list[str] = []
    observations = section_objects["observationRefs"]
    for observation_id, observation in observations.items():
        label = f"observationRefs[{observation_id!r}]"
        _validate_image_size(observation.get("imageSize"), f"{label}.imageSize")
        _require(isinstance(observation.get("scope"), dict), f"{label}.scope must be an object")
        _require_nonempty_string(observation.get("coordinateSpace", "observation-image"), f"{label}.coordinateSpace")
        screenshot_ref = observation.get("screenshotRef")
        validate_external_ref(screenshot_ref, f"{label}.screenshotRef")
        mapping = observation.get("mapping")
        if mapping is None:
            _require(
                isinstance(observation.get("mappingUnknownReason"), str)
                and bool(observation["mappingUnknownReason"].strip()),
                f"{label}.mapping is unknown but has no reason",
            )
            unknown_paths.append(f"observationRefs[{observation_id}].mapping")
        else:
            _require(
                not (
                    isinstance(observation.get("mappingUnknownReason"), str)
                    and observation["mappingUnknownReason"].strip()
                ),
                f"{label}.mapping is known but still has an unknown reason",
            )
            _validate_mapping(mapping, f"{label}.mapping")

    regions = section_objects["regions"]
    region_parent: dict[str, str | None] = {}
    for region_id, region in regions.items():
        parent_id = region.get("parentRegionId")
        if parent_id is not None:
            _require(parent_id in regions, f"region {region_id!r} references missing parent region {parent_id!r}")
        region_parent[region_id] = parent_id
        observation_id = region.get("observationId")
        _require_nonempty_string(observation_id, f"region {region_id!r}.observationId")
        _require(observation_id in observations, f"region {region_id!r} references missing observation {observation_id!r}")
        bounds = region.get("bounds")
        if bounds is None:
            _require(_unknown_reason(region, "bounds") is not None, f"region {region_id!r}.bounds is unknown but has no reason")
            unknown_paths.append(f"regions[{region_id}].bounds")
        else:
            _require(
                _unknown_reason(region, "bounds") is None,
                f"region {region_id!r}.bounds is known but still has an unknown reason",
            )
            _validate_rect(
                bounds,
                f"region {region_id!r}.bounds",
                observation_id,
                observations,
                region.get("coordinateSpace"),
            )

    for start in region_parent:
        seen: set[str] = set()
        current: str | None = start
        while current is not None:
            _require(current not in seen, f"region parent cycle includes {current!r}")
            seen.add(current)
            current = region_parent[current]

    targets = section_objects["targets"]
    for target_id, target in targets.items():
        label = f"target {target_id!r}"
        parent_id = target.get("parentRegionId")
        _require_nonempty_string(parent_id, f"{label}.parentRegionId")
        _require(parent_id in regions, f"{label} references missing parent region {parent_id!r}")
        observation_id = target.get("observationId")
        _require_nonempty_string(observation_id, f"{label}.observationId")
        _require(observation_id in observations, f"{label} references missing observation {observation_id!r}")
        target_rectangles: dict[str, dict[str, float]] = {}
        for field in ("textBounds", "controlBounds", "safeActionRegion"):
            value = target.get(field)
            if value is None:
                _require(_unknown_reason(target, field) is not None, f"{label}.{field} is unknown but has no reason")
                unknown_paths.append(f"targets[{target_id}].{field}")
            else:
                _require(
                    _unknown_reason(target, field) is None,
                    f"{label}.{field} is known but still has an unknown reason",
                )
                target_rectangles[field] = _validate_rect(
                    value,
                    f"{label}.{field}",
                    observation_id,
                    observations,
                    target.get("coordinateSpace"),
                )
        if "safeActionRegion" in target_rectangles and "controlBounds" in target_rectangles:
            _require(
                _contains(target_rectangles["controlBounds"], target_rectangles["safeActionRegion"]),
                f"{label}.safeActionRegion must be contained by controlBounds",
            )
        unknown_paths.extend(_validate_target_state(target, label))

    for relation_id, relation in section_objects["relations"].items():
        for field in ("kind", "from", "to"):
            _require_nonempty_string(relation.get(field), f"relation {relation_id!r}.{field}")
        for field in ("from", "to"):
            ref_id = relation[field]
            _require(ref_id in all_objects, f"relation {relation_id!r}.{field} references missing object {ref_id!r}")
        if relation.get("source") is None:
            _require(
                isinstance(relation.get("unknownReason"), str) and bool(relation["unknownReason"].strip()),
                f"relation {relation_id!r} has unknown source but no reason",
            )

    for claim_id, claim in section_objects["claimSources"].items():
        object_id = _require_nonempty_string(claim.get("objectId"), f"claimSource {claim_id!r}.objectId")
        _require(object_id in all_objects, f"claimSource {claim_id!r} references missing object {object_id!r}")
        _require_nonempty_string(claim.get("fieldPath"), f"claimSource {claim_id!r}.fieldPath")
        _require_nonempty_string(claim.get("sourceType"), f"claimSource {claim_id!r}.sourceType")
        refs = claim.get("evidenceRefs", [])
        _require(isinstance(refs, list), f"claimSource {claim_id!r}.evidenceRefs must be an array")
        for index, ref in enumerate(refs):
            if isinstance(ref, str):
                _require(ref in evidence_ids, f"claimSource {claim_id!r} has dangling evidence ref {ref!r}")
            else:
                validate_external_ref(ref, f"claimSource {claim_id!r}.evidenceRefs[{index}]")

    for section in ("geometryRules", "operations", "verifiers"):
        for object_id, item in section_objects[section].items():
            depends_on = item.get("dependsOn", [])
            _require(isinstance(depends_on, list), f"{section} {object_id!r}.dependsOn must be an array")
            _require(all(isinstance(value, str) for value in depends_on), f"{section} {object_id!r}.dependsOn entries must be strings")
            for ref_id in depends_on:
                _require(ref_id in all_objects, f"{section} {object_id!r} depends on missing object {ref_id!r}")

    if profile.get("reviewScope") is not None:
        scoped_observation = profile["reviewScope"].get("observationId")
        if scoped_observation is None:
            _require(
                len(observations) == 1,
                "reviewScope.observationId is required when a profile has multiple observations",
            )
            scoped_observation = next(iter(observations))
        _require(
            scoped_observation in observations,
            f"reviewScope references unknown observation {scoped_observation!r}",
        )
        _review_scope(profile, scoped_observation)

    return {
        "schemaVersion": schema_version,
        "revision": revision,
        "objectIds": sorted(all_objects),
        "targetIds": sorted(targets),
        "observationIds": sorted(observations),
        "unknownPaths": sorted(unknown_paths),
    }


def _parse_root_map(values: Sequence[str]) -> dict[str, Path]:
    roots: dict[str, Path] = {}
    for value in values:
        if "=" not in value:
            raise ReviewError(f"root mapping must be ID=DIR: {value!r}")
        root_id, raw_path = value.split("=", 1)
        _require_nonempty_string(root_id, "root ID")
        _require(root_id not in roots, f"duplicate root mapping for {root_id!r}")
        root = Path(raw_path).expanduser().resolve()
        _require(root.is_dir(), f"evidence root is not a directory: {root}")
        roots[root_id] = root
    return roots


def resolve_ref(ref: Mapping[str, Any], roots: Mapping[str, Path]) -> Path:
    root_id = ref["rootId"]
    _require(root_id in roots, f"no --root mapping supplied for {root_id!r}")
    root = roots[root_id].resolve()
    candidate = (root / PurePosixPath(ref["path"])).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ReviewError(f"ref path escapes root {root_id!r}: {ref['path']!r}") from exc
    _require(candidate.is_file(), f"referenced file does not exist: {root_id}:{ref['path']}")
    actual_hash = sha256_file(candidate)
    _require(actual_hash == ref["sha256"], f"hash mismatch for {root_id}:{ref['path']}")
    return candidate


def _atomic_write(path: Path, data: bytes, force: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not force:
        raise ReviewError(f"refusing to overwrite existing file: {path}")
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_name, path)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def _atomic_write_json(path: Path, value: Any, force: bool = False) -> None:
    _atomic_write(path, (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8"), force)


def _object_by_id(items: Sequence[Mapping[str, Any]], object_id: str) -> Mapping[str, Any]:
    for item in items:
        if item.get("id") == object_id:
            return item
    raise ReviewError(f"missing object {object_id!r}")


def _selected_targets(profile: Mapping[str, Any], observation_id: str) -> list[Mapping[str, Any]]:
    return [item for item in profile["targets"] if item.get("observationId") == observation_id]


def _selected_regions(profile: Mapping[str, Any], observation_id: str) -> list[Mapping[str, Any]]:
    return [item for item in profile["regions"] if item.get("observationId") == observation_id]


def _review_scope(
    profile: Mapping[str, Any], observation_id: str
) -> dict[str, Any]:
    """Resolve the explicit review selection without guessing omitted targets."""

    all_targets = _selected_targets(profile, observation_id)
    all_ids = sorted(target["id"] for target in all_targets)
    configured = profile.get("reviewScope")
    if configured is None:
        return {
            "kind": "all-profile-targets",
            "description": "All AppProfile targets for this observation are displayed.",
            "displayedTargetIds": all_ids,
            "hiddenTargetIds": [],
            "hiddenReasons": {},
        }
    _require(isinstance(configured, dict), "reviewScope must be an object")
    scoped_observation = configured.get("observationId")
    if scoped_observation is not None:
        _require(
            scoped_observation == observation_id,
            "reviewScope.observationId does not match the rendered observation",
        )
    displayed = configured.get("displayedTargetIds")
    hidden = configured.get("hiddenTargetIds")
    reasons = configured.get("hiddenReasons")
    _require_nonempty_string(configured.get("kind"), "reviewScope.kind")
    _require_nonempty_string(
        configured.get("description"), "reviewScope.description"
    )
    _require(
        isinstance(displayed, list)
        and all(isinstance(value, str) and value for value in displayed),
        "reviewScope.displayedTargetIds must be an array of target IDs",
    )
    _require(
        isinstance(hidden, list)
        and all(isinstance(value, str) and value for value in hidden),
        "reviewScope.hiddenTargetIds must be an array of target IDs",
    )
    _require(
        len(set(displayed)) == len(displayed)
        and len(set(hidden)) == len(hidden),
        "reviewScope target IDs must be unique",
    )
    overlap = sorted(set(displayed) & set(hidden))
    _require(
        not overlap,
        "reviewScope displayedTargetIds and hiddenTargetIds must not overlap: "
        + ", ".join(overlap),
    )
    unknown = sorted((set(displayed) | set(hidden)) - set(all_ids))
    _require(
        not unknown,
        "reviewScope references unknown target IDs: " + ", ".join(unknown),
    )
    omitted = sorted(set(all_ids) - set(displayed) - set(hidden))
    _require(
        not omitted,
        "reviewScope must classify every observation target as displayed or hidden: "
        + ", ".join(omitted),
    )
    _require(bool(displayed), "reviewScope must display at least one target")
    _require(isinstance(reasons, dict), "reviewScope.hiddenReasons must be an object")
    missing_reasons = sorted(
        target_id
        for target_id in hidden
        if not isinstance(reasons.get(target_id), str)
        or not reasons[target_id].strip()
    )
    _require(
        not missing_reasons,
        "reviewScope hidden targets require a reason: "
        + ", ".join(missing_reasons),
    )
    extra_reasons = sorted(set(reasons) - set(hidden))
    _require(
        not extra_reasons,
        "reviewScope.hiddenReasons contains non-hidden target IDs: "
        + ", ".join(extra_reasons),
    )
    return {
        "kind": configured["kind"],
        "description": configured["description"],
        "displayedTargetIds": sorted(displayed),
        "hiddenTargetIds": sorted(hidden),
        "hiddenReasons": {target_id: reasons[target_id] for target_id in sorted(hidden)},
    }


def _rect_for_draw(item: Mapping[str, Any], observation: Mapping[str, Any], field: str) -> dict[str, float] | None:
    value = item.get(field)
    if value is None:
        return None
    coordinate_space = value.get("coordinateSpace", item.get("coordinateSpace"))
    _require_nonempty_string(coordinate_space, f"{item.get('id', '<unknown>')}.{field}.coordinateSpace")
    if coordinate_space == "normalized":
        size = observation["imageSize"]
        return {
            "x": value["x"] * size["width"],
            "y": value["y"] * size["height"],
            "width": value["width"] * size["width"],
            "height": value["height"] * size["height"],
        }
    if "coordinateSpace" not in value:
        value = dict(value)
        value["coordinateSpace"] = coordinate_space
    return rect_to_image(value, observation)


def _box(rect: Mapping[str, float]) -> tuple[float, float, float, float]:
    return (
        rect["x"],
        rect["y"],
        rect["x"] + rect["width"],
        rect["y"] + rect["height"],
    )


def _color_for_id(object_id: str, alpha: int = 255) -> tuple[int, int, int, int]:
    raw = hashlib.sha256(object_id.encode("utf-8")).digest()
    return (64 + raw[0] % 160, 64 + raw[1] % 160, 64 + raw[2] % 160, alpha)


def _target_visual_labels(target_ids: Sequence[str]) -> dict[str, str]:
    """Return stable short-label -> target-ID mappings for a single view."""

    ordered = sorted(target_ids)
    width = max(2, len(str(len(ordered))))
    return {
        f"T{index:0{width}d}": target_id
        for index, target_id in enumerate(ordered, start=1)
    }


def _region_visual_labels(region_ids: Sequence[str]) -> dict[str, str]:
    ordered = sorted(region_ids)
    width = max(2, len(str(len(ordered))))
    return {
        f"R{index:0{width}d}": region_id
        for index, region_id in enumerate(ordered, start=1)
    }


def _review_font(size: int):
    """Use a deterministic Unicode-capable font when one is locally available."""

    from PIL import ImageFont

    candidates = (
        "DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _view_metadata(
    profile_path: Path,
    profile: Mapping[str, Any],
    observation_id: str,
    target_ids: Sequence[str],
    *,
    show_relations: bool = False,
) -> dict[str, Any]:
    scope = _review_scope(profile, observation_id)
    all_target_ids = sorted(
        target["id"] for target in _selected_targets(profile, observation_id)
    )
    _require(
        sorted(target_ids) == scope["displayedTargetIds"],
        "rendered targets do not match reviewScope.displayedTargetIds",
    )
    return {
        "appProfileSchemaVersion": profile["schemaVersion"],
        "appProfileRevision": profile["revision"],
        "appProfileSha256": sha256_file(profile_path),
        "observationId": observation_id,
        "targetIds": sorted(target_ids),
        "allTargetIds": all_target_ids,
        "hiddenTargetIds": scope["hiddenTargetIds"],
        "targetVisualLabels": _target_visual_labels(target_ids),
        "regionVisualLabels": _region_visual_labels(
            region["id"] for region in _selected_regions(profile, observation_id)
        ),
        "reviewScope": {
            "kind": scope["kind"],
            "description": scope["description"],
            "hiddenReasons": scope["hiddenReasons"],
        },
        "relationDisplay": "shown" if show_relations else "hidden-by-default",
    }


def _save_png(image: Any, path: Path, metadata: Mapping[str, Any], force: bool) -> None:
    try:
        from PIL.PngImagePlugin import PngInfo
    except ImportError as exc:  # pragma: no cover - environment check
        raise ReviewError("Pillow is required to produce deterministic PNG review views") from exc
    png_info = PngInfo()
    png_info.add_text("viewMetadata", canonical_json(metadata))
    if path.exists() and not force:
        raise ReviewError(f"refusing to overwrite existing file: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".png", dir=path.parent)
    os.close(fd)
    try:
        image.save(temporary_name, format="PNG", pnginfo=png_info, optimize=False, compress_level=9)
        os.replace(temporary_name, path)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def _render_overlay(
    image: Any,
    targets: Sequence[Mapping[str, Any]],
    regions: Sequence[Mapping[str, Any]],
    observation: Mapping[str, Any],
    visual_labels_by_id: Mapping[str, str],
    region_visual_labels_by_id: Mapping[str, str] | None = None,
) -> Any:
    try:
        from PIL import Image, ImageDraw
    except ImportError as exc:  # pragma: no cover - environment check
        raise ReviewError("Pillow is required to produce deterministic PNG review views") from exc
    base = image.convert("RGBA")
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    label_font = _review_font(10)
    if region_visual_labels_by_id is None:
        region_visual_labels_by_id = {
            region_id: label
            for label, region_id in _region_visual_labels(
                region["id"] for region in regions
            ).items()
        }
    for region in regions:
        rect = _rect_for_draw(region, observation, "bounds")
        if rect is None:
            continue
        color = _color_for_id(region["id"], 190)
        draw.rectangle(_box(rect), outline=color, width=2)
        draw.text(
            (rect["x"] + 3, rect["y"] + 3),
            region_visual_labels_by_id[region["id"]],
            fill=color,
            font=label_font,
        )
    for target_index, target in enumerate(targets):
        color = _color_for_id(target["id"], 225)
        rect = _rect_for_draw(target, observation, "controlBounds")
        if rect is not None:
            draw.rectangle(_box(rect), outline=color, width=3)
        text_rect = _rect_for_draw(target, observation, "textBounds")
        if text_rect is not None:
            draw.rectangle(_box(text_rect), outline=(255, 150, 0, 230), width=1)
        safe_rect = _rect_for_draw(target, observation, "safeActionRegion")
        if safe_rect is not None:
            draw.rectangle(_box(safe_rect), outline=(0, 210, 90, 230), width=2)
        label_rect = rect or text_rect or safe_rect
        label_position = (
            (label_rect["x"] + 3, label_rect["y"] + 3)
            if label_rect is not None
            else (3, 3 + target_index * 10)
        )
        draw.text(
            label_position,
            visual_labels_by_id[target["id"]],
            fill=color,
            font=label_font,
        )
    return Image.alpha_composite(base, layer)


def _render_simplified(
    size: tuple[int, int],
    targets: Sequence[Mapping[str, Any]],
    regions: Sequence[Mapping[str, Any]],
    observation: Mapping[str, Any],
    visual_labels_by_id: Mapping[str, str],
    region_visual_labels_by_id: Mapping[str, str] | None = None,
    *,
    show_relations: bool = False,
) -> Any:
    try:
        from PIL import Image, ImageDraw
    except ImportError as exc:  # pragma: no cover - environment check
        raise ReviewError("Pillow is required to produce deterministic PNG review views") from exc
    image = Image.new("RGBA", size, (250, 250, 250, 255))
    draw = ImageDraw.Draw(image)
    region_font = _review_font(10)
    target_font = _review_font(10)
    if region_visual_labels_by_id is None:
        region_visual_labels_by_id = {
            region_id: label
            for label, region_id in _region_visual_labels(
                region["id"] for region in regions
            ).items()
        }
    centers: dict[str, tuple[float, float]] = {}
    for region in regions:
        rect = _rect_for_draw(region, observation, "bounds")
        if rect is None:
            continue
        draw.rounded_rectangle(_box(rect), radius=5, fill=(230, 233, 238, 255), outline=(110, 118, 130, 255), width=2)
        draw.text(
            (rect["x"] + 4, rect["y"] + 4),
            region_visual_labels_by_id[region["id"]],
            fill=(35, 35, 40, 255),
            font=region_font,
        )
        centers[region["id"]] = (rect["x"] + rect["width"] / 2, rect["y"] + rect["height"] / 2)
    for target_index, target in enumerate(targets):
        rect = _rect_for_draw(target, observation, "controlBounds")
        if rect is None:
            rect = _rect_for_draw(target, observation, "textBounds")
        if rect is None:
            draw.text(
                (3, 3 + target_index * 10),
                visual_labels_by_id[target["id"]],
                fill=_color_for_id(target["id"], 255),
                font=target_font,
            )
            continue
        color = _color_for_id(target["id"], 255)
        fill = (color[0], color[1], color[2], 45)
        draw.rounded_rectangle(_box(rect), radius=4, fill=fill, outline=color, width=2)
        label = (
            f"{visual_labels_by_id[target['id']]}\n"
            f"{target.get('name', target.get('type', 'target'))}"
        )
        draw.multiline_text(
            (rect["x"] + 3, rect["y"] + 3),
            label,
            fill=(20, 20, 25, 255),
            spacing=1,
            font=target_font,
        )
        centers[target["id"]] = (rect["x"] + rect["width"] / 2, rect["y"] + rect["height"] / 2)
    if show_relations:
        for target in targets:
            parent_id = target.get("parentRegionId")
            if target["id"] in centers and parent_id in centers:
                draw.line(
                    (centers[parent_id], centers[target["id"]]),
                    fill=(100, 100, 100, 110),
                    width=1,
                )
    return image


def _json_diff(old: Any, new: Any, path: str = "") -> list[dict[str, Any]]:
    if type(old) is not type(new):
        return [{"path": path or "/", "oldValue": old, "newValue": new}]
    if isinstance(old, dict):
        changes: list[dict[str, Any]] = []
        for key in sorted(set(old) | set(new)):
            child = f"{path}/{str(key).replace('~', '~0').replace('/', '~1')}"
            if key not in old:
                changes.append({"path": child, "oldValue": "<missing>", "newValue": new[key]})
            elif key not in new:
                changes.append({"path": child, "oldValue": old[key], "newValue": "<missing>"})
            else:
                changes.extend(_json_diff(old[key], new[key], child))
        return changes
    if isinstance(old, list):
        changes = []
        for index in range(max(len(old), len(new))):
            child = f"{path}/{index}"
            if index >= len(old):
                changes.append({"path": child, "oldValue": "<missing>", "newValue": new[index]})
            elif index >= len(new):
                changes.append({"path": child, "oldValue": old[index], "newValue": "<missing>"})
            else:
                changes.extend(_json_diff(old[index], new[index], child))
        return changes
    if old != new:
        return [{"path": path or "/", "oldValue": old, "newValue": new}]
    return []


def _format_unknown(value: Any, reason: str | None = None) -> str:
    if value is None:
        return f"unknown — {reason}" if reason else "unknown"
    return canonical_json(value)


def _render_html(
    profile: Mapping[str, Any],
    metadata: Mapping[str, Any],
    targets: Sequence[Mapping[str, Any]],
    hidden_targets: Sequence[Mapping[str, Any]],
    diff: Sequence[Mapping[str, Any]],
    raw_evidence_path: str,
) -> str:
    rows: list[str] = []
    visual_labels_by_id = {
        target_id: label
        for label, target_id in metadata["targetVisualLabels"].items()
    }
    claims_by_object: dict[str, list[Mapping[str, Any]]] = {}
    for claim in profile["claimSources"]:
        claims_by_object.setdefault(claim["objectId"], []).append(claim)
    for target in targets:
        geometry = {
            key: _format_unknown(target.get(key), _unknown_reason(target, key))
            for key in ("textBounds", "controlBounds", "safeActionRegion")
        }
        state_value = target.get("state")
        if isinstance(state_value, dict):
            reasons = state_value.get("unknownReasons", {})
            state_for_review = {
                key: _format_unknown(value, reasons.get(key)) if value is None else value
                for key, value in state_value.items()
                if key != "unknownReasons"
            }
            state_text = canonical_json(state_for_review)
        else:
            state_text = _format_unknown(state_value, _unknown_reason(target, "state"))
        claims = [
            {
                "fieldPath": claim.get("fieldPath"),
                "sourceType": claim.get("sourceType"),
                "basis": claim.get("basis"),
            }
            for claim in claims_by_object.get(target["id"], [])
        ]
        cells = (
            visual_labels_by_id[target["id"]],
            target["id"],
            target.get("type", "unknown"),
            target.get("name", "unknown"),
            target.get("parentRegionId", "unknown"),
            state_text,
            target.get("validationStatus", "not-recorded"),
            canonical_json(geometry),
            canonical_json(claims),
        )
        rows.append("<tr>" + "".join(f"<td><pre>{html.escape(str(cell))}</pre></td>" for cell in cells) + "</tr>")
    diff_rows = []
    for change in diff:
        diff_rows.append(
            "<tr>"
            + f"<td><code>{html.escape(change['path'])}</code></td>"
            + f"<td><pre>{html.escape(canonical_json(change['oldValue']))}</pre></td>"
            + f"<td><pre>{html.escape(canonical_json(change['newValue']))}</pre></td>"
            + "</tr>"
        )
    if not diff_rows:
        diff_rows.append("<tr><td colspan=\"3\">No comparison profile supplied, or no differences.</td></tr>")
    hidden_reasons = metadata["reviewScope"]["hiddenReasons"]
    hidden_rows = [
        "<tr>"
        + f"<td><code>{html.escape(target['id'])}</code></td>"
        + f"<td>{html.escape(str(target.get('name', 'unknown')))}</td>"
        + f"<td>{html.escape(hidden_reasons[target['id']])}</td>"
        + "</tr>"
        for target in hidden_targets
    ]
    if not hidden_rows:
        hidden_rows.append(
            '<tr><td colspan="3">No targets are intentionally hidden.</td></tr>'
        )
    region_names = {region["id"]: region.get("name", "unknown") for region in profile["regions"]}
    region_rows = [
        "<tr>"
        + f"<td>{html.escape(label)}</td>"
        + f"<td><code>{html.escape(region_id)}</code></td>"
        + f"<td>{html.escape(str(region_names.get(region_id, 'unknown')))}</td>"
        + "</tr>"
        for label, region_id in sorted(metadata["regionVisualLabels"].items())
    ]
    metadata_json = canonical_json(metadata).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="app-profile-schema-version" content="{html.escape(str(metadata['appProfileSchemaVersion']), quote=True)}">
<meta name="app-profile-revision" content="{html.escape(str(metadata['appProfileRevision']), quote=True)}">
<meta name="app-profile-sha256" content="{html.escape(metadata['appProfileSha256'], quote=True)}">
<title>Application Engineer Review</title>
<style>body{{font:14px system-ui,sans-serif;margin:24px;color:#202124}} .notice{{padding:12px;background:#fff4ce;border:1px solid #e0b84f}} .views{{display:grid;grid-template-columns:repeat(3,minmax(220px,1fr));gap:16px;align-items:start}} figure{{margin:0}} figcaption{{font-weight:600;margin:0 0 6px}} img{{display:block;width:100%;height:auto;border:1px solid #bbb;background:#fafafa}} table{{border-collapse:collapse;width:100%;margin:16px 0}} th,td{{border:1px solid #ccc;padding:6px;vertical-align:top}} pre{{white-space:pre-wrap;margin:0}} code{{word-break:break-all}} @media(max-width:900px){{.views{{grid-template-columns:1fr}}}}</style>
</head><body>
<h1>Application Engineer Review</h1>
<p class="notice"><strong>Tool status:</strong> structural validation completed. Semantic confirmation and human review are not inferred by this helper.</p>
<dl><dt>Schema</dt><dd>{html.escape(str(metadata['appProfileSchemaVersion']))}</dd><dt>Revision</dt><dd>{html.escape(str(metadata['appProfileRevision']))}</dd><dt>Profile SHA-256</dt><dd><code>{metadata['appProfileSha256']}</code></dd><dt>Observation</dt><dd>{html.escape(metadata['observationId'])}</dd></dl>
<h2>Review scope</h2>
<dl><dt>Kind</dt><dd>{html.escape(metadata['reviewScope']['kind'])}</dd><dt>Description</dt><dd>{html.escape(metadata['reviewScope']['description'])}</dd><dt>Displayed targets</dt><dd>{len(metadata['targetIds'])}</dd><dt>Intentionally hidden targets</dt><dd>{len(metadata['hiddenTargetIds'])}</dd><dt>Relationships</dt><dd>{html.escape(metadata['relationDisplay'])}; parent and other relation lines do not cover the default layout.</dd></dl>
<p><a href="raw-evidence.json">Raw evidence index</a> · <a href="view-manifest.json">View manifest</a></p>
<div class="views"><figure><figcaption>Original evidence</figcaption><img data-view="original-evidence" src="{html.escape(raw_evidence_path, quote=True)}" alt="Unmodified original observation"></figure><figure><figcaption>Overlay</figcaption><img data-view="overlay" src="overlay.png" alt="Original evidence with deterministic overlay"></figure><figure><figcaption>Simplified layout</figcaption><img data-view="simplified" src="simplified.png" alt="Deterministic simplified layout"></figure></div>
<h2>Intentionally hidden controls</h2><table><thead><tr><th>ID</th><th>Name</th><th>Reason</th></tr></thead><tbody>{''.join(hidden_rows)}</tbody></table>
<h2>Region label map</h2><table><thead><tr><th>Visual label</th><th>ID</th><th>Name</th></tr></thead><tbody>{''.join(region_rows)}</tbody></table>
<h2>Attributes, sources, and validation status</h2>
<table><thead><tr><th>Visual label</th><th>ID</th><th>Type</th><th>Name</th><th>Parent</th><th>Observed state</th><th>Validation</th><th>Geometry</th><th>Claim sources</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
<h2>Differences</h2><table><thead><tr><th>Path</th><th>Old</th><th>New</th></tr></thead><tbody>{''.join(diff_rows)}</tbody></table>
<h2>Change log and unresolved status</h2><pre>{html.escape(json.dumps({'changeLog': profile['changeLog'], 'limitations': profile['limitations'], 'unknownTargetFields': [path for path in validate_profile(profile)['unknownPaths'] if path.startswith('targets[')]}, ensure_ascii=False, sort_keys=True, indent=2))}</pre>
<script type="application/json" id="view-metadata">{metadata_json}</script>
</body></html>
"""


def render_views(
    profile_path: Path | str,
    output_dir: Path | str,
    roots: Mapping[str, Path],
    *,
    observation_id: str | None = None,
    previous_profile_path: Path | str | None = None,
    copy_evidence: bool = False,
    show_relations: bool = False,
    force: bool = False,
) -> dict[str, Any]:
    """Generate deterministic review views and publish the manifest last.

    ``copy_evidence`` remains accepted for the first implementation's CLI
    compatibility; an original-evidence copy is now always required.
    """

    profile_path = Path(profile_path).resolve()
    output_dir = Path(output_dir).resolve()
    profile = load_json(profile_path)
    summary = validate_profile(profile)
    observations = profile["observationRefs"]
    if observation_id is None:
        _require(len(observations) == 1, "--observation-id is required when a profile has multiple observations")
        observation_id = observations[0]["id"]
    observation = _object_by_id(observations, observation_id)
    all_targets = _selected_targets(profile, observation_id)
    regions = _selected_regions(profile, observation_id)
    _require(bool(all_targets), f"observation {observation_id!r} has no targets to review")
    scope = _review_scope(profile, observation_id)
    targets_by_id = {target["id"]: target for target in all_targets}
    targets = [targets_by_id[target_id] for target_id in scope["displayedTargetIds"]]
    hidden_targets = [
        targets_by_id[target_id] for target_id in scope["hiddenTargetIds"]
    ]
    target_ids = sorted(target["id"] for target in targets)
    metadata = _view_metadata(
        profile_path,
        profile,
        observation_id,
        target_ids,
        show_relations=show_relations,
    )
    visual_labels_by_id = {
        target_id: label
        for label, target_id in metadata["targetVisualLabels"].items()
    }
    region_visual_labels_by_id = {
        region_id: label
        for label, region_id in metadata["regionVisualLabels"].items()
    }

    screenshot_ref = observation["screenshotRef"]
    screenshot_path = resolve_ref(screenshot_ref, roots)
    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover - environment check
        raise ReviewError("Pillow is required to produce PNG review views") from exc
    try:
        with Image.open(screenshot_path) as opened:
            opened.load()
            screenshot = opened.convert("RGBA")
    except Exception as exc:
        raise ReviewError(f"cannot decode screenshot {screenshot_ref['rootId']}:{screenshot_ref['path']}: {exc}") from exc
    declared_size = observation["imageSize"]
    _require(screenshot.size == (int(declared_size["width"]), int(declared_size["height"])), "screenshot dimensions do not match observation.imageSize")

    previous: Any = None
    if previous_profile_path is not None:
        previous = load_json(previous_profile_path)
        validate_profile(previous)
    diff = _json_diff(previous, profile) if previous is not None else []
    output_dir.mkdir(parents=True, exist_ok=True)

    evidence_entry: dict[str, Any] = {
        "observationId": observation_id,
        "screenshotRef": screenshot_ref,
        "verifiedSha256": sha256_file(screenshot_path),
    }
    suffix = screenshot_path.suffix.lower() or ".bin"
    # Every review page contains an independently visible original-evidence
    # pane. Local object IDs stay data: the digest prevents path traversal.
    observation_digest = sha256_bytes(observation_id.encode("utf-8"))[:16]
    copy_path = output_dir / "raw-evidence" / f"observation-{observation_digest}{suffix}"
    copy_path.parent.mkdir(parents=True, exist_ok=True)
    if copy_path.exists() and not force:
        raise ReviewError(f"refusing to overwrite existing evidence copy: {copy_path}")
    shutil.copyfile(screenshot_path, copy_path)
    evidence_entry["copiedPath"] = copy_path.relative_to(output_dir).as_posix()
    evidence_entry["copiedSha256"] = sha256_file(copy_path)

    raw_index = {
        "schemaVersion": "agent-to-recipe/application-review-view/v1",
        "viewKind": "raw-evidence-index",
        "source": metadata,
        "evidence": [evidence_entry],
        "reviewStatus": {
            "structuralValidation": "passed",
            "semanticValidation": "not-inferred",
            "humanReview": "not-recorded-by-tool",
        },
    }
    _atomic_write_json(output_dir / "raw-evidence.json", raw_index, force)
    overlay = _render_overlay(
        screenshot,
        targets,
        regions,
        observation,
        visual_labels_by_id,
        region_visual_labels_by_id,
    )
    simplified = _render_simplified(
        screenshot.size,
        targets,
        regions,
        observation,
        visual_labels_by_id,
        region_visual_labels_by_id,
        show_relations=show_relations,
    )
    _save_png(overlay, output_dir / "overlay.png", metadata, force)
    _save_png(simplified, output_dir / "simplified.png", metadata, force)
    review_html = _render_html(
        profile,
        metadata,
        targets,
        hidden_targets,
        diff,
        evidence_entry["copiedPath"],
    )
    _atomic_write(output_dir / "review.html", review_html.encode("utf-8"), force)

    views = []
    for name in REQUIRED_VIEW_NAMES:
        path = output_dir / name
        views.append({"path": name, "sha256": sha256_file(path)})
    manifest = {
        "schemaVersion": "agent-to-recipe/application-review-bundle/v1",
        "source": metadata,
        "views": views,
        "publishedLast": True,
    }
    _atomic_write_json(output_dir / "view-manifest.json", manifest, force)
    verify_view_bundle(profile_path, output_dir)
    return {"profile": summary, "bundle": manifest}


def _png_metadata(path: Path) -> dict[str, Any]:
    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover - environment check
        raise ReviewError("Pillow is required to verify PNG review views") from exc
    try:
        with Image.open(path) as image:
            raw = image.text.get("viewMetadata")
    except Exception as exc:
        raise ReviewError(f"cannot read PNG metadata from {path}: {exc}") from exc
    _require(isinstance(raw, str), f"PNG view is missing viewMetadata: {path.name}")
    try:
        return json.loads(raw, parse_constant=_reject_json_constant)
    except json.JSONDecodeError as exc:
        raise ReviewError(f"invalid viewMetadata in {path.name}: {exc}") from exc


def _html_metadata(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r'<script type="application/json" id="view-metadata">(.*?)</script>', text, re.DOTALL)
    _require(match is not None, "review.html is missing view metadata")
    try:
        return json.loads(match.group(1), parse_constant=_reject_json_constant)
    except json.JSONDecodeError as exc:
        raise ReviewError(f"review.html has invalid view metadata: {exc}") from exc


def verify_view_bundle(profile_path: Path | str, bundle_dir: Path | str) -> dict[str, Any]:
    profile_path = Path(profile_path).resolve()
    bundle_dir = Path(bundle_dir).resolve()
    profile = load_json(profile_path)
    validate_profile(profile)
    manifest_path = bundle_dir / "view-manifest.json"
    _require(manifest_path.is_file(), "view bundle is incomplete: view-manifest.json is missing")
    manifest = load_json(manifest_path)
    _require(manifest.get("schemaVersion") == "agent-to-recipe/application-review-bundle/v1", "unsupported review bundle schemaVersion")
    source = manifest.get("source")
    _require(isinstance(source, dict), "view manifest source must be an object")
    observation_id = _require_nonempty_string(source.get("observationId"), "view manifest source.observationId")
    _object_by_id(profile["observationRefs"], observation_id)
    target_ids = _review_scope(profile, observation_id)["displayedTargetIds"]
    relation_display = source.get("relationDisplay")
    _require(
        relation_display in ("hidden-by-default", "shown"),
        "view bundle source has an invalid relationDisplay",
    )
    expected_meta = _view_metadata(
        profile_path,
        profile,
        observation_id,
        target_ids,
        show_relations=relation_display == "shown",
    )
    _require(source == expected_meta, "view bundle source metadata does not exactly match profile")
    listed = manifest.get("views")
    _require(isinstance(listed, list), "view manifest views must be an array")
    _require(len(listed) == len(REQUIRED_VIEW_NAMES), "view manifest must list each required view exactly once")
    for index, item in enumerate(listed):
        _require(isinstance(item, dict), f"view manifest views[{index}] must be an object")
        _require_nonempty_string(item.get("path"), f"view manifest views[{index}].path")
        _require(
            SHA256_RE.fullmatch(str(item.get("sha256", ""))) is not None,
            f"view manifest views[{index}].sha256 must be lowercase SHA-256",
        )
    listed_by_path = {item["path"]: item for item in listed}
    _require(
        len(listed_by_path) == len(REQUIRED_VIEW_NAMES)
        and set(REQUIRED_VIEW_NAMES) == set(listed_by_path),
        "view manifest must list each required view exactly once",
    )
    for name in REQUIRED_VIEW_NAMES:
        path = bundle_dir / name
        _require(path.is_file(), f"view bundle is incomplete: {name} is missing")
        _require(sha256_file(path) == listed_by_path[name].get("sha256"), f"view hash mismatch: {name}")
    raw = load_json(bundle_dir / "raw-evidence.json")
    _require(raw.get("source") == expected_meta, "raw evidence view source metadata differs")
    evidence = raw.get("evidence")
    _require(
        isinstance(evidence, list) and len(evidence) == 1,
        "raw evidence view must list exactly one observation image",
    )
    copied_rel = evidence[0].get("copiedPath")
    _require_nonempty_string(copied_rel, "raw evidence copiedPath")
    copied_path = (bundle_dir / PurePosixPath(copied_rel)).resolve()
    try:
        copied_path.relative_to(bundle_dir)
    except ValueError as exc:
        raise ReviewError("raw evidence copiedPath escapes the view bundle") from exc
    _require(copied_path.is_file(), "raw evidence copied image is missing")
    _require(
        sha256_file(copied_path) == evidence[0].get("copiedSha256"),
        "raw evidence copied image hash mismatch",
    )
    _require(_png_metadata(bundle_dir / "overlay.png") == expected_meta, "overlay source metadata differs")
    _require(_png_metadata(bundle_dir / "simplified.png") == expected_meta, "simplified source metadata differs")
    _require(_html_metadata(bundle_dir / "review.html") == expected_meta, "review HTML source metadata differs")
    return manifest


def _decode_pointer_token(token: str) -> str:
    return token.replace("~1", "/").replace("~0", "~")


def _pointer_parts(pointer: str) -> list[str]:
    _require(isinstance(pointer, str) and pointer.startswith("/"), f"change path must be a JSON pointer: {pointer!r}")
    return [_decode_pointer_token(token) for token in pointer[1:].split("/")]


def _list_index(container: Sequence[Any], token: str, *, allow_append: bool = False) -> int:
    if token.startswith("@"):
        object_id = token[1:]
        for index, value in enumerate(container):
            if isinstance(value, dict) and value.get("id") == object_id:
                return index
        raise ReviewError(f"JSON pointer selector cannot find id {object_id!r}")
    if allow_append and token == "-":
        return len(container)
    _require(token.isdigit(), f"array JSON pointer token must be an index or @id selector: {token!r}")
    index = int(token)
    _require(0 <= index < len(container) or allow_append and index == len(container), f"array JSON pointer index out of range: {index}")
    return index


def _pointer_parent(document: Any, pointer: str, *, allow_append: bool = False) -> tuple[Any, str]:
    parts = _pointer_parts(pointer)
    _require(bool(parts), "root replacement is not supported")
    current = document
    for token in parts[:-1]:
        if isinstance(current, dict):
            _require(token in current, f"JSON pointer path does not exist: {pointer!r}")
            current = current[token]
        elif isinstance(current, list):
            current = current[_list_index(current, token)]
        else:
            raise ReviewError(f"JSON pointer traverses a scalar: {pointer!r}")
    return current, parts[-1]


def _pointer_get(document: Any, pointer: str) -> Any:
    parent, token = _pointer_parent(document, pointer)
    if isinstance(parent, dict):
        _require(token in parent, f"JSON pointer path does not exist: {pointer!r}")
        return parent[token]
    if isinstance(parent, list):
        return parent[_list_index(parent, token)]
    raise ReviewError(f"JSON pointer parent is a scalar: {pointer!r}")


def _pointer_apply(document: Any, operation: str, pointer: str, value: Any = None) -> None:
    parent, token = _pointer_parent(document, pointer, allow_append=operation == "add")
    if isinstance(parent, dict):
        if operation == "remove":
            _require(token in parent, f"cannot remove missing path: {pointer!r}")
            del parent[token]
        elif operation == "replace":
            _require(token in parent, f"cannot replace missing path: {pointer!r}")
            parent[token] = copy.deepcopy(value)
        elif operation == "add":
            _require(token not in parent, f"cannot add an existing path: {pointer!r}")
            parent[token] = copy.deepcopy(value)
        else:
            raise ReviewError(f"unsupported revision operation: {operation!r}")
        return
    if isinstance(parent, list):
        index = _list_index(parent, token, allow_append=operation == "add")
        if operation == "remove":
            parent.pop(index)
        elif operation == "replace":
            parent[index] = copy.deepcopy(value)
        elif operation == "add":
            parent.insert(index, copy.deepcopy(value))
        else:
            raise ReviewError(f"unsupported revision operation: {operation!r}")
        return
    raise ReviewError(f"JSON pointer parent is a scalar: {pointer!r}")


def _change_object_id(profile: Mapping[str, Any], pointer: str) -> tuple[str | None, str | None]:
    parts = _pointer_parts(pointer)
    if not parts or parts[0] not in OBJECT_SECTIONS or len(parts) < 2:
        return None, parts[0] if parts else None
    section = parts[0]
    selector = parts[1]
    if selector.startswith("@"):
        return selector[1:], section
    if selector.isdigit():
        index = int(selector)
        if index < len(profile.get(section, [])):
            item = profile[section][index]
            if isinstance(item, dict):
                return item.get("id"), section
    return None, section


def _has_resolution_evidence(change: Mapping[str, Any]) -> bool:
    refs = change.get("resolutionEvidenceRefs")
    if not isinstance(refs, list) or not refs:
        return False
    for index, ref in enumerate(refs):
        validate_external_ref(ref, f"change.resolutionEvidenceRefs[{index}]")
    return True


def _is_unknown_state_path(path: str) -> bool:
    lowered = path.lower()
    return "/state/" in lowered or lowered.endswith(
        (
            "/enabled",
            "/visible",
            "/selected",
            "/blocked",
            "/loaded",
            "/focused",
            "/occluded",
            "/checked",
            "/actionable",
            "/textbounds",
            "/controlbounds",
            "/safeactionregion",
            "/bounds",
            "/mapping",
        )
    )


def _unknown_path_object_id(path: str) -> str | None:
    """Return the owning local object ID from validate_profile's unknown path."""

    for pattern in (
        r"^targets\[([^]]+)\]\.",
        r"^regions\[([^]]+)\]\.",
        r"^observationRefs\[([^]]+)\]\.",
        r"^target '([^']+)'\.",
    ):
        match = re.match(pattern, path)
        if match is not None:
            return match.group(1)
    return None


def _critical_downgrade(target: Mapping[str, Any] | None) -> bool:
    if target is None:
        return True
    if target.get("required") is False:
        return True
    for field in ("priority", "status", "maturity"):
        value = target.get(field)
        if isinstance(value, str) and value.lower() in DOWNGRADED_VALUES:
            return True
        if isinstance(value, dict):
            status = value.get("status")
            if isinstance(status, str) and status.lower() in DOWNGRADED_VALUES:
                return True
    return False


def _impact_report(profile: dict[str, Any], changed_ids: set[str], conservative: bool) -> dict[str, Any]:
    affected: set[str] = set()
    items_by_id = {
        item["id"]: (section, item)
        for section in DEPENDENT_SECTIONS
        for item in profile[section]
    }
    if conservative:
        affected.update(items_by_id)
    else:
        affected.update(object_id for object_id in changed_ids if object_id in items_by_id)
        progress = True
        while progress:
            progress = False
            known = changed_ids | affected
            for object_id, (_, item) in items_by_id.items():
                if object_id not in affected and set(item.get("dependsOn", [])) & known:
                    affected.add(object_id)
                    progress = True
    by_section = {section: [] for section in DEPENDENT_SECTIONS}
    for object_id in sorted(affected):
        section, item = items_by_id[object_id]
        item["validationStatus"] = "needs-revalidation"
        by_section[section].append(object_id)
    return {
        "status": "needs-revalidation" if affected else "no-dependent-object",
        "changedObjectIds": sorted(changed_ids),
        "conservative": conservative,
        "affected": by_section,
        "note": "This is an application-artifact revalidation recommendation; it does not update workflow progress.",
    }


def revise_profile(
    profile_path: Path | str,
    patch_path: Path | str,
    output_path: Path | str,
    *,
    critical_target_ids: Iterable[str] = (),
    force: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Apply a baseline-bound textual revision to a new file and report impact."""

    profile_path = Path(profile_path).resolve()
    patch_path = Path(patch_path).resolve()
    output_path = Path(output_path).resolve()
    _require(output_path != profile_path, "revision output must not overwrite the source AppProfile")
    _require(output_path != patch_path, "revision output must not overwrite its revision patch")
    profile = load_json(profile_path)
    baseline_summary = validate_profile(profile)
    patch = load_json(patch_path)
    _require(isinstance(patch, dict), "revision patch must be an object")
    _require(patch.get("schemaVersion") == "agent-to-recipe/app-profile-revision/v1", "unsupported revision patch schemaVersion")
    baseline = patch.get("baseline")
    _require(isinstance(baseline, dict), "revision patch baseline must be an object")
    _require(baseline.get("schemaVersion") == profile["schemaVersion"], "revision baseline schemaVersion does not match")
    _require(baseline.get("revision") == profile["revision"], "revision baseline revision does not match")
    _require(baseline.get("sha256") == sha256_file(profile_path), "revision baseline SHA-256 does not match")
    new_revision = patch.get("newRevision")
    _require(new_revision != profile["revision"] and new_revision is not None, "newRevision must differ from the baseline revision")
    modified_by = patch.get("modifiedBy")
    _require(isinstance(modified_by, dict), "revision patch modifiedBy must be an object")
    _require_nonempty_string(modified_by.get("kind"), "revision patch modifiedBy.kind")
    _require_nonempty_string(modified_by.get("id"), "revision patch modifiedBy.id")
    changes = patch.get("changes")
    _require(isinstance(changes, list) and bool(changes), "revision patch changes must be a non-empty array")
    if "scopeChangeAuthorizationRef" in patch:
        validate_external_ref(patch["scopeChangeAuthorizationRef"], "scopeChangeAuthorizationRef")

    revised = copy.deepcopy(profile)
    changed_ids: set[str] = set()
    conservative = False
    normalized_changes: list[dict[str, Any]] = []
    protected_prefixes = ("/schemaVersion", "/revision", "/changeLog")
    for index, change in enumerate(changes):
        _require(isinstance(change, dict), f"changes[{index}] must be an object")
        operation = change.get("op", "replace")
        _require(operation in ("add", "replace", "remove"), f"changes[{index}].op is unsupported")
        pointer = _require_nonempty_string(change.get("path"), f"changes[{index}].path")
        _require(not pointer.startswith(protected_prefixes), f"changes[{index}] cannot directly modify schemaVersion, revision, or changeLog")
        reason = _require_nonempty_string(change.get("reason"), f"changes[{index}].reason")
        object_id, section = _change_object_id(revised, pointer)
        if object_id is None:
            conservative = True
        else:
            changed_ids.add(object_id)
        if operation == "add":
            _require("oldValue" in change and change["oldValue"] == "<missing>", f"changes[{index}].oldValue must be '<missing>' for add")
            old_value: Any = "<missing>"
        else:
            _require("oldValue" in change, f"changes[{index}].oldValue is required")
            old_value = copy.deepcopy(_pointer_get(revised, pointer))
            _require(old_value == change["oldValue"], f"changes[{index}].oldValue does not match the baseline")
        new_value = "<removed>" if operation == "remove" else copy.deepcopy(change.get("newValue"))
        if old_value is None and new_value is not None and _is_unknown_state_path(pointer):
            _require(_has_resolution_evidence(change), f"changes[{index}] cannot resolve unknown state without resolutionEvidenceRefs")
        if "resolutionEvidenceRefs" in change:
            _require(
                _has_resolution_evidence(change),
                f"changes[{index}].resolutionEvidenceRefs must be a non-empty array of external refs",
            )
        _pointer_apply(revised, operation, pointer, None if operation == "remove" else change.get("newValue"))
        normalized_change = {
            "op": operation,
            "path": pointer,
            "objectId": object_id,
            "section": section,
            "oldValue": old_value,
            "newValue": new_value,
            "reason": reason,
        }
        if "resolutionEvidenceRefs" in change:
            normalized_change["resolutionEvidenceRefs"] = copy.deepcopy(
                change["resolutionEvidenceRefs"]
            )
        normalized_changes.append(normalized_change)

    critical_ids = set(critical_target_ids)
    revised_targets = {target["id"]: target for target in revised.get("targets", []) if isinstance(target, dict) and "id" in target}
    downgraded = sorted(target_id for target_id in critical_ids if _critical_downgrade(revised_targets.get(target_id)))
    _require(not downgraded or "scopeChangeAuthorizationRef" in patch, f"critical targets cannot be downgraded without scope authorization: {', '.join(downgraded)}")

    revised["revision"] = new_revision
    revised_summary = validate_profile(revised)
    resolved_unknowns = sorted(
        set(baseline_summary["unknownPaths"]) - set(revised_summary["unknownPaths"])
    )
    evidence_bearing_ids = {
        change["objectId"]
        for change in normalized_changes
        if change.get("objectId") is not None
        and bool(change.get("resolutionEvidenceRefs"))
    }
    unresolved_provenance = [
        path
        for path in resolved_unknowns
        if _unknown_path_object_id(path) not in evidence_bearing_ids
    ]
    _require(
        not unresolved_provenance,
        "resolved unknowns require resolutionEvidenceRefs on their owning object: "
        + ", ".join(unresolved_provenance),
    )
    impact = _impact_report(revised, changed_ids, conservative)
    revised["changeLog"].append(
        {
            "base": copy.deepcopy(baseline),
            "revision": new_revision,
            "modifiedBy": copy.deepcopy(modified_by),
            "changedAt": patch.get("changedAt"),
            "changes": normalized_changes,
            "impact": copy.deepcopy(impact),
            "scopeChangeAuthorizationRef": copy.deepcopy(patch.get("scopeChangeAuthorizationRef")),
        }
    )
    validate_profile(revised)
    _atomic_write_json(output_path, revised, force)
    impact["revisedProfileSha256"] = sha256_file(output_path)
    return revised, impact


def inject_error(profile_path: Path | str, kind: str, output_path: Path | str, *, force: bool = False) -> dict[str, Any]:
    """Write a deliberately faulty isolated copy; never modify the source file."""

    profile_path = Path(profile_path).resolve()
    output_path = Path(output_path).resolve()
    _require(output_path != profile_path, "fault injection output must not overwrite the source AppProfile")
    profile = load_json(profile_path)
    validate_profile(profile)
    injected = copy.deepcopy(profile)
    if kind == "invalid-rectangle":
        target = next((item for item in injected["targets"] if item.get("controlBounds") is not None), None)
        _require(target is not None, "profile has no controlBounds for invalid-rectangle injection")
        target["controlBounds"]["width"] = -1
    elif kind == "dangling-reference":
        _require(bool(injected["targets"]), "profile has no target for dangling-reference injection")
        injected["targets"][0]["parentRegionId"] = "fault.missing-region"
    elif kind == "unknown-to-false":
        candidate = None
        for target in injected["targets"]:
            state = target.get("state")
            if isinstance(state, dict):
                for key, value in state.items():
                    if key != "unknownReasons" and value is None:
                        candidate = (state, key)
                        break
            if candidate:
                break
        _require(candidate is not None, "profile has no unknown state for unknown-to-false injection")
        candidate[0][candidate[1]] = False
    elif kind == "critical-downgrade":
        _require(bool(injected["targets"]), "profile has no target for critical-downgrade injection")
        injected["targets"][0]["required"] = False
    else:
        raise ReviewError(f"unsupported fault injection kind: {kind!r}")
    injected["testFaultInjection"] = {
        "kind": kind,
        "isolated": True,
        "sourceSha256": sha256_file(profile_path),
    }
    _atomic_write_json(output_path, injected, force)
    return injected


def _extraction_ref(
    extraction_path: Path, root_id: str, root_path: Path
) -> dict[str, Any]:
    root = root_path.resolve()
    source = extraction_path.resolve()
    try:
        relative = source.relative_to(root)
    except ValueError as exc:
        raise ReviewError("model extraction file is outside its declared root") from exc
    _require(source.is_file(), f"model extraction file does not exist: {source}")
    return {
        "id": "evidence.model-extraction.actual",
        "rootId": root_id,
        "path": relative.as_posix(),
        "sha256": sha256_file(source),
        "schemaVersion": MODEL_EXTRACTION_VERSION,
    }


def _extraction_target(target: Mapping[str, Any], index: int) -> dict[str, Any]:
    label = f"rawOutput.targets[{index}]"
    for key in ("id", "name", "type", "parentRegionId", "observationId", "coordinateSpace"):
        _require_nonempty_string(target.get(key), f"{label}.{key}")
    _require(isinstance(target.get("required"), bool), f"{label}.required must be boolean")
    visibility = target.get("reviewVisibility")
    _require(
        visibility in ("displayed", "hidden"),
        f"{label}.reviewVisibility must be displayed or hidden",
    )
    hidden_reason = target.get("hiddenReason")
    if visibility == "hidden":
        _require_nonempty_string(hidden_reason, f"{label}.hiddenReason")
    else:
        _require(
            hidden_reason in (None, ""),
            f"{label}.hiddenReason is only valid for hidden targets",
        )
    _require_nonempty_string(target.get("claimBasis"), f"{label}.claimBasis")
    normalized = {
        key: copy.deepcopy(value)
        for key, value in target.items()
        if key
        not in (
            "reviewVisibility",
            "hiddenReason",
            "claimBasis",
        )
    }
    return normalized


def ingest_model_extraction(
    profile_path: Path | str,
    extraction_path: Path | str,
    output_path: Path | str,
    *,
    extraction_root_id: str,
    extraction_root: Path | str,
    new_revision: str,
    changed_at: str,
    actor_id: str,
    force: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Strictly adapt an actual Agent/model image extraction into AppProfile.

    Existing target semantics must match exactly. A conflict is not normalized
    away: it must be handled later by an explicit baseline-bound revision.
    """

    profile_path = Path(profile_path).resolve()
    extraction_path = Path(extraction_path).resolve()
    output_path = Path(output_path).resolve()
    extraction_root = Path(extraction_root).resolve()
    _require(
        output_path not in (profile_path, extraction_path),
        "ingestion output must not overwrite the baseline or raw extraction",
    )
    profile = load_json(profile_path)
    baseline_summary = validate_profile(profile)
    extraction = load_json(extraction_path)
    _require(isinstance(extraction, dict), "model extraction must be an object")
    _require(
        extraction.get("schemaVersion") == MODEL_EXTRACTION_VERSION,
        f"unsupported model extraction schemaVersion: {extraction.get('schemaVersion')!r}",
    )
    if profile.get("taskId") is not None:
        _require(
            extraction.get("taskId") == profile.get("taskId"),
            "model extraction taskId does not match AppProfile",
        )
    _require_nonempty_string(extraction.get("attemptId"), "model extraction attemptId")
    _require_nonempty_string(extraction.get("extractedAt"), "model extraction extractedAt")
    producer = extraction.get("producer")
    _require(isinstance(producer, dict), "model extraction producer must be an object")
    _require_nonempty_string(producer.get("host"), "model extraction producer.host")
    _require_nonempty_string(producer.get("method"), "model extraction producer.method")
    _require(
        producer.get("actualImageConsumed") is True,
        "model extraction must attest that actual image bytes were consumed",
    )
    instruction = extraction.get("instruction")
    _require(isinstance(instruction, dict), "model extraction instruction must be an object")
    _require_nonempty_string(instruction.get("version"), "model extraction instruction.version")
    _require_nonempty_string(instruction.get("text"), "model extraction instruction.text")

    raw_input = extraction.get("input")
    _require(isinstance(raw_input, dict), "model extraction input must be an object")
    observation_id = _require_nonempty_string(
        raw_input.get("observationId"), "model extraction input.observationId"
    )
    observation = _object_by_id(profile["observationRefs"], observation_id)
    screenshot_ref = raw_input.get("screenshotRef")
    validate_external_ref(screenshot_ref, "model extraction input.screenshotRef")
    _validate_image_size(raw_input.get("imageSize"), "model extraction input.imageSize")
    _require(
        {
            key: screenshot_ref.get(key)
            for key in ("rootId", "path", "sha256", "schemaVersion")
        }
        == {
            key: observation["screenshotRef"].get(key)
            for key in ("rootId", "path", "sha256", "schemaVersion")
        },
        "model extraction screenshot ref does not match the AppProfile observation",
    )
    _require(
        raw_input["imageSize"] == observation["imageSize"],
        "model extraction image size does not match the AppProfile observation",
    )

    raw_output = extraction.get("rawOutput")
    _require(isinstance(raw_output, dict), "model extraction rawOutput must be an object")
    scope = raw_output.get("scope")
    _require(isinstance(scope, dict), "model extraction rawOutput.scope must be an object")
    _require_nonempty_string(scope.get("kind"), "model extraction rawOutput.scope.kind")
    _require_nonempty_string(
        scope.get("description"), "model extraction rawOutput.scope.description"
    )
    raw_targets = raw_output.get("targets")
    _require(isinstance(raw_targets, list) and raw_targets, "model extraction targets must be a non-empty array")
    normalized_targets: list[dict[str, Any]] = []
    raw_by_id: dict[str, Mapping[str, Any]] = {}
    for index, raw_target in enumerate(raw_targets):
        _require(isinstance(raw_target, dict), f"rawOutput.targets[{index}] must be an object")
        normalized = _extraction_target(raw_target, index)
        target_id = normalized["id"]
        _require(target_id not in raw_by_id, f"duplicate model extraction target ID {target_id!r}")
        _require(
            normalized["observationId"] == observation_id,
            f"model extraction target {target_id!r} belongs to a different observation",
        )
        raw_by_id[target_id] = raw_target
        normalized_targets.append(normalized)

    existing_by_id = {
        target["id"]: target
        for target in profile["targets"]
        if target.get("observationId") == observation_id
    }
    omitted_existing = sorted(set(existing_by_id) - set(raw_by_id))
    _require(
        not omitted_existing,
        "model extraction omits existing observation targets: "
        + ", ".join(omitted_existing),
    )
    comparable_fields = (
        "name",
        "type",
        "parentRegionId",
        "observationId",
        "coordinateSpace",
        "textBounds",
        "controlBounds",
        "safeActionRegion",
        "required",
    )
    for target_id in sorted(set(existing_by_id) & set(raw_by_id)):
        normalized = next(item for item in normalized_targets if item["id"] == target_id)
        conflicts = [
            field
            for field in comparable_fields
            if existing_by_id[target_id].get(field) != normalized.get(field)
        ]
        _require(
            not conflicts,
            f"model extraction conflicts with existing target {target_id!r} fields; use an explicit revision: "
            + ", ".join(conflicts),
        )

    extraction_evidence = _extraction_ref(
        extraction_path, extraction_root_id, extraction_root
    )
    _require(
        all(ref.get("id") != extraction_evidence["id"] for ref in profile["evidenceRefs"]),
        f"duplicate evidence ref id {extraction_evidence['id']!r}",
    )
    revised = copy.deepcopy(profile)
    revised["revision"] = new_revision
    revised["evidenceRefs"].append(extraction_evidence)
    changes: list[dict[str, Any]] = [
        {
            "op": "add",
            "path": "/evidenceRefs/-",
            "oldValue": "<missing>",
            "newValue": copy.deepcopy(extraction_evidence),
            "reason": "Retain the actual image-consuming model/Agent output used by normalization.",
        }
    ]
    changed_ids: set[str] = set()
    existing_all_ids = {target["id"] for target in revised["targets"]}
    for normalized in normalized_targets:
        if normalized["id"] in existing_all_ids:
            continue
        revised["targets"].append(normalized)
        existing_all_ids.add(normalized["id"])
        changed_ids.add(normalized["id"])
        changes.append(
            {
                "op": "add",
                "path": "/targets/-",
                "oldValue": "<missing>",
                "newValue": copy.deepcopy(normalized),
                "reason": "Adapt an explicitly extracted visible target without changing its model semantics.",
            }
        )
        claim_id = "claim.model-extraction." + sha256_bytes(
            normalized["id"].encode("utf-8")
        )[:12]
        claim = {
            "id": claim_id,
            "objectId": normalized["id"],
            "fieldPath": "name,type,parentRegionId,textBounds,controlBounds,safeActionRegion,state",
            "sourceType": "actual-agent-multimodal-extraction",
            "basis": raw_by_id[normalized["id"]]["claimBasis"],
            "evidenceRefs": [extraction_evidence["id"]],
        }
        revised["claimSources"].append(claim)
        changes.append(
            {
                "op": "add",
                "path": "/claimSources/-",
                "oldValue": "<missing>",
                "newValue": copy.deepcopy(claim),
                "reason": "Keep the added target traceable to the untouched extraction record.",
            }
        )

    raw_relations = raw_output.get("relations", [])
    _require(isinstance(raw_relations, list), "model extraction relations must be an array")
    relation_by_id = {relation["id"]: relation for relation in revised["relations"]}
    for index, raw_relation in enumerate(raw_relations):
        _require(isinstance(raw_relation, dict), f"rawOutput.relations[{index}] must be an object")
        for key in ("id", "kind", "from", "to", "basis"):
            _require_nonempty_string(raw_relation.get(key), f"rawOutput.relations[{index}].{key}")
        normalized_relation = {
            "id": raw_relation["id"],
            "kind": raw_relation["kind"],
            "from": raw_relation["from"],
            "to": raw_relation["to"],
            "source": {
                "type": "actual-agent-multimodal-extraction",
                "observationId": observation_id,
                "evidenceRefId": extraction_evidence["id"],
                "basis": raw_relation["basis"],
            },
        }
        existing = relation_by_id.get(normalized_relation["id"])
        if existing is not None:
            _require(
                all(existing.get(key) == normalized_relation[key] for key in ("kind", "from", "to")),
                f"model extraction relation {normalized_relation['id']!r} conflicts with the baseline",
            )
            continue
        revised["relations"].append(normalized_relation)
        relation_by_id[normalized_relation["id"]] = normalized_relation
        changed_ids.add(normalized_relation["id"])
        changes.append(
            {
                "op": "add",
                "path": "/relations/-",
                "oldValue": "<missing>",
                "newValue": copy.deepcopy(normalized_relation),
                "reason": "Adapt an explicit relation from the actual extraction.",
            }
        )

    displayed = sorted(
        target_id
        for target_id, raw_target in raw_by_id.items()
        if raw_target["reviewVisibility"] == "displayed"
    )
    hidden = sorted(set(raw_by_id) - set(displayed))
    review_scope = {
        "observationId": observation_id,
        "kind": scope["kind"],
        "description": scope["description"],
        "displayedTargetIds": displayed,
        "hiddenTargetIds": hidden,
        "hiddenReasons": {
            target_id: raw_by_id[target_id]["hiddenReason"]
            for target_id in hidden
        },
    }
    changes.append(
        {
            "op": "replace" if "reviewScope" in revised else "add",
            "path": "/reviewScope",
            "oldValue": copy.deepcopy(revised.get("reviewScope", "<missing>")),
            "newValue": copy.deepcopy(review_scope),
            "reason": "Make task display scope and every intentionally hidden target explicit.",
        }
    )
    revised["reviewScope"] = review_scope
    revised["normalization"] = {
        "kind": "strict-field-adaptation-of-actual-multimodal-extraction",
        "sourceEvidenceRef": extraction_evidence["id"],
        "sourceExtractedAt": extraction["extractedAt"],
        "semanticBoundary": "Existing target conflicts are rejected; unknowns and hidden targets are not filled or dropped.",
        "modelBlindness": producer.get("blindness", "unknown"),
    }
    maturity = revised.get("maturity")
    if isinstance(maturity, dict):
        maturity["modelExtraction"] = "actual-image-consumed"
        maturity["normalization"] = "complete"
        maturity["semanticReview"] = "pending"
        maturity["humanReview"] = "not-run"
    impact = {
        "status": "needs-revalidation",
        "changedObjectIds": sorted(changed_ids),
        "affected": {
            "views": ["raw-evidence", "overlay", "simplified", "review-html"],
            "geometryRules": [],
            "operations": [],
            "verifiers": [],
        },
        "conservative": False,
        "note": "Newly visible secondary targets and review scope require a new review bundle; operation conclusions are not promoted.",
    }
    revised["changeLog"].append(
        {
            "base": {
                "schemaVersion": profile["schemaVersion"],
                "revision": profile["revision"],
                "sha256": sha256_file(profile_path),
            },
            "revision": new_revision,
            "modifiedBy": {
                "kind": "actual-model-output-ingestion",
                "id": actor_id,
                "approval": "not-human-approval",
            },
            "changedAt": changed_at,
            "changes": changes,
            "impact": copy.deepcopy(impact),
            "scopeChangeAuthorizationRef": None,
        }
    )
    validate_profile(revised)
    _atomic_write_json(output_path, revised, force)
    impact["revisedProfileSha256"] = sha256_file(output_path)
    return revised, {
        "baseline": baseline_summary,
        "extractionSha256": extraction_evidence["sha256"],
        "targetCount": len(normalized_targets),
        "addedTargetIds": sorted(changed_ids & set(raw_by_id)),
        "reviewScope": review_scope,
        "impact": impact,
    }


def _load_critical_targets(scope_path: str | None, direct: Sequence[str]) -> list[str]:
    result = list(direct)
    if scope_path:
        scope = load_json(scope_path)
        _require(isinstance(scope, dict), "review scope must be an object")
        values = scope.get("criticalTargetIds")
        _require(isinstance(values, list) and all(isinstance(value, str) for value in values), "review scope criticalTargetIds must be an array of strings")
        result.extend(values)
    return sorted(set(result))


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_cmd = subparsers.add_parser("validate", help="validate an AppProfile v1.1+")
    validate_cmd.add_argument("--profile", required=True)

    render_cmd = subparsers.add_parser("render", help="generate and verify the four same-source review views")
    render_cmd.add_argument("--profile", required=True)
    render_cmd.add_argument("--output-dir", required=True)
    render_cmd.add_argument("--root", action="append", default=[], metavar="ID=DIR")
    render_cmd.add_argument("--observation-id")
    render_cmd.add_argument("--previous-profile")
    render_cmd.add_argument(
        "--copy-evidence",
        action="store_true",
        help="compatibility flag; original evidence is now always copied",
    )
    render_cmd.add_argument(
        "--show-relations",
        action="store_true",
        help="draw parent relation lines; hidden by default to keep targets legible",
    )
    render_cmd.add_argument("--force", action="store_true")

    verify_cmd = subparsers.add_parser("verify-bundle", help="reject incomplete, stale, or mixed-version view bundles")
    verify_cmd.add_argument("--profile", required=True)
    verify_cmd.add_argument("--bundle-dir", required=True)

    revise_cmd = subparsers.add_parser("revise", help="apply a baseline-bound revision into a new AppProfile")
    revise_cmd.add_argument("--profile", required=True)
    revise_cmd.add_argument("--patch", required=True)
    revise_cmd.add_argument("--output", required=True)
    revise_cmd.add_argument("--impact-output")
    revise_cmd.add_argument("--review-scope")
    revise_cmd.add_argument("--critical-target", action="append", default=[])
    revise_cmd.add_argument("--force", action="store_true")

    inject_cmd = subparsers.add_parser("inject", help="write an isolated deliberately faulty profile copy")
    inject_cmd.add_argument("--profile", required=True)
    inject_cmd.add_argument("--kind", required=True, choices=("invalid-rectangle", "dangling-reference", "unknown-to-false", "critical-downgrade"))
    inject_cmd.add_argument("--output", required=True)
    inject_cmd.add_argument("--force", action="store_true")

    ingest_cmd = subparsers.add_parser(
        "ingest-extraction",
        help="strictly adapt a preserved actual multimodal extraction into a new AppProfile revision",
    )
    ingest_cmd.add_argument("--profile", required=True)
    ingest_cmd.add_argument("--extraction", required=True)
    ingest_cmd.add_argument("--output", required=True)
    ingest_cmd.add_argument("--extraction-root-id", required=True)
    ingest_cmd.add_argument("--extraction-root", required=True)
    ingest_cmd.add_argument("--new-revision", required=True)
    ingest_cmd.add_argument("--changed-at", required=True)
    ingest_cmd.add_argument("--actor-id", required=True)
    ingest_cmd.add_argument("--force", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "validate":
            result = validate_profile(load_json(args.profile))
        elif args.command == "render":
            result = render_views(
                args.profile,
                args.output_dir,
                _parse_root_map(args.root),
                observation_id=args.observation_id,
                previous_profile_path=args.previous_profile,
                copy_evidence=args.copy_evidence,
                show_relations=args.show_relations,
                force=args.force,
            )
        elif args.command == "verify-bundle":
            result = verify_view_bundle(args.profile, args.bundle_dir)
        elif args.command == "revise":
            critical = _load_critical_targets(args.review_scope, args.critical_target)
            _, impact = revise_profile(args.profile, args.patch, args.output, critical_target_ids=critical, force=args.force)
            if args.impact_output:
                impact_path = Path(args.impact_output).resolve()
                reserved_paths = {
                    Path(args.profile).resolve(),
                    Path(args.patch).resolve(),
                    Path(args.output).resolve(),
                }
                _require(
                    impact_path not in reserved_paths,
                    "impact output must not overwrite the source profile, revision patch, or revised profile",
                )
                _atomic_write_json(impact_path, impact, args.force)
            result = impact
        elif args.command == "inject":
            result = {
                "kind": args.kind,
                "output": str(Path(args.output).resolve()),
                "profile": inject_error(args.profile, args.kind, args.output, force=args.force).get("testFaultInjection"),
            }
        elif args.command == "ingest-extraction":
            _, result = ingest_model_extraction(
                args.profile,
                args.extraction,
                args.output,
                extraction_root_id=args.extraction_root_id,
                extraction_root=args.extraction_root,
                new_revision=args.new_revision,
                changed_at=args.changed_at,
                actor_id=args.actor_id,
                force=args.force,
            )
        else:  # pragma: no cover - argparse guarantees a known command
            raise ReviewError(f"unsupported command: {args.command}")
    except ReviewError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps({"ok": True, "result": result}, ensure_ascii=False, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
