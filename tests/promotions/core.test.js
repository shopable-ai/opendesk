'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../../apps/opendesk/promotions/core.js');
const controller = require('../../apps/opendesk/promotions/controller.js');
const ownerAPI = require('../../apps/opendesk/promotions/owner.js');
const integration = require('../../apps/opendesk/promotions/integration.js');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlW0xkAAAAASUVORK5CYII=';
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const safe = () => ({
  ready: true,
  ownerVisible: true,
  automationIdle: true,
  recorderIdle: true,
  measurementIdle: true,
  listOpen: false,
  fullscreen: false,
  presentationMode: false,
});
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));

function creative(kind) {
  const base = {
    schemaVersion: 2,
    id: 'demoCreative',
    campaignId: 'demoCampaign',
    advertiser: 'OpenDesk 官方示例',
    title: '重复的操作，交给自动化。',
    description: '从一次操作，到可验证、可重复运行的自动化。',
    cta: '了解详情',
    action: {kind: 'preview'},
  };
  if (kind === 'text') return {...base, presentation: 'text'};
  if (kind === 'image-text') {
    return {...base, presentation: 'image-text', media: {kind: 'image', src: PNG, alt: '静态示例'}};
  }
  if (kind === 'animated-image') {
    return {...base, presentation: 'animated-image', media: {kind: 'animated-image', src: GIF, poster: PNG, alt: '动图示例'}};
  }
  if (kind === 'media-only-static') {
    return {
      schemaVersion: 2,
      id: 'mediaOnlyStatic',
      campaignId: 'mediaOnlyCampaign',
      advertiser: 'OpenDesk 官方示例',
      presentation: 'media-only',
      cta: '了解详情',
      action: {kind: 'preview'},
      media: {kind: 'image', src: PNG, alt: '素材自带完整文案'},
    };
  }
  if (kind === 'media-only-animated') {
    return {
      schemaVersion: 2,
      id: 'mediaOnlyAnimated',
      campaignId: 'mediaOnlyCampaign',
      advertiser: 'OpenDesk 官方示例',
      presentation: 'media-only',
      cta: '了解详情',
      action: {kind: 'preview'},
      media: {kind: 'animated-image', src: GIF, poster: PNG, alt: '动图素材自带完整文案'},
    };
  }
  return {...base, presentation: 'image', media: {kind: 'image', src: PNG, alt: '静态示例'}};
}

function fakeHost(options = {}) {
  const windows = [];
  const timers = new Map();
  let nextTimer = 0;
  function later(fn, ms) {
    const id = ++nextTimer;
    if (ms <= 25) queueMicrotask(fn);
    else timers.set(id, {fn, ms});
    return id;
  }
  function cancel(id) { timers.delete(id); }
  const ui = {
    async createWindow(spec) {
      if (options.webviewUnavailable) throw new Error('WebView2 unavailable');
      if (options.beforeCreate) await options.beforeCreate();
      const events = {};
      const controls = {};
      const imageMatch = spec.content && spec.content.html && spec.content.html.match(/id="promotionImage"[^>]*src="([^"]+)"/);
      let imageSource = imageMatch ? imageMatch[1] : '';
      let closed = false;
      const handle = {
        id: spec.id,
        spec,
        events,
        controls,
        shows: 0,
        closed: false,
        on(type, fn) { events[type] = fn; return () => { if (events[type] === fn) delete events[type]; }; },
        control(id) {
          if (!controls[id]) {
            const controlEvents = {};
            controls[id] = {
              events: controlEvents,
              patches: [],
              on(type, fn) { controlEvents[type] = fn; return () => { if (controlEvents[type] === fn) delete controlEvents[type]; }; },
              async update(patch) {
                this.patches.push(clone(patch));
                if (id === 'promotionImage' && patch && typeof patch.source === 'string') imageSource = patch.source;
                return this.getState();
              },
              async getState() {
                if (id !== 'promotionImage') return {id, classes: []};
                const fail = options.decodeFailure === true
                  || (typeof options.decodeFailure === 'function' && options.decodeFailure(imageSource));
                return {
                  id,
                  type: 'img',
                  source: imageSource,
                  imageComplete: true,
                  imageNaturalWidth: fail ? 0 : 360,
                  imageNaturalHeight: fail ? 0 : 240,
                };
              },
            };
          }
          return controls[id];
        },
        async setRelativeTo(anchor) {
          const size = spec.position.size;
          return {bounds: options.overlap ? clone(anchor) : {x: anchor.x + anchor.width - size.width, y: anchor.y - size.height - 12, width: size.width, height: size.height}};
        },
        async setPlacement() {
          const size = spec.position.size;
          return {bounds: {x: 600, y: 300, width: size.width, height: size.height}};
        },
        async show() {
          this.shows++;
          return {visible: true, onScreen: options.onScreen !== false, bounds: {x: 600, y: 300, width: spec.position.size.width, height: spec.position.size.height}};
        },
        async close() {
          if (options.closeError) throw new Error('host close failed');
          if (closed) return {visible: false, onScreen: false};
          closed = true;
          this.closed = true;
          if (events.close) await events.close({type: 'close'});
          return {visible: false, onScreen: false};
        },
        async waitUntilClosed() { return closed; },
      };
      windows.push(handle);
      return handle;
    },
  };
  return {ui, windows, timers, later, cancel};
}

