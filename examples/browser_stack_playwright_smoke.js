console.log('playwright facade smoke start');
const browser = await playwright.chromium.launch();
const context = await browser.newContext();
const pageHandle = await context.newPage();
const locator = pageHandle.locator('body');

const facadeChecks = {
  browserType: typeof browser,
  contextType: typeof context,
  pageType: typeof pageHandle,
  getContextMatches: browser.getContext() === contextUpgraded,
  getPageMatches: browser.getPage() === pageUpgraded,
  contextGetBrowserMatches: context.getBrowser() === browserUpgraded,
  contextGetPageMatches: context.getPage() === pageUpgraded,
  locatorSelector: locator.selector,
};
console.log(facadeChecks);

const selectorCapablePage = {
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
selectorCapablePage.locator = pageUpgraded.locator;
selectorCapablePage.evaluate = pageUpgraded.evaluate;

await page.waitFor(10);
await selectorCapablePage.locator('body').waitFor({ timeout: 10 });
const evaluateResult = await selectorCapablePage.locator('body').evaluate((selector, suffix) => selector + suffix, '-shim');
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
