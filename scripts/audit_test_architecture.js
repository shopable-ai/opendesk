#!/usr/bin/env node

const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.cwd();
const output = path.resolve(process.argv[2] || '.runtime/tests/test-architecture/audit.json');
const runtimeRoot = path.resolve(root, '.runtime');

function relativeFrom(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' ? '.' : relative.split(path.sep).join('/');
}

function isBelow(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

if (!fs.existsSync(path.join(root, 'go.mod')) || !fs.existsSync(path.join(root, 'AGENTS.md'))) {
  throw new Error('run this audit from the OpenDesk repository root');
}
if (!isBelow(runtimeRoot, output)) {
  throw new Error(`audit output must stay below .runtime/: ${output}`);
}

const ignoredDirectories = new Set(['.git', '.runtime', 'dist']);

function walk(directory, predicate, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, predicate, result);
    else if (predicate(absolute)) result.push(relativeFrom(root, absolute));
  }
  return result;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function command(args) {
  return childProcess.execFileSync(args[0], args.slice(1), { cwd: root, encoding: 'utf8' }).trim();
}

const sourceRoots = new Set(['apps', 'automation', 'blogs', 'cmd', 'docs', 'examples', 'internal', 'jslibs', 'pkg', 'polyfills', 'prompts', 'public', 'schemas', 'scripts', 'tests', 'third_party', 'types']);
const sourceRootFiles = new Set(['.gitignore', 'AGENTS.md', 'Makefile', 'QUICKSTART.md', 'README.md', 'SUPPORT.md', 'go.mod', 'go.sum', 'jsconfig.json', 'tm.config.js']);
const sourceFiles = walk(root, (file) => {
  const relative = relativeFrom(root, file);
  const first = relative.split('/')[0];
  return sourceRoots.has(first) || sourceRootFiles.has(relative);
}).filter((file) => !file.startsWith('.archive/')).sort();
const sourceClosure = crypto.createHash('sha256');
for (const file of sourceFiles) {
  sourceClosure.update(file);
  sourceClosure.update('\0');
  sourceClosure.update(sha256(path.join(root, file)));
  sourceClosure.update('\n');
}

const errors = [];
const classificationPath = path.join(root, 'docs/quality/go-test-file-classification.md');
const classificationText = fs.readFileSync(classificationPath, 'utf8');
const classificationPattern = /^\| `([^`]+_test\.go)` \| `(KEEP_PACKAGE|SPLIT_JS_CONTRACT|MOVE_TOOL|OPT_IN_LIVE|VENDOR_ONLY|ARCHIVE_ONLY)` \| ([^|\n]+) \| ([^|\n]+) \| ([^|\n]+) \| ([^|\n]+) \| ([^|\n]+) \|$/gm;
const classifications = new Map();
const reviewFingerprints = new Map();
let match;
while ((match = classificationPattern.exec(classificationText)) !== null) {
  const [, file, disposition, privateAccessRaw, boundaryRaw, externalDependenciesRaw, assertionValueRaw, reasonRaw] = match;
  const privateAccess = privateAccessRaw.trim();
  const boundary = boundaryRaw.trim();
  const externalDependencies = externalDependenciesRaw.trim();
  const assertionValue = assertionValueRaw.trim();
  const reason = reasonRaw.trim();
  if (classifications.has(file)) errors.push(`duplicate classification: ${file}`);
  classifications.set(file, {
    disposition,
    privateAccess,
    boundary,
    externalDependencies,
    assertionValue,
    reason,
  });

  if (!/^(是：|否：|历史：)/.test(privateAccess)) {
    errors.push(`classification privateAccess must start with 是：, 否：, or 历史： ${file}`);
  }
  for (const [field, value, minimumLength] of [
    ['privateAccess', privateAccess, 4],
    ['boundary', boundary, 6],
    ['externalDependencies', externalDependencies, 1],
    ['assertionValue', assertionValue, 6],
    ['reason', reason, 10],
  ]) {
    if (value.length < minimumLength) errors.push(`classification ${field} is not substantive: ${file}`);
  }
  if (/^(有断言|有价值|稳定断言)[。.]?$/.test(assertionValue)) {
    errors.push(`classification assertionValue is generic: ${file}`);
  }
  if (/\b(?:TODO|TBD)\b|待补|同上|自动生成|模板占位/i.test([privateAccess, boundary, externalDependencies, assertionValue, reason].join(' '))) {
    errors.push(`classification contains a placeholder: ${file}`);
  }
  const reviewFingerprint = [boundary, externalDependencies, assertionValue, reason].join('\0');
  if (reviewFingerprints.has(reviewFingerprint)) {
    errors.push(`classification review is duplicated: ${reviewFingerprints.get(reviewFingerprint)} -> ${file}`);
  } else {
    reviewFingerprints.set(reviewFingerprint, file);
  }
}

const candidateClassificationRows = classificationText.split('\n')
  .filter((line) => /^\| `[^`]+_test\.go` \| `(KEEP_PACKAGE|SPLIT_JS_CONTRACT|MOVE_TOOL|OPT_IN_LIVE|VENDOR_ONLY|ARCHIVE_ONLY)` \|/.test(line));
