export {};

declare global {
  interface ClawdeskTouchscreen {
    tap(x: number, y: number): void;
  }

  var touchscreen: ClawdeskTouchscreen;
}
