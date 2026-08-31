export {};

declare global {
  interface ClawdeskPoint {
    x: number;
    y: number;
  }

  interface ClawdeskMouseClickOptions {
    button?: "left" | "right" | "middle";
    clickCount?: number;
    delay?: number;
  }

  interface ClawdeskMouseMoveOptions {
    steps?: number;
  }

  interface ClawdeskMouseButtonOptions {
    button?: "left" | "right" | "middle";
  }

  interface ClawdeskMouseWheelOptions {
    deltaX?: number;
    deltaY?: number;
    steps?: number;
    delay?: number;
  }

  interface ClawdeskMouse {
    click(x: number, y: number, options?: ClawdeskMouseClickOptions): void;
    /**
     * Performs one macOS Accessibility press on the press-capable element
     * owned by processID at the supplied global virtual-desktop coordinates.
     */
    clickForPID(processID: number, x: number, y: number): void;
    move(x: number, y: number, options?: ClawdeskMouseMoveOptions): void;
    down(options?: ClawdeskMouseButtonOptions): void;
    up(options?: ClawdeskMouseButtonOptions): void;
    getPos(): ClawdeskPoint;
    wheel(options?: ClawdeskMouseWheelOptions): void;
  }

  var mouse: ClawdeskMouse;
}
