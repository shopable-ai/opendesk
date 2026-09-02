console.log('playwright facade smoke start');
const browser = await playwright.chromium.launch();
const context = await browser.newContext();
const pageHandle = await context.newPage();
const locator = pageHandle.locator('body');

const facadeChecks = {
  browserType: typeof browser,
  contextType: typeof context,
  pageType: typeof pageHandle,
  runtimeBrowserAliased: globalThis.browser === browserUpgraded,
  runtimeContextAliased: globalThis.context === contextUpgraded,
  runtimePageAliased: globalThis.page === pageUpgraded,
  browserContextAvailable: browser.getContext() && typeof browser.getContext().newPage === 'function',
  browserPageAvailable: browser.getPage() && typeof browser.getPage().locator === 'function',
  contextBrowserAvailable: context.getBrowser() && typeof context.getBrowser().newContext === 'function',
  contextPageAvailable: context.getPage() && typeof context.getPage().locator === 'function',
  locatorSelectorMatches: locator.selector === 'body',
};
console.log(facadeChecks);

const selectorCapablePageBase = {
  waitFor(ms) {
    console.log('selectorCapablePage.waitFor', ms);
  },
  waitForSelector(selector, options) {
    console.log('selectorCapablePage.waitForSelector', selector, options && options.timeout);
  },
  evaluate(fn, ...args) {
    return fn(...args);
  },
};
const selectorCapablePage = Object.create(selectorCapablePageBase);
selectorCapablePage.locator = pageUpgraded.locator;
selectorCapablePage.evaluate = pageUpgraded.evaluate;

await page.waitFor(10);
await selectorCapablePage.locator('body').waitFor({ timeout: 10 });
const evaluateResult = await selectorCapablePage.locator('body').evaluate((selector, suffix) => selector + suffix, '-shim');
if (!Object.values(facadeChecks).every(Boolean) || evaluateResult !== 'body-shim') {
  throw new Error('playwright facade smoke failed: ' + JSON.stringify({ facadeChecks, evaluateResult }));
}
console.log(JSON.stringify({
  ok: true,
  stack: 'playwright',
  selectedApp: null,
  skipped: false,
  runtimeNote: 'Playwright smoke proves a playwright-shaped shim launch/newContext/newPage chain, not a full Playwright runtime.',
  finalStatus: 'succeeded',
  executionId: (globalThis.Execution && globalThis.Execution.executionId) || null,
  artifactDir: (globalThis.Execution && globalThis.Execution.artifactDir) || null,
  proofLevel: 'shim support',
  boundaryNote: 'This smoke proves a playwright-shaped compatibility facade only; it must not be reported as browser-process or DOM-runtime proof.',
  facadeChecks,
  evaluateResult,
}));
console.log('playwright facade smoke end');
