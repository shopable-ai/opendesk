"use strict";

const { bundle, evidence, observation, profile, rect } = require("./builders");

function coverage(source, status, evidenceRef, reason) {
  return {
    source,
    status,
    ...(reason ? { reason } : {}),
    evidenceRefs: [evidenceRef],
  };
}

function boundaryAndTextRows(prefix, rows, textSource = "ocr") {
  const observations = [];
  rows.forEach((row, index) => {
    const number = index + 1;
    observations.push(observation(
      `${prefix}-boundary-${number}`,
      "layout",
      "item-boundary",
      rect(0, row.y, row.width || 240, row.height),
      `${prefix}-layout-evidence`,
      { role: "row" },
    ));
    observations.push(observation(
      `${prefix}-text-${number}`,
      textSource,
      "text",
      rect(16, row.y + 12, 180, Math.min(24, row.height - 12)),
      `${prefix}-${textSource}-evidence`,
      { text: row.text },
    ));
  });
  return observations;
}

function f1NativeList() {
  const ev = evidence("f1-accessibility-evidence", "accessibility", "Complete fixture AX list subtree");
  const observations = [
    observation("f1-list", "accessibility", "container", rect(0, 0, 240, 210), ev.id, {
      role: "list",
      native: { role: "list", backend: "ax", metadata: { attribute: "AXRole" } },
    }),
  ];
  ["Alpha", "Beta", "Gamma"].forEach((text, index) => {
    const rootId = `f1-item-${index + 1}`;
    observations.push(observation(rootId, "accessibility", "native-node", rect(0, index * 70, 240, 70), ev.id, {
      role: "listItem",
      native: { role: "listItem", parentId: "f1-list", backend: "ax" },
      states: index === 2
        ? [{ name: "selected", status: "unknown", reason: "AXSelected was not exposed" }]
        : [{ name: "selected", status: "known", value: false }],
    }));
    observations.push(observation(`f1-text-${index + 1}`, "accessibility", "text", rect(12, index * 70 + 18, 140, 24), ev.id, {
      role: "staticText",
      value: text,
      native: { role: "staticText", parentId: rootId, backend: "ax" },
    }));
  });
  return {
    id: "F1",
    scenarios: ["SC-A", "SC-K"],
    description: "Complete native list in the current viewport",
    input: {
      bundle: bundle("f1-native-list", 240, 210, [coverage("accessibility", "complete", ev.id)], [ev], observations),
      profile: profile("f1-native-profile", 240, 210, {
        strategy: "native-roots",
        allowVariablePrimarySize: false,
        completeSources: ["accessibility"],
      }),
    },
    oracle: {
      itemCount: 3,
      coverage: "complete",
      preservedUnknownState: true,
    },
  };
}

