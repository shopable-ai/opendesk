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

  /** A fixed screen-space snapshot or a rule recomputed from the same identified window's latest snapshot. */
  type OpenDeskUITextRegionRule =
    | OpenDeskScreenRegion
    | ((currentWin: OpenDeskWindowInfo) => OpenDeskScreenRegion);

  interface OpenDeskUIRelativeTextDirection {
    /** Non-empty exact-match anchor text. */
    text: string;
    direction: "right" | "left" | "above" | "below";
    /** Inclusive maximum edge-to-edge gap in screen logical coordinate units. */
    maxGap: number;
    /** Inclusive minimum overlap ratio. Defaults to 0.5. */
    minOverlap?: number;
    region?: never;
  }

  interface OpenDeskUIRelativeTextRegion {
    /** Non-empty exact-match anchor text. */
    text: string;
    /** Synchronously computes a screen-space candidate filter from the same-frame anchor. */
    region: (anchor: OpenDeskUITextTarget) => OpenDeskScreenRegion;
    direction?: never;
    maxGap?: never;
    minOverlap?: never;
  }

  type OpenDeskUIRelativeText = OpenDeskUIRelativeTextDirection | OpenDeskUIRelativeTextRegion;

  /** New positioning rules require an explicit WindowInfo so window identity can be retained. */
  type OpenDeskUIPositionedTextOptions = Omit<OpenDeskUITextOptions, "within"> & {
    within: OpenDeskWindowInfo;
  } & (
    | { region: OpenDeskUITextRegionRule; relativeTo?: OpenDeskUIRelativeText }
    | { region?: OpenDeskUITextRegionRule; relativeTo: OpenDeskUIRelativeText }
  );

  /** Options for text discovery/click methods; wait methods intentionally use OpenDeskUITextOptions. */
  type OpenDeskUITextLocateOptions =
    | (OpenDeskUITextOptions & { region?: never; relativeTo?: never })
    | OpenDeskUIPositionedTextOptions;

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
    /** Identifies anchor resolution failures when relativeTo is enabled. */
    stage?: "anchor";
    cause?: unknown;
  }

  interface OpenDeskUI {
    getCapabilities(): OpenDeskUICapabilities;
    findTexts(text: string, options?: OpenDeskUITextLocateOptions): Promise<OpenDeskUITextTarget[]>;
    findText(text: string, options?: OpenDeskUITextLocateOptions): Promise<OpenDeskUITextTarget | null>;
    hasText(text: string, options?: OpenDeskUITextLocateOptions): Promise<boolean>;
    tapText(text: string, options?: OpenDeskUITextLocateOptions): Promise<OpenDeskUITapResult<OpenDeskUITextTarget>>;
    tapTexts(texts: string[], options?: OpenDeskUITextLocateOptions): Promise<OpenDeskUITapTextsResult>;
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
