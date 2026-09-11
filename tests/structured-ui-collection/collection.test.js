"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const collectionCore = require("../../scripts/lib/structured-ui-collection");
const {
  readCurrentViewportCollection,
  segmentCollection,
  validateCollection,
  validateCollectionProfile,
  validateObservationBundle,
} = collectionCore;
const { byId, scenarios } = require("./fixtures/scenarios");

const repositoryRoot = path.resolve(__dirname, "../..");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runScenario(id) {
  const scenario = byId[id];
  const segmentation = segmentCollection(scenario.input.bundle, scenario.input.profile);
  const result = validateCollection(scenario.input.bundle, scenario.input.profile, segmentation);
  return { scenario, segmentation, result };
}

function texts(item) {
  return item.elements
    .filter((element) => typeof element.text === "string")
    .map((element) => element.text);
}

function hasOwnKeyDeep(value, forbidden) {
  if (Array.isArray(value)) {
    return value.some((entry) => hasOwnKeyDeep(entry, forbidden));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, child]) => forbidden.has(key) || hasOwnKeyDeep(child, forbidden));
  }
  return false;
}

test("Phase 1 schemas are parseable and freeze generic, current-viewport contracts", () => {
  const schemaNames = [
    "observation-bundle-v1.schema.json",
    "collection-profile-v1.schema.json",
    "collection-result-v1.schema.json",
  ];
  const schemas = schemaNames.map((name) => JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, "schemas/automation", name),
    "utf8",
  )));
  assert.deepEqual(
    schemas.map((schema) => schema.$schema),
    Array(3).fill("https://json-schema.org/draft/2020-12/schema"),
  );
  assert.equal(schemas[1].additionalProperties, false);
  assert.equal(schemas[2].properties.coverage.properties.scope.const, "current-viewport");
  assert.equal(schemas[2].properties.items.items.$ref, "#/$defs/collectionItem");
  assert.match(schemas[2].$defs.collectionItem.properties.index.description, /never a stable identity/);
  assert.equal(
    hasOwnKeyDeep(schemas[1].properties, new Set(["sender", "price", "customerName", "scrollStrategy", "paginationButton"])),
    false,
  );
  assert.equal(hasOwnKeyDeep(schemas[2], new Set(["totalCount", "wholeCollectionComplete"])), false);
});

test("Phase 2 core exposes only internal deterministic seams and has no provider or UI side effects", () => {
  for (const publicName of ["readCollection", "collectCollection", "extractList", "SemanticVisionProvider"]) {
    assert.equal(Object.hasOwn(collectionCore, publicName), false, publicName);
  }
  const source = fs.readFileSync(path.join(repositoryRoot, "scripts/lib/structured-ui-collection.js"), "utf8");
  for (const forbiddenCall of ["fetch(", "http.request(", "https.request(", "eval(", "child_process"]) {
    assert.equal(source.includes(forbiddenCall), false, forbiddenCall);
  }
});

test("all formal fixtures are ordinary serializable data accepted by Phase 1 validators", () => {
  assert.deepEqual(scenarios.map((scenario) => scenario.id), [
    "F1",
    "F2",
    "F3",
    "F4",
    "F5",
    "F6",
    "F7",
    "F8",
    "F9",
    "IMAGE-WECHAT-PANEL",
  ]);
  for (const scenario of scenarios) {
    assert.doesNotThrow(() => validateObservationBundle(scenario.input.bundle), scenario.id);
    assert.doesNotThrow(() => validateCollectionProfile(scenario.input.profile), scenario.id);
    assert.deepEqual(JSON.parse(JSON.stringify(scenario.input)), scenario.input, scenario.id);
  }
});

test("SC-A / F1: complete native list yields ordered generic items and current-viewport coverage", () => {
  const { result } = runScenario("F1");
  assert.equal(result.valid, true);
  assert.equal(result.items.length, 3);
  assert.deepEqual(result.items.map((item) => item.index), [0, 1, 2]);
  assert.deepEqual(result.items.map((item) => item.bounds.y), [0, 70, 140]);
  assert.deepEqual(result.items.map((item) => item.nativeStructure.rootObservationIds.length), [1, 1, 1]);
  assert.deepEqual(result.coverage, {
    scope: "current-viewport",
    status: "complete",
    sourceStatus: [{ source: "accessibility", status: "complete" }],
    reasons: [],
  });
  assert.equal(Object.hasOwn(result, "complete"), false);
});

