const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const appRoot = path.join(repoRoot, 'apps/inspector_web');
const webRoot = appRoot;
const assetRoot = path.join(webRoot, 'assets');
const model = require(path.join(assetRoot, 'model.js'));

function relativeLuminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(left, right) {
  const values = [relativeLuminance(left), relativeLuminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('page access distinguishes local-only, trusted-LAN, and rejected origins', () => {
  for (const value of [
    'http://127.0.0.1:60844/accessibility-workbench/',
    'http://127.12.34.56:60844/accessibility-workbench/',
    'http://localhost:60844/accessibility-workbench/',
    'http://[::1]:60844/accessibility-workbench/',
  ]) {
    const access = model.pageAccess(value);
    assert.equal(access.canConnect, true, value);
    assert.equal(access.mode, 'local');
    assert.equal(access.reason, 'plain-http-loopback');
    assert.equal(access.currentURL.includes('#'), false);
  }

  const trusted = model.pageAccess('http://192.168.30.104:60844/accessibility-workbench/#pair=must-not-render');
  assert.deepEqual(trusted, {
    mode: 'trusted-lan',
    canConnect: true,
    reason: 'plain-http-private-network',
    currentURL: 'http://192.168.30.104:60844/accessibility-workbench/',
    loopbackURL: 'http://127.0.0.1:60844/accessibility-workbench/',
    plaintextWarning: true,
  });
  const remote = model.pageAccess('http://203.0.113.7:60844/accessibility-workbench/');
  assert.deepEqual(remote, {
    mode: 'preview',
    canConnect: false,
    reason: 'outside-trusted-network',
    currentURL: 'http://203.0.113.7:60844/accessibility-workbench/',
    loopbackURL: 'http://127.0.0.1:60844/accessibility-workbench/',
    plaintextWarning: false,
  });
  assert.equal(model.pageAccess('https://127.0.0.1:60844/accessibility-workbench/').reason, 'requires-http');
  assert.equal(model.pageAccess('not a URL').canConnect, false);
});

test('tree search and summaries preserve hostile text as data', () => {
  const hostile = '<img src=x onerror=alert(1)>';
  const root = {
    nodeId: 'node-1', role: 'window', name: 'Fixture', children: [
      { nodeId: 'node-2', role: 'button', nativeRole: 'AXButton', nativeSubrole: null,
        name: hostile, identifier: 'fixture.save', value: 'must-not-render', children: [] },
    ],
  };
  assert.equal(model.flattenTree(root).length, 2);
  const matches = model.searchSnapshot(root, 'onerror');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].node.name, hostile);
  assert.equal(model.nodeSummary(matches[0].node), `button · ${hostile}`);
  assert.equal(model.nodePresentation(matches[0].node).primary, hostile);
  assert.equal(model.buildTreeView(root).root.children[0].node.name, hostile);
  assert.equal(model.searchSnapshot(root, 'axbutton').length, 1);
  assert.deepEqual(model.nodeDetails(matches[0].node), {
    nodeId: 'node-2', role: 'button', nativeRole: 'AXButton', nativeSubrole: null, name: hostile,
    identifier: 'fixture.save', childCount: 0,
  });
});

test('selection is preserved only by a unique semantic anchor after refresh', () => {
  const before = {
    nodeId: 'node-1', role: 'window', name: 'Fixture', children: [
      { nodeId: 'node-2', role: 'button', name: 'Save', identifier: 'fixture.save', children: [] },
    ],
  };
  const anchor = model.selectionAnchor(before, before.children[0]);
  const after = {
    nodeId: 'node-9', role: 'window', name: 'Fixture', children: [
      { nodeId: 'node-10', role: 'staticText', name: 'Inserted', children: [] },
      { nodeId: 'node-11', role: 'button', name: 'Save', identifier: 'fixture.save', children: [] },
    ],
  };
  assert.deepEqual(model.restoreSelection(after, anchor), {
    node: after.children[1], status: 'preserved',
  });
  after.children.push({
    nodeId: 'node-12', role: 'button', name: 'Other', identifier: 'fixture.save', children: [],
  });
  assert.deepEqual(model.restoreSelection(after, anchor), { node: null, status: 'stale' });
  assert.deepEqual(model.restoreSelection(null, anchor), { node: null, status: 'none' });
});

