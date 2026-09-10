const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const appRoot = path.join(repoRoot, 'apps/inspector_web');
const webRoot = appRoot;
const assetRoot = path.join(webRoot, 'assets');
const model = require(path.join(assetRoot, 'model.js'));

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
    available: false, reason: 'logical-element-bounds-unavailable', boxes: [],
  });
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
  const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
  for (const forbidden of ['.innerHTML', 'insertAdjacentHTML', 'localStorage', 'sessionStorage', 'eval(']) {
    assert.equal(app.includes(forbidden), false, `app.js contains ${forbidden}`);
  }
  assert.match(app, /\/api\/accessibility-inspector\/v1/);
  assert.match(app, /\/api\/accessibility-workbench\/v1\/launch/);
  assert.match(app, /X-OpenDesk-Workbench-Control/);
  assert.match(app, /location\.replace\(payload\.data\.url\)/);
  assert.match(app, /fragment\.get\("api"\)/);
  assert.match(app, /plain HTTP loopback origin/);
  assert.match(app, /history\.replaceState/);
  assert.ok(app.indexOf('history.replaceState') < app.indexOf('request("/pair"'));
  assert.match(app, /scopeEpoch/);
  assert.match(app, /observationSequence/);
  assert.match(app, /collapsedNodeIds/);
  assert.match(app, /aria-busy/);
  assert.match(app, /Stale observation/);
  assert.match(app, /model\.restoreSelection/);
  assert.match(app, /model\.nodeDetails/);
  assert.match(app, /Imported validation claims were discarded/);
  assert.match(html, /id="import-handoff"/);
  assert.match(html, /id="connect-opendesk"/);
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.match(html, /connect-src 'self' http:\/\/127\.0\.0\.1:\*/);
  assert.doesNotMatch(html, /http:\/\/\[::1\]:\*/);
  assert.match(html, /rel="icon" href="data:,"/);
  assert.match(html, /href="\.\/assets\/app\.css"/);
  assert.match(html, /src="\.\/assets\/model\.js"/);
  assert.match(html, /src="\.\/assets\/app\.js"/);
  assert.equal(/<script(?!\s+src=)/i.test(html), false, 'inline script bypasses static CSP');
});

test('static frontend has no Go adapter, launcher runtime, or host asset injection', () => {
  const compositionRoot = fs.readFileSync(path.join(repoRoot, 'cmd/opendesk/main.go'), 'utf8');
  assert.equal(fs.existsSync(path.join(repoRoot, 'apps/inspector_web_assets.go')), false);
  assert.equal(fs.readdirSync(appRoot).some((entry) => entry.endsWith('.go')), false);
  assert.equal(fs.existsSync(path.join(appRoot, 'launch.js')), false);
  assert.equal(fs.existsSync(path.join(appRoot, 'package.json')), false);
  assert.doesNotMatch(compositionRoot, /InspectorWebAssets|apps\/inspector_web/);
  for (const entry of fs.readdirSync(path.join(repoRoot, 'pkg/http'))) {
    if (!entry.endsWith('.go')) continue;
    const source = fs.readFileSync(path.join(repoRoot, 'pkg/http', entry), 'utf8');
    assert.doesNotMatch(
      source,
      /go:embed.*inspector_web|HandleInspectorPage|HandleInspectorAsset/,
      `pkg/http/${entry} must not serve or embed inspector_web`,
    );
  }
  assert.equal(fs.existsSync(path.join(repoRoot, 'apps/accessibility-workbench')), false);
  assert.equal(fs.existsSync(path.join(repoRoot, 'pkg/http/inspector_ui')), false);
});
