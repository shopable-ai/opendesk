"use strict";

function rect(x, y, width, height, coordinateSpace = "screen") {
  return { x, y, width, height, coordinateSpace };
}

function evidence(id, source, description, extra = {}) {
  return {
    id,
    source,
    kind: extra.kind || "fixture-source",
    description,
    ...(extra.artifact ? { artifact: extra.artifact } : {}),
    ...(extra.metadata ? { metadata: extra.metadata } : {}),
  };
}

function observation(id, source, kind, bounds, evidenceRef, extra = {}) {
  return {
    id,
    source,
    kind,
    ...(extra.role !== undefined ? { role: extra.role } : {}),
    ...(extra.text !== undefined ? { text: extra.text } : {}),
    ...(extra.value !== undefined ? { value: extra.value } : {}),
    ...(bounds ? { bounds } : {}),
    states: extra.states || [],
    ...(extra.confidence ? { confidence: extra.confidence } : {}),
    ...(extra.native ? { native: extra.native } : {}),
    ...(extra.metadata ? { metadata: extra.metadata } : {}),
    evidenceRefs: extra.evidenceRefs || [evidenceRef],
    unknowns: extra.unknowns || [],
    conflicts: extra.conflicts || [],
  };
}

function bundle(id, width, height, sourceCoverage, evidenceEntries, observations, extra = {}) {
  return {
    schemaVersion: "opendesk/observation-bundle/v1",
    id,
    scope: {
      id: `${id}-scope`,
      kind: extra.scopeKind || "region",
      bounds: rect(0, 0, width, height, extra.scopeSpace || "screen"),
    },
    coordinateSpaces: extra.coordinateSpaces || [
      { id: "screen", kind: "screen-logical" },
    ],
    sourceCoverage,
    evidence: evidenceEntries,
    observations,
  };
}

function profile(id, width, height, extra = {}) {
  const strategy = extra.strategy || "anchor-bounds";
  const anchor = extra.anchor || {
    sources: ["layout"],
    kinds: ["item-boundary"],
  };
  return {
    schemaVersion: "opendesk/collection-profile/v1",
    id,
    revision: 1,
    applicability: {
      apps: extra.apps || ["fixture-app"],
      pages: extra.pages || ["fixture-page"],
      layouts: extra.layouts || ["fixture-layout"],
    },
    collectionKind: extra.collectionKind || "list",
    axis: extra.axis || "vertical",
    region: {
      bounds: rect(0, 0, width, height, extra.coordinateSpace || "screen"),
    },
    nativeRoleHints: {
      containerRoles: ["list"],
      itemRoles: ["listItem"],
    },
    itemGeometry: extra.itemGeometry || {
      minPrimarySize: 20,
      minCrossSize: 40,
    },
    repeatPattern: {
      strategy,
      ...(strategy === "anchor-bounds" ? { anchor } : {}),
      minOccurrences: extra.minOccurrences || 2,
    },
    ...(extra.separator ? { separator: extra.separator } : {}),
    spacing: extra.spacing || {},
    layoutConstraints: {
      allowVariablePrimarySize: extra.allowVariablePrimarySize !== false,
      requiredObservationKinds: extra.requiredObservationKinds || [
        strategy === "native-roots" ? "native-node" : "item-boundary",
      ],
    },
    validation: {
      minItems: extra.minItems || 2,
      requiredPerItem: extra.requiredPerItem || [
        strategy === "native-roots"
          ? { source: "accessibility", role: "listItem", min: 1 }
          : { kind: "item-boundary", min: 1 },
      ],
      prohibitObservationReuse: true,
      compareCompleteStructuralSources: extra.compareCompleteStructuralSources !== false,
      conflictPolicy: "uncertain",
      coverage: {
        completeSources: extra.completeSources || [strategy === "native-roots" ? "accessibility" : "layout"],
      },
    },
  };
}

module.exports = {
  bundle,
  evidence,
  observation,
  profile,
  rect,
};
