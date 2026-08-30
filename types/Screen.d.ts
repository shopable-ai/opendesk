export {};

declare global {
  interface ClawdeskDisplayInfo {
    index: number;
    id: string;
    isPrimary: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    pixelWidth: number;
    pixelHeight: number;
    scale: number;
  }

  interface ClawdeskScreenClip {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface ClawdeskScreenshotResult {
    path: string;
    mimeType: string;
    width: number;
    height: number;
    sizeBytes: number;
    source: string;
    backend: string;
  }

  interface ClawdeskScreen {
    getWidth(): number;
    getHeight(): number;
    getDisplays(): ClawdeskDisplayInfo[];
    getPrimaryDisplay(): ClawdeskDisplayInfo | null;
    getDisplay(index: number): ClawdeskDisplayInfo | null;
    getVirtualBounds(): ClawdeskScreenClip;
    pixel(x: number, y: number): string;
    pixels(points: (ClawdeskPoint | [number, number])[], scaled?: boolean): string[];
    screenshot(options?: ClawdeskPageScreenshotOptions): Promise<string | ArrayBuffer | ClawdeskScreenshotResult | null>;
  }

  var Screen: ClawdeskScreen;
}