test('refresh recomputes the anchor from the current selection before using a cached anchor', () => {
  const heading = { nodeId: 'node-2', role: 'heading', name: 'Old selection', children: [] };
  const invoke = { nodeId: 'node-4', role: 'button', name: 'Invoke Once', identifier: 'fixture.invoke', children: [] };
  const before = { nodeId: 'node-1', role: 'window', name: 'Fixture', children: [heading, invoke] };
  const staleCachedAnchor = model.selectionAnchor(before, heading);
  const currentAnchor = model.refreshSelectionAnchor(before, invoke, staleCachedAnchor);
  assert.deepEqual(currentAnchor, model.selectionAnchor(before, invoke));

  const after = {
    nodeId: 'node-9', role: 'window', name: 'Fixture', children: [
      { nodeId: 'node-10', role: 'staticText', name: 'Inserted', children: [] },
      { nodeId: 'node-11', role: 'button', name: 'Invoke Once', identifier: 'fixture.invoke', children: [] },
    ],
  };
  assert.deepEqual(model.restoreSelection(after, currentAnchor), {
    node: after.children[1], status: 'preserved',
  });
  assert.equal(model.refreshSelectionAnchor(null, null, staleCachedAnchor), staleCachedAnchor);
});

test('async review and import results stay bound to one observation and selected node', () => {
  const invoke = { nodeId: 'node-4', role: 'button', name: 'Invoke Once', identifier: 'fixture.invoke' };
  const root = { nodeId: 'node-1', role: 'window', name: 'Fixture', identifier: 'fixture.window', children: [invoke] };
  const observation = { observationId: 'observation-1', root };
  const context = model.selectionContext(observation, invoke);
  assert.deepEqual(context, {
    observationId: 'observation-1', nodeId: 'node-4', fingerprint: model.nodeFingerprint(invoke),
  });
  assert.equal(model.sameSelectionContext(context, observation, invoke), true);
  assert.equal(model.sameSelectionContext(context, observation, root), false);
  assert.equal(model.sameSelectionContext(context, { observationId: 'observation-2', root }, invoke), false);
  assert.equal(model.sameSelectionContext(context, observation, { ...invoke, name: 'Changed' }), false);
});

test('tree presentation keeps readable text and compresses default state noise', () => {
  const button = model.nodePresentation({
    role: 'button', name: 'Save changes', identifier: 'settings.save', enabled: true,
    focused: false, selected: false, actions: ['press'], children: [],
  });
  assert.equal(button.icon, '↵');
  assert.equal(button.primary, 'Save changes');
  assert.equal(button.unnamed, false);
  assert.deepEqual(button.states, []);
  assert.match(button.accessibleLabel, /Save changes, Button, ID settings\.save, Actionable/);
  assert.doesNotMatch(button.accessibleLabel, /Enabled|not focused|not selected|actions=/);

  const iconOnly = model.nodePresentation({
    role: 'checkbox', name: '', identifier: 'settings.analytics', enabled: false,
    focused: true, checked: false, children: [],
  });
  assert.equal(iconOnly.icon, '□');
  assert.equal(iconOnly.primary, '#settings.analytics');
  assert.equal(iconOnly.unnamed, true);
  assert.equal(iconOnly.fallback, true);
  assert.deepEqual(iconOnly.states.map(({ key, symbol }) => ({ key, symbol })), [
    { key: 'focused', symbol: '⌾' },
    { key: 'disabled', symbol: '×' },
    { key: 'unchecked', symbol: '○' },
  ]);
  assert.match(iconOnly.accessibleLabel, /Unnamed checkbox/);

  const structural = model.nodePresentation(
    { role: 'group', name: '', children: [{}] },
    { visualKind: 'structure', structuralSummary: true },
  );
  assert.equal(structural.primary, 'Group');
  assert.match(structural.accessibleLabel, /Structural branch summary/);
  assert.equal(model.nodePresentation({ role: 'staticText', name: '' }).primary, 'Static Text');
});

test('window picker presentation exposes exact identity and only warns on the exact Inspector title', () => {
  const candidate = {
    windowId: 'window-a', application: 'Google Chrome', title: 'OpenDesk Inspector', pid: 4242,
    bounds: { x: -20, y: 10, width: 1200, height: 800 },
  };
  const presentation = model.windowPresentation(candidate, 'OpenDesk Inspector');
  assert.equal(presentation.possibleInspector, true);
  assert.equal(presentation.application, 'Google Chrome');
  assert.equal(presentation.title, 'OpenDesk Inspector');
  assert.match(presentation.label, /Google Chrome/);
  assert.match(presentation.label, /“OpenDesk Inspector”/);
  assert.match(presentation.label, /PID 4242/);
  assert.match(presentation.label, /1200×800 @ -20,10/);
  assert.match(presentation.label, /window-a/);

  const sameTitleDifferentIdentity = model.windowPresentation({ ...candidate, windowId: 'window-b' }, 'OpenDesk Inspector');
  assert.notEqual(presentation.label, sameTitleDifferentIdentity.label);
  assert.equal(
    model.windowPresentation({ ...candidate, title: 'OpenDesk Inspector docs' }, 'OpenDesk Inspector').possibleInspector,
    false,
  );
  assert.equal(model.windowPresentation(null, 'OpenDesk Inspector').possibleInspector, false);
});

