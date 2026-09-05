export {};

declare global {
  interface OpenDeskPoint {
    x: number;
    y: number;
  }

  interface OpenDeskMouseClickOptions {
    button?: "left" | "right" | "middle";
    clickCount?: number;
    delay?: number;
  }

  interface OpenDeskMouseMoveOptions {
    steps?: number;
  }

  interface OpenDeskMouseButtonOptions {
    button?: "left" | "right" | "middle";
  }

  interface OpenDeskMouseWheelOptions {
    deltaX?: number;
    deltaY?: number;
    steps?: number;
    delay?: number;
  }

  interface OpenDeskMouse {
    click(x: number, y: number, options?: OpenDeskMouseClickOptions): void;
    /**
     * Clicks an explicitly tagged virtual-desktop logical point. OCR/image
     * pixel coordinates and unmarked `{ x, y }` objects are rejected.
     */
    clickPoint(point: OpenDeskScreenPoint, options?: OpenDeskMouseClickOptions): void;
    /**
     * Performs one macOS Accessibility press on the press-capable element
     * owned by processID at the supplied global virtual-desktop coordinates.
     */
    clickForPID(processID: number, x: number, y: number): void;
    move(x: number, y: number, options?: OpenDeskMouseMoveOptions): void;
    down(options?: OpenDeskMouseButtonOptions): void;
    up(options?: OpenDeskMouseButtonOptions): void;
    getPos(): OpenDeskPoint;
    wheel(options?: OpenDeskMouseWheelOptions): void;
  }

  var mouse: OpenDeskMouse;
}
