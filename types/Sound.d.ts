export {};

declare global {
  interface ClawdeskSound {
    playSuccess(): void;
    playFail(): void;
    playWarning(): void;
    playError(): void;
    playCaptcha(): void;
    playSound(soundPath: string): void;
    play(soundPath: string): void;
  }

  var Sound: ClawdeskSound;
}
