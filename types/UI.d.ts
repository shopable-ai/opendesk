export {};

declare global {
  type OpenDeskUIScope = OpenDeskWindowInfo | OpenDeskDisplayInfo | OpenDeskScreenRegion;

  interface OpenDeskUIBaseOptions {
    /** Defaults to the current active window when omitted. */
    within?: OpenDeskUIScope;
    /** Zero-based explicit disambiguation index. */
    index?: number;
    /** Finite wait deadline in milliseconds. Defaults to 10000; image find/tap only validate it and do not poll. */
    timeout?: number;
    /** Finite polling interval in milliseconds. Defaults to 200; image find/tap only validate it and do not poll. */
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

  interface OpenDeskUIMenuAppScope {
    app: OpenDeskAppTarget;
    root: "menuBar";
  }

  /** Menu traversal is always bound to a resolved window or an explicit app menu bar. */
  type OpenDeskUIMenuScope = OpenDeskWindowInfo | OpenDeskUIMenuAppScope;

  type OpenDeskUIMenuPathSegment =
    | string
    | { name: string; identifier?: string }
    | { name?: string; identifier: string };

  /** A complete, non-empty hierarchy path, not a list of aliases or independent clicks. */
  type OpenDeskUIMenuPath = [OpenDeskUIMenuPathSegment, ...OpenDeskUIMenuPathSegment[]];

  interface OpenDeskUIMenuOptions {
    within: OpenDeskUIMenuScope;
    /** One total deadline for the entire observation/action. Default 3000; maximum 30000. */
    timeout?: number;
    /** Default 8; maximum 32. */
    maxDepth?: number;
    /** Default 1000; maximum 5000. */
    maxNodes?: number;
  }

  type OpenDeskUIMenuFinalAction =
    | { action: "invoke" }
    | { action: "select" }
    | { action: "setChecked"; checked: boolean };

  interface OpenDeskUITapMenuItemOptions extends OpenDeskUIMenuOptions {
    /** Defaults to { action: "invoke" }. */
    finalAction?: OpenDeskUIMenuFinalAction;
  }

  interface OpenDeskUIMenuItem {
    role: OpenDeskAccessibilityRole;
    nativeRole: string;
    name: string | null;
    identifier: string | null;
    enabled: boolean | null;
    focused: boolean | null;
    selected: boolean | null;
    checked: OpenDeskAccessibilityCheckedState;
    expanded: boolean | null;
    actions: string[];
    nativeBounds: OpenDeskAccessibilityNativeBounds | null;
    /** Null unless the backend performed a verified screen-coordinate conversion. */
    bounds: OpenDeskScreenRegion | null;
    children: OpenDeskUIMenuItem[];
  }

  interface OpenDeskUIGetMenuItemsResult {
    requestId: string;
    operation: "UI.getMenuItems";
    backend: string;
    items: OpenDeskUIMenuItem[];
    complete: boolean;
    truncated: boolean;
    reason: string | null;
    stats: OpenDeskAccessibilityStats;
  }

  interface OpenDeskUITapMenuItemResult {
    requestId: string;
    operation: "UI.tapMenuItem";
    backend: string;
    action: OpenDeskUIMenuFinalAction["action"];
    actionState: OpenDeskAccessibilityActionState;
    completedLevels: number;
    expansionOccurred: boolean;
  }

  interface OpenDeskUIAccessibilityCapabilitySummary {
    /** Current execution usability: implementation, OS permission, and execution authorization all passed. */
    available: boolean;
    /** Whether the native backend is implemented on this build, independent of permission/authorization. */
    implemented: boolean;
    status: string;
    enabled: boolean;
    backend: string;
    permission: string;
    menus: boolean;
    /** Backend-level implementation summary, not a promise that a matched element supports an action. */
    actions: Record<string, boolean>;
    coordinateMapping: boolean;
    notes: string;
  }

  interface OpenDeskUICapabilities {
    text: { find: true; tap: true; wait: true; backend: "Vision.runOCR" };
    image: { find: true; tap: true; backend: "ImageColor.findImages" };
    accessibility: OpenDeskUIAccessibilityCapabilitySummary;
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

  interface OpenDeskUIMenuError extends OpenDeskAccessibilityError {
    operation: "UI.getMenuItems" | "UI.findMenuItem" | "UI.tapMenuItem";
    failedLevel?: number;
    completedLevels?: number;
    expansionOccurred?: boolean;
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
    findImages(template: OpenDeskImageTemplate, options?: OpenDeskUIImageOptions): Promise<OpenDeskUIImageTarget[]>;
    findImage(template: OpenDeskImageTemplate, options?: OpenDeskUIImageOptions): Promise<OpenDeskUIImageTarget | null>;
    tapImage(template: OpenDeskImageTemplate, options?: OpenDeskUIImageOptions): Promise<OpenDeskUITapResult<OpenDeskUIImageTarget>>;
    /** Observes only; it does not expand menus or take focus. */
    getMenuItems(options: OpenDeskUIMenuOptions): Promise<OpenDeskUIGetMenuItemsResult>;
    /** Observes only and returns null on a complete zero-match search. */
    findMenuItem(path: OpenDeskUIMenuPath, options: OpenDeskUIMenuOptions): Promise<OpenDeskUIMenuItem | null>;
    /** Expands each uniquely matched level under one deadline, then submits the final action at most once. */
    tapMenuItem(path: OpenDeskUIMenuPath, options: OpenDeskUITapMenuItemOptions): Promise<OpenDeskUITapMenuItemResult>;
  }

  /**
   * Finds and activates visible UI in external desktop applications.
   * This is distinct from lowercase `ui`, which creates OpenDesk Custom UI.
   */
  var UI: OpenDeskUI;
}