function f2NativeIncompleteOcrComplete() {
  const ax = evidence("f2-accessibility-evidence", "accessibility", "Partial AX subtree containing only two materialized rows");
  const layout = evidence("f2-layout-evidence", "layout", "Complete current-viewport row boundary observations");
  const ocr = evidence("f2-ocr-evidence", "ocr", "Complete OCR observations in image-pixel coordinates", {
    metadata: { provider: "fixture-ocr" },
  });
  const observations = boundaryAndTextRows("f2", [
    { y: 0, height: 70, text: "First visible row" },
    { y: 70, height: 70, text: "Second visible row" },
    { y: 140, height: 70, text: "Third visible row" },
  ]).map((entry) => {
    if (entry.source === "ocr") {
      return {
        ...entry,
        bounds: { ...entry.bounds, coordinateSpace: "capture-pixels" },
        confidence: {
          value: 0.96,
          scale: "provider-specific",
          provider: "fixture-ocr",
          evidenceRef: ocr.id,
        },
      };
    }
    return entry;
  });
  observations.push(
    observation("f2-native-1", "accessibility", "native-node", rect(0, 0, 240, 70), ax.id, {
      role: "listItem",
      native: { role: "listItem", backend: "ax" },
    }),
    observation("f2-native-2", "accessibility", "native-node", rect(0, 70, 240, 70), ax.id, {
      role: "listItem",
      native: { role: "listItem", backend: "ax" },
    }),
  );
  return {
    id: "F2",
    scenarios: ["SC-B", "SC-K"],
    description: "Incomplete native structure coexists with complete OCR and layout evidence",
    input: {
      bundle: bundle(
        "f2-native-incomplete-ocr-complete",
        240,
        210,
        [
          coverage("accessibility", "partial", ax.id, "third visible row is absent from the AX subtree"),
          coverage("layout", "complete", layout.id),
          coverage("ocr", "complete", ocr.id),
        ],
        [ax, layout, ocr],
        observations,
        {
          coordinateSpaces: [
            { id: "screen", kind: "screen-logical" },
            {
              id: "capture-pixels",
              kind: "image-pixel",
              imageSize: { width: 240, height: 210 },
              transformTo: {
                coordinateSpace: "screen",
                scale: { x: 1, y: 1 },
                offset: { x: 0, y: 0 },
                evidenceRefs: [ocr.id],
              },
            },
          ],
        },
      ),
      profile: profile("f2-fallback-profile", 240, 210, {
        completeSources: ["layout", "ocr"],
        requiredPerItem: [
          { source: "layout", kind: "item-boundary", min: 1 },
          { source: "ocr", kind: "text", min: 1 },
        ],
      }),
    },
    oracle: {
      itemCount: 3,
      coverage: "complete",
      accessibilityCoverage: "partial",
    },
  };
}

function f3NoUiTree() {
  const layout = evidence("f3-layout-evidence", "layout", "Complete image-layout row boundaries with no UI tree");
  const ocr = evidence("f3-ocr-evidence", "ocr", "Complete visible text observations with no native source");
  const rows = [
    { y: 0, height: 64, text: "Visible one" },
    { y: 64, height: 64, text: "Visible two" },
    { y: 128, height: 64, text: "Visible three" },
  ];
  return {
    id: "F3",
    scenarios: ["SC-C"],
    description: "No usable UI tree; OCR plus layout still describes the visible collection",
    input: {
      bundle: bundle(
        "f3-no-ui-tree",
        240,
        192,
        [coverage("layout", "complete", layout.id), coverage("ocr", "complete", ocr.id)],
        [layout, ocr],
        boundaryAndTextRows("f3", rows),
      ),
      profile: profile("f3-no-tree-profile", 240, 192, {
        completeSources: ["layout", "ocr"],
        requiredPerItem: [
          { source: "layout", kind: "item-boundary", min: 1 },
          { source: "ocr", kind: "text", min: 1 },
        ],
      }),
    },
    oracle: { itemCount: 3, coverage: "complete", nativeObservationCount: 0 },
  };
}

function f4GroupingDifficult() {
  const layout = evidence("f4-layout-evidence", "layout", "Complete row, icon, and grouping geometry");
  const ocr = evidence("f4-ocr-evidence", "ocr", "Complete multi-line OCR for each visible card");
  const observations = [];
  [0, 112, 224].forEach((y, index) => {
    const number = index + 1;
    observations.push(
      observation(`f4-boundary-${number}`, "layout", "item-boundary", rect(0, y, 280, 112), layout.id, { role: "card" }),
      observation(`f4-icon-${number}`, "layout", "icon-shape", rect(12, y + 16, 28, 28), layout.id, { role: "leadingIcon" }),
      observation(`f4-title-${number}`, "ocr", "text", rect(52, y + 12, 150, 22), ocr.id, { text: `Title ${number}` }),
      observation(`f4-body-${number}-a`, "ocr", "text", rect(52, y + 42, 188, 20), ocr.id, { text: `Body line A ${number}` }),
      observation(`f4-body-${number}-b`, "ocr", "text", rect(52, y + 66, 188, 20), ocr.id, { text: `Body line B ${number}` }),
      observation(`f4-time-${number}`, "ocr", "text", rect(220, y + 12, 48, 18), ocr.id, { text: `1${number}:00`, role: "timestamp" }),
    );
  });
  return {
    id: "F4",
    scenarios: ["SC-D"],
    description: "Multi-line content, icon, and timestamp require structural grouping",
    input: {
      bundle: bundle(
        "f4-grouping-difficult",
        280,
        336,
        [coverage("layout", "complete", layout.id), coverage("ocr", "complete", ocr.id)],
        [layout, ocr],
        observations,
      ),
      profile: profile("f4-card-profile", 280, 336, {
        collectionKind: "cards",
        completeSources: ["layout", "ocr"],
        requiredPerItem: [
          { source: "layout", kind: "item-boundary", min: 1 },
          { source: "layout", kind: "icon-shape", min: 1 },
          { source: "ocr", kind: "text", min: 4 },
        ],
      }),
    },
    oracle: { itemCount: 3, elementsPerItem: 6, coverage: "complete" },
  };
}

