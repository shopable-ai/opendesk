(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/catalog_validation.js');
for (const file of [...RuntimeAPITestFiles.unit, ...RuntimeAPITestFiles.live]) RuntimeAPITest.load(file);

const catalogCheck = RuntimeAPICatalogValidation.validateCatalog();
const requiredFamilyFiles = {
  page: 'page.test.js',
  mouse: 'mouse.test.js',
  keyboard: 'keyboard.test.js',
  globalShortcut: 'global-shortcut.test.js',
  touchscreen: 'touchscreen.test.js',
  window: 'window.test.js',
  Screen: 'screen.test.js',
  System: 'system.test.js',
  File: 'file.test.js',
  AppStorage: 'storage.test.js',
  clipboard: 'clipboard.test.js',
  console: 'console.test.js',
  http: 'http.test.js',
  axios: 'axios.test.js',
  OCR: 'ocr.test.js',
  Vision: 'vision.test.js',
  ImageColor: 'image-color.test.js',
  Sound: 'sound.test.js',
  FloatingWindow: 'floating-window.test.js',
  browser: 'browser.test.js',
  context: 'context.test.js',
  global: 'globals.test.js',
};

const allFiles = [...RuntimeAPITestFiles.unit, ...RuntimeAPITestFiles.live];
const missingFamilyFiles = Object.entries(requiredFamilyFiles)
  .filter(([, expected]) => !allFiles.some((file) => file.endsWith('/' + expected)))
  .map(([family, expected]) => family + ':' + expected);
const executedGateResults = {};
const passedTestRecords = [];
for (const gate of ['contract', 'unit', 'live']) {
  const resultFile = RuntimeAPITest.resultPath(gate);
  if (!RuntimeAPITest.exists(resultFile)) continue;
  const gateResult = RuntimeAPITest.readJSON(resultFile);
  if (gateResult.runId !== RuntimeAPITest.context.runId) continue;
  executedGateResults[gate] = gateResult.status;
  for (const test of gateResult.tests || []) {
    if (test.status === 'passed') passedTestRecords.push(test);
  }
}
const ids = RuntimeAPIManifest.map((entry) => entry.id);
const registeredIds = new Set(ids);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
const unknown = RuntimeAPITest.tests.flatMap((test) => test.covers).filter((id) => !registeredIds.has(id));
const rows = [];
let failed = 0;

for (const entry of RuntimeAPIManifest) {
  const matching = passedTestRecords.filter((test) => (test.covers || []).includes(entry.id));
  const contract = matching.some((test) => test.verification === 'contract');
  const behaviorTiers = Array.from(new Set(
    matching.filter((test) => test.verification === 'behavior').map((test) => test.tier),
  )).sort();
  const requiredBehaviorTiers = entry.requiredVerificationTiers.filter((tier) => tier !== 'contract');
  const missingBehaviorTiers = requiredBehaviorTiers.filter((tier) => !behaviorTiers.includes(tier));
  const contractOnlyValid = requiredBehaviorTiers.length > 0
    || (entry.riskClassification === 'restricted' && typeof entry.contractOnlyReason === 'string' && entry.contractOnlyReason.length > 0);
  const passed = contract && missingBehaviorTiers.length === 0 && contractOnlyValid;
  if (!passed) failed += 1;
  const row = {
    id: entry.id,
    family: entry.family,
    status: passed ? 'passed' : 'failed',
    contractPresent: contract,
    passedBehaviorTiers: behaviorTiers,
    requiredBehaviorTiers,
    riskClassification: entry.riskClassification,
    contractOnlyReason: entry.contractOnlyReason,
    tests: matching.map((test) => test.name),
    platforms: entry.platforms,
  };
  rows.push(row);
  console.log('[RUNTIME-API-COVERAGE ' + (passed ? 'PASS' : 'FAIL') + '] ' + entry.id
    + ' contract=' + contract
    + ' behavior=' + behaviorTiers.join(',')
    + ' required=' + requiredBehaviorTiers.join(',')
    + ' risk=' + (entry.contractOnlyReason || ''));
}

const result = {
  status: failed === 0 && duplicates.length === 0 && unknown.length === 0 && missingFamilyFiles.length === 0 && catalogCheck.ok ? 'passed' : 'failed',
  documentedMethods: RuntimeAPIManifest.length,
  covered: RuntimeAPIManifest.length - failed,
  failed,
  catalogFingerprint: catalogCheck.catalogFingerprint,
  catalogErrors: catalogCheck.errors,
  duplicateIds: Array.from(new Set(duplicates)),
  unknownTestIds: Array.from(new Set(unknown)),
  missingFamilyFiles,
  executedGateResults,
  coverage: rows,
};
RuntimeAPITest.writeGate('coverage', result);
console.log('[RUNTIME-API-COVERAGE RESULT] ' + JSON.stringify(result));
if (result.status !== 'passed') {
  throw new Error('Runtime API coverage failed: covered=' + result.covered + '/' + result.documentedMethods
    + ' unknown=' + result.unknownTestIds.length
    + ' duplicate=' + result.duplicateIds.length
    + ' familyFiles=' + result.missingFamilyFiles.length
    + ' catalog=' + result.catalogErrors.length);
}
