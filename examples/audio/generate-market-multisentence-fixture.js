// 从仓库根目录使用 OpenDesk GoJS Runtime 运行：
// ./dist/opendesk -script examples/audio/generate-market-multisentence-fixture.js -console-mode script
//
// 这个生成器的职责：
// 1. 在 macOS 上优先使用系统免费内置的 `/usr/bin/say` 默认语音生成 TTS，
//    再用 `/usr/bin/afconvert` 转成 PCM16 WAV。
// 2. 如果 TTS 不可用、命令失败，或设置
//    OPENDESK_AUDIO_FIXTURE_FORCE_FALLBACK=1，则在 JavaScript 中生成确定性的
//    合成音符 cue；不调用网络服务，也不依赖付费 API。
// 3. 将每个 cue 规范化为 48 kHz、mono、PCM16，并写出三个 reference：
//    Order created、Payment completed，以及非目标 Payment pending confuser。
// 4. 构造一个 20 秒 mono 混音：3 秒放入 order，7 秒放入 confuser，
//    11 秒放入 payment，并加入确定性背景/噪声和 16.2 秒音调干扰。
// 5. 最后的 JSON 日志会打印每个 cue 是否使用 TTS，以及生成文件的绝对路径。
// 这些都是固定声学 pattern，不是 ASR，也不能证明真实业务事件。

const sampleRate = 48000;
const durationSeconds = 20;
const totalSamples = sampleRate * durationSeconds;
const outputDirectory = File.join('.runtime', 'tests', 'platform-primitives', 'task-016-audio-pattern-watcher', 'market-multisentence');
const references = {
  order: File.join(outputDirectory, 'order-created.wav'),
  payment: File.join(outputDirectory, 'payment-completed.wav'),
  confuser: File.join(outputDirectory, 'payment-pending-confuser.wav'),
};
const utterances = {
  order: 'Order created',
  payment: 'Payment completed',
  confuser: 'Payment pending',
};
const playbackPath = File.join(outputDirectory, 'market-multisentence-20s.wav');
const forceFallback = Execution.env.OPENDESK_AUDIO_FIXTURE_FORCE_FALLBACK === '1';
const ttsFailureReasons = {};