if (candidateClassificationRows.length !== classifications.size) {
  errors.push(`malformed classification rows=${candidateClassificationRows.length - classifications.size}`);
}

const currentGoTests = walk(root, (file) => file.endsWith('_test.go')).sort();
const movedSources = new Set(
  [...classifications.entries()]
    .filter(([, value]) => value.disposition === 'MOVE_TOOL')
    .map(([file]) => file),
);
const classifiedCurrent = [...classifications.keys()].filter((file) => !movedSources.has(file)).sort();

for (const file of currentGoTests) {
  if (!classifications.has(file)) errors.push(`unclassified current Go test: ${file}`);
}
for (const file of classifiedCurrent) {
  if (!currentGoTests.includes(file)) errors.push(`classified current Go test is missing: ${file}`);
}
for (const file of movedSources) {
  if (fs.existsSync(path.join(root, file))) errors.push(`MOVE_TOOL source still exists as _test.go: ${file}`);
}

const movedTargetBySource = {
  'automation/image_layout_validation_test.go': 'tests/automation/tools/image-layout-lab/main.go',
  'automation/image_layout_visualize_test.go': 'tests/automation/tools/image-layout-lab/main.go',
  'automation/wechat_visualization_test.go': 'tests/wechat/tools/visualize-layout/main.go',
};
const movedTargets = [...new Set(Object.values(movedTargetBySource))];
for (const file of movedTargets) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`moved tool target is missing: ${file}`);
}
for (const [source, target] of Object.entries(movedTargetBySource)) {
  const classification = classifications.get(source);
  if (!classification || classification.disposition !== 'MOVE_TOOL') {
    errors.push(`moved tool source does not have MOVE_TOOL disposition: ${source}`);
  } else if (!classification.reason.includes(`\`${target}\``)) {
    errors.push(`MOVE_TOOL classification does not cite target ${target}: ${source}`);
  }
}

const liveOptInBySource = {
  'automation/audio_backend_darwin_test.go': 'OPENDESK_LIVE_AUDIO_TEST=1',
  'automation/clipboard_rich_darwin_test.go': 'OPENDESK_LIVE_CLIPBOARD_TEST=1',
};
for (const [source, optIn] of Object.entries(liveOptInBySource)) {
  const classification = classifications.get(source);
  if (!classification || classification.disposition !== 'OPT_IN_LIVE') {
    errors.push(`live source does not have OPT_IN_LIVE disposition: ${source}`);
  } else if (!classification.reason.includes(`\`${optIn}\``)) {
    errors.push(`OPT_IN_LIVE classification does not cite ${optIn}: ${source}`);
  }
}

