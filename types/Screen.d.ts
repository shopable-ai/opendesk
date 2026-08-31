export {};

declare global {
  interface OpenDeskDisplayInfo {
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

  interface OpenDeskScreenClip {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface OpenDeskScreenshotResult {
    path: string;
    mimeType: string;
    width: number;
    height: number;
    sizeBytes: number;
    source: string;
    backend: string;
  }

  interface OpenDeskScreen {
    getWidth(): number;
    getHeight(): number;
    getDisplays(): OpenDeskDisplayInfo[];
    getPrimaryDisplay(): OpenDeskDisplayInfo | null;
    getDisplay(index: number): OpenDeskDisplayInfo | null;
    getVirtualBounds(): OpenDeskScreenClip;
    pixel(x: number, y: number): string;
    pixels(points: (OpenDeskPoint | [number, number])[], scaled?: boolean): string[];
    screenshot(options?: OpenDeskPageScreenshotOptions): Promise<string | ArrayBuffer | OpenDeskScreenshotResult | null>;
  }

  var Screen: OpenDeskScreen;
}
