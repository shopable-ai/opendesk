export {};

declare global {
  type OpenDeskUILocatorSemanticTarget =
    | { text?: string; role: OpenDeskAccessibilityRole; name?: string; identifier?: string; image?: never }
    | { text?: string; role?: OpenDeskAccessibilityRole; name: string; identifier?: string; image?: never }
    | { text?: string; role?: OpenDeskAccessibilityRole; name?: string; identifier: string; image?: never };

  type OpenDeskUILocatorTarget =
    | { text: string; image?: never; role?: never; name?: never; identifier?: never }
    | { image: string; text?: never; role?: never; name?: never; identifier?: never }
    | OpenDeskUILocatorSemanticTarget;

  interface OpenDeskUILocatorWindowSnapshot {
    id: string;
    pid: number;
    handle: number;
    title: string;
    bounds?: OpenDeskScreenRegion;
  }

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
    readonly enabled?: boolean;
    readonly focused?: boolean;
    readonly selected?: boolean;
    readonly checked?: boolean;
    readonly expanded?: boolean;
  }

  interface OpenDeskUILocatorFindOptions {
    /** One bounded observation; default 3000 ms, maximum 30000 ms. */
    timeout?: number;
    /** Checked before and between observation stages; native calls remain non-hard-cancelable. */
    signal?: AbortSignal | null;
    /** Native semantic traversal only; visual targets ignore these fields. */
    maxDepth?: number;
    maxNodes?: number;
  }

  interface OpenDeskUILocatorWaitOptions {
    /** P0 states. Semantic `visible` rejects when the native backend cannot prove visibility. */
    state?: "exists" | "visible";
    /** One total wait deadline. Default 10000 ms. */
    timeout?: number;
    signal?: AbortSignal | null;
  }

  interface OpenDeskUILocatorTapOptions {
    timeout?: number;
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
    /** Repeats read-only observations until `exists`/`visible` is proven or the total deadline ends. */
    waitFor(options?: OpenDeskUILocatorWaitOptions): Promise<void>;
    /** Delegates to the existing target-specific UI action owner exactly once. */
    tap(options?: OpenDeskUILocatorTapOptions): Promise<OpenDeskUITapResult<OpenDeskUITextTarget> | OpenDeskUITapResult<OpenDeskUIImageTarget> | OpenDeskUISemanticTapResult>;
    /** Strict native textField value only; visual targets reject with NOT_SUPPORTED. */
    getValue(options?: OpenDeskUILocatorValueOptions): Promise<string>;
    /** Strict native setValue + same-ref readback; never keyboard/OCR fallback. */
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

  interface OpenDeskUI {
    /** Synchronously binds a resolved WindowInfo identity without observing or changing the desktop. */
    within(win: OpenDeskWindowInfo): OpenDeskUIWindowScope;
  }
}