test('node value tiers retain meaningful unnamed nodes without treating default states as signal', () => {
  assert.equal(model.nodeValue({ role: 'window', children: [] }, { root: true }).level, 'root');
  assert.equal(model.nodeValue({ role: 'group', name: 'Account', children: [] }).level, 'content');
  assert.equal(model.nodeValue({ role: 'group', identifier: 'settings.group', children: [] }).level, 'identified');
  assert.equal(model.nodeValue({ role: 'unknown', focused: true, children: [] }).level, 'stateful');
  assert.equal(model.nodeValue({ role: 'unknown', selected: true, children: [] }).keepDefault, true);
  assert.equal(model.nodeValue({ role: 'unknown', enabled: false, children: [] }).keepDefault, true);
  assert.equal(model.nodeValue({ role: 'unknown', checked: false, children: [] }).keepDefault, true);
  assert.equal(model.nodeValue({ role: 'unknown', actions: ['press'], children: [] }).level, 'actionable');
  assert.equal(model.nodeValue({ role: 'button', name: '', children: [] }).level, 'actionable');
  assert.equal(model.nodeValue({ role: 'textField', name: '', children: [] }).keepDefault, true);
  assert.equal(model.nodeValue({ role: 'group', enabled: true, focused: false, children: [{}] }).level, 'structure');
  assert.equal(model.nodeValue({ role: 'staticText', name: '', children: [] }).level, 'noise');
});

test('compact tree folds structural chains, preserves branches, and full mode restores every node', () => {
  const root = {
    nodeId: 'root', role: 'window', name: 'Fixture', children: [
      { nodeId: 'chain-1', role: 'group', children: [
        { nodeId: 'chain-2', role: 'generic', children: [
          { nodeId: 'anonymous-button', role: 'button', name: '', children: [] },
        ] },
      ] },
      { nodeId: 'branch', role: 'group', children: [
        { nodeId: 'named-text', role: 'staticText', name: 'Ready', children: [] },
        { nodeId: 'identified', role: 'group', identifier: 'results.group', children: [] },
        { nodeId: 'branch-empty', role: 'staticText', name: '', children: [] },
      ] },
      { nodeId: 'direct-empty', role: 'staticText', name: '', children: [] },
      { nodeId: 'anonymous-input', role: 'textField', name: '', children: [] },
      { nodeId: 'disabled-node', role: 'unknown', name: '', enabled: false, children: [] },
    ],
  };
  const flattenView = (view) => view ? [view, ...view.children.flatMap(flattenView)] : [];
  const compact = model.buildTreeView(root);
  const compactRows = flattenView(compact.root);
  const compactIds = compactRows.map(({ node }) => node.nodeId);
  assert.equal(compact.root.visualKind, 'container');
  assert.deepEqual(compact.stats, {
    totalNodes: 11, visibleNodes: 7, hiddenStructure: 2, hiddenLeaves: 2,
  });
  assert.deepEqual(compact.hiddenById, {
    'chain-1': 'structure', 'chain-2': 'structure',
    'branch-empty': 'empty-leaf', 'direct-empty': 'empty-leaf',
  });
  const hiddenSearch = model.searchSnapshot(root, 'generic');
  assert.equal(hiddenSearch.length, 1);
  assert.equal(compact.hiddenById[hiddenSearch[0].node.nodeId], 'structure');
  assert.ok(compactIds.includes('anonymous-button'), 'unnamed control remains visible');
  assert.ok(compactIds.includes('anonymous-input'), 'unnamed input remains visible');
  assert.ok(compactIds.includes('disabled-node'), 'stateful unnamed node remains visible');
  assert.ok(compactIds.includes('identified'), 'identifier candidate remains visible');

  const buttonView = compactRows.find(({ node }) => node.nodeId === 'anonymous-button');
  assert.deepEqual(buttonView.compressedAncestors.map(({ nodeId }) => nodeId), ['chain-1', 'chain-2']);
  const branchView = compactRows.find(({ node }) => node.nodeId === 'branch');
  assert.equal(branchView.visualKind, 'structure');
  assert.equal(branchView.structuralSummary, true);
  assert.deepEqual(branchView.children.map(({ node }) => node.nodeId), ['named-text', 'identified']);
  assert.equal(branchView.children[0].visualKind, 'content');
  assert.equal(branchView.children[1].visualKind, 'container');

  const selectedEmpty = model.buildTreeView(root, { preserveNodeIds: ['direct-empty'] });
  assert.ok(flattenView(selectedEmpty.root).some(({ node }) => node.nodeId === 'direct-empty'));
  assert.equal(selectedEmpty.stats.hiddenLeaves, 1);

  const full = model.buildTreeView(root, { showStructureNodes: true });
  assert.deepEqual(full.stats, {
    totalNodes: 11, visibleNodes: 11, hiddenStructure: 0, hiddenLeaves: 0,
  });
  assert.deepEqual(full.root.children[0].children[0].children[0].node, root.children[0].children[0].children[0]);
  assert.equal(full.root.children[0].visualKind, 'structure');
  assert.deepEqual(full.hiddenById, {});
  assert.deepEqual(full.hiddenNodes, []);
});

