const manifestPath = 'tests/opencv/fixtures/image-color/pairs.json';
const failures = [];
let assertions = 0;

function expect(condition, message) {
  assertions += 1;
  if (!condition) failures.push(message);
}

function number(value) {
  return Number(value);
}

function sameNumber(actual, expected) {
  return number(actual) === number(expected);
}

async function main() {
  expect(File.exists(manifestPath), `missing fixture manifest: ${manifestPath}`);
  if (failures.length > 0) throw new Error(failures.join('\n'));

  const manifest = JSON.parse(await File.read(manifestPath));
  expect(manifest.schemaVersion === 1,
    `unsupported fixture schema version: ${manifest.schemaVersion}`);
  expect(Array.isArray(manifest.pairs) && manifest.pairs.length >= 4,
    'fixture manifest must contain at least three positive pairs and one negative pair');
  expect(Array.isArray(manifest.colorSamples) && manifest.colorSamples.length >= 3,
    'fixture manifest must contain color samples for all positive panels');
  const backend = await ImageColor.templateMatchBackend();
  expect(backend === manifest.requiredBackend,
    `expected backend ${manifest.requiredBackend}, got ${backend}`);

  expect(File.exists(manifest.source.path), `missing source image: ${manifest.source.path}`);
  const sourceSize = await ImageColor.getSize(manifest.source.path);
  expect(sameNumber(sourceSize[0], manifest.source.width),
    `source width: expected ${manifest.source.width}, got ${sourceSize[0]}`);
  expect(sameNumber(sourceSize[1], manifest.source.height),
    `source height: expected ${manifest.source.height}, got ${sourceSize[1]}`);

  const sourceBase64 = await ImageColor.loadBase64(manifest.source.path);
  expect(String(sourceBase64).startsWith('data:image/png;base64,'),
    'source image did not load as a PNG data URL');
  for (const sample of manifest.colorSamples) {
    const actual = String(await ImageColor.pixel(sourceBase64, sample.x, sample.y)).toLowerCase();
    expect(actual === sample.expected.toLowerCase(),
      `${sample.id}: expected color ${sample.expected}, got ${actual}`);
  }

  const results = [];
  for (const pair of manifest.pairs) {
    expect(File.exists(pair.templatePath), `${pair.id}: missing template ${pair.templatePath}`);
    const templateSize = await ImageColor.getSize(pair.templatePath);
    expect(sameNumber(templateSize[0], pair.expected.width),
      `${pair.id}: template width expected ${pair.expected.width}, got ${templateSize[0]}`);
    expect(sameNumber(templateSize[1], pair.expected.height),
      `${pair.id}: template height expected ${pair.expected.height}, got ${templateSize[1]}`);

    const result = await ImageColor.findPos(
      manifest.source.path,
      pair.templatePath,
      pair.threshold,
    );

    expect(Boolean(result.found) === pair.expected.found,
      `${pair.id}: expected found=${pair.expected.found}, got ${JSON.stringify(result)}`);
    expect(sameNumber(result.x, pair.expected.x),
      `${pair.id}: expected x=${pair.expected.x}, got ${result.x}`);
    expect(sameNumber(result.y, pair.expected.y),
      `${pair.id}: expected y=${pair.expected.y}, got ${result.y}`);
    expect(sameNumber(result.width, pair.expected.width),
      `${pair.id}: result width expected ${pair.expected.width}, got ${result.width}`);
    expect(sameNumber(result.height, pair.expected.height),
      `${pair.id}: result height expected ${pair.expected.height}, got ${result.height}`);
    if (pair.expected.found) {
      expect(number(result.confidence) >= pair.expected.minConfidence,
        `${pair.id}: confidence ${result.confidence} below ${pair.expected.minConfidence}`);
    } else {
      expect(number(result.confidence) < pair.threshold,
        `${pair.id}: absent template confidence ${result.confidence} reached threshold ${pair.threshold}`);
    }

    results.push({
      id: pair.id,
      found: Boolean(result.found),
      x: number(result.x),
      y: number(result.y),
      confidence: number(result.confidence),
    });
  }

  console.log(JSON.stringify({
    test: 'image_color_opencv_fixture_pairs',
    backend,
    assertions,
    cases: results,
  }, null, 2));

  if (failures.length > 0) {
    throw new Error(`OpenCV JS fixture test failed (${failures.length}):\n${failures.join('\n')}`);
  }
  console.log(`OpenCV JS fixture test: PASS (${assertions} assertions)`);
}

await main();