test("F1 unknown native state remains unknown and is never converted to false", () => {
  const { result } = runScenario("F1");
  const unknownState = result.items[2].states.find((state) => state.name === "selected");
  assert.deepEqual(unknownState, {
    name: "selected",
    status: "unknown",
    reason: "AXSelected was not exposed",
    observationId: "f1-item-3",
  });
  assert.deepEqual(result.items[2].unknowns, [{
    field: "states.selected",
    reason: "AXSelected was not exposed",
    observationId: "f1-item-3",
  }]);
});

test("SC-B / F2: incomplete native evidence coexists with complete OCR and layout evidence", () => {
  const { result } = runScenario("F2");
  assert.equal(result.items.length, 3);
  assert.equal(result.coverage.status, "complete");
  assert.deepEqual(result.coverage.sourceStatus, [
    {
      source: "accessibility",
      status: "partial",
      reason: "third visible row is absent from the AX subtree",
    },
    { source: "layout", status: "complete" },
    { source: "ocr", status: "complete" },
  ]);
  assert.deepEqual(result.items.map((item) => texts(item)), [
    ["First visible row"],
    ["Second visible row"],
    ["Third visible row"],
  ]);
  const ocr = result.items[0].elements.find((element) => element.source === "ocr");
  assert.equal(ocr.bounds.coordinateSpace, "screen");
  assert.equal(Object.hasOwn(ocr, "native"), false);
  assert.equal(ocr.confidence.scale, "provider-specific");
});

test("SC-C / F3: OCR plus layout can validate a visible list with no native observations", () => {
  const { scenario, result } = runScenario("F3");
  assert.equal(scenario.input.bundle.observations.some((entry) => entry.source === "accessibility"), false);
  assert.equal(result.valid, true);
  assert.equal(result.items.length, 3);
  assert.equal(result.coverage.status, "complete");
  assert.equal(result.items.every((item) => item.nativeStructure.observationIds.length === 0), true);
});

test("SC-D / F4: geometry groups multi-line text, icon, and timestamp into variable content", () => {
  const { result } = runScenario("F4");
  assert.equal(result.valid, true);
  assert.equal(result.items.length, 3);
  assert.deepEqual(result.items.map((item) => item.elements.length), [6, 6, 6]);
  assert.equal(result.items.every((item) => item.elements.some((element) => element.role === "timestamp")), true);
});

test("SC-D negative: OCR lines alone are not arbitrarily promoted into valid records", () => {
  const scenario = byId.F4;
  const weakProfile = clone(scenario.input.profile);
  weakProfile.id = "f4-ocr-lines-are-not-items";
  weakProfile.repeatPattern.anchor = { sources: ["ocr"], kinds: ["text"] };
  const segmentation = segmentCollection(scenario.input.bundle, weakProfile);
  const result = validateCollection(scenario.input.bundle, weakProfile, segmentation);
  assert.equal(segmentation.items.length > 3, true);
  assert.equal(result.valid, false);
  assert.equal(result.items.length, 0);
  assert.equal(result.coverage.status, "uncertain");
  assert.equal(result.issues.some((entry) => entry.code === "REQUIRED_OBSERVATION_MISSING"), true);
});

test("SC-F / F5: complete native and static semantic-vision counts conflict and fail closed", () => {
  const { scenario, segmentation, result } = runScenario("F5");
  assert.equal(segmentation.items.length, 3);
  assert.equal(result.items.length, 0);
  assert.equal(result.valid, false);
  assert.equal(result.coverage.status, "uncertain");
  assert.equal(result.issues.some((entry) =>
    entry.code === "EVIDENCE_CONFLICT" &&
    entry.message.includes("accessibility=2") &&
    entry.message.includes("semantic-vision=3")), true);
  assert.equal(scenario.input.bundle.evidence[1].kind, "static-proposal-fixture");
  assert.equal(scenario.input.bundle.evidence[1].description.includes("no provider was run"), true);
});

test("SC-G / F6: repeated identical text remains three distinct items", () => {
  const { result } = runScenario("F6");
  assert.equal(result.valid, true);
  assert.equal(result.items.length, 3);
  assert.deepEqual(result.items.map((item) => texts(item)[0]), ["好的", "好的", "好的"]);
  assert.deepEqual(
    result.items.map((item) => item.elements.find((element) => element.source === "ocr").observationId),
    ["f6-text-1", "f6-text-2", "f6-text-3"],
  );
});