test('compact visibility identifies hidden structure and empty leaves without node IDs', () => {
  const structural = {
    role: 'generic', children: [
      { role: 'staticText', name: 'Needle', children: [] },
    ],
  };
  const emptyLeaf = { role: 'staticText', name: '', children: [] };
  const root = { role: 'window', name: 'Fixture', children: [structural, emptyLeaf] };
  const compact = model.buildTreeView(root);
  assert.equal(model.hiddenReason(compact, structural), 'structure');
  assert.equal(model.hiddenReason(compact, emptyLeaf), 'empty-leaf');
  assert.deepEqual(compact.hiddenById, {});
  assert.equal(compact.hiddenNodes.length, 2);
  assert.equal(model.hiddenReason(compact, model.searchSnapshot(root, 'generic')[0].node), 'structure');
  const emptyMatch = model.searchSnapshot(root, 'statictext').find(({ node }) => !node.name);
  assert.equal(model.hiddenReason(compact, emptyMatch.node), 'empty-leaf');

  const withSelectedLeaf = model.buildTreeView(root, { preserveNodes: [emptyLeaf] });
  assert.ok(withSelectedLeaf.root.children.some(({ node }) => node === emptyLeaf));
  assert.equal(model.hiddenReason(withSelectedLeaf, emptyLeaf), '');

  const full = model.buildTreeView(root, { showStructureNodes: true });
  assert.equal(model.hiddenReason(full, structural), '');
  assert.equal(model.hiddenReason(full, emptyLeaf), '');
});

test('observation presentation distinguishes loading empty stale partial and truncation', () => {
  assert.deepEqual(model.observationState(null, 'loading'), {
    label: 'Loading', tone: 'pending', mode: 'loading',
  });
  assert.equal(model.observationState(null, 'idle').mode, 'empty');
  assert.deepEqual(model.observationState({ root: {}, freshness: 'stale' }, 'idle'), {
    label: 'Stale', tone: 'bad', mode: 'stale',
  });
  assert.equal(model.observationState({ root: {}, complete: false, truncated: false }, 'idle').label, 'Partial');
  assert.equal(model.observationState({ root: {}, complete: false, truncated: true }, 'idle').label, 'Truncated');
});

test('logical geometry clips negative and off-window bounds without inventing coordinates', () => {
  const observation = {
    window: { x: 0, y: 0, width: 100, height: 100 },
    root: {
      nodeId: 'node-1', role: 'window', bounds: { x: 0, y: 0, width: 100, height: 100 }, children: [
        { nodeId: 'node-2', role: 'button', bounds: { x: -50, y: 20, width: 100, height: 40 } },
        { nodeId: 'node-3', role: 'button', bounds: { x: 200, y: 200, width: 10, height: 10 } },
      ],
    },
  };
  const mapping = model.layoutMapping(observation, 100, 100);
  assert.equal(mapping.available, true);
  const clipped = mapping.boxes.find((box) => box.nodeId === 'node-2');
  assert.deepEqual(
    { left: clipped.left, top: clipped.top, width: clipped.width, height: clipped.height },
    { left: 0, top: 20, width: 50, height: 40 },
  );
  assert.equal(mapping.boxes.some((box) => box.nodeId === 'node-3'), false);

  const negativeDisplay = {
    window: { x: -1440, y: -100, width: 800, height: 600 },
    root: { nodeId: 'node-1', role: 'window', bounds: { x: -1440, y: -100, width: 800, height: 600 } },
  };
  assert.equal(model.layoutMapping(negativeDisplay, 400, 300).available, true);
  assert.deepEqual(model.layoutMapping({ window: negativeDisplay.window, root: { nodeId: 'node-1' } }, 400, 300), {
    available: false, reason: 'compatible-element-bounds-unavailable', boxes: [],
  });
});