function f5EvidenceConflict() {
  const ax = evidence("f5-accessibility-evidence", "accessibility", "Complete native source claims two visible list items");
  const semantic = evidence("f5-semantic-vision-evidence", "semantic-vision", "Static proposal fixture claims three visible rows; no provider was run", {
    kind: "static-proposal-fixture",
  });
  const observations = [
    observation("f5-native-1", "accessibility", "native-node", rect(0, 0, 240, 90), ax.id, {
      role: "listItem",
      native: { role: "listItem", backend: "uia" },
    }),
    observation("f5-native-2", "accessibility", "native-node", rect(0, 90, 240, 90), ax.id, {
      role: "listItem",
      native: { role: "listItem", backend: "uia" },
    }),
    observation("f5-boundary-1", "semantic-vision", "item-boundary", rect(0, 0, 240, 60), semantic.id, { role: "row" }),
    observation("f5-boundary-2", "semantic-vision", "item-boundary", rect(0, 60, 240, 60), semantic.id, { role: "row" }),
    observation("f5-boundary-3", "semantic-vision", "item-boundary", rect(0, 120, 240, 60), semantic.id, { role: "row" }),
  ];
  return {
    id: "F5",
    scenarios: ["SC-F"],
    description: "Complete native and visual structural evidence disagree on visible item count",
    input: {
      bundle: bundle(
        "f5-evidence-conflict",
        240,
        180,
        [coverage("accessibility", "complete", ax.id), coverage("semantic-vision", "complete", semantic.id)],
        [ax, semantic],
        observations,
      ),
      profile: profile("f5-conflict-profile", 240, 180, {
        anchor: { sources: ["semantic-vision"], kinds: ["item-boundary"] },
        completeSources: ["semantic-vision"],
        requiredPerItem: [{ source: "semantic-vision", kind: "item-boundary", min: 1 }],
      }),
    },
    oracle: {
      proposedItemCount: 3,
      acceptedItemCount: 0,
      coverage: "uncertain",
      issue: "EVIDENCE_CONFLICT",
    },
  };
}

function f6RepeatedIdenticalText() {
  const layout = evidence("f6-layout-evidence", "layout", "Complete repeated row boundaries");
  const ocr = evidence("f6-ocr-evidence", "ocr", "Three distinct OCR observations with identical text");
  return {
    id: "F6",
    scenarios: ["SC-G"],
    description: "Three legitimate identical texts remain three collection items",
    input: {
      bundle: bundle(
        "f6-repeated-identical-text",
        200,
        150,
        [coverage("layout", "complete", layout.id), coverage("ocr", "complete", ocr.id)],
        [layout, ocr],
        boundaryAndTextRows("f6", [
          { y: 0, height: 50, width: 200, text: "好的" },
          { y: 50, height: 50, width: 200, text: "好的" },
          { y: 100, height: 50, width: 200, text: "好的" },
        ]),
      ),
      profile: profile("f6-repeat-profile", 200, 150, {
        completeSources: ["layout", "ocr"],
        requiredPerItem: [
          { source: "layout", kind: "item-boundary", min: 1 },
          { source: "ocr", kind: "text", min: 1 },
        ],
      }),
    },
    oracle: { itemCount: 3, texts: ["好的", "好的", "好的"], coverage: "complete" },
  };
}