test("SC-H / F7: variable-height timeline does not assume fixed row height or stable index identity", () => {
  const { result } = runScenario("F7");
  assert.equal(result.valid, true);
  assert.deepEqual(result.items.map((item) => item.bounds.height), [80, 130, 95]);
  assert.deepEqual(result.items.map((item) => item.index), [0, 1, 2]);
  assert.equal(result.items.every((item) => !Object.hasOwn(item, "id")), true);
  assert.equal(result.items.every((item) => item.elements.some((element) => element.role === "timestamp")), true);
});

test("SC-K / F8: virtualized list reports eight visible items without whole-list claims", () => {
  const { result } = runScenario("F8");
  assert.equal(result.items.length, 8);
  assert.deepEqual(result.coverage, {
    scope: "current-viewport",
    status: "complete",
    sourceStatus: [
      { source: "layout", status: "complete" },
      { source: "ocr", status: "complete" },
    ],
    reasons: [],
  });
  assert.equal(hasOwnKeyDeep(result, new Set(["totalCount", "wholeCollectionComplete"])), false);
});

test("SC-P / F9: a downstream business parser failure is not a segmenter failure", () => {
  const { result } = runScenario("F9");
  assert.equal(result.valid, true);
  assert.equal(result.items.length, 2);
  function parseConversation(item) {
    const raw = texts(item).join(" ");
    if (!raw.includes("sender:")) {
      const error = new Error("fixture lacks the app-specific sender grammar");
      error.code = "BUSINESS_MAPPING_ERROR";
      throw error;
    }
    return { raw };
  }
  assert.throws(
    () => parseConversation(result.items[0]),
    (error) => error.code === "BUSINESS_MAPPING_ERROR",
  );
  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
});

test("authorized WeChat PNG validates eight annotated rows as partial current-viewport image evidence", () => {
  const { scenario, result } = runScenario("IMAGE-WECHAT-PANEL");
  const artifact = scenario.input.bundle.evidence[0].artifact;
  const imagePath = path.join(repositoryRoot, artifact.path);
  const image = fs.readFileSync(imagePath);
  assert.equal(crypto.createHash("sha256").update(image).digest("hex"), artifact.sha256);
  assert.equal(image.readUInt32BE(16), 880);
  assert.equal(image.readUInt32BE(20), 640);
  assert.equal(result.items.length, 8);
  assert.equal(result.coverage.scope, "current-viewport");
  assert.equal(result.coverage.status, "partial");
  assert.equal(result.coverage.reasons.includes("image: a further row is clipped at the bottom edge"), true);
  assert.equal(result.items.every((item) => item.elements.every((element) => element.source === "image")), true);
  assert.equal(result.items.every((item) => item.elements.every((element) => !Object.hasOwn(element, "text"))), true);
});

test("segmentation and validation are deterministic for identical serialized input", () => {
  for (const id of ["F1", "F2", "F4", "F5", "F6", "F7", "F8"] ) {
    const scenario = byId[id];
    const firstSegmentation = segmentCollection(clone(scenario.input.bundle), clone(scenario.input.profile));
    const secondSegmentation = segmentCollection(clone(scenario.input.bundle), clone(scenario.input.profile));
    assert.deepEqual(secondSegmentation, firstSegmentation, id);
    assert.deepEqual(
      validateCollection(scenario.input.bundle, scenario.input.profile, secondSegmentation),
      validateCollection(scenario.input.bundle, scenario.input.profile, firstSegmentation),
      id,
    );
  }
});

test("current-viewport convenience seam preserves separate proposal and validation outputs", () => {
  const scenario = byId.F3;
  const combined = readCurrentViewportCollection(scenario.input.bundle, scenario.input.profile);
  assert.deepEqual(
    combined.segmentation,
    segmentCollection(scenario.input.bundle, scenario.input.profile),
  );
  assert.deepEqual(
    combined.validation,
    validateCollection(scenario.input.bundle, scenario.input.profile, combined.segmentation),
  );
});