test('visual capture trust state binds pixels to session observation generation bounds and expiry', () => {
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const observation = {
    observationId: 'observation-1', generation: 7, freshness: 'current',
    window: {
      windowId: 'window-1', title: 'Fixture', application: 'OpenDesk Fixture', pid: 42,
      x: -20, y: 10, width: 200, height: 100,
    },
    root: { nodeId: 'node-1', role: 'window', bounds: { x: -20, y: 10, width: 200, height: 100 } },
  };
  const capture = {
    schemaVersion: 'opendesk.inspector.visual-capture/v1',
    captureId: 'capture-1', sessionId: 'session-1', observationId: 'observation-1', generation: 7,
    capturedAt: '2026-09-11T10:00:00Z', expiresAt: '2026-09-11T10:00:30Z',
    window: {
      windowId: 'window-1', title: 'Fixture', application: 'OpenDesk Fixture', pid: 42,
      x: -20, y: 10, width: 200, height: 100,
    },
    image: {
      dataUrl: `data:image/png;base64,${pngBase64}`, mimeType: 'image/png',
      width: 400, height: 200, sizeBytes: Buffer.from(pngBase64, 'base64').length,
    },
    captureProvenance: {
      method: 'macos-coregraphics-window-id', scope: 'exact-window',
      foregroundVerified: false, occlusionRisk: false, focusChanged: false, persisted: false,
    },
  };
  assert.deepEqual(model.visualCaptureState(capture, observation, 'session-1', 7, Date.parse('2026-09-11T10:00:10Z')), {
    current: true, usable: true, reason: 'exact-window', label: 'Exact window', tone: 'good',
  });
  assert.equal(model.visualCaptureState(capture, observation, 'session-other', 7, Date.parse('2026-09-11T10:00:10Z')).reason, 'capture-binding-mismatch');
  assert.equal(model.visualCaptureState(capture, observation, 'session-1', 7, Date.parse('2026-09-11T10:00:30Z')).reason, 'capture-expired');
  assert.equal(model.visualCaptureState({ ...capture, window: { ...capture.window, width: 201 } }, observation, 'session-1', 7, Date.parse('2026-09-11T10:00:10Z')).reason, 'capture-bounds-mismatch');
  assert.equal(model.visualCaptureState({ ...capture, image: { ...capture.image, dataUrl: 'file:///tmp/leak.png' } }, observation, 'session-1', 7, Date.parse('2026-09-11T10:00:10Z')).reason, 'capture-image-invalid');
  const risky = model.visualCaptureState({
    ...capture,
    captureProvenance: { ...capture.captureProvenance, scope: 'visible-bounds', occlusionRisk: true },
  }, observation, 'session-1', 7, Date.parse('2026-09-11T10:00:10Z'));
  assert.deepEqual(risky, {
    current: true, usable: false, reason: 'occlusion-risk',
    label: 'Visible bounds / may be occluded', tone: 'warn',
  });
  assert.equal(model.visualCaptureState(capture, { ...observation, freshness: 'stale' }, 'session-1', 7, Date.parse('2026-09-11T10:00:10Z')).reason, 'observation-stale');
});

test('image-fit mapping and Selected / All boxes keep exact logical alignment', () => {
  const selected = { nodeId: 'node-2', role: 'button', name: '<img onerror=alert(1)>', bounds: { x: 50, y: 25, width: 100, height: 50 } };
  const outside = { nodeId: 'node-3', role: 'button', name: 'Outside', bounds: { x: 300, y: 300, width: 10, height: 10 } };
  const observation = {
    window: { x: 0, y: 0, width: 200, height: 100 },
    root: { nodeId: 'node-1', role: 'window', bounds: { x: 0, y: 0, width: 200, height: 100 }, children: [selected, outside] },
  };
  const mapping = model.layoutMapping(observation, 400, 300);
  assert.equal(mapping.scale, 2);
  assert.equal(mapping.offsetX, 0);
  assert.equal(mapping.offsetY, 50);
  const selectedMapped = mapping.boxes.find((box) => box.nodeId === 'node-2');
  assert.deepEqual(
    { left: selectedMapped.left, top: selectedMapped.top, width: selectedMapped.width, height: selectedMapped.height },
    { left: 100, top: 100, width: 200, height: 100 },
  );
  assert.equal(mapping.boxes.some((box) => box.nodeId === 'node-3'), false);
  const selectedOnly = model.overlayBoxes(mapping, selected, 'selected');
  assert.equal(selectedOnly.length, 1);
  assert.equal(selectedOnly[0].selected, true);
  assert.equal(selectedOnly[0].label, 'button · <img onerror=alert(1)>');
  const all = model.overlayBoxes(mapping, selected, 'all');
  assert.equal(all.length, 2);
  assert.equal(all.filter((box) => box.selected).length, 1);
  assert.equal(model.overlayBoxes(mapping, null, 'selected').length, 0);
});