function setup(options = {}) {
  const host = fakeHost(options.host || {});
  const context = safe();
  let now = new Date(2026, 8, 17, 10).getTime();
  const writes = [];
  const c = controller.create({
    ui: host.ui,
    getContext: () => context,
    setTimeout: host.later,
    clearTimeout: host.cancel,
    now: () => now,
    reducedMotion: options.reducedMotion === true,
    savePreferences: async value => { writes.push(clone(value)); },
    ...(options.controller || {}),
  });
  return {host, context, c, writes, setNow: value => { now = value; }, now: () => now};
}

const placement = {mode: 'runner-above', anchor: {x: 400, y: 700, width: 590, height: 54}};

async function click(window, id) {
  const control = window.control(id);
  assert.equal(typeof control.events.click, 'function', `${id} click handler`);
  return control.events.click({type: 'click'});
}

test('v4 validates all five presentations including media-only static and animated', () => {
  for (const kind of ['image', 'animated-image', 'media-only-static', 'media-only-animated', 'image-text', 'text']) {
    assert.equal(core.validateCreative(creative(kind)).schemaVersion, 2);
  }
  assert.deepEqual(core.PRESENTATIONS, ['image', 'animated-image', 'media-only', 'image-text', 'text']);
});

test('media-only rejects title/description and never renders copy controls', () => {
  const staticCreative = creative('media-only-static');
  const animatedCreative = creative('media-only-animated');
  for (const value of [staticCreative, animatedCreative]) {
    const html = core.render(value, true).html;
    assert.ok(html.includes('promotionImage'));
    assert.ok(!html.includes('promotionTitle'));
    assert.ok(!html.includes('promotionDescription'));
    assert.ok(html.includes('promotionOpen'));
  }
  assert.throws(() => core.validateCreative({...staticCreative, title: '不应出现'}), /media-only/);
  assert.throws(() => core.validateCreative({...animatedCreative, description: '不应出现'}), /media-only/);
});

test('unknown presentation/media combinations fail closed', () => {
  assert.throws(() => core.validateCreative({...creative('image'), presentation: 'video'}), /presentation/);
  assert.throws(() => core.validateCreative({...creative('image'), presentation: 'animated-image'}), /animated-image presentation/);
  assert.throws(() => core.validateCreative({...creative('text'), media: {kind: 'image', src: PNG, alt: 'x'}}), /cannot contain media/);
});