test("horizontal axis uses left-to-right deterministic reading order", () => {
  const source = byId.F6;
  const bundle = clone(source.input.bundle);
  bundle.id = "horizontal-axis-fixture";
  bundle.scope.bounds = { x: 0, y: 0, width: 150, height: 200, coordinateSpace: "screen" };
  bundle.observations.forEach((entry) => {
    const original = entry.bounds;
    if (entry.kind === "item-boundary") {
      entry.bounds = { x: original.y, y: 0, width: original.height, height: 200, coordinateSpace: "screen" };
    } else {
      entry.bounds = { x: original.y + 12, y: 16, width: 24, height: 160, coordinateSpace: "screen" };
    }
  });
  const profile = clone(source.input.profile);
  profile.id = "horizontal-axis-profile";
  profile.axis = "horizontal";
  profile.region.bounds = { x: 0, y: 0, width: 150, height: 200, coordinateSpace: "screen" };
  const segmentation = segmentCollection(bundle, profile);
  const result = validateCollection(bundle, profile, segmentation);
  assert.equal(result.valid, true);
  assert.deepEqual(result.items.map((item) => item.bounds.x), [0, 50, 100]);
});

test("separator-band strategy proposes deterministic regions without consuming separator lines", () => {
  const source = byId.F6;
  const bundle = clone(source.input.bundle);
  bundle.id = "separator-band-fixture";
  bundle.observations = bundle.observations.filter((entry) => entry.kind === "text");
  bundle.observations.push(
    {
      id: "separator-1",
      source: "layout",
      kind: "separator",
      role: "separator",
      bounds: { x: 0, y: 49.5, width: 200, height: 1, coordinateSpace: "screen" },
      states: [],
      evidenceRefs: ["f6-layout-evidence"],
      unknowns: [],
      conflicts: [],
    },
    {
      id: "separator-2",
      source: "layout",
      kind: "separator",
      role: "separator",
      bounds: { x: 0, y: 99.5, width: 200, height: 1, coordinateSpace: "screen" },
      states: [],
      evidenceRefs: ["f6-layout-evidence"],
      unknowns: [],
      conflicts: [],
    },
  );
  const profile = clone(source.input.profile);
  profile.id = "separator-band-profile";
  profile.repeatPattern = { strategy: "separator-bands", minOccurrences: 3 };
  profile.separator = { sources: ["layout"], kinds: ["separator"] };
  profile.layoutConstraints.requiredObservationKinds = ["text"];
  profile.validation.requiredPerItem = [{ source: "ocr", kind: "text", min: 1 }];
  profile.validation.coverage.completeSources = ["ocr", "layout"];
  const segmentation = segmentCollection(bundle, profile);
  const result = validateCollection(bundle, profile, segmentation);
  assert.equal(result.valid, true);
  assert.deepEqual(result.items.map((item) => item.bounds.height), [50, 50, 50]);
  assert.equal(result.items.every((item) => item.elements.every((element) => element.kind !== "separator")), true);
});

test("image-pixel and screen-logical bounds require an explicit transform", () => {
  const broken = clone(byId.F2.input.bundle);
  delete broken.coordinateSpaces[1].transformTo;
  assert.throws(
    () => segmentCollection(broken, byId.F2.input.profile),
    /cannot map capture-pixels directly to scope coordinate space screen/,
  );
});

test("CollectionProfile region cannot extend beyond the observed viewport scope", () => {
  const profile = clone(byId.F1.input.profile);
  profile.region.bounds.width = 300;
  assert.throws(
    () => segmentCollection(byId.F1.input.bundle, profile),
    /must stay inside the observed current-viewport scope/,
  );
});

test("source provenance cannot be overwritten by cross-source evidence", () => {
  const broken = clone(byId.F3.input.bundle);
  const ocrObservation = broken.observations.find((entry) => entry.source === "ocr");
  ocrObservation.evidenceRefs = ["f3-layout-evidence"];
  assert.throws(
    () => validateObservationBundle(broken),
    /belongs to layout/,
  );
});

test("OCR cannot masquerade as native value and layout/image cannot claim text", () => {
  const ocrValue = clone(byId.F3.input.bundle);
  ocrValue.observations.find((entry) => entry.source === "ocr").value = "native-looking";
  assert.throws(() => validateObservationBundle(ocrValue), /OCR content.*not a native value/);

  const layoutText = clone(byId.F3.input.bundle);
  layoutText.observations.find((entry) => entry.source === "layout").text = "not actually observed";
  assert.throws(() => validateObservationBundle(layoutText), /layout observations may only declare observed structure/);

  const ocrNative = clone(byId.F3.input.bundle);
  ocrNative.observations.find((entry) => entry.source === "ocr").native = { role: "staticText" };
  assert.throws(() => validateObservationBundle(ocrNative), /native metadata is only valid for accessibility/);
});

