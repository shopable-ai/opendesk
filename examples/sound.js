
console.log("Playing captcha sound...")
Sound.playCaptcha();

console.log("Playing done sound...")
// Custom sounds will also have the 2-second delay
Sound.play("public/done.mp3");
await sleep(2000);

console.log("playSuccess sound...")
// These will now have a 2-second pause between sounds
Sound.playSuccess(); // Plays done.mp3
await sleep(2000);
Sound.playFail();    // Plays fail.mp3
await sleep(2000);
Sound.playWarning(); // Plays ding.mp3
await sleep(2000);

// Custom sounds will also have the 2-second delay
Sound.playSound("public/ding.mp3");

await sleep(2000);
Sound.play("public/fail.mp3");
await sleep(2000);