test('renderer has no legacy motion controls or footer bar', () => {
  const html = core.render(creative('animated-image'), true).html;
  assert.ok(!html.includes('promotionMotion'));
  assert.ok(!html.includes('播放动图'));
  assert.ok(!html.includes('暂停动图'));
  assert.ok(!html.includes('footer'));
  const source = fs.readFileSync(path.join(__dirname, '../../apps/opendesk/promotions/controller.js'), 'utf8');
  assert.ok(!source.includes('promotionMotion'));
});

test('sizes match v4 contract', () => {
  assert.deepEqual(core.sizeFor(core.validateCreative(creative('image'))), {width: 360, height: 240});
  assert.deepEqual(core.sizeFor(core.validateCreative(creative('animated-image'))), {width: 360, height: 240});
  assert.deepEqual(core.sizeFor(core.validateCreative(creative('media-only-static'))), {width: 360, height: 240});
  assert.deepEqual(core.sizeFor(core.validateCreative(creative('image-text'))), {width: 360, height: 268});
  assert.deepEqual(core.sizeFor(core.validateCreative(creative('text'))), {width: 360, height: 196});
});

test('placement respects runner gap, work area, negative origins and no-overlap rule', () => {
  const area = {x: -1440, y: 0, width: 1440, height: 900};
  const anchor = {x: -1000, y: 800, width: 590, height: 54};
  const placed = core.place('runner-above', area, anchor, {width: 360, height: 240});
  assert.equal(placed.y, 548);
  assert.ok(!core.overlaps(placed, anchor));
  const corner = core.place('screen-bottom-right', area, null, {width: 360, height: 240});
  assert.equal(corner.x, -376);
  assert.equal(core.place('runner-above', area, {...anchor, y: 100}, {width: 360, height: 240}), null);
});

test('unknown/missing lifecycle state fails closed', () => {
  assert.equal(core.contextReason({}), 'unknown');
  assert.equal(core.contextReason(safe()), '');
  for (const key of Object.keys(safe())) {
    const value = safe();
    delete value[key];
    assert.ok(core.contextReason(value), key);
  }
  for (const key of ['automationIdle', 'recorderIdle', 'measurementIdle', 'ownerVisible']) {
    const value = safe();
    value[key] = false;
    assert.equal(core.contextReason(value), key);
  }
});

test('daily cap, cooldown, today, campaign and global preferences are stable', () => {
  const now = new Date(2026, 8, 17, 10).getTime();
  const value = creative('image');
  let prefs = core.freshPreferences();
  assert.equal(core.eligible(value, safe(), prefs, now), '');
  prefs = core.recordShown(prefs, now);
  assert.equal(core.eligible(value, safe(), prefs, now + 1), 'cooldown');
  prefs = core.recordShown(prefs, now + core.LIMITS.cooldownMs);
  assert.equal(core.eligible(value, safe(), prefs, now + core.LIMITS.cooldownMs * 2), 'daily-cap');
  const campaign = core.dismiss(core.freshPreferences(), value, 'campaign', now);
  assert.equal(core.eligible({...value, id: 'changedCreative'}, safe(), campaign, now), 'dismissed');
  assert.equal(core.eligible(value, safe(), core.dismiss(core.freshPreferences(), value, 'today', now), now), 'today');
  assert.equal(core.eligible(value, safe(), core.dismiss(core.freshPreferences(), value, 'disable', now), now), 'disabled');
  assert.equal(core.dismiss(core.dismiss(core.freshPreferences(), value, 'disable', now), value, 'restore', now).enabled, true);
});

