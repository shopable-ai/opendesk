// Run from the repository root:
// go run ./cmd/opendesk -script examples/audio/control-smoke.js -console-mode script

const evidenceDirectory = '.runtime/tests/platform-primitives/task-004-audio';
const evidencePath = File.join(evidenceDirectory, 'control-smoke.json');
const capabilities = Audio.getCapabilities();

if (capabilities.backend !== 'coreaudio') {
  throw new Error(`Audio control smoke requires coreaudio, got ${capabilities.backend}`);
}
if (!capabilities.controls.volume.read || !capabilities.controls.volume.write) {
  throw new Error('default output has no readable/writable software volume');
}
if (!capabilities.controls.mute.read || !capabilities.controls.mute.write) {
  throw new Error('default output has no readable/writable software mute');
}

const outputs = Audio.getOutputDevices();
const inputs = Audio.getInputDevices();
const defaultOutput = Audio.getDefaultOutput();
const defaultInput = Audio.getDefaultInput();
const originalVolume = Audio.getVolume();
const originalMuted = Audio.isMuted();
const requestedVolume = originalVolume <= 0.8 ? originalVolume + 0.1 : originalVolume - 0.1;
const requestedMuted = !originalMuted;
let observation;
let operationError;
let restoreError;

try {
  const volumeReadback = Audio.setVolume(requestedVolume);
  const muteReadback = requestedMuted ? Audio.mute() : Audio.unmute();
  if (Math.abs(volumeReadback - requestedVolume) > 0.05) {
    throw new Error(`volume readback ${volumeReadback} is too far from requested ${requestedVolume}`);
  }
  if (Math.abs(volumeReadback - originalVolume) < 0.001) {
    throw new Error('volume readback did not prove a state change');
  }
  if (muteReadback !== requestedMuted || Audio.isMuted() !== requestedMuted) {
    throw new Error('mute readback did not match the requested state');
  }
  observation = { requestedVolume, volumeReadback, requestedMuted, muteReadback };
} catch (error) {
  operationError = error;
} finally {
  try {
    const restoredVolume = Audio.setVolume(originalVolume);
    const restoredMuted = originalMuted ? Audio.mute() : Audio.unmute();
    if (Math.abs(restoredVolume - originalVolume) > 0.05 || restoredMuted !== originalMuted) {
      throw new Error('audio state restoration readback failed');
    }
  } catch (error) {
    restoreError = error;
  }
}

if (restoreError) throw restoreError;
if (operationError) throw operationError;

const evidence = {
  schemaVersion: 1,
  task: 'TASK-004-audio',
  platform: System.getPlatformInfo(),
  backend: capabilities.backend,
  controls: capabilities.controls,
  outputDeviceCount: outputs.length,
  inputDeviceCount: inputs.length,
  defaultOutput: defaultOutput ? {
    id: defaultOutput.id,
    transport: defaultOutput.transport,
    outputChannels: defaultOutput.outputChannels,
    volume: defaultOutput.volume,
    mute: defaultOutput.mute,
  } : null,
  defaultInput: defaultInput ? {
    id: defaultInput.id,
    transport: defaultInput.transport,
    inputChannels: defaultInput.inputChannels,
  } : null,
  before: { volume: originalVolume, muted: originalMuted },
  operation: observation,
  restored: { volume: Audio.getVolume(), muted: Audio.isMuted() },
  capture: capabilities.capture,
  deviceNamesOrUIDsRecorded: false,
};

File.ensureDir(evidenceDirectory);
File.write(evidencePath, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({
  ok: true,
  evidencePath,
  backend: evidence.backend,
  outputDeviceCount: evidence.outputDeviceCount,
  inputDeviceCount: evidence.inputDeviceCount,
  before: evidence.before,
  operation: evidence.operation,
  restored: evidence.restored,
  deviceNamesOrUIDsRecorded: false,
}));