test('macOS nativeBounds map only inside one proven coordinate space', () => {
  const space = 'macos-global-display-points-top-left';
  const selected = {
    nodeId: 'node-2', role: 'button', name: 'Invoke Once', bounds: null,
    nativeBounds: { x: 1491, y: 250, width: 180, height: 36, coordinateSpace: space },
  };
  const mismatched = {
    nodeId: 'node-3', role: 'button', name: 'Other display', bounds: null,
    nativeBounds: { x: 1491, y: 300, width: 180, height: 36, coordinateSpace: 'other-space' },
  };
  const observation = {
    window: { x: 1311, y: 153, width: 720, height: 388 },
    root: {
      nodeId: 'node-1', role: 'window', bounds: null,
      nativeBounds: { x: 1311, y: 153, width: 720, height: 388, coordinateSpace: space },
      children: [selected, mismatched],
    },
  };
  const mapping = model.layoutMapping(observation, 720, 420);
  assert.equal(mapping.available, true);
  assert.equal(mapping.coordinateSource, 'nativeBounds');
  assert.equal(mapping.coordinateSpace, space);
  assert.equal(mapping.reason, 'compatible-native-bounds-mapped');
  assert.equal(mapping.scale, 1);
  assert.equal(mapping.offsetX, 0);
  assert.equal(mapping.offsetY, 16);
  const selectedMapped = mapping.boxes.find((box) => box.nodeId === 'node-2');
  assert.deepEqual(
    { left: selectedMapped.left, top: selectedMapped.top, width: selectedMapped.width, height: selectedMapped.height },
    { left: 180, top: 113, width: 180, height: 36 },
  );
  assert.equal(mapping.boxes.some((box) => box.nodeId === 'node-3'), false);

  const narrow = model.layoutMapping(observation, 280, 420);
  assert.equal(narrow.scale, 280 / 720);
  assert.equal(narrow.offsetX, 0);
  assert.ok(narrow.boxes.every((box) => box.left + box.width <= 280));
});

