// Run from the repository root:
// go run ./cmd/opendesk -script examples/sound-playback.js -console-mode script

const playback = Sound.start('public/done.mp3', { loop: true });
const started = playback.status();
await System.delay(100);
const pauseAccepted = playback.pause();
await System.delay(100);
const resumeAccepted = playback.resume();
await System.delay(100);
const stopAccepted = playback.stop();
const result = await playback.wait();

console.log(JSON.stringify({
  id: playback.id,
  started,
  pauseAccepted,
  resumeAccepted,
  stopAccepted,
  terminalStatus: result.status,
  activeAfterWait: Sound.getActive().length,
}));

if (!pauseAccepted || !resumeAccepted || !stopAccepted || result.status !== 'stopped' || Sound.getActive().length !== 0) {
  throw new Error('Sound playback lifecycle did not stop cleanly');
}
