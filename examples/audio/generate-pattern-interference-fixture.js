// Run from the repository root with Node.js:
// node examples/audio/generate-pattern-interference-fixture.js
//
// Creates deterministic, synthetic, speech-free PCM WAV files under .runtime/.
// The long file contains order cues near 3s and 12s, background/noise, and
// strong confusers. It is intentionally a generated test artifact, not a
// product sound or a business signal.

const fs = require('fs');
const path = require('path');

const sampleRate = 48000;
const durationSeconds = 20;
const cueSeconds = 0.84;
const cueSamples = Math.round(sampleRate * cueSeconds);
const totalSamples = sampleRate * durationSeconds;
const outputDir = path.resolve('.runtime/tests/platform-primitives/task-016-audio-pattern-watcher/fixture');
const referencePath = path.join(outputDir, 'order-cue.wav');
const playbackPath = path.join(outputDir, 'order-interference-20s.wav');

function cueSample(index) {
  const t = index / sampleRate;
  const notes = [880, 1320, 1760, 1320, 990];
  const noteIndex = Math.min(notes.length - 1, Math.floor(t / 0.15));
  const noteT = t - noteIndex * 0.15;
  const envelope = Math.min(1, noteT / 0.012) * Math.min(1, (0.15 - noteT) / 0.035);
  const f = notes[noteIndex];
  return envelope * (0.46 * Math.sin(2 * Math.PI * f * t)
    + 0.20 * Math.sin(2 * Math.PI * f * 2 * t)
    + 0.08 * Math.sin(2 * Math.PI * f * 3 * t));
}

function writeWav(filePath, samples) {
  const dataBytes = samples.length * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + dataBytes, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(dataBytes, 40);
  const data = Buffer.alloc(dataBytes);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(value * 32767), i * 2);
  }
  fs.writeFileSync(filePath, Buffer.concat([header, data]));
}

let random = 0x13579bdf;
function noise() {
  random = (1664525 * random + 1013904223) >>> 0;
  return (random / 0x100000000) * 2 - 1;
}

fs.mkdirSync(outputDir, { recursive: true });
const reference = Array.from({ length: cueSamples }, (_, i) => cueSample(i));
const playback = new Float32Array(totalSamples);
for (let i = 0; i < totalSamples; i += 1) {
  const t = i / sampleRate;
  playback[i] = 0.025 * Math.sin(2 * Math.PI * 110 * t)
    + 0.012 * Math.sin(2 * Math.PI * 233 * t) + 0.006 * noise();
}

function mixAt(seconds, gain, source) {
  const start = Math.round(seconds * sampleRate);
  for (let i = 0; i < source.length && start + i < playback.length; i += 1) playback[start + i] += gain * source[i];
}

mixAt(3, 1, reference);
mixAt(12, 0.9, reference);
// A non-matching tonal confuser, deliberately louder than the background.
const confuserLength = Math.round(1.1 * sampleRate);
const confuser = Array.from({ length: confuserLength }, (_, i) => {
  const t = i / sampleRate;
  const envelope = Math.min(1, t / 0.08) * Math.min(1, (1.1 - t) / 0.12);
  return envelope * 0.42 * Math.sin(2 * Math.PI * (180 + 90 * t) * t);
});
mixAt(7, 1, confuser);
mixAt(16.2, 0.85, confuser);

writeWav(referencePath, reference);
writeWav(playbackPath, playback);
console.log(JSON.stringify({ sampleRate, durationSeconds, cueOffsetsSeconds: [3, 12], files: 2 }));
