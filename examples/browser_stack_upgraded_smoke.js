console.log('upgraded stack smoke start');
const browserHandle = browserUpgraded;
const contextHandle = page.getContext();
const pageHandle = page.getPage();
const locator = page.locator('body');

const facadeChecks = {
  pageFacadeSelected: page === pageUpgraded,
  browserFacadeAvailable: browserHandle === browserUpgraded && typeof browserHandle.newContext === 'function',
  contextOwnerAvailable: contextHandle && typeof contextHandle.newPage === 'function',
  pageMatchesFacade: pageHandle === pageUpgraded,
  locatorSelectorMatches: locator.selector === 'body',
};
console.log(facadeChecks);

const ownerPageBase = {
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
const ownerPage = Object.create(ownerPageBase);
ownerPage.open = pageUpgraded.open;
ownerPage.waitFor = pageUpgraded.waitFor;
ownerPage.locator = pageUpgraded.locator;
ownerPage.evaluate = pageUpgraded.evaluate;

await ownerPage.open('https://example.com');
await ownerPage.waitFor(10);
await ownerPage.locator('body').waitFor({ timeout: 10 });
const evaluateResult = await ownerPage.locator('body').evaluate((selector, suffix) => selector + suffix, '-checked');
if (!Object.values(facadeChecks).every(Boolean) || evaluateResult !== 'body-checked') {
  throw new Error('upgraded facade smoke failed: ' + JSON.stringify({ facadeChecks, evaluateResult }));
}
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
