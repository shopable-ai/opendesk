// Formal CLI cancellation probe. The shell gate sends SIGINT after READY.
(() => {
  const sampleRate = 8000;
  const durationSeconds = 15;
  const dataSize = sampleRate * durationSeconds;
  const bytes = new Array(44 + dataSize).fill(128);

  function ascii(offset, value) {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  }
  function uint16le(offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
  }
  function uint32le(offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
  }

  ascii(0, 'RIFF');
  uint32le(4, 36 + dataSize);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  uint32le(16, 16);
  uint16le(20, 1); // PCM
  uint16le(22, 1); // mono
  uint32le(24, sampleRate);
  uint32le(28, sampleRate); // 8-bit mono byte rate
  uint16le(32, 1);
  uint16le(34, 8);
  ascii(36, 'data');
  uint32le(40, dataSize);

  File.ensureDir(Execution.artifactDir);
  const fixture = File.join(Execution.artifactDir, 'sound-cancel-silence.wav');
  File.writeBytes(fixture, bytes);

  // Initialize the process-global speaker with a short packaged sound first.
  // The long second playback proves both reuse across sample rates and SIGINT
  // cancellation without waiting for the audio callback to finish naturally.
  Sound.play('public/fail.mp3');
  console.log('SOUND_SYNC_CANCEL_READY=' + JSON.stringify({ fixture, durationSeconds }));
  Sound.play(fixture);
  console.log('SOUND_SYNC_CANCEL_UNEXPECTED_RETURN');
  throw new Error('blocking Sound.play returned without the external SIGINT canceling the execution');
})();