test('animated media shows decoded poster first, then plays once and returns to poster by five seconds', async () => {
  const {host, c} = setup();
  const result = await c.show(creative('animated-image'), placement);
  assert.equal(result.status, 'visible');
  assert.ok(host.windows[0].spec.content.html.includes(PNG));
  assert.ok(!host.windows[0].spec.content.html.includes(GIF));
  const patches = host.windows[0].control('promotionImage').patches;
  assert.equal(patches[0].source, GIF);
  const motion = [...host.timers.values()].find(timer => timer.ms === 5000);
  assert.ok(motion, '5 second motion timer');
  motion.fn();
  await tick();
  assert.equal(patches.at(-1).source, PNG);
  const countBefore = patches.length;
  await tick();
  assert.equal(patches.length, countBefore, 'animation is not replayed');
  await c.dispose();
});

test('reduced-motion stays poster-only', async () => {
  const {host, c} = setup({reducedMotion: true});
  assert.equal((await c.show(creative('media-only-animated'), placement)).status, 'visible');
  const patches = host.windows[0].control('promotionImage').patches;
  assert.equal(patches.some(patch => patch.source === GIF), false);
  assert.equal([...host.timers.values()].some(timer => timer.ms === 5000), false);
  await c.dispose();
});

test('X closes only the current surface and writes no campaign dismissal', async () => {
  const {host, c} = setup();
  await c.show(creative('image'), placement);
  await click(host.windows[0], 'promotionClose');
  const prefs = c.state().preferences;
  assert.deepEqual(prefs.dismissed, {});
  assert.equal(prefs.dayHiddenUntil, 0);
  assert.equal(prefs.enabled, true);
});

test('menu owns today, campaign and disable persistence', async () => {
  for (const [controlId, check] of [
    ['promotionToday', prefs => prefs.dayHiddenUntil > 0],
    ['promotionCampaign', prefs => prefs.dismissed.demoCampaign > 0],
    ['promotionDisable', prefs => prefs.enabled === false],
  ]) {
    const {host, c} = setup();
    await c.show(creative('image'), placement);
    await click(host.windows[0], controlId);
    assert.equal(check(c.state().preferences), true, controlId);
  }
});

test('single-flight show creates one native window', async () => {
  const {host, c} = setup();
  const first = c.show(creative('image'), placement);
  const second = c.show(creative('image'), placement);
  assert.equal(first, second);
  assert.equal((await first).status, 'visible');
  assert.equal(host.windows.length, 1);
  await c.dispose();
});

test('automation beginning during async create cancels late show', async () => {
  let release;
  const {host, context, c} = setup({host: {beforeCreate: () => new Promise(resolve => { release = resolve; })}});
  const pending = c.show(creative('image'), placement);
  await tick();
  context.automationIdle = false;
  await c.refreshContext();
  release();
  const result = await pending;
  assert.equal(result.status, 'suppressed');
  assert.equal(host.windows[0].shows, 0);
  assert.equal(host.windows[0].closed, true);
});

test('image decode failure closes promotion and does not count an impression', async () => {
  const {host, c} = setup({host: {decodeFailure: true}});
  const result = await c.show(creative('image'), placement);
  assert.equal(result.status, 'suppressed');
  assert.equal(result.reason, 'surface-error');
  assert.equal(host.windows[0].closed, true);
  assert.equal(c.state().preferences.count, 0);
});

test('runner move reanchors and unsafe list-open/hide context closes the surface', async () => {
  const {host, context, c} = setup();
  await c.show(creative('image'), placement);
  await c.reanchor({x: 500, y: 720, width: 590, height: 54});
  assert.equal(host.windows[0].closed, false);
  context.listOpen = true;
  await c.refreshContext();
  assert.equal(host.windows[0].closed, true);
});

test('Recorder, Measurement and automation activity each suppress display', async () => {
  for (const key of ['automationIdle', 'recorderIdle', 'measurementIdle']) {
    const {context, c} = setup();
    context[key] = false;
    const result = await c.show(creative('image'), placement);
    assert.equal(result.status, 'suppressed');
    assert.equal(result.reason, key);
  }
});

