export {};

declare global {
  interface ClawdeskKeyboard {
    type(text: string): void;
    press(key: string): void;
    down(key: string): void;
    up(key: string): void;
    combination(...keys: string[]): void;
  }

  var keyboard: ClawdeskKeyboard;
}