test("an explicitly preserved observation conflict is rejected as uncertain", () => {
  const bundle = clone(byId.F6.input.bundle);
  bundle.observations[0].conflicts.push({
    field: "bounds",
    withObservationId: "f6-boundary-2",
    reason: "two source-local groupings overlap",
  });
  const segmentation = segmentCollection(bundle, byId.F6.input.profile);
  const result = validateCollection(bundle, byId.F6.input.profile, segmentation);
  assert.equal(result.valid, false);
  assert.equal(result.items.length, 0);
  assert.equal(result.coverage.status, "uncertain");
  assert.equal(result.issues.some((entry) => entry.code === "EVIDENCE_CONFLICT"), true);
});

test("CollectionValidator independently rejects invalid bounds and region escape", () => {
  const scenario = byId.F1;
  const segmentation = segmentCollection(scenario.input.bundle, scenario.input.profile);
  segmentation.items[0].bounds.x = -10;
  const result = validateCollection(scenario.input.bundle, scenario.input.profile, segmentation);
  assert.equal(result.valid, false);
  assert.equal(result.items.length, 0);
  assert.equal(result.issues.some((entry) => entry.code === "ITEM_OUTSIDE_COLLECTION_REGION"), true);
});

test("CollectionValidator independently rejects out-of-order candidates", () => {
  const scenario = byId.F1;
  const segmentation = segmentCollection(scenario.input.bundle, scenario.input.profile);
  [segmentation.items[0], segmentation.items[1]] = [segmentation.items[1], segmentation.items[0]];
  const result = validateCollection(scenario.input.bundle, scenario.input.profile, segmentation);
  assert.equal(result.valid, false);
  assert.equal(result.issues.some((entry) => entry.code === "ITEM_ORDER_INVALID"), true);
});

test("CollectionValidator independently rejects cross-item observation reuse", () => {
  const scenario = byId.F6;
  const segmentation = segmentCollection(scenario.input.bundle, scenario.input.profile);
  segmentation.items[1].elements.push(clone(segmentation.items[0].elements[0]));
  const result = validateCollection(scenario.input.bundle, scenario.input.profile, segmentation);
  assert.equal(result.valid, false);
  assert.equal(result.items.length, 0);
  assert.equal(result.issues.some((entry) => entry.code === "OBSERVATION_REUSED"), true);
});

test("CollectionValidator independently rejects missing required observations", () => {
  const scenario = byId.F3;
  const segmentation = segmentCollection(scenario.input.bundle, scenario.input.profile);
  segmentation.items[1].elements = segmentation.items[1].elements.filter((entry) => entry.source !== "ocr");
  const result = validateCollection(scenario.input.bundle, scenario.input.profile, segmentation);
  assert.equal(result.valid, false);
  assert.equal(result.items.length, 0);
  assert.equal(result.issues.some((entry) => entry.code === "REQUIRED_OBSERVATION_MISSING"), true);
});

test("CollectionValidator independently enforces overlap, spacing, geometry, variable-size, and cross-axis constraints", () => {
  const native = byId.F1;

  const overlap = segmentCollection(native.input.bundle, native.input.profile);
  overlap.items[1].bounds.y = 60;
  let result = validateCollection(native.input.bundle, native.input.profile, overlap);
  assert.equal(result.issues.some((entry) => entry.code === "ITEM_OVERLAP"), true);

  const spacingProfile = clone(native.input.profile);
  spacingProfile.spacing.min = 1;
  result = validateCollection(
    native.input.bundle,
    spacingProfile,
    segmentCollection(native.input.bundle, spacingProfile),
  );
  assert.equal(result.issues.some((entry) => entry.code === "SPACING_CONSTRAINT_NOT_MET"), true);

  const geometryProfile = clone(native.input.profile);
  geometryProfile.itemGeometry.maxPrimarySize = 60;
  result = validateCollection(
    native.input.bundle,
    geometryProfile,
    segmentCollection(native.input.bundle, geometryProfile),
  );
  assert.equal(result.issues.some((entry) => entry.code === "ITEM_GEOMETRY_NOT_MET"), true);

  const timeline = byId.F7;
  const fixedProfile = clone(timeline.input.profile);
  fixedProfile.layoutConstraints.allowVariablePrimarySize = false;
  result = validateCollection(
    timeline.input.bundle,
    fixedProfile,
    segmentCollection(timeline.input.bundle, fixedProfile),
  );
  assert.equal(result.issues.some((entry) => entry.code === "VARIABLE_SIZE_NOT_ALLOWED"), true);

  const crossProfile = clone(native.input.profile);
  crossProfile.itemGeometry.minCrossAxisOverlapRatio = 0.5;
  const cross = segmentCollection(native.input.bundle, crossProfile);
  cross.items[0].bounds.width = 100;
  cross.items[1].bounds.x = 140;
  cross.items[1].bounds.width = 100;
  result = validateCollection(native.input.bundle, crossProfile, cross);
  assert.equal(result.issues.some((entry) => entry.code === "CROSS_AXIS_ALIGNMENT_NOT_MET"), true);
});

