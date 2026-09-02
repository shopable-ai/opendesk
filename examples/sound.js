// Run from the repository root:
// go run ./cmd/opendesk -script examples/sound.js -console-mode script

// Legacy methods are synchronous and return after the sound finishes.
Sound.playCaptcha();
Sound.play('public/done.mp3');
Sound.playSuccess();
Sound.playFail();
Sound.playWarning();
Sound.playError();
Sound.playSound('public/ding.mp3');

// For long-running or controllable playback, see:
// go run ./cmd/opendesk -script examples/sound-playback.js -console-mode script