for (const [file, classification] of classifications.entries()) {
  if (classification.disposition === 'SPLIT_JS_CONTRACT') {
    const jsTests = [...classification.reason.matchAll(/`(tests\/runtime-api\/[^`]+\.js)`/g)].map((item) => item[1]);
    if (jsTests.length === 0) errors.push(`SPLIT_JS_CONTRACT classification has no Runtime JS test: ${file}`);
    for (const jsTest of jsTests) {
      if (!fs.existsSync(path.join(root, jsTest))) errors.push(`classified Runtime JS test is missing: ${file} -> ${jsTest}`);
    }
  }
  if (classification.disposition === 'VENDOR_ONLY') {
    const moduleRoot = file.startsWith('third_party/robotgo/')
      ? 'third_party/robotgo/go.mod'
      : 'third_party/kbinani-screenshot/go.mod';
    if (!fs.existsSync(path.join(root, moduleRoot))) errors.push(`VENDOR_ONLY nested module is missing: ${file} -> ${moduleRoot}`);
  }
  if (classification.disposition === 'ARCHIVE_ONLY' && !file.startsWith('.archive/')) {
    errors.push(`ARCHIVE_ONLY classification is outside .archive: ${file}`);
  }
}

const expectedCounts = {
  KEEP_PACKAGE: 114,
  SPLIT_JS_CONTRACT: 14,
  MOVE_TOOL: 3,
  OPT_IN_LIVE: 2,
  VENDOR_ONLY: 4,
  ARCHIVE_ONLY: 8,
};
const dispositionCounts = Object.fromEntries(Object.keys(expectedCounts).map((label) => [label, 0]));
for (const { disposition } of classifications.values()) dispositionCounts[disposition] += 1;
for (const [label, expected] of Object.entries(expectedCounts)) {
  if (dispositionCounts[label] !== expected) {
    errors.push(`${label} count=${dispositionCounts[label]}, expected=${expected}`);
  }
}
if (classifications.size !== 145) errors.push(`classification total=${classifications.size}, expected=145`);
if (currentGoTests.length !== 142) errors.push(`current _test.go total=${currentGoTests.length}, expected=142`);

if (fs.existsSync(path.join(root, 'temp'))) errors.push('retired repository-root output directory exists');

const manifestPath = path.join(root, 'tests/runtime-api/manifest.js');
const context = {};
context.globalThis = context;
vm.runInNewContext(fs.readFileSync(manifestPath, 'utf8'), context, { filename: manifestPath });
const runtimeObjects = context.RuntimeAPIObjects || {};
const catalogLinks = [];
for (const [name, entry] of Object.entries(runtimeObjects)) {
  for (const field of ['docs', 'types']) {
    const target = path.join(root, entry[field]);
    if (!fs.existsSync(target)) errors.push(`${name}.${field} target is missing: ${entry[field]}`);
  }
  catalogLinks.push({ name, docs: entry.docs, types: entry.types, source: entry.source, methods: entry.methods.length });
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((line) => {
    const trimmed = line.trimStart();
    return trimmed.startsWith('//') ? '' : line;
  }).join('\n');
}

const forbiddenCalls = [
  ['System.writeFile', /\bSystem\.writeFile\s*\(/],
  ['System.getenv', /\bSystem\.getenv\s*\(/],
  ['ImageColor.drawSeparators', /\bImageColor\.drawSeparators\s*\(/],
  ['ImageColor.visualizeRegions', /\bImageColor\.visualizeRegions\s*\(/],
  ['ImageColor.saveBase64', /\bImageColor\.saveBase64\s*\(/],
  ['ImageColor.templateMatchBackend', /\bImageColor\.templateMatchBackend\s*\(/],
  ['window.bringToTopByPID', /\bwindow\.bringToTopByPID\s*\(/],
  ['mouse.scroll', /\bmouse\.scroll\s*\(/],
  ['File.mkdir', /\bFile\.mkdir\s*\(/],
];
const publicJavaScript = walk(root, (file) => file.endsWith('.js') && (file.includes(`${path.sep}examples${path.sep}`) || file.includes(`${path.sep}tests${path.sep}`)))
  .filter((file) => !file.startsWith('.archive/'));
for (const relative of publicJavaScript) {
  const source = stripComments(fs.readFileSync(path.join(root, relative), 'utf8'));
  for (const [api, pattern] of forbiddenCalls) {
    if (pattern.test(source)) errors.push(`undocumented/removed API call ${api}: ${relative}`);
  }
}

const allJavaScript = walk(root, (file) => file.endsWith('.js'));
const archiveFiles = walk(path.join(root, '.archive'), () => true).sort();
const tools = [];
const fixtures = [];
for (const relative of walk(path.join(root, 'tests'), () => true)) {
  const parts = relative.split('/');
  const toolIndex = parts.indexOf('tools');
  const fixtureIndex = parts.findIndex((part) => part === 'fixture' || part === 'fixtures');
  if (toolIndex >= 0 && parts[toolIndex + 1]) tools.push(parts.slice(0, toolIndex + 2).join('/'));
  if (fixtureIndex >= 0) fixtures.push(parts.slice(0, fixtureIndex + 1).join('/'));
}

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  status: errors.length === 0 ? 'passed' : 'failed',
  repositoryRoot: root,
  output,
  errors,
  sourceSnapshot: {
    head: command(['git', 'rev-parse', 'HEAD']),
    branch: command(['git', 'branch', '--show-current']),
    dirty: command(['git', 'status', '--porcelain=v1']).length > 0,
    fileCount: sourceFiles.length,
    closureSha256: sourceClosure.digest('hex'),
  },
  goTests: {
    migrationBaseline: classifications.size,
    current: currentGoTests.length,
    dispositionCounts,
    classificationDocument: relativeFrom(root, classificationPath),
    classificationSha256: sha256(classificationPath),
    classifications: Object.fromEntries([...classifications.entries()].sort(([left], [right]) => left.localeCompare(right))),
    movedSources: [...movedSources].sort(),
    movedTargets,
  },
  runtimeCatalog: {
    objectCount: Object.keys(runtimeObjects).length,
    methodCount: catalogLinks.reduce((sum, entry) => sum + entry.methods, 0),
    manifest: relativeFrom(root, manifestPath),
    manifestSha256: sha256(manifestPath),
    links: catalogLinks,
  },
  inventory: {
    javascriptFilesExcludingGitRuntimeDist: allJavaScript.length,
    runtimeApiJavaScript: allJavaScript.filter((file) => file.startsWith('tests/runtime-api/')).length,
    testJavaScript: allJavaScript.filter((file) => file.startsWith('tests/')).length,
    examplesJavaScript: allJavaScript.filter((file) => file.startsWith('examples/')).length,
    javascriptFiles: allJavaScript.sort(),
    javascriptByScope: {
      runtimeAPI: allJavaScript.filter((file) => file.startsWith('tests/runtime-api/')).sort(),
      domainTestsAndTools: allJavaScript.filter((file) => file.startsWith('tests/') && !file.startsWith('tests/runtime-api/')).sort(),
      examples: allJavaScript.filter((file) => file.startsWith('examples/')).sort(),
      polyfills: allJavaScript.filter((file) => file.startsWith('polyfills/')).sort(),
      libraries: allJavaScript.filter((file) => file.startsWith('jslibs/')).sort(),
      archive: allJavaScript.filter((file) => file.startsWith('.archive/')).sort(),
      other: allJavaScript.filter((file) => !['tests/', 'examples/', 'polyfills/', 'jslibs/', '.archive/'].some((prefix) => file.startsWith(prefix))).sort(),
    },
    archiveFileCount: archiveFiles.length,
    archiveFiles,
    toolRoots: [...new Set(tools)].sort(),
    fixtureRoots: [...new Set(fixtures)].sort(),
  },
  invariants: {
    rootTempAbsent: !fs.existsSync(path.join(root, 'temp')),
    movedPseudoTestsAbsent: [...movedSources].every((file) => !fs.existsSync(path.join(root, file))),
    allCurrentGoTestsClassified: currentGoTests.every((file) => classifications.has(file)),
    allClassificationsHaveReviewFields: candidateClassificationRows.length === classifications.size
      && [...classifications.values()].every((entry) => entry.privateAccess && entry.boundary && entry.externalDependencies && entry.assertionValue && entry.reason),
    splitContractsCiteExistingJavaScript: !errors.some((error) => error.includes('Runtime JS test')),
    catalogDocsAndTypesExist: !errors.some((error) => error.includes('.docs target') || error.includes('.types target')),
    forbiddenPublicJavaScriptCallsAbsent: !errors.some((error) => error.startsWith('undocumented/removed API call')),
  },
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[TEST-ARCHITECTURE-AUDIT] ${report.status.toUpperCase()} -> ${relativeFrom(root, output)}`);
console.log(JSON.stringify({
  sourceSnapshot: report.sourceSnapshot,
  goTests: {
    migrationBaseline: report.goTests.migrationBaseline,
    current: report.goTests.current,
    dispositionCounts: report.goTests.dispositionCounts,
    classificationDocument: report.goTests.classificationDocument,
    classificationSha256: report.goTests.classificationSha256,
    movedSources: report.goTests.movedSources,
    movedTargets: report.goTests.movedTargets,
  },
  inventory: {
    javascriptFilesExcludingGitRuntimeDist: report.inventory.javascriptFilesExcludingGitRuntimeDist,
    runtimeApiJavaScript: report.inventory.runtimeApiJavaScript,
    testJavaScript: report.inventory.testJavaScript,
    examplesJavaScript: report.inventory.examplesJavaScript,
    archiveFileCount: report.inventory.archiveFileCount,
    toolRootCount: report.inventory.toolRoots.length,
    fixtureRootCount: report.inventory.fixtureRoots.length,
  },
  invariants: report.invariants,
}, null, 2));
if (errors.length > 0) {
  for (const error of errors) console.error(`[TEST-ARCHITECTURE-AUDIT] ${error}`);
  process.exit(1);
}
