// native-extension: suite implementation loaded by catalog-runner.js; not a standalone entry.
// Runtime assertions remain in their existing tests/runtime-api files.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, CONTEXT, GO_BASIC_BUNDLE, GO_BASIC_EXTENSION, APPLE_VISION_BUNDLE, APPLE_VISION_EXTENSION, requireCommand, readJSON, sha256, assertExecutable, updateContext } = context;

async function prepareAppleVisionExtension() {
  const context = await readJSON(CONTEXT);
  if (!/^Darwin$/i.test(context.environment.os)) return;
  const sourceRoot = File.join(ROOT_DIR, 'examples', 'native-extensions', 'macos-vision');
  const extensionStage = `${APPLE_VISION_EXTENSION}.stage.${Execution.id}`;
  const manifestStage = File.join(APPLE_VISION_BUNDLE, `.extension.json.stage.${Execution.id}`);
  const typesStage = File.join(APPLE_VISION_BUNDLE, 'types', `.index.d.ts.stage.${Execution.id}`);
  File.ensureDir(File.join(APPLE_VISION_BUNDLE, 'bin'));
  File.ensureDir(File.join(APPLE_VISION_BUNDLE, 'types'));
  const sdk = (await requireCommand('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], { timeout: 60_000 }, 'xcrun SDK lookup')).stdout.trim();
  const arch = context.environment.arch;
  await requireCommand('xcrun', [
    'swiftc', '-O', '-target', `${arch}-apple-macosx12.0`, '-sdk', sdk,
    File.join(sourceRoot, 'main.swift'), '-framework', 'Vision', '-framework', 'ImageIO', '-o', extensionStage,
  ], { cwd: ROOT_DIR, timeout: 10 * 60_000, maxOutputBytes: 16 * 1024 * 1024 }, 'build Apple Vision Native Extension');
  await requireCommand('/bin/cp', [File.join(sourceRoot, 'extension.json'), manifestStage], { timeout: 30_000 }, 'stage Apple Vision manifest');
  await requireCommand('/bin/cp', [File.join(sourceRoot, 'types', 'index.d.ts'), typesStage], { timeout: 30_000 }, 'stage Apple Vision types');
  await requireCommand('/bin/mv', [extensionStage, APPLE_VISION_EXTENSION], { timeout: 30_000 }, 'install Apple Vision extension');
  await requireCommand('/bin/mv', [manifestStage, File.join(APPLE_VISION_BUNDLE, 'extension.json')], { timeout: 30_000 }, 'install Apple Vision manifest');
  await requireCommand('/bin/mv', [typesStage, File.join(APPLE_VISION_BUNDLE, 'types', 'index.d.ts')], { timeout: 30_000 }, 'install Apple Vision types');
  await requireCommand('/bin/chmod', ['-R', 'go-w', APPLE_VISION_BUNDLE], { timeout: 30_000 }, 'protect Apple Vision bundle');
  await assertExecutable(APPLE_VISION_EXTENSION, 'Apple Vision Native Extension');
  const digest = await sha256(APPLE_VISION_EXTENSION);
  await updateContext((value) => {
    value.nativeExtensions = value.nativeExtensions || {};
    value.nativeExtensions.appleVision = {
      id: 'com.example.macos-vision', namespace: 'macosVision', bundlePath: APPLE_VISION_BUNDLE,
      path: APPLE_VISION_EXTENSION, sha256: digest,
      buildSource: `xcrun swiftc -O -target ${arch}-apple-macosx12.0 examples/native-extensions/macos-vision/main.swift`,
    };
  });
}

async function prepareNativeExtension() {
  const sourceRoot = File.join(ROOT_DIR, 'examples', 'native-extensions', 'go-basic');
  const extensionStage = `${GO_BASIC_EXTENSION}.stage.${Execution.id}`;
  const manifestStage = File.join(GO_BASIC_BUNDLE, `.extension.json.stage.${Execution.id}`);
  const typesStage = File.join(GO_BASIC_BUNDLE, 'types', `.index.d.ts.stage.${Execution.id}`);
  File.ensureDir(File.join(GO_BASIC_BUNDLE, 'bin'));
  File.ensureDir(File.join(GO_BASIC_BUNDLE, 'types'));
  await requireCommand('go', ['build', '-o', extensionStage, '.'], {
    cwd: sourceRoot,
    timeout: 10 * 60_000,
    maxOutputBytes: 16 * 1024 * 1024,
  }, 'build Go basic Native Extension');
  await requireCommand('/bin/cp', [File.join(sourceRoot, 'extension.json'), manifestStage], { timeout: 30_000 }, 'stage Go extension manifest');
  await requireCommand('/bin/cp', [File.join(sourceRoot, 'types', 'index.d.ts'), typesStage], { timeout: 30_000 }, 'stage Go extension types');
  await requireCommand('/bin/mv', [extensionStage, GO_BASIC_EXTENSION], { timeout: 30_000 }, 'install Go extension');
  await requireCommand('/bin/mv', [manifestStage, File.join(GO_BASIC_BUNDLE, 'extension.json')], { timeout: 30_000 }, 'install Go manifest');
  await requireCommand('/bin/mv', [typesStage, File.join(GO_BASIC_BUNDLE, 'types', 'index.d.ts')], { timeout: 30_000 }, 'install Go types');
  await assertExecutable(GO_BASIC_EXTENSION, 'Go basic Native Extension');
  const digest = await sha256(GO_BASIC_EXTENSION);
  await updateContext((value) => {
    value.nativeExtensions = value.nativeExtensions || {};
    value.nativeExtensions.goBasic = {
      id: 'com.example.go-basic', namespace: 'goBasic', bundlePath: GO_BASIC_BUNDLE,
      path: GO_BASIC_EXTENSION, sha256: digest,
      buildSource: `go -C ${sourceRoot} build -o ${GO_BASIC_EXTENSION} .`,
    };
  });
  await prepareAppleVisionExtension();
}

return Object.freeze({ prepareAppleVisionExtension, prepareNativeExtension });
})
