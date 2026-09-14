export {};

declare global {
  /**
   * One explicit UI.tapTexts step. `text` remains the visual/OCR query while
   * `locator` is an exact Accessibility selector supplied by the caller.
   * The Runtime never derives the locator from text.
   */
  interface OpenDeskUITapTextAccessibilityStep {
    text: string | RegExp;
    locator: OpenDeskAccessibilitySelector;
  }

  /**
   * Structured UI.tapTexts deliberately excludes visual-only disambiguators
   * whose semantics cannot be preserved by Accessibility fallback.
   */
  interface OpenDeskUITapTextsAccessibilityOptions {
    within: OpenDeskWindowInfo;
    timeout?: number;
    polling?: number;
    intervalMs?: number;
    match?: "exact" | "contains";
    caseSensitive?: boolean;
    normalizeWhitespace?: boolean;
    minConfidence?: number;
    provider?: string;
    providerChain?: string[];
    lang?: string;
    maxDepth?: number;
    maxNodes?: number;
    refocus?: "if-needed";
    refocusTimeout?: number;
    signal?: AbortSignal | null;
  }

  interface OpenDeskUITapTextsAccessibilityCompletion {
    index: number;
    action: "invoke";
    backend: string;
    requestId: string;
    actionState: "acknowledged" | "not_needed";
    fallbackFrom: "ocr-zero-match";
  }

  interface OpenDeskUITapTextsAccessibilityResult {
    ok: true;
    action: "tapTexts";
    completed: Array<
      OpenDeskUITapResult<OpenDeskUITextTarget> |
      OpenDeskUITapTextsAccessibilityCompletion
    >;
  }

  interface OpenDeskUI {
    /**
     * Explicit OCR -> Accessibility cooperation. Accessibility is attempted
     * only after a successful OCR observation yields zero candidates and
     * before this step has submitted any input. Legacy string[] calls keep the
     * original OCR-only contract and perform zero Accessibility calls.
     */
    tapTexts(
      texts: Array<string | OpenDeskUITapTextAccessibilityStep>,
      options: OpenDeskUITapTextsAccessibilityOptions,
    ): Promise<OpenDeskUITapTextsAccessibilityResult>;
  }
}