test("CollectionValidator independently rejects proposal provenance mutation", () => {
  const scenario = byId.F1;
  const segmentation = segmentCollection(scenario.input.bundle, scenario.input.profile);
  segmentation.items[0].elements[0].source = "ocr";
  const result = validateCollection(scenario.input.bundle, scenario.input.profile, segmentation);
  assert.equal(result.valid, false);
  assert.equal(result.items.length, 0);
  assert.equal(result.issues.some((entry) => entry.code === "PROVENANCE_MISMATCH"), true);
});

test("a clipped candidate is reported as partial instead of being silently lost", () => {
  const scenario = byId.F6;
  const clippedBundle = clone(scenario.input.bundle);
  const clippedBoundary = clippedBundle.observations.find((entry) => entry.id === "f6-boundary-3");
  clippedBoundary.bounds.y = 125;
  const segmentation = segmentCollection(clippedBundle, scenario.input.profile);
  const result = validateCollection(clippedBundle, scenario.input.profile, segmentation);
  assert.equal(segmentation.items.length, 2);
  assert.equal(segmentation.issues.some((entry) => entry.code === "CANDIDATE_OUTSIDE_COLLECTION_REGION"), true);
  assert.equal(segmentation.unassignedObservationIds.includes("f6-boundary-3"), true);
  assert.equal(result.coverage.status, "partial");
  assert.equal(result.issues.some((entry) => entry.code === "UNASSIGNED_OBSERVATIONS"), true);
});

test("CollectionValidator enforces the profile minimum repeat pattern", () => {
  const scenario = byId.F6;
  const strictProfile = clone(scenario.input.profile);
  strictProfile.repeatPattern.minOccurrences = 3;
  strictProfile.validation.minItems = 3;
  const segmentation = segmentCollection(scenario.input.bundle, strictProfile);
  segmentation.items.pop();
  const result = validateCollection(scenario.input.bundle, strictProfile, segmentation);
  assert.equal(result.valid, false);
  assert.equal(result.coverage.status, "uncertain");
  assert.equal(result.issues.some((entry) => entry.code === "REPEAT_PATTERN_NOT_MET"), true);
});

test("CollectionProfile rejects business mapping and traversal fields at any depth", () => {
  for (const [field, value] of [
    ["sender", "somebody"],
    ["customerName", "customer"],
    ["orderPrice", 10],
    ["conversationTitle", "title"],
    ["orderId", "123"],
    ["scrollStrategy", "wheel"],
    ["paginationButton", "next"],
    ["loadMoreAction", "click"],
  ]) {
    const broken = clone(byId.F1.input.profile);
    broken.layoutConstraints[field] = value;
    assert.throws(
      () => validateCollectionProfile(broken),
      /business mapping and traversal are outside CollectionProfile/,
      field,
    );
  }
});

test("unknown state must be explicit and cannot be supplied as a boolean", () => {
  const broken = clone(byId.F1.input.bundle);
  broken.observations[1].states = [false];
  assert.throws(() => validateObservationBundle(broken), /states\[0\]: must be an object/);
});

test("Observation bundles reject executable or non-JSON metadata", () => {
  const broken = clone(byId.F1.input.bundle);
  broken.observations[0].metadata = { callback() {} };
  assert.throws(() => validateObservationBundle(broken), /must contain only JSON data, not function/);
});
