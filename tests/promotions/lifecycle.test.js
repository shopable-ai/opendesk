'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const controllerAPI = require('../../apps/opendesk/promotions/controller.js');
const integration = require('../../apps/opendesk/promotions/integration.js');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlW0xkAAAAASUVORK5CYII=';
const creative = {
  schemaVersion: 2,
  id: 'barrierFixture',
  campaignId: 'barrierCampaign',
  advertiser: 'OpenDesk',
  presentation: 'image',
  title: 'Promotion barrier fixture',
  description: 'fixture',
  cta: '查看',
  action: {kind: 'preview'},
  media: {kind: 'image', src: PNG, alt: 'fixture'},
};
const placement = {mode: 'runner-above', anchor: {x: 400, y: 700, width: 590, height: 54}};
const safeContext = () => ({
  ready: true,
  ownerVisible: true,
  automationIdle: true,
  recorderIdle: true,
  measurementIdle: true,
  listOpen: false,
  fullscreen: false,
  presentationMode: false,
});

test('Agent.run is guarded for its complete async lifetime', async () => {
  const order = [];
  const owner = {
    async beginAutomation(source) { order.push('begin:' + source); return 'agent-token'; },
    async endAutomation(token) { order.push('end:' + token); },
  };
  const agent = {
    getCapabilities(input) { return {supported: true, input}; },
    async run(input) { order.push('run:' + input.prompt); return {ok: true}; },
  };
  const wrapped = integration.wrapAgent(agent, () => owner);
  assert.deepEqual(wrapped.getCapabilities({backend: 'codex'}), {supported: true, input: {backend: 'codex'}});
  assert.deepEqual(await wrapped.run({prompt: 'plan'}), {ok: true});
  assert.deepEqual(order, ['begin:assistant:agent', 'run:plan', 'end:agent-token']);
});

test('automation barrier cancels an in-flight native create without waiting for createWindow', async () => {
  const context = safeContext();
  let releaseCreate;
  let created = 0;
  let shown = 0;
  let closed = 0;
  const ui = {
    createWindow() {
      created += 1;
      return new Promise(resolve => {
        releaseCreate = () => resolve({
          id: 'promotionRace',
          async setRelativeTo() { return {bounds: {x: 630, y: 448, width: 360, height: 240}}; },
          async setPlacement() { return {bounds: {x: 630, y: 448, width: 360, height: 240}}; },
          async show() { shown += 1; return {visible: true, onScreen: true, bounds: {x: 630, y: 448, width: 360, height: 240}}; },
          async close() { closed += 1; return {visible: false, onScreen: false}; },
          async waitUntilClosed() { return {visible: false, onScreen: false}; },
          on() { return () => {}; },
          control(id) {
            return {
              on() { return () => {}; },
              async update() { return {}; },
              async getState() {
                if (id === 'promotionImage') {
                  return {id, type: 'img', source: PNG, imageComplete: true, imageNaturalWidth: 1, imageNaturalHeight: 1};
                }
                return {id};
              },
            };
          },
        });
      });
    },
  };
  const controller = controllerAPI.create({ui, getContext: () => context});
  const pendingShow = controller.show(creative, placement);
  await Promise.resolve();
  assert.equal(created, 1);

  const safety = controller.waitUntilHidden();
  const marker = await Promise.race([
    safety.then(() => 'closed'),
    new Promise(resolve => setTimeout(() => resolve('blocked'), 20)),
  ]);
  assert.equal(marker, 'closed', 'automation must not wait for a stuck promotion create');

  releaseCreate();
  const result = await pendingShow;
  assert.equal(result.status, 'suppressed');
  assert.equal(result.reason, 'canceled');
  assert.equal(shown, 0, 'canceled promotion never becomes visible');
  assert.equal(closed, 1, 'late-created native surface is closed');
});
