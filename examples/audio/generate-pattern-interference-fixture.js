// Run from the repository root with Node.js:
// node examples/audio/generate-pattern-interference-fixture.js
//
// Creates local, no-copyright, deterministic WAV fixtures under .runtime/.
// The playback fixture uses an original synthesized music bed (not a downloaded
// song) plus fixed acoustic patterns. It is not speech, ASR, or proof of a
// business event.

const fs = require('fs');
const path = require('path');

const sampleRate = 48000;
const durationSeconds = 20;
const totalSamples = sampleRate * durationSeconds;
const outputDir = path.resolve('.runtime/tests/platform-primitives/task-016-audio-pattern-watcher/fixture');
const orderPath = path.join(outputDir, 'order-created.wav');
const paymentPath = path.join(outputDir, 'payment-completed.wav');
const confuserPath = path.join(outputDir, 'payment-pending-confuser.wav');
const playbackPath = path.join(outputDir, 'order-interference-20s.wav');

function fallbackSample(index, profile) {
  const t = index / sampleRate;
  const notes = profile === 'payment'
    ? [4200, 7100, 5400, 7100, 4200]
    : (profile === 'confuser' ? [190, 270, 230, 320, 180] : [880, 1320, 1760, 1320, 990]);
  const noteIndex = Math.min(notes.length - 1, Math.floor(t / 0.15));
  const noteT = t - noteIndex * 0.15;
  const envelope = Math.min(1, noteT / 0.012) * Math.min(1, (0.15 - noteT) / 0.035);
  const f = notes[noteIndex];
  const harmonic = profile === 'payment' ? 1.3 : 2;
  return envelope * (0.46 * Math.sin(2 * Math.PI * f * t)
    + 0.20 * Math.sin(2 * Math.PI * f * harmonic * t)
    + 0.08 * Math.sin(2 * Math.PI * f * 0.7 * t));
}

function fallbackCue(profile) {
  const cueSamples = Math.round(sampleRate * 0.84);
  return Array.from({ length: cueSamples }, (_, i) => fallbackSample(i, profile));
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

// An original, deterministic 16-second chord loop. Keeping it synthesized in
// this file makes the fixture repeatable and avoids a third-party music license
// or a network dependency. Its gain stays well below the target cue gain.
const accompaniment = [
  [130.81, 164.81, 196.00],
  [110.00, 130.81, 164.81],
  [87.31, 110.00, 130.81],
  [98.00, 123.47, 146.83],
];

function originalMusicBed(t) {
  const chord = accompaniment[Math.floor(t / 4) % accompaniment.length];
  const barT = t % 4;
  const sixteenth = Math.floor(t * 4) % chord.length;
  const arpT = t % 0.25;
  const beatT = t % 1;
  const pad = chord.reduce((sum, frequency) => sum
    + Math.sin(2 * Math.PI * frequency * t), 0) / chord.length;
  const bass = Math.sin(2 * Math.PI * (chord[0] / 2) * t);
  const arpEnvelope = Math.exp(-13 * arpT);
  const arpeggio = arpEnvelope * Math.sin(2 * Math.PI * chord[sixteenth] * t);
  const kickEnvelope = Math.exp(-15 * beatT);
  const kick = kickEnvelope * Math.sin(2 * Math.PI * (78 - 32 * beatT) * t);
  const barAccent = Math.exp(-9 * barT) * Math.sin(2 * Math.PI * chord[2] * t);
  return 0.019 * pad + 0.024 * bass + 0.017 * arpeggio + 0.013 * kick + 0.008 * barAccent;
}

fs.mkdirSync(outputDir, { recursive: true });
const orderReference = fallbackCue('order');
const paymentReference = fallbackCue('payment');
const confuserReference = fallbackCue('confuser');
writeWav(orderPath, orderReference);
writeWav(paymentPath, paymentReference);
writeWav(confuserPath, confuserReference);
const playback = new Float32Array(totalSamples);
for (let i = 0; i < totalSamples; i += 1) {
  const t = i / sampleRate;
  playback[i] = originalMusicBed(t) + 0.006 * noise();
}

function mixAt(seconds, gain, source) {
  const start = Math.round(seconds * sampleRate);
  for (let i = 0; i < source.length && start + i < playback.length; i += 1) playback[start + i] += gain * source[i];
}

function resampleRoundTrip(samples) {
  const downLength = Math.max(1, Math.round(samples.length * 44100 / sampleRate));
  const resample = (input, length) => Array.from({ length }, (_, index) => {
    if (length === 1) return input[0];
    const position = index * (input.length - 1) / (length - 1);
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    return input[left] * (right - position) + input[right] * (position - left);
  });
  return resample(resample(samples, downLength), samples.length);
}

// The target order cue occurs twice. The other two cues are non-target input.
mixAt(3, 1, orderReference);
mixAt(12, 0.72, orderReference);
mixAt(9.2, 0.70, resampleRoundTrip(paymentReference));
mixAt(7, 0.82, confuserReference);
// A non-matching tonal confuser, deliberately louder than the background.
const confuserLength = Math.round(1.1 * sampleRate);
const confuser = Array.from({ length: confuserLength }, (_, i) => {
  const t = i / sampleRate;
  const envelope = Math.min(1, t / 0.08) * Math.min(1, (1.1 - t) / 0.12);
  return envelope * 0.42 * Math.sin(2 * Math.PI * (180 + 90 * t) * t);
});
mixAt(16.2, 0.85, confuser);

writeWav(playbackPath, playback);
console.log(JSON.stringify({
  sampleRate,
  durationSeconds,
  background: 'original-deterministic-synth-bed-v1',
  cueOffsetsSeconds: { 'order-created': [3, 12], 'payment-completed': 9.2, 'payment-pending-confuser': 7 },
  files: 4,
}));