function f7VariableHeightTimeline() {
  const layout = evidence("f7-layout-evidence", "layout", "Variable-height timeline geometry and separators");
  const ocr = evidence("f7-ocr-evidence", "ocr", "Timeline timestamps and multi-line text");
  const rows = [
    { y: 0, height: 80, lines: ["09:00", "Short update"] },
    { y: 80, height: 130, lines: ["09:10", "Long update line one", "Long update line two", "Long update line three"] },
    { y: 210, height: 95, lines: ["09:30", "Medium update", "Second line"] },
  ];
  const observations = [];
  rows.forEach((row, rowIndex) => {
    const number = rowIndex + 1;
    observations.push(observation(`f7-boundary-${number}`, "layout", "item-boundary", rect(0, row.y, 260, row.height), layout.id, { role: "timelineEntry" }));
    row.lines.forEach((text, lineIndex) => {
      observations.push(observation(
        `f7-text-${number}-${lineIndex + 1}`,
        "ocr",
        "text",
        rect(20, row.y + 10 + lineIndex * 22, 210, 18),
        ocr.id,
        { text, role: lineIndex === 0 ? "timestamp" : "bodyLine" },
      ));
    });
    if (rowIndex < rows.length - 1) {
      observations.push(observation(`f7-separator-${number}`, "layout", "separator", rect(0, row.y + row.height - 1, 260, 1), layout.id, { role: "separator" }));
    }
  });
  return {
    id: "F7",
    scenarios: ["SC-H"],
    description: "Variable-height timeline with timestamp, separator, and multi-line text",
    input: {
      bundle: bundle(
        "f7-variable-height-timeline",
        260,
        305,
        [coverage("layout", "complete", layout.id), coverage("ocr", "complete", ocr.id)],
        [layout, ocr],
        observations,
      ),
      profile: profile("f7-timeline-profile", 260, 305, {
        collectionKind: "timeline",
        completeSources: ["layout", "ocr"],
        separator: { sources: ["layout"], kinds: ["separator"] },
        requiredPerItem: [
          { source: "layout", kind: "item-boundary", min: 1 },
          { source: "ocr", role: "timestamp", min: 1 },
          { source: "ocr", kind: "text", min: 2 },
        ],
      }),
    },
    oracle: { itemCount: 3, heights: [80, 130, 95], coverage: "complete" },
  };
}

function f8VirtualizedCollection() {
  const layout = evidence("f8-layout-evidence", "layout", "Eight complete visible row boundaries only");
  const ocr = evidence("f8-ocr-evidence", "ocr", "Text for the eight currently visible rows only");
  const rows = Array.from({ length: 8 }, (_, index) => ({
    y: index * 48,
    height: 48,
    text: `Visible row ${index + 1}`,
  }));
  const observations = boundaryAndTextRows("f8", rows);
  observations.forEach((entry) => {
    entry.metadata = { virtualizationScope: "currently-materialized-viewport-only" };
  });
  return {
    id: "F8",
    scenarios: ["SC-P"],
    description: "Eight materialized rows do not imply a whole-collection total of eight",
    input: {
      bundle: bundle(
        "f8-virtualized-collection",
        240,
        384,
        [coverage("layout", "complete", layout.id), coverage("ocr", "complete", ocr.id)],
        [layout, ocr],
        observations,
      ),
      profile: profile("f8-virtualized-profile", 240, 384, {
        completeSources: ["layout", "ocr"],
        requiredPerItem: [
          { source: "layout", kind: "item-boundary", min: 1 },
          { source: "ocr", kind: "text", min: 1 },
        ],
      }),
    },
    oracle: {
      visibleItemCount: 8,
      coverageScope: "current-viewport",
      forbiddenClaims: ["wholeCollectionComplete", "totalCount"],
    },
  };
}

