'use strict';
// Manual native UI qualification smoke, from repository root:
// ./dist/opendesk -ui -script tests/runtime-api/promotion-surface.js -console-mode script
// Run on an idle desktop. This inert fixture never executes recipes, navigates
// externally, requests remote ads, or writes product promotion preferences.

const productRoot = File.join(Execution.scriptDir, '..', '..', 'apps', 'opendesk');
for (const relative of ['promotions/core.js', 'promotions/controller.js']) {
  const sourcePath = File.join(productRoot, relative);
  (0, eval)(File.read(sourcePath) + '\n//# sourceURL=' + sourcePath);
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlW0xkAAAAASUVORK5CYII=';
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const context = {
  ready: true,
  ownerVisible: true,
  automationIdle: true,
  recorderIdle: true,
  measurementIdle: true,
  listOpen: false,
  fullscreen: false,
  presentationMode: false,
};

function creative(presentation, mediaKind) {
  const base = {
    schemaVersion: 2,
    id: 'native' + presentation.replace(/[^A-Za-z0-9]/g, ''),
    campaignId: 'nativeQualificationCampaign',
    advertiser: 'OpenDesk 官方示例',
    presentation,
    title: '重复的操作，交给自动化。',
    description: 'v4 Native Renderer qualification fixture',
    cta: '了解详情',
    action: {kind: 'preview'},
  };
  if (presentation === 'text') return base;
  if (presentation === 'media-only') {
    delete base.title;
    delete base.description;
  }
  if (mediaKind === 'animated-image') {
    base.media = {kind: 'animated-image', src: GIF, poster: PNG, alt: 'OpenDesk v4 animated local fixture'};
  } else {
    base.media = {kind: 'image', src: PNG, alt: 'OpenDesk v4 static local fixture'};
  }
  return base;
}

const scenarios = [
  ['image', 'image'],
  ['animated-image', 'animated-image'],
  ['media-only', 'image'],
  ['media-only', 'animated-image'],
  ['image-text', 'image'],
  ['text', null],
];

let anchor = null;
let promotion = null;
try {
  anchor = await ui.createWindow({
    id: 'promotionFixtureAnchor',
    kind: 'floating',
    title: '推广测试锚点',
    position: {mode: 'anchor', size: {width: 590, height: 54}, horizontal: 'center', vertical: 'bottom', margin: 40, display: 'active'},
    alwaysOnTop: true,
    draggable: false,
    content: {
      html: '<main><strong>Promotion v4 Native Qualification</strong><span>Close each promotion to advance.</span></main>',
      css: 'html,body{margin:0;background:#182231;color:#eef2f8;font:13px sans-serif}main{padding:16px}span{margin-left:12px;font-size:11px;color:#bdcde2}',
    },
  });
  await anchor.show();

  for (const [presentation, mediaKind] of scenarios) {
    const anchorState = await anchor.getState();
    promotion = OpenDeskPromotionsController.create({
      ui,
      getContext: () => context,
      reducedMotion: false,
      activate: action => console.log('PROMOTION_FIXTURE_CTA=' + JSON.stringify(action)),
      logger: console,
    });
    const result = await promotion.show(creative(presentation, mediaKind), {
      mode: 'runner-above',
      anchor: anchorState.bounds,
    });
    console.log('PROMOTION_FIXTURE_SHOWN=' + JSON.stringify({presentation, mediaKind, result, state: promotion.state()}));
    if (result.status !== 'visible') {
      throw new Error('Promotion v4 fixture was not visible: ' + JSON.stringify({presentation, mediaKind, result}));
    }
    await promotion.waitUntilClosed();
    await promotion.dispose();
    promotion = null;
  }

  // Explicitly qualify the optional work-area bottom-right placement once.
  await anchor.setPlacement({horizontal: 'left', vertical: 'top', margin: 24, display: 'current'});
  promotion = OpenDeskPromotionsController.create({
    ui,
    getContext: () => context,
    reducedMotion: true,
    logger: console,
  });
  const corner = await promotion.show(creative('media-only', 'image'), {mode: 'screen-bottom-right'});
  console.log('PROMOTION_FIXTURE_CORNER=' + JSON.stringify({result: corner, state: promotion.state()}));
  if (corner.status !== 'visible') throw new Error('Bottom-right promotion fixture was not visible: ' + JSON.stringify(corner));
  await promotion.waitUntilClosed();
  await promotion.dispose();
  promotion = null;

  console.log('PROMOTION_FIXTURE_COMPLETED: v4 scenarios closed; focus, visual quality and animation require native evidence review.');
} finally {
  if (promotion) await promotion.dispose();
  if (anchor) await anchor.close();
}
