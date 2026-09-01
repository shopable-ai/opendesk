console.log('legacy stack smoke start');
await page.waitFor(10);
console.log(JSON.stringify({
  ok: true,
  stack: 'legacy',
  selectedApp: null,
  skipped: false,
  runtimeNote: 'Legacy smoke proves the preserved default page.waitFor baseline path, not upgraded or Playwright-style runtime semantics.',
  finalStatus: 'succeeded',
  executionId: (globalThis.Execution && globalThis.Execution.executionId) || null,
  artifactDir: (globalThis.Execution && globalThis.Execution.artifactDir) || null,
  proofLevel: 'runtime proof',
  boundaryNote: 'This smoke proves legacy execution-path compatibility only; it is not upgraded/playwright facade proof.',
}));
console.log('legacy stack smoke end');
