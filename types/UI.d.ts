export {};

declare global {
  type OpenDeskUIScope = OpenDeskWindowInfo | OpenDeskDisplayInfo | OpenDeskScreenRegion;

  interface OpenDeskUIBaseOptions {
    /** Defaults to the current active window when omitted. */
    within?: OpenDeskUIScope;
    /** Zero-based explicit disambiguation index. */
    index?: number;
    /** Finite wait deadline in milliseconds. Defaults to 10000. */
    timeout?: number;
    /** Finite polling interval in milliseconds. Defaults to 200. */
    polling?: number;
    click?: OpenDeskMouseClickOptions;
  }

  interface OpenDeskUITextOptions extends OpenDeskUIBaseOptions {
    match?: "exact" | "contains";
    caseSensitive?: boolean;
    normalizeWhitespace?: boolean;
    minConfidence?: number;
    provider?: string;
    providerChain?: string[];
    lang?: string;
    /** Delay between UI.tapTexts actions; defaults to 0. */
    intervalMs?: number;
  }

  interface OpenDeskUIImageOptions extends OpenDeskUIBaseOptions {
    threshold?: number;
    scales?: number[];
    maxResults?: number;
  }

  interface OpenDeskUIImageBounds {
    x: number;
    y: number;
    width: number;
    height: number;
    coordinateSpace: "image";
  }

  interface OpenDeskUITextTarget {
    source: "ocr";
    text: string;
    confidence: number;
    provider: string;
    imageBounds: OpenDeskUIImageBounds;
    bounds: OpenDeskScreenRegion;
    center: OpenDeskScreenPoint;
  }

  interface OpenDeskUIImageTarget {
    source: "image";
    template: string;
    confidence: number;
    scale?: number;
    imageBounds: OpenDeskUIImageBounds;
    bounds: OpenDeskScreenRegion;
    center: OpenDeskScreenPoint;
  }

  interface OpenDeskUITapResult<T extends OpenDeskUITextTarget | OpenDeskUIImageTarget> {
    ok: true;
    action: "tapText" | "tapImage";
    target: T;
    point: OpenDeskScreenPoint;
  }

  interface OpenDeskUITapTextsResult {
    ok: true;
    action: "tapTexts";
    completed: Array<OpenDeskUITapResult<OpenDeskUITextTarget>>;
  }

  interface OpenDeskUICapabilities {
    text: { find: true; tap: true; wait: true; backend: "Vision.runOCR" };
    image: { find: true; tap: true; backend: "ImageColor.findImages" };
    accessibility: { available: false; status: "notImplemented" };
    coordinateMapping: { actualCaptureScale: true; mixedDPIScope: false };
  }

  interface OpenDeskUIError extends Error {
    code:
      | "INVALID_ARGUMENT"
      | "TARGET_NOT_FOUND"
      | "AMBIGUOUS_TARGET"
      | "STALE_TARGET"
      | "TARGET_SCOPE_NOT_VISIBLE"
      | "SCREENSHOT_FAILED"
      | "OCR_FAILED"
      | "IMAGE_MATCH_FAILED"
      | "UNSUPPORTED_MIXED_DPI_SCOPE"
      | "UNSUPPORTED_COORDINATE_MAPPING"
      | "TIMEOUT";
    operation: string;
    candidateCount?: number;
    candidates?: Array<OpenDeskUITextTarget | OpenDeskUIImageTarget>;
    failedIndex?: number;
    failedText?: string;
    completed?: Array<OpenDeskUITapResult<OpenDeskUITextTarget>>;
    cause?: unknown;
  }

  interface OpenDeskUI {
    getCapabilities(): OpenDeskUICapabilities;
    findTexts(text: string, options?: OpenDeskUITextOptions): Promise<OpenDeskUITextTarget[]>;
    findText(text: string, options?: OpenDeskUITextOptions): Promise<OpenDeskUITextTarget | null>;
    hasText(text: string, options?: OpenDeskUITextOptions): Promise<boolean>;
    tapText(text: string, options?: OpenDeskUITextOptions): Promise<OpenDeskUITapResult<OpenDeskUITextTarget>>;
    tapTexts(texts: string[], options?: OpenDeskUITextOptions): Promise<OpenDeskUITapTextsResult>;
    waitText(text: string, options?: OpenDeskUITextOptions): Promise<OpenDeskUITextTarget>;
    waitTextGone(text: string, options?: OpenDeskUITextOptions): Promise<true>;
    findImages(template: string, options?: OpenDeskUIImageOptions): Promise<OpenDeskUIImageTarget[]>;
    findImage(template: string, options?: OpenDeskUIImageOptions): Promise<OpenDeskUIImageTarget | null>;
    tapImage(template: string, options?: OpenDeskUIImageOptions): Promise<OpenDeskUITapResult<OpenDeskUIImageTarget>>;
  }

  /**
   * Finds and activates visible UI in external desktop applications.
   * This is distinct from lowercase `ui`, which creates OpenDesk Custom UI.
   */
  var UI: OpenDeskUI;
}
