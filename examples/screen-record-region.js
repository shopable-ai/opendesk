// Run from the repository root:
// ./opendesk -script examples/screen-record-region.js -console-mode script

const artifactDir = File.join(
  System.getWorkingDirectory(),
  '.runtime',
  'tests',
  'platform-primitives',
  'task-006-screen-capture'
);
File.ensureDir(artifactDir);

const region = await Screen.selectRegion({
  dimOutside: true,
  movable: true,
  resizable: true,
  minWidth: 24,
  minHeight: 24,
});
const output = File.join(artifactDir, `region-${Date.now()}.mov`);
const recording = await Screen.startRecording({
  target: {
    type: 'region',
    displayIndex: region.displayIndex,
    displayId: region.displayId,
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
  },
  fps: 30,
  output,
  showCursor: true,
});

let result;
try {
  await sleep(1500);
} finally {
  result = await recording.stop();
}

// Only metadata is printed. Captured pixels remain in the local .runtime file.
console.log(JSON.stringify({
  output: result.output,
  container: result.container,
  codec: result.codec,
  durationMs: result.durationMs,
  sizeBytes: result.sizeBytes,
  pixelWidth: result.pixelWidth,
  pixelHeight: result.pixelHeight,
  finalized: result.finalized,
}));