test('locator handoff stays exact and generated JavaScript is observation-only', () => {
  const node = { role: 'button', name: 'Save', identifier: 'fixture.save' };
  assert.deepEqual(model.locatorFromNode(node), node);
  assert.equal(model.sameLocator(node, { identifier: 'fixture.save', role: 'button' }), false);
  assert.equal(model.sameLocator(node, { role: 'button', name: 'Save', identifier: 'fixture.save' }), true);
  const handoff = {
    scope: { windowTarget: { pid: 42, title: 'Fixture' } },
    locatorCandidate: { selector: node },
  };
  const source = model.jsSnippet(handoff);
  assert.match(source, /window\.get/);
  assert.match(source, /Accessibility\.find/);
  assert.match(source, /Accessibility\.read/);
  assert.match(source, /Accessibility\.release/);
  assert.doesNotMatch(source, /Accessibility\.perform\s*\(/);
});

test('browser UI uses text-only rendering, memory credentials, current routes, and import controls', () => {
  const app = fs.readFileSync(path.join(assetRoot, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(assetRoot, 'app.css'), 'utf8');
  const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
  for (const forbidden of ['.innerHTML', 'insertAdjacentHTML', 'localStorage', 'sessionStorage', 'eval(']) {
    assert.equal(app.includes(forbidden), false, `app.js contains ${forbidden}`);
  }
  assert.match(app, /\/api\/accessibility-inspector\/v1/);
  assert.match(app, /\/api\/accessibility-workbench\/v1\/launch/);
  assert.match(app, /X-OpenDesk-Workbench-Control/);
  assert.match(app, /await pair\(launchURL\.hash\)/);
  assert.match(app, /different selected node/);
  assert.match(app, /clearHandoffDetail/);
  assert.match(app, /globalThis\.top !== globalThis\.self/);
  assert.match(app, /refuses to run inside an embedded frame/);
  assert.match(app, /fragment\.get\("api"\)/);
  assert.match(app, /no longer accepts a separate API origin/);
  assert.match(app, /location\.origin/);
  assert.match(app, /trusted-LAN/);
  assert.doesNotMatch(app, /The Workbench API endpoint must be a plain HTTP loopback origin/);
  assert.doesNotMatch(app, /query\.get\("control"\)/);
  assert.match(app, /model\.pageAccess\(location\.href\)/);
  assert.match(app, /history\.replaceState\(null, "", location\.pathname \+ location\.search\)/);
  assert.match(app, /history\.replaceState/);
  assert.ok(app.indexOf('history.replaceState') < app.indexOf('request("/pair"'));
  assert.match(app, /scopeEpoch/);
  assert.match(app, /observationSequence/);
  assert.match(app, /collapsedNodeIds/);
  assert.match(app, /model\.buildTreeView/);
  assert.match(app, /model\.hiddenReason/);
  assert.match(app, /sameObservedNode/);
  assert.match(app, /showStructureNodes/);
  assert.match(app, /selectedWithId/);
  assert.match(app, /snapshot node has no node ID/);
  assert.match(app, /children\.length \+ \(children\.length === 1 \? " branch" : " branches"\)/);
  assert.match(app, /hidden structural node in compact view/);
  assert.match(app, /aria-posinset/);
  assert.match(app, /aria-busy/);
  assert.match(app, /model\.nodePresentation/);
  assert.match(app, /handleTreeKeydown/);
  assert.match(css, /\.tree-row\.is-container\s*\{[^}]*min-height:\s*27px/s);
  assert.match(css, /\.tree-row\.is-structure\s*\{[^}]*min-height:\s*21px/s);
  assert.match(css, /\.tree-structure-fold/);
  assert.doesNotMatch(css, /\.tree-row\.is-enabled/);
  assert.match(app, /Stale observation/);
  assert.match(app, /Selection stale/);
  assert.match(app, /was not reused/);
  assert.match(app, /model\.restoreSelection/);
  assert.match(app, /model\.nodeDetails/);
  assert.match(app, /Imported validation claims were discarded/);
  assert.match(app, /model\.windowPresentation/);
  assert.match(app, /globalThis\.confirm/);
  assert.match(app, /data\.window\.windowId !== windowId/);
  assert.match(app, /sessionPhase/);
  assert.match(app, /function guideState\(\)/);
  assert.match(app, /function performGuideAction\(\)/);
  assert.match(app, /windowPhase/);
  assert.match(app, /Go to target list/);
  assert.match(app, /Click a row in the UI tree/);
  assert.doesNotMatch(app, /elements\["how-to-use"\]\.open = false/);
  assert.match(html, /id="import-handoff"/);
  assert.doesNotMatch(html, /id="connect-opendesk"/);
  assert.match(html, /id="getting-started"/);
  assert.match(html, /id="how-to-use"/);
  assert.match(html, /id="guide-action"/);
  assert.equal((html.match(/>Connect to OpenDesk<\/button>/g) || []).length, 1);
  assert.match(html, /id="origin-route"/);
  assert.match(html, /Trusted-LAN address · plaintext HTTP/);
  assert.match(html, /id="interface-preview" class="interface-preview"/);
  assert.match(html, /Do this now/);
  assert.match(html, /Click a row in UI tree/);
  assert.match(html, /It does not click or type/);
  assert.match(html, /id="target-state"/);
  assert.match(html, /one connected Inspector/i);
  assert.match(html, /One current OpenDesk\.app on this computer is enough/i);
  assert.match(html, /Do not start a Python server or companion OpenDesk process/i);
  assert.match(html, /separate native browser window/i);
  assert.match(html, /Refreshing the UI tree never captures pixels/i);
  assert.match(html, /id="tree-view-toggle"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-controls="tree"/);
  assert.match(html, /aria-label="Tree visual key"/);
  assert.match(html, /aria-label="Refresh UI tree"/);
  assert.match(html, /id="capture-visual"/);
  assert.match(html, /id="visual-image" class="visual-image"/);
  assert.match(html, /id="visual-overlay" class="visual-overlay"/);
  assert.match(html, /id="boxes-selected"[^>]*aria-pressed="true"/);
  assert.match(html, /id="boxes-all"[^>]*aria-pressed="false"/);
  assert.match(html, /2px red box/);
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /connect-src 'self'/);
  assert.match(html, /img-src 'self' data:/);
  assert.doesNotMatch(html, /http:\/\/\[::1\]:\*/);
  assert.match(html, /rel="icon" href="data:,"/);
  assert.match(html, /href="\.\/assets\/app\.css"/);
  assert.match(html, /src="\.\/assets\/model\.js"/);
  assert.match(html, /src="\.\/assets\/app\.js"/);
  assert.match(css, /\.quick-steps li\.current/);
  assert.match(css, /\.quick-steps li\.complete/);
  assert.match(css, /--visual-selection:\s*#ff3b30/i);
  assert.match(css, /\.mapping-box\.selected\s*\{[^}]*border:\s*2px solid var\(--visual-selection\)/s);
  assert.match(css, /\.mapping-box\s*\{[^}]*border:\s*1px solid rgba\(85, 167, 255/s);
  assert.match(app, /\/visual-captures/);
  assert.match(app, /body: \{ observationId, generation \}/);
  assert.match(app, /function invalidateVisual\(/);
  assert.match(app, /The UI tree was refreshed\. Capture visual again for this observation\./);
  assert.match(css, /\.empty\[hidden\]\s*\{\s*display:\s*none;/);
  assert.match(app, /model\.visualCaptureState/);
  assert.match(app, /model\.overlayBoxes/);
  assert.match(app, /source: "overlay"/);
  assert.match(app, /scrollIntoView/);
  assert.match(app, /handleMappingKeydown/);
  assert.match(app, /visualStage\.clientWidth/);
  assert.match(app, /visualStage\.clientHeight/);
  assert.match(app, /logical\.clientWidth/);
  assert.doesNotMatch(app, /Math\.max\([^\n]+,\s*320\)/);
  assert.doesNotMatch(app, /page\.screenshot|CaptureScreen/);
  assert.equal(/<script(?!\s+src=)/i.test(html), false, 'inline script bypasses static CSP');
});

test('user documentation describes the current same-origin local and trusted-LAN workflow', () => {
  const readme = fs.readFileSync(path.join(webRoot, 'README.md'), 'utf8');
  const integration = fs.readFileSync(path.join(repoRoot, 'docs/integrations/desktop-agent.md'), 'utf8');
  const quickstart = fs.readFileSync(path.join(repoRoot, 'QUICKSTART.md'), 'utf8');
  for (const document of [readme, integration, quickstart]) {
    assert.match(document, /OpenDesk ready|actual-port|实际地址|实际.*端口/i);
    assert.match(document, /trusted-LAN|可信.*局域网/i);
    assert.doesNotMatch(document, /python3 -m http\.server 60845/);
  }
  assert.match(readme, /same-origin/i);
  assert.match(integration, /legacy `60844`|legacy.*60844/i);
  assert.match(quickstart, /Allow Inspector from\s+LAN/);
});

test('small secondary text tokens retain WCAG AA contrast on workbench surfaces', () => {
  const css = fs.readFileSync(path.join(assetRoot, 'app.css'), 'utf8');
  const token = (name) => {
    const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'));
    assert.ok(match, `missing --${name} color token`);
    return match[1];
  };
  for (const foreground of ['muted', 'subtle']) {
    assert.ok(
      contrastRatio(token(foreground), token('panel')) >= 4.5,
      `--${foreground} must remain readable at small text sizes`,
    );
  }
});

test('frontend remains source-owned and is served and bundled through an explicit allowlist', () => {
  const compositionRoot = fs.readFileSync(path.join(repoRoot, 'cmd/opendesk/main.go'), 'utf8');
  const handler = fs.readFileSync(path.join(repoRoot, 'pkg/http/inspector_control.go'), 'utf8');
  const build = fs.readFileSync(path.join(repoRoot, 'scripts/build_macos_app.sh'), 'utf8');
  const legacyEntryPath = path.join(webRoot, 'accessibility-workbench', 'index.html');
  const legacyEntry = fs.readFileSync(legacyEntryPath, 'utf8');
  assert.match(legacyEntry, /http-equiv="refresh" content="0; url=\.\.\/"/);
  assert.match(legacyEntry, /default-src 'none'/);
  assert.equal(/<script/i.test(legacyEntry), false, 'legacy static entry must remain a data-free redirect');
  assert.equal(fs.existsSync(path.join(repoRoot, 'apps/inspector_web_assets.go')), false);
  assert.equal(fs.readdirSync(appRoot).some((entry) => entry.endsWith('.go')), false);
  assert.equal(fs.existsSync(path.join(appRoot, 'launch.js')), false);
  assert.equal(fs.existsSync(path.join(appRoot, 'package.json')), false);
  assert.match(compositionRoot, /apps", "inspector_web/);
  assert.match(compositionRoot, /Resources", "inspector_web/);
  assert.match(handler, /"index\.html"/);
  assert.match(handler, /"assets", "app\.js"/);
  assert.doesNotMatch(handler, /http\.FileServer|go:embed/);
  assert.match(build, /INSPECTOR_WEB_PATH/);
  assert.match(build, /rsync -a --delete/);
  assert.equal(fs.existsSync(path.join(repoRoot, 'apps/accessibility-workbench')), false);
  assert.equal(fs.existsSync(path.join(repoRoot, 'pkg/http/inspector_ui')), false);
});

test('macOS Developer tray uses only the loopback token control bridge', () => {
  const compositionRoot = fs.readFileSync(path.join(repoRoot, 'cmd/opendesk/main.go'), 'utf8');
  const launcher = fs.readFileSync(path.join(repoRoot, 'cmd/opendesk/app_status_darwin.go'), 'utf8');
  const helper = fs.readFileSync(path.join(repoRoot, 'cmd/opendesk-status/main_darwin.m'), 'utf8');
  const control = fs.readFileSync(path.join(repoRoot, 'pkg/http/inspector_control.go'), 'utf8');
  assert.match(helper, /initWithTitle:@"Developer"/);
  assert.match(helper, /initWithTitle:@"Open Inspector"/);
  assert.match(helper, /initWithTitle:@"Allow Inspector from LAN"/);
  assert.match(helper, /initWithTitle:@"Copy Inspector LAN URL"/);
  assert.match(helper, /inspectorControlToken\.length > 0/);
  assert.match(helper, /X-OpenDesk-Inspector-Control/);
  assert.match(compositionRoot, /accessibilityWorkbenchEnabled\(isAutoRunJs, port\)/);
  assert.match(compositionRoot, /autoRuntime \|\| strings\.TrimSpace\(port\) == "60844"/);
  assert.match(launcher, /endpointAddress.*accessibility-workbench|baseURL.*accessibility-workbench/);
  assert.match(launcher, /inspectorControlToken/);
  assert.match(control, /authorizeInternal/);
  assert.match(control, /subtle\.ConstantTimeCompare/);
  assert.doesNotMatch(control, /os\.WriteFile|NSUserDefaults|Save.*allowLAN/i);
});
