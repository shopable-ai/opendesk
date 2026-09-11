"use strict";

const OBSERVATION_SCHEMA_VERSION = "opendesk/observation-bundle/v1";
const PROFILE_SCHEMA_VERSION = "opendesk/collection-profile/v1";
const RESULT_SCHEMA_VERSION = "opendesk/collection-result/v1";

const SOURCES = new Set([
  "accessibility",
  "ocr",
  "layout",
  "image",
  "semantic-vision",
  "manual",
]);

const COVERAGE_STATUSES = new Set([
  "complete",
  "partial",
  "unavailable",
  "uncertain",
]);

const FORBIDDEN_PROFILE_FIELDS = new Set([
  "sender",
  "customerName",
  "orderPrice",
  "conversationTitle",
  "messageSender",
  "orderId",
  "price",
  "scrollStrategy",
  "paginationButton",
  "loadMoreAction",
  "traversal",
  "pagination",
  "scroll",
  "loadMore",
  "businessSchema",
  "jsonSchema",
]);

function fail(path, message) {
  throw new TypeError(`${path}: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, path) {
  if (!isObject(value)) {
    fail(path, "must be an object");
  }
  return value;
}

function requireArray(value, path) {
  if (!Array.isArray(value)) {
    fail(path, "must be an array");
  }
  return value;
}

function requireString(value, path) {
  if (typeof value !== "string" || value.length === 0) {
    fail(path, "must be a non-empty string");
  }
  return value;
}

function requireFinite(value, path) {
  if (!Number.isFinite(value)) {
    fail(path, "must be a finite number");
  }
  return value;
}

function requirePositive(value, path) {
  requireFinite(value, path);
  if (value <= 0) {
    fail(path, "must be greater than zero");
  }
  return value;
}

function assertAllowedKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      fail(`${path}.${key}`, "is not part of this contract");
    }
  }
}

function assertStringArray(value, path) {
  requireArray(value, path);
  value.forEach((entry, index) => requireString(entry, `${path}[${index}]`));
}

function assertRectangle(rectangle, path, coordinateSpaceIds) {
  requireObject(rectangle, path);
  assertAllowedKeys(
    rectangle,
    new Set(["x", "y", "width", "height", "coordinateSpace"]),
    path,
  );
  requireFinite(rectangle.x, `${path}.x`);
  requireFinite(rectangle.y, `${path}.y`);
  requirePositive(rectangle.width, `${path}.width`);
  requirePositive(rectangle.height, `${path}.height`);
  requireString(rectangle.coordinateSpace, `${path}.coordinateSpace`);
  if (coordinateSpaceIds && !coordinateSpaceIds.has(rectangle.coordinateSpace)) {
    fail(`${path}.coordinateSpace`, `references unknown coordinate space ${rectangle.coordinateSpace}`);
  }
}

function assertReferenceList(value, path, knownIds) {
  requireArray(value, path);
  value.forEach((entry, index) => {
    requireString(entry, `${path}[${index}]`);
    if (knownIds && !knownIds.has(entry)) {
      fail(`${path}[${index}]`, `references unknown id ${entry}`);
    }
  });
}

function assertJsonData(value, path, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail(path, "must not contain a non-finite JSON number");
    }
    return;
  }
  if (typeof value !== "object") {
    fail(path, `must contain only JSON data, not ${typeof value}`);
  }
  if (ancestors.has(value)) {
    fail(path, "must not contain a cyclic reference");
  }
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonData(entry, `${path}[${index}]`, nextAncestors));
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(path, "must be a plain JSON object");
  }
  Object.entries(value).forEach(([key, child]) => assertJsonData(child, `${path}.${key}`, nextAncestors));
}

function clone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw new TypeError(`value is not JSON serializable: ${error.message}`);
  }
}

function validateObservationBundle(bundle) {
  requireObject(bundle, "bundle");
  assertJsonData(bundle, "bundle");
  assertAllowedKeys(
    bundle,
    new Set([
      "schemaVersion",
      "id",
      "capturedAt",
      "scope",
      "coordinateSpaces",
      "sourceCoverage",
      "evidence",
      "observations",
    ]),
    "bundle",
  );
  if (bundle.schemaVersion !== OBSERVATION_SCHEMA_VERSION) {
    fail("bundle.schemaVersion", `must equal ${OBSERVATION_SCHEMA_VERSION}`);
  }
  requireString(bundle.id, "bundle.id");
  if (bundle.capturedAt !== undefined &&
      (typeof bundle.capturedAt !== "string" || !Number.isFinite(Date.parse(bundle.capturedAt)))) {
    fail("bundle.capturedAt", "must be an ISO-compatible date-time string");
  }

  const spaces = requireArray(bundle.coordinateSpaces, "bundle.coordinateSpaces");
  if (spaces.length === 0) {
    fail("bundle.coordinateSpaces", "must contain at least one coordinate space");
  }
  const coordinateSpaceIds = new Set();
  spaces.forEach((space, index) => {
    const path = `bundle.coordinateSpaces[${index}]`;
    requireObject(space, path);
    assertAllowedKeys(space, new Set(["id", "kind", "imageSize", "transformTo"]), path);
    requireString(space.id, `${path}.id`);
    if (coordinateSpaceIds.has(space.id)) {
      fail(`${path}.id`, `duplicate coordinate space ${space.id}`);
    }
    coordinateSpaceIds.add(space.id);
    if (!["screen-logical", "screen-physical", "window-logical", "image-pixel"].includes(space.kind)) {
      fail(`${path}.kind`, "is not a supported coordinate-space kind");
    }
    if (space.kind === "image-pixel") {
      requireObject(space.imageSize, `${path}.imageSize`);
      requirePositive(space.imageSize.width, `${path}.imageSize.width`);
      requirePositive(space.imageSize.height, `${path}.imageSize.height`);
    }
    if (space.transformTo !== undefined) {
      requireObject(space.transformTo, `${path}.transformTo`);
      assertAllowedKeys(
        space.transformTo,
        new Set(["coordinateSpace", "scale", "offset", "evidenceRefs"]),
        `${path}.transformTo`,
      );
      requireString(space.transformTo.coordinateSpace, `${path}.transformTo.coordinateSpace`);
      for (const vectorName of ["scale", "offset"]) {
        const vector = requireObject(space.transformTo[vectorName], `${path}.transformTo.${vectorName}`);
        assertAllowedKeys(vector, new Set(["x", "y"]), `${path}.transformTo.${vectorName}`);
        requireFinite(vector.x, `${path}.transformTo.${vectorName}.x`);
        requireFinite(vector.y, `${path}.transformTo.${vectorName}.y`);
      }
      if (space.transformTo.scale.x === 0 || space.transformTo.scale.y === 0) {
        fail(`${path}.transformTo.scale`, "must not contain a zero scale");
      }
      assertReferenceList(space.transformTo.evidenceRefs, `${path}.transformTo.evidenceRefs`);
    }
  });

  const scope = requireObject(bundle.scope, "bundle.scope");
  assertAllowedKeys(scope, new Set(["id", "kind", "bounds"]), "bundle.scope");
  requireString(scope.id, "bundle.scope.id");
  if (!["window", "region", "image"].includes(scope.kind)) {
    fail("bundle.scope.kind", "must be window, region, or image");
  }
  assertRectangle(scope.bounds, "bundle.scope.bounds", coordinateSpaceIds);

  const evidence = requireArray(bundle.evidence, "bundle.evidence");
  const evidenceById = new Map();
  evidence.forEach((entry, index) => {
    const path = `bundle.evidence[${index}]`;
    requireObject(entry, path);
    assertAllowedKeys(entry, new Set(["id", "source", "kind", "description", "artifact", "metadata"]), path);
    requireString(entry.id, `${path}.id`);
    if (evidenceById.has(entry.id)) {
      fail(`${path}.id`, `duplicate evidence id ${entry.id}`);
    }
    if (!SOURCES.has(entry.source)) {
      fail(`${path}.source`, "is not a supported observation source");
    }
    requireString(entry.kind, `${path}.kind`);
    requireString(entry.description, `${path}.description`);
    if (entry.artifact !== undefined) {
      requireObject(entry.artifact, `${path}.artifact`);
      assertAllowedKeys(entry.artifact, new Set(["path", "sha256"]), `${path}.artifact`);
      requireString(entry.artifact.path, `${path}.artifact.path`);
      if (entry.artifact.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(entry.artifact.sha256)) {
        fail(`${path}.artifact.sha256`, "must be a lowercase SHA-256 digest");
      }
    }
    if (entry.metadata !== undefined) {
      requireObject(entry.metadata, `${path}.metadata`);
    }
    evidenceById.set(entry.id, entry);
  });

  spaces.forEach((space, index) => {
    if (space.transformTo !== undefined) {
      const path = `bundle.coordinateSpaces[${index}].transformTo`;
      if (!coordinateSpaceIds.has(space.transformTo.coordinateSpace)) {
        fail(`${path}.coordinateSpace`, `references unknown coordinate space ${space.transformTo.coordinateSpace}`);
      }
      assertReferenceList(space.transformTo.evidenceRefs, `${path}.evidenceRefs`, new Set(evidenceById.keys()));
    }
  });

  const coverage = requireArray(bundle.sourceCoverage, "bundle.sourceCoverage");
  if (coverage.length === 0) {
    fail("bundle.sourceCoverage", "must contain at least one source status");
  }
  const coveredSources = new Set();
  coverage.forEach((entry, index) => {
    const path = `bundle.sourceCoverage[${index}]`;
    requireObject(entry, path);
    assertAllowedKeys(entry, new Set(["source", "status", "reason", "evidenceRefs"]), path);
    if (!SOURCES.has(entry.source)) {
      fail(`${path}.source`, "is not a supported observation source");
    }
    if (coveredSources.has(entry.source)) {
      fail(`${path}.source`, `duplicate coverage declaration for ${entry.source}`);
    }
    coveredSources.add(entry.source);
    if (!COVERAGE_STATUSES.has(entry.status)) {
      fail(`${path}.status`, "is not a supported coverage status");
    }
    if (entry.status !== "complete") {
      requireString(entry.reason, `${path}.reason`);
    }
    assertReferenceList(entry.evidenceRefs, `${path}.evidenceRefs`, new Set(evidenceById.keys()));
    entry.evidenceRefs.forEach((id) => {
      if (evidenceById.get(id).source !== entry.source) {
        fail(`${path}.evidenceRefs`, `evidence ${id} belongs to ${evidenceById.get(id).source}`);
      }
    });
  });

  const observations = requireArray(bundle.observations, "bundle.observations");
  const observationById = new Map();
  observations.forEach((observation, index) => {
    const path = `bundle.observations[${index}]`;
    requireObject(observation, path);
    assertAllowedKeys(
      observation,
      new Set([
        "id",
        "source",
        "kind",
        "role",
        "text",
        "value",
        "bounds",
        "states",
        "confidence",
        "native",
        "metadata",
        "evidenceRefs",
        "unknowns",
        "conflicts",
      ]),
      path,
    );
    requireString(observation.id, `${path}.id`);
    if (observationById.has(observation.id)) {
      fail(`${path}.id`, `duplicate observation id ${observation.id}`);
    }
    if (!SOURCES.has(observation.source)) {
      fail(`${path}.source`, "is not a supported observation source");
    }
    requireString(observation.kind, `${path}.kind`);
    if (observation.role !== undefined) {
      requireString(observation.role, `${path}.role`);
    }
    if (observation.text !== undefined && typeof observation.text !== "string") {
      fail(`${path}.text`, "must be a string");
    }
    if (["layout", "image"].includes(observation.source) && ("text" in observation || "value" in observation)) {
      fail(path, `${observation.source} observations may only declare observed structure`);
    }
    if (observation.source === "ocr" && "value" in observation) {
      fail(`${path}.value`, "OCR content must remain source-labelled text, not a native value");
    }
    if (observation.bounds !== undefined) {
      assertRectangle(observation.bounds, `${path}.bounds`, coordinateSpaceIds);
    }
    if (observation.native !== undefined) {
      if (observation.source !== "accessibility") {
        fail(`${path}.native`, "native metadata is only valid for accessibility observations");
      }
      requireObject(observation.native, `${path}.native`);
      assertAllowedKeys(observation.native, new Set(["role", "parentId", "backend", "metadata"]), `${path}.native`);
      if (observation.native.role !== undefined) {
        requireString(observation.native.role, `${path}.native.role`);
      }
      if (observation.native.parentId !== undefined) {
        requireString(observation.native.parentId, `${path}.native.parentId`);
      }
      if (observation.native.backend !== undefined && !["ax", "uia", "atspi", "other"].includes(observation.native.backend)) {
        fail(`${path}.native.backend`, "is not supported");
      }
      if (observation.native.metadata !== undefined) {
        requireObject(observation.native.metadata, `${path}.native.metadata`);
      }
    }
    if (observation.metadata !== undefined) {
      requireObject(observation.metadata, `${path}.metadata`);
    }

    requireArray(observation.states, `${path}.states`).forEach((state, stateIndex) => {
      const statePath = `${path}.states[${stateIndex}]`;
      requireObject(state, statePath);
      requireString(state.name, `${statePath}.name`);
      if (state.status === "known") {
        assertAllowedKeys(state, new Set(["name", "status", "value"]), statePath);
        if (!("value" in state)) {
          fail(`${statePath}.value`, "is required for a known state");
        }
      } else if (state.status === "unknown") {
        assertAllowedKeys(state, new Set(["name", "status", "reason"]), statePath);
        requireString(state.reason, `${statePath}.reason`);
      } else {
        fail(`${statePath}.status`, "must be known or unknown");
      }
    });

    if (observation.confidence !== undefined) {
      const confidence = requireObject(observation.confidence, `${path}.confidence`);
      assertAllowedKeys(confidence, new Set(["value", "scale", "provider", "evidenceRef"]), `${path}.confidence`);
      requireFinite(confidence.value, `${path}.confidence.value`);
      if (confidence.scale !== "provider-specific") {
        fail(`${path}.confidence.scale`, "must be provider-specific; cross-source global confidence is not supported");
      }
      requireString(confidence.provider, `${path}.confidence.provider`);
      requireString(confidence.evidenceRef, `${path}.confidence.evidenceRef`);
    }

    assertReferenceList(observation.evidenceRefs, `${path}.evidenceRefs`, new Set(evidenceById.keys()));
    if (observation.evidenceRefs.length === 0) {
      fail(`${path}.evidenceRefs`, "must preserve at least one source evidence reference");
    }
    observation.evidenceRefs.forEach((id) => {
      if (evidenceById.get(id).source !== observation.source) {
        fail(`${path}.evidenceRefs`, `evidence ${id} belongs to ${evidenceById.get(id).source}`);
      }
    });
    if (observation.confidence !== undefined) {
      const confidenceEvidence = evidenceById.get(observation.confidence.evidenceRef);
      if (!confidenceEvidence || confidenceEvidence.source !== observation.source) {
        fail(`${path}.confidence.evidenceRef`, "must reference evidence from the same source");
      }
    }

    requireArray(observation.unknowns, `${path}.unknowns`).forEach((unknown, unknownIndex) => {
      const unknownPath = `${path}.unknowns[${unknownIndex}]`;
      requireObject(unknown, unknownPath);
      assertAllowedKeys(unknown, new Set(["field", "reason"]), unknownPath);
      requireString(unknown.field, `${unknownPath}.field`);
      requireString(unknown.reason, `${unknownPath}.reason`);
    });
    requireArray(observation.conflicts, `${path}.conflicts`).forEach((conflict, conflictIndex) => {
      const conflictPath = `${path}.conflicts[${conflictIndex}]`;
      requireObject(conflict, conflictPath);
      assertAllowedKeys(conflict, new Set(["field", "withObservationId", "reason"]), conflictPath);
      requireString(conflict.field, `${conflictPath}.field`);
      requireString(conflict.withObservationId, `${conflictPath}.withObservationId`);
      requireString(conflict.reason, `${conflictPath}.reason`);
    });
    observationById.set(observation.id, observation);
  });

  observations.forEach((observation, index) => {
    const path = `bundle.observations[${index}]`;
    if (observation.native && observation.native.parentId && !observationById.has(observation.native.parentId)) {
      fail(`${path}.native.parentId`, `references unknown observation ${observation.native.parentId}`);
    }
    observation.conflicts.forEach((conflict, conflictIndex) => {
      if (!observationById.has(conflict.withObservationId)) {
        fail(`${path}.conflicts[${conflictIndex}].withObservationId`, `references unknown observation ${conflict.withObservationId}`);
      }
    });
  });

  clone(bundle);
  return bundle;
}

function visitProfileFields(value, path) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visitProfileFields(entry, `${path}[${index}]`));
    return;
  }
  if (!isObject(value)) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PROFILE_FIELDS.has(key)) {
      fail(`${path}.${key}`, "business mapping and traversal are outside CollectionProfile");
    }
    visitProfileFields(child, `${path}.${key}`);
  }
}

function assertSelector(selector, path) {
  requireObject(selector, path);
  assertAllowedKeys(selector, new Set(["sources", "kinds", "roles"]), path);
  if (selector.sources !== undefined) {
    requireArray(selector.sources, `${path}.sources`).forEach((source, index) => {
      if (!SOURCES.has(source)) {
        fail(`${path}.sources[${index}]`, "is not a supported observation source");
      }
    });
  }
  if (selector.kinds !== undefined) {
    assertStringArray(selector.kinds, `${path}.kinds`);
  }
  if (selector.roles !== undefined) {
    assertStringArray(selector.roles, `${path}.roles`);
  }
  if (selector.sources === undefined && selector.kinds === undefined && selector.roles === undefined) {
    fail(path, "must declare at least one source, kind, or role");
  }
}

function validateCollectionProfile(profile) {
  requireObject(profile, "profile");
  assertJsonData(profile, "profile");
  visitProfileFields(profile, "profile");
  assertAllowedKeys(
    profile,
    new Set([
      "schemaVersion",
      "id",
      "revision",
      "applicability",
      "collectionKind",
      "axis",
      "region",
      "nativeRoleHints",
      "itemGeometry",
      "repeatPattern",
      "separator",
      "spacing",
      "layoutConstraints",
      "validation",
    ]),
    "profile",
  );
  if (profile.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    fail("profile.schemaVersion", `must equal ${PROFILE_SCHEMA_VERSION}`);
  }
  requireString(profile.id, "profile.id");
  if (!Number.isInteger(profile.revision) || profile.revision < 1) {
    fail("profile.revision", "must be a positive integer");
  }
  const applicability = requireObject(profile.applicability, "profile.applicability");
  assertAllowedKeys(applicability, new Set(["apps", "pages", "layouts"]), "profile.applicability");
  for (const key of ["apps", "pages", "layouts"]) {
    assertStringArray(applicability[key], `profile.applicability.${key}`);
  }
  if (!["list", "table", "timeline", "grid", "cards", "tree"].includes(profile.collectionKind)) {
    fail("profile.collectionKind", "is not supported");
  }
  if (!["vertical", "horizontal"].includes(profile.axis)) {
    fail("profile.axis", "must be vertical or horizontal");
  }
  const region = requireObject(profile.region, "profile.region");
  assertAllowedKeys(region, new Set(["bounds"]), "profile.region");
  assertRectangle(region.bounds, "profile.region.bounds");

  const hints = requireObject(profile.nativeRoleHints, "profile.nativeRoleHints");
  assertAllowedKeys(hints, new Set(["containerRoles", "itemRoles"]), "profile.nativeRoleHints");
  assertStringArray(hints.containerRoles, "profile.nativeRoleHints.containerRoles");
  assertStringArray(hints.itemRoles, "profile.nativeRoleHints.itemRoles");

  const geometry = requireObject(profile.itemGeometry, "profile.itemGeometry");
  assertAllowedKeys(
    geometry,
    new Set(["minPrimarySize", "maxPrimarySize", "minCrossSize", "maxCrossSize", "minCrossAxisOverlapRatio"]),
    "profile.itemGeometry",
  );
  for (const key of ["minPrimarySize", "maxPrimarySize", "minCrossSize", "maxCrossSize"]) {
    if (geometry[key] !== undefined) {
      requirePositive(geometry[key], `profile.itemGeometry.${key}`);
    }
  }
  if (geometry.minCrossAxisOverlapRatio !== undefined &&
      (!Number.isFinite(geometry.minCrossAxisOverlapRatio) || geometry.minCrossAxisOverlapRatio < 0 || geometry.minCrossAxisOverlapRatio > 1)) {
    fail("profile.itemGeometry.minCrossAxisOverlapRatio", "must be between zero and one");
  }

  const repeat = requireObject(profile.repeatPattern, "profile.repeatPattern");
  assertAllowedKeys(repeat, new Set(["strategy", "anchor", "minOccurrences"]), "profile.repeatPattern");
  if (!["native-roots", "anchor-bounds", "separator-bands"].includes(repeat.strategy)) {
    fail("profile.repeatPattern.strategy", "is not supported");
  }
  if (!Number.isInteger(repeat.minOccurrences) || repeat.minOccurrences < 1) {
    fail("profile.repeatPattern.minOccurrences", "must be a positive integer");
  }
  if (repeat.anchor !== undefined) {
    assertSelector(repeat.anchor, "profile.repeatPattern.anchor");
  }
  if (repeat.strategy === "anchor-bounds" && repeat.anchor === undefined) {
    fail("profile.repeatPattern.anchor", "is required for anchor-bounds");
  }
  if (repeat.strategy === "native-roots" && hints.itemRoles.length === 0) {
    fail("profile.nativeRoleHints.itemRoles", "is required for native-roots");
  }
  if (profile.separator !== undefined) {
    assertSelector(profile.separator, "profile.separator");
  }
  if (repeat.strategy === "separator-bands" && profile.separator === undefined) {
    fail("profile.separator", "is required for separator-bands");
  }

  const spacing = requireObject(profile.spacing, "profile.spacing");
  assertAllowedKeys(spacing, new Set(["min", "max"]), "profile.spacing");
  for (const key of ["min", "max"]) {
    if (spacing[key] !== undefined && (!Number.isFinite(spacing[key]) || spacing[key] < 0)) {
      fail(`profile.spacing.${key}`, "must be a non-negative finite number");
    }
  }
  if (spacing.min !== undefined && spacing.max !== undefined && spacing.min > spacing.max) {
    fail("profile.spacing", "min must not exceed max");
  }

  const layout = requireObject(profile.layoutConstraints, "profile.layoutConstraints");
  assertAllowedKeys(layout, new Set(["allowVariablePrimarySize", "requiredObservationKinds"]), "profile.layoutConstraints");
  if (typeof layout.allowVariablePrimarySize !== "boolean") {
    fail("profile.layoutConstraints.allowVariablePrimarySize", "must be boolean");
  }
  assertStringArray(layout.requiredObservationKinds, "profile.layoutConstraints.requiredObservationKinds");

  const validation = requireObject(profile.validation, "profile.validation");
  assertAllowedKeys(
    validation,
    new Set([
      "minItems",
      "requiredPerItem",
      "prohibitObservationReuse",
      "compareCompleteStructuralSources",
      "conflictPolicy",
      "coverage",
    ]),
    "profile.validation",
  );
  if (!Number.isInteger(validation.minItems) || validation.minItems < 1) {
    fail("profile.validation.minItems", "must be a positive integer");
  }
  requireArray(validation.requiredPerItem, "profile.validation.requiredPerItem").forEach((requirement, index) => {
    const path = `profile.validation.requiredPerItem[${index}]`;
    requireObject(requirement, path);
    assertAllowedKeys(requirement, new Set(["source", "kind", "role", "min"]), path);
    if (requirement.source !== undefined && !SOURCES.has(requirement.source)) {
      fail(`${path}.source`, "is not a supported observation source");
    }
    if (requirement.kind !== undefined) {
      requireString(requirement.kind, `${path}.kind`);
    }
    if (requirement.role !== undefined) {
      requireString(requirement.role, `${path}.role`);
    }
    if (requirement.source === undefined && requirement.kind === undefined && requirement.role === undefined) {
      fail(path, "must select at least one source, kind, or role");
    }
    if (!Number.isInteger(requirement.min) || requirement.min < 1) {
      fail(`${path}.min`, "must be a positive integer");
    }
  });
  if (validation.prohibitObservationReuse !== true) {
    fail("profile.validation.prohibitObservationReuse", "must be true in v1");
  }
  if (typeof validation.compareCompleteStructuralSources !== "boolean") {
    fail("profile.validation.compareCompleteStructuralSources", "must be boolean");
  }
  if (validation.conflictPolicy !== "uncertain") {
    fail("profile.validation.conflictPolicy", "must fail closed as uncertain in v1");
  }
  const coverage = requireObject(validation.coverage, "profile.validation.coverage");
  assertAllowedKeys(coverage, new Set(["completeSources"]), "profile.validation.coverage");
  const completeSources = requireArray(coverage.completeSources, "profile.validation.coverage.completeSources");
  if (completeSources.length === 0) {
    fail("profile.validation.coverage.completeSources", "must contain at least one source");
  }
  completeSources.forEach((source, index) => {
    if (!SOURCES.has(source)) {
      fail(`profile.validation.coverage.completeSources[${index}]`, "is not a supported observation source");
    }
  });

  clone(profile);
  return profile;
}

function coordinateSpaceById(bundle, id) {
  return bundle.coordinateSpaces.find((space) => space.id === id);
}

function mapRectangleToScope(rectangle, bundle) {
  const targetSpace = bundle.scope.bounds.coordinateSpace;
  if (rectangle.coordinateSpace === targetSpace) {
    return clone(rectangle);
  }
  const sourceSpace = coordinateSpaceById(bundle, rectangle.coordinateSpace);
  if (!sourceSpace || !sourceSpace.transformTo || sourceSpace.transformTo.coordinateSpace !== targetSpace) {
    fail(
      "rectangle.coordinateSpace",
      `cannot map ${rectangle.coordinateSpace} directly to scope coordinate space ${targetSpace}`,
    );
  }
  const { scale, offset } = sourceSpace.transformTo;
  const firstX = rectangle.x * scale.x + offset.x;
  const secondX = (rectangle.x + rectangle.width) * scale.x + offset.x;
  const firstY = rectangle.y * scale.y + offset.y;
  const secondY = (rectangle.y + rectangle.height) * scale.y + offset.y;
  return {
    x: Math.min(firstX, secondX),
    y: Math.min(firstY, secondY),
    width: Math.abs(secondX - firstX),
    height: Math.abs(secondY - firstY),
    coordinateSpace: targetSpace,
  };
}

function selectorMatches(observation, selector) {
  if (selector.sources && !selector.sources.includes(observation.source)) {
    return false;
  }
  if (selector.kinds && !selector.kinds.includes(observation.kind)) {
    return false;
  }
  if (selector.roles && !selector.roles.includes(observation.role)) {
    return false;
  }
  return true;
}

function roleOf(observation) {
  return observation.role || (observation.native && observation.native.role);
}

function primaryStart(rectangle, axis) {
  return axis === "vertical" ? rectangle.y : rectangle.x;
}

function primarySize(rectangle, axis) {
  return axis === "vertical" ? rectangle.height : rectangle.width;
}

function crossStart(rectangle, axis) {
  return axis === "vertical" ? rectangle.x : rectangle.y;
}

function crossSize(rectangle, axis) {
  return axis === "vertical" ? rectangle.width : rectangle.height;
}

function compareRectangles(left, right, axis, leftId = "", rightId = "") {
  return (
    primaryStart(left, axis) - primaryStart(right, axis) ||
    crossStart(left, axis) - crossStart(right, axis) ||
    primarySize(left, axis) - primarySize(right, axis) ||
    crossSize(left, axis) - crossSize(right, axis) ||
    leftId.localeCompare(rightId)
  );
}

function pointInside(rectangle, x, y) {
  return (
    x >= rectangle.x &&
    x < rectangle.x + rectangle.width &&
    y >= rectangle.y &&
    y < rectangle.y + rectangle.height
  );
}

function rectangleInside(inner, outer, epsilon = 1e-6) {
  return (
    inner.x >= outer.x - epsilon &&
    inner.y >= outer.y - epsilon &&
    inner.x + inner.width <= outer.x + outer.width + epsilon &&
    inner.y + inner.height <= outer.y + outer.height + epsilon
  );
}

function observationElement(observation, normalizedBounds) {
  const element = {
    observationId: observation.id,
    source: observation.source,
    kind: observation.kind,
  };
  for (const key of ["role", "text", "value", "confidence", "native", "metadata"]) {
    if (observation[key] !== undefined) {
      element[key] = clone(observation[key]);
    }
  }
  if (normalizedBounds) {
    element.bounds = normalizedBounds;
  }
  element.states = clone(observation.states);
  element.evidenceRefs = clone(observation.evidenceRefs);
  element.unknowns = clone(observation.unknowns);
  element.conflicts = clone(observation.conflicts);
  return element;
}

function separatorCandidates(bundle, profile, observationsWithBounds) {
  const region = mapRectangleToScope(profile.region.bounds, bundle);
  const separators = observationsWithBounds
    .filter(({ observation }) => selectorMatches(observation, profile.separator))
    .sort((left, right) => compareRectangles(left.bounds, right.bounds, profile.axis, left.observation.id, right.observation.id));
  const regionStart = primaryStart(region, profile.axis);
  const regionEnd = regionStart + primarySize(region, profile.axis);
  const cuts = separators
    .map(({ bounds }) => primaryStart(bounds, profile.axis) + primarySize(bounds, profile.axis) / 2)
    .filter((cut) => cut > regionStart && cut < regionEnd);
  const boundaries = [regionStart, ...cuts, regionEnd];
  const candidates = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end <= start) {
      continue;
    }
    const bounds = profile.axis === "vertical"
      ? { x: region.x, y: start, width: region.width, height: end - start, coordinateSpace: region.coordinateSpace }
      : { x: start, y: region.y, width: end - start, height: region.height, coordinateSpace: region.coordinateSpace };
    candidates.push({ rootObservationId: null, bounds, observationIds: new Set(), warnings: [] });
  }
  return candidates;
}

function segmentCollection(bundle, profile) {
  validateObservationBundle(bundle);
  validateCollectionProfile(profile);
  const scopeSpace = bundle.scope.bounds.coordinateSpace;
  if (profile.region.bounds.coordinateSpace !== scopeSpace) {
    const profileSpace = coordinateSpaceById(bundle, profile.region.bounds.coordinateSpace);
    if (!profileSpace || !profileSpace.transformTo || profileSpace.transformTo.coordinateSpace !== scopeSpace) {
      fail("profile.region.bounds.coordinateSpace", "must be the scope space or have an explicit transform to it");
    }
  }
  const region = mapRectangleToScope(profile.region.bounds, bundle);
  if (!rectangleInside(region, bundle.scope.bounds)) {
    fail("profile.region.bounds", "must stay inside the observed current-viewport scope");
  }
  const normalizedById = new Map();
  const observationsWithBounds = [];
  bundle.observations.forEach((observation) => {
    if (observation.bounds) {
      const bounds = mapRectangleToScope(observation.bounds, bundle);
      normalizedById.set(observation.id, bounds);
      observationsWithBounds.push({ observation, bounds });
    }
  });

  let candidates;
  if (profile.repeatPattern.strategy === "native-roots") {
    candidates = observationsWithBounds
      .filter(({ observation }) =>
        observation.source === "accessibility" && profile.nativeRoleHints.itemRoles.includes(roleOf(observation)),
      )
      .map(({ observation, bounds }) => ({
        rootObservationId: observation.id,
        bounds,
        observationIds: new Set([observation.id]),
        warnings: [],
      }));
  } else if (profile.repeatPattern.strategy === "anchor-bounds") {
    candidates = observationsWithBounds
      .filter(({ observation }) => selectorMatches(observation, profile.repeatPattern.anchor))
      .map(({ observation, bounds }) => ({
        rootObservationId: observation.id,
        bounds,
        observationIds: new Set([observation.id]),
        warnings: [],
      }));
  } else {
    candidates = separatorCandidates(bundle, profile, observationsWithBounds);
  }

  const rejectedCandidates = candidates.filter((candidate) => !rectangleInside(candidate.bounds, region));
  candidates = candidates
    .filter((candidate) => rectangleInside(candidate.bounds, region))
    .sort((left, right) => compareRectangles(left.bounds, right.bounds, profile.axis, left.rootObservationId || "", right.rootObservationId || ""));

  const observationById = new Map(bundle.observations.map((observation) => [observation.id, observation]));
  const candidateByRootId = new Map(
    candidates.filter((candidate) => candidate.rootObservationId).map((candidate) => [candidate.rootObservationId, candidate]),
  );
  const unassignedObservationIds = rejectedCandidates
    .map((candidate) => candidate.rootObservationId)
    .filter(Boolean);
  const issues = rejectedCandidates.map((candidate) => ({
    code: "CANDIDATE_OUTSIDE_COLLECTION_REGION",
    severity: "warning",
    message: `candidate ${candidate.rootObservationId || "separator band"} is not wholly inside the collection region`,
    ...(candidate.rootObservationId ? { observationIds: [candidate.rootObservationId] } : {}),
  }));

  function nativeCandidate(observation) {
    let parentId = observation.native && observation.native.parentId;
    const visited = new Set();
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      if (candidateByRootId.has(parentId)) {
        return candidateByRootId.get(parentId);
      }
      const parent = observationById.get(parentId);
      parentId = parent && parent.native && parent.native.parentId;
    }
    return null;
  }

  for (const { observation, bounds } of observationsWithBounds) {
    if (candidateByRootId.has(observation.id)) {
      continue;
    }
    if (observation.kind === "container" || profile.nativeRoleHints.containerRoles.includes(roleOf(observation))) {
      continue;
    }
    if (observation.kind === "separator") {
      continue;
    }
    const byNativeHierarchy = nativeCandidate(observation);
    if (byNativeHierarchy) {
      byNativeHierarchy.observationIds.add(observation.id);
      continue;
    }
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const containing = candidates.filter((candidate) => pointInside(candidate.bounds, centerX, centerY));
    if (containing.length === 1) {
      containing[0].observationIds.add(observation.id);
    } else if (containing.length > 1) {
      unassignedObservationIds.push(observation.id);
      issues.push({
        code: "AMBIGUOUS_ASSOCIATION",
        severity: "error",
        message: `observation ${observation.id} intersects more than one proposed item`,
        observationIds: [observation.id],
      });
    } else if (rectangleInside(bounds, region) && observation.kind !== "separator") {
      unassignedObservationIds.push(observation.id);
    }
  }

  const items = candidates.map((candidate, index) => {
    const elements = Array.from(candidate.observationIds)
      .map((id) => ({ observation: observationById.get(id), bounds: normalizedById.get(id) }))
      .sort((left, right) => compareRectangles(
        left.bounds || candidate.bounds,
        right.bounds || candidate.bounds,
        profile.axis,
        left.observation.id,
        right.observation.id,
      ))
      .map(({ observation, bounds }) => observationElement(observation, bounds));
    const nativeElements = elements.filter((element) => element.source === "accessibility");
    const rootObservationIds = nativeElements
      .filter((element) => profile.nativeRoleHints.itemRoles.includes(roleOf(observationById.get(element.observationId))))
      .map((element) => element.observationId);
    const states = [];
    const unknowns = [];
    for (const element of elements) {
      for (const state of element.states) {
        states.push({ ...clone(state), observationId: element.observationId });
        if (state.status === "unknown") {
          unknowns.push({
            field: `states.${state.name}`,
            reason: state.reason,
            observationId: element.observationId,
          });
        }
      }
      for (const unknown of element.unknowns) {
        unknowns.push({ ...clone(unknown), observationId: element.observationId });
      }
    }
    const evidenceRefs = Array.from(new Set(elements.flatMap((element) => element.evidenceRefs))).sort();
    return {
      index,
      bounds: clone(candidate.bounds),
      elements,
      nativeStructure: {
        rootObservationIds,
        observationIds: nativeElements.map((element) => element.observationId),
      },
      states,
      evidenceRefs,
      warnings: clone(candidate.warnings),
      unknowns,
    };
  });

  return {
    profileId: profile.id,
    axis: profile.axis,
    items,
    unassignedObservationIds,
    issues,
  };
}

function issue(code, severity, message, details = {}) {
  return { code, severity, message, ...details };
}

function structuralCounts(bundle, profile) {
  const idsBySource = new Map();
  function add(source, id) {
    if (!idsBySource.has(source)) {
      idsBySource.set(source, new Set());
    }
    idsBySource.get(source).add(id);
  }
  bundle.observations.forEach((observation) => {
    if (
      observation.source === "accessibility" &&
      profile.nativeRoleHints.itemRoles.includes(roleOf(observation))
    ) {
      add(observation.source, observation.id);
    }
    if (profile.repeatPattern.anchor && selectorMatches(observation, profile.repeatPattern.anchor)) {
      add(observation.source, observation.id);
    }
  });
  return new Map(Array.from(idsBySource, ([source, ids]) => [source, ids.size]));
}

function requirementMatches(element, requirement) {
  return (
    (requirement.source === undefined || element.source === requirement.source) &&
    (requirement.kind === undefined || element.kind === requirement.kind) &&
    (requirement.role === undefined || element.role === requirement.role)
  );
}

function validateCollection(bundle, profile, segmentation) {
  validateObservationBundle(bundle);
  validateCollectionProfile(profile);
  requireObject(segmentation, "segmentation");
  if (segmentation.profileId !== profile.id) {
    fail("segmentation.profileId", "does not match the CollectionProfile");
  }
  const issues = clone(segmentation.issues || []);
  const items = requireArray(segmentation.items, "segmentation.items");
  const region = mapRectangleToScope(profile.region.bounds, bundle);
  if (!rectangleInside(region, bundle.scope.bounds)) {
    fail("profile.region.bounds", "must stay inside the observed current-viewport scope");
  }
  const usedObservationIds = new Map();
  const originalObservationById = new Map(bundle.observations.map((observation) => [observation.id, observation]));
  const evidenceById = new Map(bundle.evidence.map((entry) => [entry.id, entry]));
  const conflictedObservationIds = new Set();

  if (items.length < profile.validation.minItems || items.length < profile.repeatPattern.minOccurrences) {
    issues.push(issue(
      "REPEAT_PATTERN_NOT_MET",
      "error",
      `proposed ${items.length} items; profile requires at least ${Math.max(profile.validation.minItems, profile.repeatPattern.minOccurrences)}`,
    ));
  }

  let previous;
  let firstPrimarySize;
  items.forEach((item, index) => {
    if (!Number.isInteger(item.index) || item.index !== index) {
      issues.push(issue("INVALID_ITEM_INDEX", "error", "item index must express current reading order only", { itemIndexes: [index] }));
    }
    try {
      assertRectangle(item.bounds, `segmentation.items[${index}].bounds`, new Set([region.coordinateSpace]));
    } catch (error) {
      issues.push(issue("INVALID_ITEM_BOUNDS", "error", error.message, { itemIndexes: [index] }));
    }
    if (!rectangleInside(item.bounds, region)) {
      issues.push(issue("ITEM_OUTSIDE_COLLECTION_REGION", "error", `item ${index} is outside the collection region`, { itemIndexes: [index] }));
    }
    if (previous) {
      if (compareRectangles(previous.bounds, item.bounds, profile.axis) > 0) {
        issues.push(issue("ITEM_ORDER_INVALID", "error", `item ${index} is out of ${profile.axis} reading order`, { itemIndexes: [index - 1, index] }));
      }
      const gap = primaryStart(item.bounds, profile.axis) -
        (primaryStart(previous.bounds, profile.axis) + primarySize(previous.bounds, profile.axis));
      if (gap < -1e-6) {
        issues.push(issue("ITEM_OVERLAP", "error", `items ${index - 1} and ${index} overlap on the primary axis`, { itemIndexes: [index - 1, index] }));
      } else if (profile.spacing.min !== undefined && gap < profile.spacing.min - 1e-6) {
        issues.push(issue("SPACING_CONSTRAINT_NOT_MET", "error", `gap before item ${index} is below profile minimum`, { itemIndexes: [index - 1, index] }));
      } else if (profile.spacing.max !== undefined && gap > profile.spacing.max + 1e-6) {
        issues.push(issue("SPACING_CONSTRAINT_NOT_MET", "error", `gap before item ${index} exceeds profile maximum`, { itemIndexes: [index - 1, index] }));
      }
      if (profile.itemGeometry.minCrossAxisOverlapRatio !== undefined) {
        const previousCrossStart = crossStart(previous.bounds, profile.axis);
        const itemCrossStart = crossStart(item.bounds, profile.axis);
        const overlap = Math.max(
          0,
          Math.min(
            previousCrossStart + crossSize(previous.bounds, profile.axis),
            itemCrossStart + crossSize(item.bounds, profile.axis),
          ) - Math.max(previousCrossStart, itemCrossStart),
        );
        const ratio = overlap / Math.min(
          crossSize(previous.bounds, profile.axis),
          crossSize(item.bounds, profile.axis),
        );
        if (ratio + 1e-6 < profile.itemGeometry.minCrossAxisOverlapRatio) {
          issues.push(issue(
            "CROSS_AXIS_ALIGNMENT_NOT_MET",
            "error",
            `items ${index - 1} and ${index} do not meet the cross-axis overlap ratio`,
            { itemIndexes: [index - 1, index] },
          ));
        }
      }
    }
    previous = item;

    const itemPrimary = primarySize(item.bounds, profile.axis);
    const itemCross = crossSize(item.bounds, profile.axis);
    const geometry = profile.itemGeometry;
    for (const [key, actual, relation] of [
      ["minPrimarySize", itemPrimary, "below"],
      ["maxPrimarySize", itemPrimary, "above"],
      ["minCrossSize", itemCross, "below"],
      ["maxCrossSize", itemCross, "above"],
    ]) {
      if (geometry[key] === undefined) {
        continue;
      }
      const violated = key.startsWith("min") ? actual < geometry[key] : actual > geometry[key];
      if (violated) {
        issues.push(issue("ITEM_GEOMETRY_NOT_MET", "error", `item ${index} is ${relation} ${key}`, { itemIndexes: [index] }));
      }
    }
    if (firstPrimarySize === undefined) {
      firstPrimarySize = itemPrimary;
    } else if (!profile.layoutConstraints.allowVariablePrimarySize && Math.abs(itemPrimary - firstPrimarySize) > 1e-6) {
      issues.push(issue("VARIABLE_SIZE_NOT_ALLOWED", "error", `item ${index} has a different primary size`, { itemIndexes: [index] }));
    }

    const elementKinds = new Set(item.elements.map((element) => element.kind));
    profile.layoutConstraints.requiredObservationKinds.forEach((kind) => {
      if (!elementKinds.has(kind)) {
        issues.push(issue("REQUIRED_OBSERVATION_MISSING", "error", `item ${index} has no ${kind} observation`, { itemIndexes: [index] }));
      }
    });
    profile.validation.requiredPerItem.forEach((requirement) => {
      const matches = item.elements.filter((element) => requirementMatches(element, requirement));
      if (matches.length < requirement.min) {
        issues.push(issue("REQUIRED_OBSERVATION_MISSING", "error", `item ${index} does not satisfy a required observation selector`, { itemIndexes: [index] }));
      }
    });

    item.elements.forEach((element) => {
      const original = originalObservationById.get(element.observationId);
      if (!original) {
        issues.push(issue(
          "PROVENANCE_MISSING",
          "error",
          `proposed element ${element.observationId} has no source observation`,
          { observationIds: [element.observationId] },
        ));
      } else {
        const originalRefs = [...original.evidenceRefs].sort();
        const proposedRefs = Array.isArray(element.evidenceRefs) ? [...element.evidenceRefs].sort() : [];
        const unchangedSourceFacts = ["role", "text", "value", "confidence", "native", "metadata"]
          .every((key) => JSON.stringify(element[key]) === JSON.stringify(original[key]));
        if (
          element.source !== original.source ||
          element.kind !== original.kind ||
          JSON.stringify(proposedRefs) !== JSON.stringify(originalRefs) ||
          JSON.stringify(element.states) !== JSON.stringify(original.states) ||
          JSON.stringify(element.unknowns) !== JSON.stringify(original.unknowns) ||
          JSON.stringify(element.conflicts) !== JSON.stringify(original.conflicts) ||
          !unchangedSourceFacts
        ) {
          issues.push(issue(
            "PROVENANCE_MISMATCH",
            "error",
            `proposed element ${element.observationId} changed source facts or provenance`,
            { observationIds: [element.observationId] },
          ));
        }
      }
      if (usedObservationIds.has(element.observationId)) {
        issues.push(issue(
          "OBSERVATION_REUSED",
          "error",
          `observation ${element.observationId} was consumed by more than one item`,
          { observationIds: [element.observationId], itemIndexes: [usedObservationIds.get(element.observationId), index] },
        ));
      } else {
        usedObservationIds.set(element.observationId, index);
      }
      if (!Array.isArray(element.evidenceRefs) || element.evidenceRefs.length === 0) {
        issues.push(issue("PROVENANCE_MISSING", "error", `observation ${element.observationId} has no evidence references`, { observationIds: [element.observationId] }));
      } else if (element.evidenceRefs.some((evidenceId) => {
        const evidence = evidenceById.get(evidenceId);
        return !evidence || evidence.source !== element.source;
      })) {
        issues.push(issue(
          "PROVENANCE_MISMATCH",
          "error",
          `observation ${element.observationId} references missing or cross-source evidence`,
          { observationIds: [element.observationId] },
        ));
      }
      if (element.bounds && !rectangleInside(element.bounds, item.bounds)) {
        issues.push(issue(
          "ELEMENT_OUTSIDE_ITEM",
          "error",
          `observation ${element.observationId} is not wholly inside item ${index}`,
          { observationIds: [element.observationId], itemIndexes: [index] },
        ));
      }
      if (element.conflicts && element.conflicts.length > 0) {
        conflictedObservationIds.add(element.observationId);
        issues.push(issue(
          "EVIDENCE_CONFLICT",
          "error",
          `observation ${element.observationId} preserves unresolved conflicting evidence`,
          { observationIds: [element.observationId, ...element.conflicts.map((conflict) => conflict.withObservationId)] },
        ));
      }
    });
  });

  bundle.observations.forEach((observation) => {
    if (observation.conflicts.length > 0 && !conflictedObservationIds.has(observation.id)) {
      issues.push(issue(
        "EVIDENCE_CONFLICT",
        "error",
        `observation ${observation.id} preserves unresolved conflicting evidence`,
        { observationIds: [observation.id, ...observation.conflicts.map((conflict) => conflict.withObservationId)] },
      ));
    }
  });

  if (profile.validation.compareCompleteStructuralSources) {
    const completeSources = new Set(
      bundle.sourceCoverage
        .filter((entry) => entry.status === "complete")
        .map((entry) => entry.source),
    );
    const comparableCounts = Array.from(structuralCounts(bundle, profile))
      .filter(([source]) => completeSources.has(source))
      .sort(([left], [right]) => left.localeCompare(right));
    const uniqueCounts = new Set(comparableCounts.map(([, count]) => count));
    if (comparableCounts.length > 1 && uniqueCounts.size > 1) {
      const summary = comparableCounts.map(([source, count]) => `${source}=${count}`).join(", ");
      issues.push(issue(
        "EVIDENCE_CONFLICT",
        "error",
        `complete structural sources disagree on visible item count: ${summary}`,
      ));
    }
  }

  if (segmentation.unassignedObservationIds && segmentation.unassignedObservationIds.length > 0) {
    issues.push(issue(
      "UNASSIGNED_OBSERVATIONS",
      "warning",
      `${segmentation.unassignedObservationIds.length} in-region observations were not assigned to an item`,
      { observationIds: clone(segmentation.unassignedObservationIds) },
    ));
  }

  const sourceStatus = bundle.sourceCoverage.map((entry) => {
    const output = { source: entry.source, status: entry.status };
    if (entry.reason !== undefined) {
      output.reason = entry.reason;
    }
    return output;
  });
  const coverageBySource = new Map(bundle.sourceCoverage.map((entry) => [entry.source, entry]));
  const requiredCoverage = profile.validation.coverage.completeSources.map((source) => coverageBySource.get(source));
  const missingRequiredSource = requiredCoverage.some((entry) => !entry);
  const uncertainRequiredSource = requiredCoverage.some((entry) => entry && entry.status === "uncertain");
  const incompleteRequiredSource = requiredCoverage.some((entry) => entry && entry.status !== "complete");
  const blocking = issues.some((entry) => entry.severity === "error");
  let coverageStatus = "complete";
  if (blocking || missingRequiredSource || uncertainRequiredSource) {
    coverageStatus = "uncertain";
  } else if (incompleteRequiredSource || issues.some((entry) => entry.severity === "warning")) {
    coverageStatus = "partial";
  }
  const reasons = [];
  if (blocking) {
    reasons.push("validator rejected the proposed grouping");
  }
  if (missingRequiredSource) {
    reasons.push("a profile-required source has no coverage declaration");
  }
  if (incompleteRequiredSource) {
    reasons.push("a profile-required source is not complete for the current viewport");
    requiredCoverage
      .filter((entry) => entry && entry.status !== "complete" && entry.reason)
      .forEach((entry) => reasons.push(`${entry.source}: ${entry.reason}`));
  }
  if (segmentation.unassignedObservationIds && segmentation.unassignedObservationIds.length > 0) {
    reasons.push("some in-region observations were not assigned");
  }

  const result = {
    schemaVersion: RESULT_SCHEMA_VERSION,
    items: blocking ? [] : clone(items),
    coverage: {
      scope: "current-viewport",
      status: coverageStatus,
      sourceStatus,
      reasons,
    },
    issues,
    valid: !blocking && items.length > 0,
  };
  return clone(result);
}

function readCurrentViewportCollection(bundle, profile) {
  const segmentation = segmentCollection(bundle, profile);
  return {
    segmentation,
    validation: validateCollection(bundle, profile, segmentation),
  };
}

module.exports = {
  OBSERVATION_SCHEMA_VERSION,
  PROFILE_SCHEMA_VERSION,
  RESULT_SCHEMA_VERSION,
  mapRectangleToScope,
  readCurrentViewportCollection,
  segmentCollection,
  validateCollection,
  validateCollectionProfile,
  validateObservationBundle,
};
