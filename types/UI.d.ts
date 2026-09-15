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
    /** Extra milliseconds between UI.tapTexts actions. Defaults to 300; explicit 0 disables the extra delay. */
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

  /**
   * Experimental sequential timing contract. Defaults: intervalMs=300,
   * waitForEach=true, timeout=10000 per step, polling=200 milliseconds.
   * Waiting pins one resolved window; it never launches, focuses or switches
   * windows. Only successful zero-candidate observations are polled, never input.
   * timeout starts after each inter-step interval and bounds the next input's
   * start, not the whole batch or an already-running synchronous native call.
   * Use waitForEach:false and intervalMs:0 for legacy fail-fast behavior.
   */
  type OpenDeskUITapTextsOptions = (
    | ((
        | (Omit<OpenDeskUITextOptions, "within"> & {
            within?: OpenDeskWindowInfo;
            region?: never;
            relativeTo?: never;
          })
        | OpenDeskUIPositionedTextOptions
      ) & { waitForEach?: boolean })
    | (OpenDeskUITextLocateOptions & { waitForEach: false })
  ) & {
    /** Cancels delays and prevents later observations/input; null means no per-call signal. */
    signal?: AbortSignal | null;
  };

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

  interface OpenDeskUITextMatchGroup {
    /** Zero-based position of the corresponding input query. */
    queryIndex: number;
    /** Reading-order matches for this query from the shared OCR observation. */
    matches: OpenDeskUITextTarget[];
  }

  interface OpenDeskUITextMatchOptions {
    within?: OpenDeskUIScope;
    match?: "exact" | "contains" | "startsWith" | "endsWith";
    caseSensitive?: boolean;
    normalizeWhitespace?: boolean;
    minConfidence?: number;
    provider?: string;
    providerChain?: string[];
    lang?: string;
    region?: OpenDeskUITextRegionRule;
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
    completed: Array<OpenDeskUISequenceCompletion>;
  }

  /** Runtime-owned native completion; acknowledgement is not business success. */
  interface OpenDeskUISemanticTapCompletion {
    ok: true;
    action: "invoke";
    actionState: "acknowledged" | "not_needed";
    backend: string;
    requestId: string;
    target: {source: "accessibility"; text?: string; locator: OpenDeskAccessibilitySelector};
  }
  type OpenDeskUISequenceCompletion = OpenDeskUITapResult<OpenDeskUITextTarget> | OpenDeskUISemanticTapCompletion;
  type OpenDeskUISemanticTapTarget = string | OpenDeskAccessibilitySelector | { text: string; role?: OpenDeskAccessibilityRole; name?: string; identifier?: string };
  interface OpenDeskUISemanticTapOptions {
    /** Defaults to the active window pinned before the first step. */
    within?: OpenDeskWindowInfo;
    /** Per-step budget after its interval; integer milliseconds 1..30000, default 10000. */
    timeout?: number;
    /** Integer milliseconds 1..10000; default 200. */
    polling?: number;
    /** Integer milliseconds 0..86400000; default 300. */
    intervalMs?: number;
    signal?: AbortSignal | null;
  }
  interface OpenDeskUISemanticTapResult {
    ok: true;
    action: "tapTargets";
    completed: OpenDeskUISequenceCompletion[];
  }
  /** Compatibility-only explicit native sequence; new code uses strings/flat selectors. */
  interface OpenDeskUITapTargetStep {
    locator: OpenDeskAccessibilitySelector;
  }

  interface OpenDeskUITapTargetsOptions extends OpenDeskAccessibilityTraversalOptions {
    /** Required resolved window with stable id, PID, title, native handle, and bounds. */
    within: OpenDeskWindowInfo;
    /** Opt in to one exact, bounded same-window activation immediately before each invoke. */
    refocus?: "if-needed";
    /** Per-activation budget in milliseconds, 1..10000; requires refocus and defaults to 1000. */
    refocusTimeout?: number;
    /** Prevents later observation/action stages; it cannot interrupt an in-flight native call. */
    signal?: AbortSignal | null;
  }

  interface OpenDeskUITapTargetCompletion {
    /** Zero-based position in the caller's snapshotted sequence. */
    index: number;
    action: "invoke";
    /** Actual native Accessibility backend reported by Accessibility.perform. */
    backend: string;
    requestId: string;
    actionState: "acknowledged" | "not_needed";
  }

  interface OpenDeskUITapTargetsResult {
    ok: true;
    action: "tapTargets";
    backend: "accessibility";
    completed: OpenDeskUITapTargetCompletion[];
  }

  type OpenDeskUITapTargetsPhase =
    | "arguments"
    | "capability"
    | "preflight"
    | "action"
    | "cleanup" | "interval" | "locate" | "precondition" | "input";

  /** Accessibility failures plus exact-window activation verification. */
  type OpenDeskUITapTargetsErrorCode =
    | OpenDeskAccessibilityErrorCode
    | "VERIFICATION_FAILED";

  interface OpenDeskUITapTargetsCleanupError {
    code: OpenDeskAccessibilityErrorCode;
    operation: "UI.tapTargets";
    phase: "cleanup";
    nativePhase?: string;
    actionState: OpenDeskAccessibilityActionState;
    backend?: string;
    requestId?: string;
  }

  /** Rejection shape for UI.tapTargets; no Runtime constructor is added. */
  interface OpenDeskUITapTargetsError extends Error {
    code: OpenDeskUITapTargetsErrorCode;
    operation: "UI.tapTargets";
    phase: OpenDeskUITapTargetsPhase;
    nativePhase?: string;
    actionState: OpenDeskAccessibilityActionState;
    backend?: string;
    requestId?: string;
    /** Present for preflight/action failures after a sequence was established. */
    failedIndex?: number;
    failedPhase?: OpenDeskUITapTargetsPhase;
    completed?: Array<OpenDeskUITapTargetCompletion | OpenDeskUISequenceCompletion>;
    cause?: unknown;
    cleanupErrors?: OpenDeskUITapTargetsCleanupError[];
  }

  /**
   * Lightweight business-semantic target for UI.tapTargets.
   * P0 matching is exact; Runtime owns OCR/Accessibility resolver policy.
   */
  type OpenDeskUISemanticTapTarget =
    | { text: string; role?: OpenDeskAccessibilityRole; name?: string; identifier?: string }
    | { text?: string; role: OpenDeskAccessibilityRole; name?: string; identifier?: string }
    | { text?: string; role?: OpenDeskAccessibilityRole; name: string; identifier?: string }
    | { text?: string; role?: OpenDeskAccessibilityRole; name?: string; identifier: string };

  interface OpenDeskUISemanticTapTargetsOptions {
    /** Pins the sequence to this resolved window; when omitted, Runtime resolves the active window once. */
    within?: OpenDeskWindowInfo;
    /** Per resolver-operation budget in milliseconds. Defaults to 3000; range 1..30000. */
    timeout?: number;
    /** Prevents later resolver observations/actions; cannot retract submitted native or mouse input. */
    signal?: AbortSignal | null;
  }

  interface OpenDeskUISemanticTapAttempt {
    resolver: "ocr" | "accessibility";
    phase: "resolve" | "precondition" | "action" | "cleanup";
    code: string;
    message: string;
    candidateCount?: number;
    candidates?: OpenDeskUITextTarget[];
    backend?: string;
    requestId?: string;
    actionState?: OpenDeskAccessibilityActionState;
  }

  interface OpenDeskUISemanticOCRTapCompletion {
    index: number;
    resolver: "ocr";
    action: "click";
    backend: string;
    target?: OpenDeskUITextTarget;
    point?: OpenDeskScreenPoint;
  }

  interface OpenDeskUISemanticAccessibilityTapCompletion {
    index: number;
    resolver: "accessibility";
    action: "invoke";
    backend: string;
    requestId: string;
    actionState: "acknowledged" | "not_needed";
  }

  type OpenDeskUISemanticTapCompletion =
    | OpenDeskUISemanticOCRTapCompletion
    | OpenDeskUISemanticAccessibilityTapCompletion;

  interface OpenDeskUISemanticTapTargetsResult {
    ok: true;
    action: "tapTargets";
    completed: OpenDeskUISemanticTapCompletion[];
  }

  interface OpenDeskUISemanticTapTargetsError extends Error {
    code: OpenDeskUIError["code"] | OpenDeskAccessibilityErrorCode | "NOT_SUPPORTED";
    operation: "UI.tapTargets";
    failedIndex: number;
    failedTarget: OpenDeskUISemanticTapTarget;
    failedPhase: "arguments" | "scope" | "capability" | "resolve" | "precondition" | "action" | "cleanup";
    completed: OpenDeskUISemanticTapCompletion[];
    attempts: OpenDeskUISemanticTapAttempt[];
    cause?: unknown;
    cleanupError?: unknown;
  }

  /** Native text-value lookup reuses Accessibility selector and scope semantics. */
  interface OpenDeskUIValueOptions extends OpenDeskAccessibilityTraversalOptions {
    /** Required: semantic value lookup never defaults to the whole desktop or active window. */
    within: OpenDeskAccessibilityScope;
  }

  interface OpenDeskUISetValueResult {
    requestId: string;
    operation: "UI.setValue";
    backend: string;
    action: "setValue";
    /** Native submission state; it is separate from strict same-ref readback verification. */
    actionState: OpenDeskAccessibilityActionState;
    verified: true;
  }

  type OpenDeskUIValuePhase =
    | "arguments"
    | "capability"
    | "locate"
    | "read"
    | "precondition"
    | "action"
    | "verification"
    | "cleanup";

  interface OpenDeskUIValueCleanupError {
    code: OpenDeskAccessibilityErrorCode;
    operation: "UI.getValue" | "UI.setValue";
    phase: "cleanup";
    /** Preserved native phase when the owner provides one. */
    nativePhase?: string;
    actionState: OpenDeskAccessibilityActionState;
    message: string;
    backend?: string;
    requestId?: string;
  }

  /** Error shape rejected by UI.getValue and UI.setValue; this is not a Runtime global constructor. */
  interface OpenDeskUIValueError extends Error {
    code: OpenDeskAccessibilityErrorCode;
    operation: "UI.getValue" | "UI.setValue";
    /** Stable high-level lifecycle phase. */
    phase: OpenDeskUIValuePhase;
    /** Optional lower-level native phase, kept separate from the high-level lifecycle. */
    nativePhase?: string;
    actionState: OpenDeskAccessibilityActionState;
    verified?: boolean;
    backend?: string;
    requestId?: string;
    cause?: unknown;
    cleanupError?: OpenDeskUIValueCleanupError;
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
    text: { find: true; tap: true; wait: true; backend: "Vision.runOCR"; sequenceStrategy: "auto" };
    targets: { semantic: true; legacyLocatorSequence: true };
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
      | "TIMEOUT"
      | "CANCELED"
      | "BACKEND_FAILED"
      | "SEARCH_INCOMPLETE"
      | "ELEMENT_DISABLED"
      | "STATE_UNKNOWN"
      | "REF_RELEASED"
      | "CAPABILITY_DISABLED"
      | "PERMISSION_DENIED"
      | "ACTION_NOT_SUPPORTED";
    operation: string;
    candidateCount?: number;
    candidates?: Array<OpenDeskUITextTarget | OpenDeskUIImageTarget>;
    failedIndex?: number;
    failedText?: string;
    actionState?: OpenDeskAccessibilityActionState;
    resolution?: {ocr: "missing" | "ambiguous"; ocrCandidateCount: number; accessibility: "unavailable" | "unique" | "missing"};
    /** Sequence failure stage; input may have been submitted even when it failed. */
    failedPhase?: "interval" | "locate" | "input";
    completed?: Array<OpenDeskUISequenceCompletion>;
    /** Identifies anchor resolution failures when relativeTo is enabled. */
    stage?: "anchor";
    cause?: unknown;
  }

  /**
   * A lightweight locator target. The description is copied at construction;
   * it is never a retained Accessibility ref, OCR result, or screen point.
   */
  type OpenDeskUILocatorSemanticTarget =
    | { text?: string; role: OpenDeskAccessibilityRole; name?: string; identifier?: string; image?: never }
    | { text?: string; role?: OpenDeskAccessibilityRole; name: string; identifier?: string; image?: never }
    | { text?: string; role?: OpenDeskAccessibilityRole; name?: string; identifier: string; image?: never };

  type OpenDeskUILocatorTarget =
    | { text: string; image?: never; role?: never; name?: never; identifier?: never }
    | { image: string; text?: never; role?: never; name?: never; identifier?: never }
    | OpenDeskUILocatorSemanticTarget;

  /** Identity and current geometry observed for a TargetMatch. */
  interface OpenDeskUILocatorWindowSnapshot {
    id: string;
    pid: number;
    handle: number;
    title: string;
    bounds?: OpenDeskScreenRegion;
  }

  /** A one-time observation, not an executable element or persistent handle. */
  interface OpenDeskUITargetMatch {
    readonly target: Readonly<OpenDeskUILocatorTarget>;
    readonly source: "ocr" | "image" | "accessibility";
    readonly window: Readonly<OpenDeskUILocatorWindowSnapshot>;
    readonly observedAt: number;
    readonly bounds?: Readonly<OpenDeskScreenRegion>;
    readonly visible?: true;
    readonly text?: string;
    readonly provider?: string;
    readonly template?: string;
    readonly confidence?: number;
    readonly role?: OpenDeskAccessibilityRole;
    readonly name?: string;
    readonly identifier?: string;
    /** Native states are present only when Accessibility explicitly read them. */
    readonly enabled?: boolean;
    readonly focused?: boolean;
    readonly selected?: boolean;
    readonly checked?: boolean;
    readonly expanded?: boolean;
  }

  interface OpenDeskUILocatorFindOptions {
    /** One bounded observation; default 3000 ms, maximum 30000 ms. */
    timeout?: number;
    /** Checked before and between observation stages; in-flight native calls remain non-hard-cancelable. */
    signal?: AbortSignal | null;
    /** Native semantic traversal only; visual targets ignore these fields. */
    maxDepth?: number;
    maxNodes?: number;
  }

  interface OpenDeskUILocatorWaitOptions {
    /** P0 states. Semantic visible rejects unless the backend can prove visibility. */
    state?: "exists" | "visible";
    /** One total wait deadline. Default 10000 ms. */
    timeout?: number;
    signal?: AbortSignal | null;
  }

  interface OpenDeskUILocatorTapOptions {
    timeout?: number;
    /** Semantic actions forward this signal to UI.tapTargets; visual owners keep their existing cancellation contract. */
    signal?: AbortSignal | null;
  }

  type OpenDeskUILocatorValueOptions = Omit<OpenDeskUIValueOptions, "within">;
  type OpenDeskUIWindowTextOptions = Omit<OpenDeskUITextLocateOptions, "within">;
  type OpenDeskUIWindowTapTextsOptions = Omit<OpenDeskUITapTextsOptions, "within">;
  type OpenDeskUIWindowImageOptions = Omit<OpenDeskUIImageOptions, "within">;
  type OpenDeskUIWindowSemanticTapOptions = Omit<OpenDeskUISemanticTapOptions, "within">;
  type OpenDeskUIWindowLegacyTapTargetsOptions = Omit<OpenDeskUITapTargetsOptions, "within">;

  interface OpenDeskUILocator {
    /** Runs one fresh bounded observation; no native ref is retained. */
    find(options?: OpenDeskUILocatorFindOptions): Promise<OpenDeskUITargetMatch | null>;
    /** Repeats read-only observations until exists/visible is proven or the total deadline ends. */
    waitFor(options?: OpenDeskUILocatorWaitOptions): Promise<void>;
    /** Delegates exactly once to the existing target-specific UI action owner. */
    tap(options?: OpenDeskUILocatorTapOptions): Promise<OpenDeskUITapResult<OpenDeskUITextTarget> | OpenDeskUITapResult<OpenDeskUIImageTarget> | OpenDeskUISemanticTapResult>;
    /** Strict native textField value only; visual targets reject with NOT_SUPPORTED. */
    getValue(options?: OpenDeskUILocatorValueOptions): Promise<string>;
    /** Strict native setValue and same-ref readback; never keyboard/OCR fallback. */
    setValue(value: string, options?: OpenDeskUILocatorValueOptions): Promise<OpenDeskUISetValueResult>;
  }

  interface OpenDeskUIWindowScope {
    locator(target: OpenDeskUILocatorTarget): OpenDeskUILocator;
    findTexts(text: string, options?: OpenDeskUIWindowTextOptions): Promise<OpenDeskUITextTarget[]>;
    findTextMatches(queries: Array<string | RegExp>, options?: Omit<OpenDeskUITextMatchOptions, "within">): Promise<OpenDeskUITextMatchGroup[]>;
    findText(text: string, options?: OpenDeskUIWindowTextOptions): Promise<OpenDeskUITextTarget | null>;
    hasText(text: string, options?: OpenDeskUIWindowTextOptions): Promise<boolean>;
    tapText(text: string, options?: OpenDeskUIWindowTextOptions): Promise<OpenDeskUITapResult<OpenDeskUITextTarget>>;
    tapTexts(texts: string[], options?: OpenDeskUIWindowTapTextsOptions): Promise<OpenDeskUITapTextsResult>;
    tapTargets(targets: OpenDeskUISemanticTapTarget[], options?: OpenDeskUIWindowSemanticTapOptions): Promise<OpenDeskUISemanticTapResult>;
    tapTargets(targets: OpenDeskUITapTargetStep[], options?: OpenDeskUIWindowLegacyTapTargetsOptions): Promise<OpenDeskUITapTargetsResult>;
    findImages(template: OpenDeskImageTemplate, options?: OpenDeskUIWindowImageOptions): Promise<OpenDeskUIImageTarget[]>;
    findImage(template: OpenDeskImageTemplate, options?: OpenDeskUIWindowImageOptions): Promise<OpenDeskUIImageTarget | null>;
    tapImage(template: OpenDeskImageTemplate, options?: OpenDeskUIWindowImageOptions): Promise<OpenDeskUITapResult<OpenDeskUIImageTarget>>;
    getValue(target: OpenDeskUILocatorSemanticTarget, options?: OpenDeskUILocatorValueOptions): Promise<string>;
    setValue(target: OpenDeskUILocatorSemanticTarget, value: string, options?: OpenDeskUILocatorValueOptions): Promise<OpenDeskUISetValueResult>;
  }

  interface OpenDeskUIMenuError extends OpenDeskAccessibilityError {
    operation: "UI.getMenuItems" | "UI.findMenuItem" | "UI.tapMenuItem";
    failedLevel?: number;
    completedLevels?: number;
    expansionOccurred?: boolean;
  }

  interface OpenDeskUI {
    /** Synchronously binds a resolved WindowInfo identity without observing or changing the desktop. */
    within(win: OpenDeskWindowInfo): OpenDeskUIWindowScope;
    getCapabilities(): OpenDeskUICapabilities;
    /** Reads only a native string value from one uniquely located textField. */
    getValue(target: OpenDeskAccessibilitySelector, options: OpenDeskUIValueOptions): Promise<string>;
    /** Sets one complete native string value once and verifies it by reading the same ref. */
    setValue(target: OpenDeskAccessibilitySelector, value: string, options: OpenDeskUIValueOptions): Promise<OpenDeskUISetValueResult>;
    findTexts(text: string, options?: OpenDeskUITextLocateOptions): Promise<OpenDeskUITextTarget[]>;
    /** Evaluates 1..32 string or RegExp queries against one shared OCR observation. */
    findTextMatches(queries: Array<string | RegExp>, options?: OpenDeskUITextMatchOptions): Promise<OpenDeskUITextMatchGroup[]>;
    findText(text: string, options?: OpenDeskUITextLocateOptions): Promise<OpenDeskUITextTarget | null>;
    hasText(text: string, options?: OpenDeskUITextLocateOptions): Promise<boolean>;
    tapText(text: string, options?: OpenDeskUITextLocateOptions): Promise<OpenDeskUITapResult<OpenDeskUITextTarget>>;
    /** The required first argument is the ordered action sequence; options.within only scopes it to a resolved window. */
    tapTexts(texts: string[], options?: OpenDeskUITapTextsOptions): Promise<OpenDeskUITapTextsResult>;
    /** Text delegates to tapTexts; native constraints are resolved fresh per step and never weakened to OCR. */
    tapTargets(targets: OpenDeskUISemanticTapTarget[], options?: OpenDeskUISemanticTapOptions): Promise<OpenDeskUISemanticTapResult>;
    /** Compatibility: preflights every distinct legacy locator, then invokes fixed refs in order. */
    tapTargets(targets: OpenDeskUITapTargetStep[], options: OpenDeskUITapTargetsOptions): Promise<OpenDeskUITapTargetsResult>;
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
