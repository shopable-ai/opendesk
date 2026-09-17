'use strict';

// Visual-only developer preview for the production OpenDesk promotion surface.
// It deliberately uses fresh in-memory preferences and never writes the product
// promotions/preferences.json, so repeated previews do not consume production
// cooldown or daily-cap state.
async function main() {
  const capabilities = ui.getCapabilities();
  if (!capabilities.enabled || !capabilities.available) {
    throw new Error('Custom UI is unavailable: ' + (capabilities.reason || 'run with -ui'));
  }

  // Public examples are run from the repository root. Keep this preview wired
  // to the real product modules instead of copying promotion UI or policy code.
  const productRoot = File.path('apps/opendesk');
  for (const name of ['core.js', 'controller.js', 'official-creative.js']) {
    const entry = File.join(productRoot, 'promotions', name);
    if (!File.isFile(entry)) {
      throw new Error('Promotion module not found: ' + entry);
    }
    (0, eval)(File.read(entry) + '\n//# sourceURL=' + entry);
  }

  if (!globalThis.OpenDeskPromotionsCore
    || !globalThis.OpenDeskPromotionsController
    || !globalThis.OpenDeskOfficialPromotionCreative) {
    throw new Error('OpenDesk Promotion preview modules did not initialize');
  }

  const previewContext = Object.freeze({
    ready: true,
    ownerVisible: true,
    automationIdle: true,
    recorderIdle: true,
    measurementIdle: true,
    listOpen: false,
    fullscreen: false,
    presentationMode: false,
  });

  let memoryPreferences = OpenDeskPromotionsCore.freshPreferences();
  const controller = OpenDeskPromotionsController.create({
    ui,
    preferences: memoryPreferences,
    getContext: () => previewContext,
    savePreferences: async (next) => {
      memoryPreferences = next;
      console.log('PROMOTION_PREVIEW_PREFERENCES_MEMORY_ONLY=' + JSON.stringify(next));
    },
    // A visual preview must not navigate away or trigger a product action.
    // Clicking the CTA proves the wiring and prints the action instead.
    activate: async (action) => {
      console.log('PROMOTION_PREVIEW_ACTION=' + JSON.stringify(action));
    },
    logger: globalThis.console,
  });

  try {
    const creative = OpenDeskOfficialPromotionCreative.create();
    console.log('PROMOTION_PREVIEW_START=' + JSON.stringify({
      creativeId: creative.id,
      campaignId: creative.campaignId,
      presentation: creative.presentation,
      placementMode: 'screen-bottom-right',
      preferences: memoryPreferences,
    }));

    const result = await controller.show(creative, {mode: 'screen-bottom-right'});
    console.log('PROMOTION_PREVIEW_RESULT=' + JSON.stringify(result));
    if (!result || result.status !== 'visible') {
      throw new Error('Promotion preview was not shown: ' + JSON.stringify(result));
    }

    // The production controller closes on ×, outside interaction, CTA, Escape,
    // a dismiss-menu action, or its normal lifetime timeout (currently 15 s).
    await controller.waitUntilClosed();
    console.log('PROMOTION_PREVIEW_CLOSED');
  } finally {
    await controller.dispose();
  }
}

await main();