test('WebView2/native surface unavailability suppresses promotions without throwing', async () => {
  const {c} = setup({host: {webviewUnavailable: true}});
  const result = await c.show(creative('image'), placement);
  assert.equal(result.status, 'suppressed');
  assert.equal(result.reason, 'surface-error');
});

test('CTA closes the surface before activation', async () => {
  const order = [];
  const {host, c} = setup({controller: {activate: async () => { order.push(host.windows[0].closed ? 'closed-first' : 'still-open'); }}});
  await c.show(creative('image'), placement);
  await click(host.windows[0], 'promotionOpen');
  assert.deepEqual(order, ['closed-first']);
});

test('owner persists under appDataRoot and native activity fails closed by kind', async () => {
  const writes = [];
  const file = {
    join: (...parts) => parts.join('/'),
    readJSON: async (_path, options) => clone(options.defaultValue),
    writeJSON: async (filePath, value) => { writes.push({filePath, value: clone(value)}); },
  };
  let activity = {available: true, active: false, activeKinds: []};
  const scheduler = {
    listJobs: async () => [],
    productActivity: async () => clone(activity),
  };
  const fakeController = {
    state: () => ({visible: false, preferences: core.freshPreferences()}),
    show: async () => ({status: 'suppressed', reason: 'fixture'}),
    waitUntilHidden: async () => true,
    refreshContext: async () => {},
    reanchor: async () => {},
    dispose: async () => {},
  };
  const owner = ownerAPI.create({
    file,
    ui: {createWindow() {}},
    appDataRoot: '/app-data',
    creative: creative('image'),
    schedulerClient: scheduler,
    controllerFactory: settings => ({
      ...fakeController,
      restore: async () => {
        const preferences = core.freshPreferences();
        await settings.savePreferences(preferences);
        return {preferences};
      },
    }),
    getRunnerState: () => ({runner: {running: false, player: {panelLifecycle: 'hidden', panelDesiredVisible: false}}}),
  });
  await owner.start();
  assert.equal(owner.state().preferencePath, '/app-data/promotions/preferences.json');
  activity = {available: true, active: true, activeKinds: ['recorder']};
  await owner.refreshNativeActivity();
  assert.equal(owner.state().context.recorderIdle, false);
  assert.equal(owner.state().context.automationIdle, false);
  activity = {available: true, active: true, activeKinds: ['measurement']};
  await owner.refreshNativeActivity();
  assert.equal(owner.state().context.measurementIdle, false);
  await owner.restore();
  assert.ok(writes.some(write => write.filePath === '/app-data/promotions/preferences.json'));
  await owner.dispose();
});

test('Agent/Calculator integration closes promotion before execute and releases activity after', async () => {
  const order = [];
  const fakeOwner = {
    async beginAutomation() { order.push('begin'); return 'token'; },
    async endAutomation(token) { order.push('end:' + token); },
  };
  const wrapped = integration.wrapCalculator({
    definition: {id: 'calculator'},
    async execute() { order.push('execute'); return {ok: true}; },
  }, () => fakeOwner);
  assert.deepEqual(await wrapped.execute(), {ok: true});
  assert.deepEqual(order, ['begin', 'execute', 'end:token']);
});

test('Runner integration wraps every requestRun with promotion activity barrier', async () => {
  const order = [];
  const fakeOwner = {
    async beginAutomation() { order.push('begin'); return 'r'; },
    async endAutomation() { order.push('end'); },
    async beforeInteraction(reason) { order.push(reason); },
  };
  const Base = {createApp: () => ({
    async requestRun() { order.push('run'); return 7; },
    async openList() { order.push('list'); return 8; },
  })};
  const wrapped = integration.wrapRunnerController(Base, () => fakeOwner).createApp({});
  assert.equal(await wrapped.requestRun([], 'test'), 7);
  assert.equal(await wrapped.openList(), 8);
  assert.deepEqual(order, ['begin', 'run', 'end', 'script-runner-manager', 'list']);
});