function f9BusinessMappingBoundary() {
  const layout = evidence("f9-layout-evidence", "layout", "Complete generic conversation-row geometry");
  const ocr = evidence("f9-ocr-evidence", "ocr", "Generic row text without business interpretation");
  return {
    id: "F9",
    scenarios: ["SC-P"],
    description: "Generic items validate even when a downstream business parser deliberately fails",
    input: {
      bundle: bundle(
        "f9-business-mapping-boundary",
        240,
        120,
        [coverage("layout", "complete", layout.id), coverage("ocr", "complete", ocr.id)],
        [layout, ocr],
        boundaryAndTextRows("f9", [
          { y: 0, height: 60, text: "Raw row one" },
          { y: 60, height: 60, text: "Raw row two" },
        ]),
      ),
      profile: profile("f9-generic-profile", 240, 120, {
        completeSources: ["layout", "ocr"],
        requiredPerItem: [
          { source: "layout", kind: "item-boundary", min: 1 },
          { source: "ocr", kind: "text", min: 1 },
        ],
      }),
    },
    oracle: {
      itemCount: 2,
      collectionValid: true,
      downstreamParserError: "BUSINESS_MAPPING_ERROR",
    },
  };
}

function wechatPanelImage() {
  const image = evidence("wechat-image-evidence", "image", "Repository PNG plus deterministic human-authored row geometry; no OCR or VLM provider was run", {
    kind: "fixture-image-annotation",
    artifact: {
      path: "examples/image-color/fixtures/wechat-panel.png",
      sha256: "6a79bd709d184279e7fd213993aced95c340c700e0f390e34a704bb203b21b79",
    },
    metadata: { width: 880, height: 640, annotationMethod: "human-authored-static-fixture" },
  });
  const rowGeometry = [
    [90, 60],
    [150, 62],
    [212, 62],
    [274, 62],
    [336, 63],
    [399, 63],
    [462, 62],
    [524, 74],
  ];
  const observations = rowGeometry.map(([y, height], index) => observation(
    `wechat-image-row-${index + 1}`,
    "image",
    "item-boundary",
    rect(60, y, 240, height, "wechat-image-pixels"),
    image.id,
    { role: "visually-annotated-row", metadata: { annotationIndex: index + 1 } },
  ));
  return {
    id: "IMAGE-WECHAT-PANEL",
    scenarios: ["SC-C", "SC-P"],
    description: "Static functional validation against the repository WeChat panel image",
    input: {
      bundle: bundle(
        "wechat-panel-static-image",
        880,
        640,
        [coverage("image", "partial", image.id, "a further row is clipped at the bottom edge")],
        [image],
        observations,
        {
          scopeKind: "image",
          scopeSpace: "wechat-image-pixels",
          coordinateSpaces: [
            { id: "wechat-image-pixels", kind: "image-pixel", imageSize: { width: 880, height: 640 } },
          ],
        },
      ),
      profile: profile("wechat-panel-image-profile", 880, 640, {
        coordinateSpace: "wechat-image-pixels",
        apps: ["image-fixture"],
        pages: ["wechat-panel-static"],
        layouts: ["left-conversation-panel"],
        anchor: { sources: ["image"], kinds: ["item-boundary"] },
        completeSources: ["image"],
        minOccurrences: 3,
        minItems: 3,
        itemGeometry: { minPrimarySize: 40, minCrossSize: 200 },
        requiredPerItem: [{ source: "image", kind: "item-boundary", min: 1 }],
      }),
    },
    oracle: {
      imageSize: [880, 640],
      fullyAnnotatedVisibleItems: 8,
      coverage: "partial",
      providerClaims: [],
    },
  };
}

const scenarios = [
  f1NativeList(),
  f2NativeIncompleteOcrComplete(),
  f3NoUiTree(),
  f4GroupingDifficult(),
  f5EvidenceConflict(),
  f6RepeatedIdenticalText(),
  f7VariableHeightTimeline(),
  f8VirtualizedCollection(),
  f9BusinessMappingBoundary(),
  wechatPanelImage(),
];

module.exports = {
  byId: Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario])),
  scenarios,
};
