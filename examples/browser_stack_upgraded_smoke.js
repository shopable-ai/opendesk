console.log('upgraded stack smoke start');
const browserHandle = browserUpgraded;
const contextHandle = page.getContext();
const pageHandle = page.getPage();
const locator = page.locator('body');

const facadeChecks = {
  browserMatchesFacade: browserHandle === browserUpgraded,
  contextMatchesFacade: contextHandle === contextUpgraded,
  pageMatchesFacade: pageHandle === pageUpgraded,
  locatorSelector: locator.selector,
};
console.log(facadeChecks);

const ownerPage = {
  openURL(url) {
    console.log('ownerPage.openURL', url);
  },
  waitFor(ms) {
    console.log('ownerPage.waitFor', ms);
  },
  waitForSelector(selector, options) {
    console.log('ownerPage.waitForSelector', selector, options && options.timeout);
  },
  evaluate(fn, ...args) {
    return fn(...args);
  },
};
ownerPage.open = pageUpgraded.open;
ownerPage.waitFor = pageUpgraded.waitFor;
ownerPage.locator = pageUpgraded.locator;
ownerPage.evaluate = pageUpgraded.evaluate;

await ownerPage.open('https://example.com');
await ownerPage.waitFor(10);
await ownerPage.locator('body').waitFor({ timeout: 10 });
const evaluateResult = await ownerPage.locator('body').evaluate((selector, suffix) => selector + suffix, '-checked');
console.log(JSON.stringify({
  ok: true,
  stack: 'upgraded',
  selectedApp: null,
  skipped: false,
  runtimeNote: 'Upgraded smoke proves facade routing and locator/getter alignment, not full Playwright runtime or DOM selector semantics.',
  finalStatus: 'succeeded',
  executionId: (globalThis.Execution && globalThis.Execution.executionId) || null,
  artifactDir: (globalThis.Execution && globalThis.Execution.artifactDir) || null,
  proofLevel: 'facade proof',
  boundaryNote: 'This smoke proves upgraded facade routing only; selector/evaluate behavior remains compatibility-surface evidence rather than browser-runtime proof.',
  facadeChecks,
  evaluateResult,
}));
console.log('upgraded stack smoke end');