function ascii(bytes, offset, value) {
  for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
}
function uint16le(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}
function uint32le(bytes, offset, value) {
  bytes[offset] = value >>> 0 & 0xff;
  bytes[offset + 1] = value >>> 8 & 0xff;
  bytes[offset + 2] = value >>> 16 & 0xff;
  bytes[offset + 3] = value >>> 24 & 0xff;
}
function writeWav(path, samples) {
  const dataBytes = samples.length * 2;
  const bytes = new Array(44 + dataBytes).fill(0);
  ascii(bytes, 0, 'RIFF'); uint32le(bytes, 4, 36 + dataBytes); ascii(bytes, 8, 'WAVE');
  ascii(bytes, 12, 'fmt '); uint32le(bytes, 16, 16); uint16le(bytes, 20, 1);
  uint16le(bytes, 22, 1); uint32le(bytes, 24, sampleRate); uint32le(bytes, 28, sampleRate * 2);
  uint16le(bytes, 32, 2); uint16le(bytes, 34, 16); ascii(bytes, 36, 'data'); uint32le(bytes, 40, dataBytes);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]));
    const pcm = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
    uint16le(bytes, 44 + index * 2, pcm < 0 ? pcm + 65536 : pcm);
  }
  File.writeBytes(path, bytes);
}
function readUInt16(bytes, offset) { return bytes[offset] | bytes[offset + 1] << 8; }
function readUInt32(bytes, offset) {
  return (bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16 | bytes[offset + 3] << 24) >>> 0;
}
function readMonoPCM16(path) {
  const bytes = File.readBytes(path);
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'RIFF'
    || String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) !== 'WAVE') throw new Error('TTS output is not WAV');
  const channels = readUInt16(bytes, 22); const bits = readUInt16(bytes, 34); const rate = readUInt32(bytes, 24);
  let dataOffset = -1; let dataSize = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunk = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = readUInt32(bytes, offset + 4);
    if (chunk === 'data') { dataOffset = offset + 8; dataSize = size; break; }
    offset += 8 + size + (size % 2);
  }
  if (channels < 1 || bits !== 16 || rate < 8000 || dataOffset < 0) throw new Error('TTS output is not PCM16 WAV');
  const frameBytes = channels * 2; const frames = Math.floor(Math.min(dataSize, bytes.length - dataOffset) / frameBytes);
  const samples = new Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let mixed = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const at = dataOffset + frame * frameBytes + channel * 2; const value = readUInt16(bytes, at);
      mixed += (value > 32767 ? value - 65536 : value) / 32768;
    }
    samples[frame] = mixed / channels;
  }
  return { samples, rate };
}
function resample(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const length = Math.max(1, Math.round(input.length * toRate / fromRate)); const output = new Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * (input.length - 1) / Math.max(1, length - 1);
    const left = Math.floor(position); const right = Math.min(input.length - 1, left + 1);
    output[index] = input[left] * (right - position) + input[right] * (position - left);
  }
  return output;
}
function fallbackCue(profile) {
  const notes = profile === 'payment' ? [4200, 7100, 5400, 7100, 4200]
    : (profile === 'confuser' ? [190, 270, 230, 320, 180] : [880, 1320, 1760, 1320, 990]);
  const count = Math.round(sampleRate * 0.84); const samples = new Array(count);
  for (let index = 0; index < count; index += 1) {
    const t = index / sampleRate; const noteDuration = 0.15;
    const noteIndex = Math.min(notes.length - 1, Math.floor(t / noteDuration)); const noteT = t - noteIndex * noteDuration;
    const envelope = Math.min(1, noteT / 0.012) * Math.min(1, (noteDuration - noteT) / 0.035);
    const frequency = notes[noteIndex]; const harmonic = profile === 'payment' ? 1.3 : 2;
    samples[index] = envelope * (0.46 * Math.sin(2 * Math.PI * frequency * t)
      + 0.20 * Math.sin(2 * Math.PI * frequency * harmonic * t)
      + 0.08 * Math.sin(2 * Math.PI * frequency * 0.7 * t));
  }
  return samples;
}
let random = 0x13579bdf;
function noise() { random = (1664525 * random + 1013904223) >>> 0; return (random / 0x100000000) * 2 - 1; }

async function tryTTS(text, output) {
  if (forceFallback) { ttsFailureReasons[text] = 'forced-fallback'; return null; }
  if (System.getPlatformInfo().os !== 'darwin') { ttsFailureReasons[text] = 'platform-not-darwin'; return null; }
  if (!File.exists('/usr/bin/say') || !File.exists('/usr/bin/afconvert')) {
    ttsFailureReasons[text] = 'macOS-say-or-afconvert-not-found'; return null;
  }
  const aiff = output + '.aiff';
  try {
    await Command.run('/usr/bin/say', ['-r', '175', '-o', aiff, text], { cwd: File.cwd(), timeout: 120000 });
    await Command.run('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@48000', aiff, output], { cwd: File.cwd(), timeout: 120000 });
    const decoded = readMonoPCM16(output); File.remove(aiff); return resample(decoded.samples, decoded.rate, sampleRate);
  } catch (error) {
    if (File.exists(aiff)) File.remove(aiff); if (File.exists(output)) File.remove(output);
    ttsFailureReasons[text] = String(error && error.code || 'command-or-decode-failed');
    return null;
  }
}

