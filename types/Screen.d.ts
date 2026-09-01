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

  interface OpenDeskSelectedRegion extends OpenDeskScreenClip {
    displayId: string;
    displayIndex: number;
    scaleFactor: number;
    pixelWidth: number;
    pixelHeight: number;
  }

  interface OpenDeskRegionSelectorOptions {
    dimOutside?: boolean;
    movable?: boolean;
    resizable?: boolean;
    minWidth?: number;
    minHeight?: number;
  }

  interface OpenDeskDisplayRecordingTarget {
    type: 'display';
    displayIndex?: number;
    displayId?: string;
  }

  interface OpenDeskRegionRecordingTarget extends OpenDeskScreenClip {
    type: 'region';
    displayIndex?: number;
    displayId?: string;
  }

  type OpenDeskScreenRecordingTarget = OpenDeskDisplayRecordingTarget | OpenDeskRegionRecordingTarget;

  interface OpenDeskResolvedScreenRecordingTarget extends OpenDeskScreenClip {
    type: 'display' | 'region';
    displayIndex: number;
    displayId: string;
    pixelWidth: number;
    pixelHeight: number;
  }

  interface OpenDeskScreenRecordingOptions {
    target: OpenDeskResolvedScreenRecordingTarget;
    fps?: 30;
    output: string;
    showCursor?: boolean;
  }

  interface OpenDeskScreenRecordingResult {
    id: string;
    output: string;
    container: 'video/quicktime';
    codec: 'H.264';
    fps: 30;
    durationMs: number;
    sizeBytes: number;
    pixelWidth: number;
    pixelHeight: number;
    target: OpenDeskResolvedScreenRecordingTarget;
    finalized: boolean;
  }

  interface OpenDeskScreenRecording {
    id: string;
    state: 'recording' | 'stopped';
    output: string;
    fps: 30;
    target: OpenDeskScreenRecordingTarget;
    startedAt: string;
    stop(): Promise<OpenDeskScreenRecordingResult>;
  }

  interface OpenDeskScreenCaptureCapabilities {
    schemaVersion: 1;
    platform: string;
    backend: string;
    selector: Record<string, unknown>;
    recording: Record<string, unknown>;
    frameStream: { supported: false; status: 'notImplemented'; reason: string };
    audio: { system: false; microphone: false; namespace: 'Audio'; reason: string };
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
    /** Experimental on macOS. Opens a real multi-display AppKit selection overlay. */
    selectRegion(options?: OpenDeskRegionSelectorOptions): Promise<OpenDeskSelectedRegion>;
    /** Experimental on macOS. The output must be a clean absolute, non-existing .mov path. */
    startRecording(options: OpenDeskScreenRecordingOptions): Promise<OpenDeskScreenRecording>;
    getCaptureCapabilities(): OpenDeskScreenCaptureCapabilities;
  }

  var Screen: OpenDeskScreen;
}
