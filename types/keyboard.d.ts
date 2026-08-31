export {};

declare global {
  interface OpenDeskKeyboard {
    type(text: string): void;
    press(key: string): void;
    down(key: string): void;
    up(key: string): void;
    combination(...keys: string[]): void;
  }

  var keyboard: OpenDeskKeyboard;
}