File.ensureDir(outputDirectory);
const usedTTS = { order: false, payment: false, confuser: false };
const patterns = {};
let ttsPattern = await tryTTS(utterances.order, references.order);
usedTTS.order = ttsPattern !== null; patterns.order = ttsPattern || fallbackCue('order');
ttsPattern = await tryTTS(utterances.payment, references.payment);
usedTTS.payment = ttsPattern !== null; patterns.payment = ttsPattern || fallbackCue('payment');
ttsPattern = await tryTTS(utterances.confuser, references.confuser);
usedTTS.confuser = ttsPattern !== null; patterns.confuser = ttsPattern || fallbackCue('confuser');
writeWav(references.order, patterns.order); writeWav(references.payment, patterns.payment); writeWav(references.confuser, patterns.confuser);

const playback = new Array(totalSamples);
const chords = [
  [130.81, 164.81, 196.00],
  [110.00, 130.81, 164.81],
  [87.31, 110.00, 130.81],
  [98.00, 123.47, 146.83],
];
function musicBed(t) {
  const chord = chords[Math.floor(t / 4) % chords.length];
  const barTime = t % 4;
  const beatTime = t % 1;
  const arpTime = t % 0.25;
  const note = chord[Math.floor(t * 4) % chord.length];
  const pad = (Math.sin(2 * Math.PI * chord[0] * t)
    + Math.sin(2 * Math.PI * chord[1] * t)
    + Math.sin(2 * Math.PI * chord[2] * t)) / 3;
  const bass = Math.sin(2 * Math.PI * chord[0] / 2 * t);
  const arpeggio = Math.exp(-13 * arpTime) * Math.sin(2 * Math.PI * note * t);
  const kick = Math.exp(-15 * beatTime) * Math.sin(2 * Math.PI * (78 - 32 * beatTime) * t);
  const accent = Math.exp(-9 * barTime) * Math.sin(2 * Math.PI * chord[2] * t);
  return 0.019 * pad + 0.024 * bass + 0.017 * arpeggio + 0.013 * kick + 0.008 * accent;
}
for (let index = 0; index < totalSamples; index += 1) {
  const t = index / sampleRate;
  playback[index] = musicBed(t) + 0.006 * noise();
}
function mixAt(seconds, gain, samples) {
  const start = Math.round(seconds * sampleRate);
  for (let index = 0; index < samples.length && start + index < playback.length; index += 1) playback[start + index] += gain * samples[index];
}
function resampleRoundTrip(samples) { return resample(resample(samples, sampleRate, 44100), 44100, sampleRate); }
mixAt(3, 1, patterns.order); mixAt(7, 0.82, patterns.confuser); mixAt(11, 0.72, resampleRoundTrip(patterns.payment));
const tonalConfuser = new Array(Math.round(sampleRate * 1.1));
for (let index = 0; index < tonalConfuser.length; index += 1) {
  const t = index / sampleRate;
  tonalConfuser[index] = Math.min(1, t / 0.08) * Math.min(1, (1.1 - t) / 0.12)
    * 0.42 * Math.sin(2 * Math.PI * (180 + 90 * t) * t);
}
mixAt(16.2, 0.85, tonalConfuser); writeWav(playbackPath, playback);
console.log(JSON.stringify({ sampleRate, channels: 1, bits: 16, durationSeconds, forceFallback,
  ttsEngine: 'macOS /usr/bin/say (default voice) -> /usr/bin/afconvert', tts: usedTTS,
  ttsFallbackReasons: ttsFailureReasons,
  utterances,
  watchTargets: {
    references: ['order-created', 'payment-completed'],
    targetOffsetsSeconds: { 'order-created': 3, 'payment-completed': 11 },
    confuser: { patternId: 'payment-pending-confuser', offsetSeconds: 7, expected: 'no-match' },
    matching: 'fixed acoustic pattern reference; not keyword search or ASR',
  },
  cueOffsetsSeconds: { 'order-created': 3, 'payment-pending-confuser': 7, 'payment-completed': 11, 'tonal-confuser': 16.2 },
  files: {
    order: File.path(references.order),
    payment: File.path(references.payment),
    confuser: File.path(references.confuser),
    playback: File.path(playbackPath),
  } }));
