export {};

declare global {
  interface OpenDeskTouchscreen {
    tap(x: number, y: number): void;
  }

  var touchscreen: OpenDeskTouchscreen;
}
