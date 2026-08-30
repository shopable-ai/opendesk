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

  interface ClawdeskScreenScreenshotOptions {
    path?: string;
    fullPage?: boolean;
    clip?: ClawdeskScreenClip;
    encoding?: "binary" | "base64";
    returnType?: "base64" | "bytes" | "path" | "object" | "none";
    target?: "activeWindow" | "screen";
    displayIndex?: number;
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
    screenshot(options?: ClawdeskScreenScreenshotOptions): Promise<string | ArrayBuffer | ClawdeskScreenshotResult | null>;
  }

  var Screen: ClawdeskScreen;
}
