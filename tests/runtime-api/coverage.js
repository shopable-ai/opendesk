(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');
RuntimeAPITest.load('tests/runtime-api/catalog_validation.js');
RuntimeAPITest.load('tests/runtime-api/coverage_validation.js');

// A focused API can use the exact same coverage algorithm without pretending
// that unrelated desktop/live evidence has been collected. The default remains
// the complete catalog; focused entrypoints supply either families or exact IDs.
const coverageScope = globalThis.RuntimeAPICoverageScope || null;
const coverageFamilies = coverageScope && Array.isArray(coverageScope.families)
  ? new Set(coverageScope.families.map((family) => String(family)))
  : null;
const coverageIds = coverageScope && Array.isArray(coverageScope.ids)
  ? new Set(coverageScope.ids.map((id) => String(id)))
  : null;
if (coverageFamilies && coverageIds) {
  throw new Error('Runtime API coverage scope must use either families or ids, not both');
}
if (coverageIds) {
  const unknownScopeIds = Array.from(coverageIds).filter((id) => !RuntimeAPIManifest.some((entry) => entry.id === id));
  if (coverageIds.size === 0 || unknownScopeIds.length > 0) {
    throw new Error('Runtime API coverage scope contains no entries or unknown IDs: ' + unknownScopeIds.join(','));
  }
}
const coverageManifest = coverageIds
  ? RuntimeAPIManifest.filter((entry) => coverageIds.has(entry.id))
  : (coverageFamilies
    ? RuntimeAPIManifest.filter((entry) => coverageFamilies.has(entry.family))
    : RuntimeAPIManifest);
if ((coverageFamilies || coverageIds) && coverageManifest.length === 0) {
  const requested = coverageIds || coverageFamilies;
  throw new Error('Runtime API coverage scope matched no catalog entries: ' + Array.from(requested).join(','));
}

const allRequiredFamilyFiles = {
  page: 'page.test.js',
  mouse: 'mouse.test.js',
  keyboard: 'keyboard.test.js',
  globalShortcut: 'global-shortcut.test.js',
  touchscreen: 'touchscreen.test.js',
  window: 'window.test.js',
  Screen: 'screen.test.js',
  System: 'system.test.js',
  Execution: 'execution.test.js',
  Command: 'command.test.js',
  File: 'file.test.js',
  SQLite: 'sqlite.test.js',
  SQLiteDatabase: 'sqlite.test.js',
  AppStorage: 'storage.test.js',
  clipboard: 'clipboard.test.js',
  console: 'console.test.js',
  http: 'http.test.js',
  axios: 'axios.test.js',
  OCR: 'ocr.test.js',
  Vision: 'vision.test.js',
  ImageColor: 'image-color.test.js',
  Sound: 'sound.test.js',
  Audio: 'audio.test.js',
  FloatingWindow: 'floating-window.test.js',
  global: 'globals.test.js',
};
const scopedFamilies = coverageIds
  ? new Set(coverageManifest.map((entry) => entry.family))
  : coverageFamilies;
const requiredFamilyFiles = scopedFamilies
  ? Object.fromEntries(Object.entries(allRequiredFamilyFiles).filter(([family]) => scopedFamilies.has(family)))
  : allRequiredFamilyFiles;
const allFiles = [...RuntimeAPITestFiles.unit, ...RuntimeAPITestFiles.live];

// The coverage gate only imports test files to collect their declarative
// `covers` metadata. Live test files normally receive this driver from
// macos_live.js, but their registration must also work in this offline gate.
// Keep the stub deliberately incomplete: no test body runs here, and a live
// gate cannot mistake this metadata-only driver for real evidence.
const coverageInstalledRuntimeLiveStub = !globalThis.RuntimeLive;
if (coverageInstalledRuntimeLiveStub) {
  globalThis.RuntimeLive = {
    fixture: {
      title: 'runtime-api-coverage-metadata-only',
      browserApp: 'coverage-metadata-only',
    },
    refreshTarget: () => Promise.reject(new Error('RuntimeLive is unavailable in the coverage metadata gate')),
  };
}
// Exact-ID coverage is deliberately isolated from unrelated API families. It
// still loads the authoritative family test file so declaration metadata is
// verified, but an in-progress file in another family cannot turn a focused
// Page report into an accidental full-catalog execution.
const metadataFiles = coverageIds
  ? allFiles.filter((file) => Object.values(requiredFamilyFiles).some((expected) => file.endsWith('/' + expected)))
  : allFiles;
for (const file of metadataFiles) RuntimeAPITest.load(file);
if (coverageInstalledRuntimeLiveStub) delete globalThis.RuntimeLive;

const catalogCheck = RuntimeAPICatalogValidation.validateCatalog();
const missingFamilyFiles = Object.entries(requiredFamilyFiles)
  .filter(([, expected]) => !allFiles.some((file) => file.endsWith('/' + expected)))
  .map(([family, expected]) => family + ':' + expected);
const requiredGateNames = Array.from(new Set(coverageManifest.flatMap((entry) => entry.requiredVerificationTiers))).sort();
const executedGateResults = {};
const executedGates = {};
for (const gate of requiredGateNames) {
  const resultFile = RuntimeAPITest.resultPath(gate);
  if (!RuntimeAPITest.exists(resultFile)) continue;
  const gateResult = RuntimeAPITest.readJSON(resultFile);
  if (gateResult.runId !== RuntimeAPITest.context.runId) continue;
  executedGateResults[gate] = RuntimeAPICoverageValidation.gatePassed(gate, gateResult)
    ? 'passed'
    : (gateResult.status === 'passed' ? 'unfinalized' : gateResult.status);
  // Composition records are already part of the live result; its dedicated
  // envelope is still required as an independently successful gate.
  if (gate !== 'composition') executedGates[gate] = gateResult;
}
const passedTestRecords = RuntimeAPICoverageValidation.passedTestRecords(executedGates);
const failedRequiredGates = RuntimeAPICoverageValidation.failedRequiredGates(coverageManifest, executedGateResults);
const ids = coverageManifest.map((entry) => entry.id);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
// Test source is loaded in full for its declaration metadata. Validate covers
// against the full catalog so a focused report does not mislabel other valid
// family tests as unknown IDs.
const registeredIds = new Set(RuntimeAPIManifest.map((entry) => entry.id));
const unknown = [...RuntimeAPITest.tests, ...passedTestRecords].flatMap((test) => test.covers || []).filter((id) => !registeredIds.has(id));
const rows = [];
let failed = 0;

for (const entry of coverageManifest) {
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
  status: failed === 0 && duplicates.length === 0 && unknown.length === 0 && missingFamilyFiles.length === 0
    && failedRequiredGates.length === 0 && catalogCheck.ok ? 'passed' : 'failed',
  scope: coverageIds ? {
    name: String(coverageScope.name || 'focused'),
    ids: Array.from(coverageIds).sort(),
  } : (coverageFamilies ? {
    name: String(coverageScope.name || 'focused'),
    families: Array.from(coverageFamilies).sort(),
  } : null),
  documentedMethods: coverageManifest.length,
  covered: coverageManifest.length - failed,
  failed,
  catalogFingerprint: catalogCheck.catalogFingerprint,
  catalogErrors: catalogCheck.errors,
  duplicateIds: Array.from(new Set(duplicates)),
  unknownTestIds: Array.from(new Set(unknown)),
  missingFamilyFiles,
  executedGateResults,
  failedRequiredGates,
  coverage: rows,
};
RuntimeAPITest.writeGate('coverage', result);
console.log('[RUNTIME-API-COVERAGE RESULT] ' + JSON.stringify(result));
if (result.status !== 'passed') {
  throw new Error('Runtime API coverage failed: covered=' + result.covered + '/' + result.documentedMethods
    + ' unknown=' + result.unknownTestIds.length
    + ' duplicate=' + result.duplicateIds.length
    + ' familyFiles=' + result.missingFamilyFiles.length
    + ' gates=' + result.failedRequiredGates.map((item) => item.gate + ':' + item.status).join(',')
    + ' catalog=' + result.catalogErrors.length);
}
