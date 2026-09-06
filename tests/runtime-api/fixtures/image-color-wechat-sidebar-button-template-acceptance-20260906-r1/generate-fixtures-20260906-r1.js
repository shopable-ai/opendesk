// One-time, non-overwriting fixture generator.
// Run from the repository root with:
// ./opendesk -script tests/runtime-api/fixtures/image-color-wechat-sidebar-button-template-acceptance-20260906-r1/generate-fixtures-20260906-r1.js -console-mode script

const fixtureRoot = './tests/runtime-api/fixtures/image-color-wechat-sidebar-button-template-acceptance-20260906-r1';
const selectedMessageSource = './examples/image-color/fixtures/wechat-panel.png';
const selectedContactsSource = '/Users/mac/Downloads/wechat-temp.png';
const manifest = await File.readJSON(`${fixtureRoot}/fixture-manifest.json`);
eval(File.read('./tests/runtime-api/crypto.js'));

const outputs = {
  selectedMessageSource: `${fixtureRoot}/sources/message-selected-panel-880x640.png`,
  selectedContactsSource: `${fixtureRoot}/sources/contacts-selected-sidebar-62x290.png`,
  messageUnselected: `${fixtureRoot}/states/messages/unselected-24x22.png`,
  messageSelected: `${fixtureRoot}/states/messages/selected-24x22.png`,
  contactsUnselected: `${fixtureRoot}/states/contacts/unselected-24x22.png`,
  contactsSelected: `${fixtureRoot}/states/contacts/selected-24x22.png`,
  favorites: `${fixtureRoot}/buttons/favorites-24x22.png`,
  channels: `${fixtureRoot}/buttons/channels-24x22.png`,
  miniPrograms: `${fixtureRoot}/buttons/mini-programs-24x22.png`,
  look: `${fixtureRoot}/buttons/look-24x22.png`,
  mobile: `${fixtureRoot}/buttons/mobile-24x22.png`,
  settings: `${fixtureRoot}/buttons/settings-32x28.png`,
};

const expectedSourceSizes = [
  {
    path: selectedMessageSource,
    size: [880, 640],
    sha256: manifest.sourceSnapshots.find((source) => source.id === 'message-selected-panel').sha256,
  },
  {
    path: selectedContactsSource,
    size: [62, 290],
    sha256: manifest.sourceSnapshots.find((source) => source.id === 'contacts-selected-sidebar').sha256,
  },
];

for (const source of expectedSourceSizes) {
  if (!File.exists(source.path)) {
    throw new Error(`fixture source is missing: ${source.path}`);
  }
  const actual = ImageColor.getSize(source.path);
  if (!Array.isArray(actual) || actual[0] !== source.size[0] || actual[1] !== source.size[1]) {
    throw new Error(`unexpected fixture source size for ${source.path}: ${JSON.stringify(actual)}`);
  }
  const actualSha256 = RuntimeAPICrypto.hashFile(source.path);
  if (actualSha256 !== source.sha256) {
    throw new Error(`fixture source digest changed for ${source.path}: expected ${source.sha256}, got ${actualSha256}`);
  }
}

const collisions = Object.values(outputs).filter((output) => File.exists(output));
if (collisions.length > 0) {
  throw new Error(`refusing to overwrite existing acceptance fixtures: ${JSON.stringify(collisions)}`);
}

File.ensureDir(`${fixtureRoot}/sources`);
File.ensureDir(`${fixtureRoot}/states/messages`);
File.ensureDir(`${fixtureRoot}/states/contacts`);
File.ensureDir(`${fixtureRoot}/buttons`);

File.copy(selectedMessageSource, outputs.selectedMessageSource);
File.copy(selectedContactsSource, outputs.selectedContactsSource);

const crops = [
  { source: outputs.selectedContactsSource, output: outputs.messageUnselected, bounds: { x: 18, y: 111, width: 24, height: 22 } },
  { source: outputs.selectedMessageSource, output: outputs.messageSelected, bounds: { x: 18, y: 111, width: 24, height: 22 } },
  { source: outputs.selectedMessageSource, output: outputs.contactsUnselected, bounds: { x: 18, y: 159, width: 24, height: 22 } },
  { source: outputs.selectedContactsSource, output: outputs.contactsSelected, bounds: { x: 18, y: 159, width: 24, height: 22 } },
  { source: outputs.selectedMessageSource, output: outputs.favorites, bounds: { x: 18, y: 207, width: 24, height: 22 } },
  { source: outputs.selectedMessageSource, output: outputs.channels, bounds: { x: 18, y: 255, width: 24, height: 22 } },
  { source: outputs.selectedMessageSource, output: outputs.miniPrograms, bounds: { x: 18, y: 303, width: 24, height: 22 } },
  { source: outputs.selectedMessageSource, output: outputs.look, bounds: { x: 18, y: 351, width: 24, height: 22 } },
  { source: outputs.selectedMessageSource, output: outputs.mobile, bounds: { x: 18, y: 548, width: 24, height: 22 } },
  { source: outputs.selectedMessageSource, output: outputs.settings, bounds: { x: 14, y: 592, width: 32, height: 28 } },
];

for (const crop of crops) {
  const image = ImageColor.clip(crop.source, crop.bounds);
  const saved = ImageColor.save(image, crop.output, 'png', 100);
  if (!saved) throw new Error(`failed to save fixture crop: ${crop.output}`);
  const size = ImageColor.getSize(crop.output);
  if (!Array.isArray(size) || size[0] !== crop.bounds.width || size[1] !== crop.bounds.height) {
    throw new Error(`unexpected generated fixture size for ${crop.output}: ${JSON.stringify(size)}`);
  }
}

const expectedGeneratedFiles = [
  ...manifest.sourceSnapshots.map((source) => ({ path: `${fixtureRoot}/${source.path}`, sha256: source.sha256 })),
  ...manifest.statePairs.flatMap((pair) => pair.templates
    .map((template) => ({ path: `${fixtureRoot}/${template.path}`, sha256: template.sha256 }))),
  ...manifest.additionalButtons
    .map((button) => ({ path: `${fixtureRoot}/${button.path}`, sha256: button.sha256 })),
];
for (const expected of expectedGeneratedFiles) {
  const actualSha256 = RuntimeAPICrypto.hashFile(expected.path);
  if (actualSha256 !== expected.sha256) {
    throw new Error(`generated fixture digest mismatch for ${expected.path}: expected ${expected.sha256}, got ${actualSha256}`);
  }
}

console.log(`WECHAT_SIDEBAR_ACCEPTANCE_FIXTURES_20260906_R1=${JSON.stringify({ fixtureRoot, outputs, crops, verifiedDigests: expectedGeneratedFiles.length })}`);
