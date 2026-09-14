export {};

declare global {
  /**
   * Lightweight business-semantic target for UI.tapTargets.
   * Matching is exact in P0. Resolver choice is intentionally not public API.
   */
  type OpenDeskUISemanticTapTarget =
    | { text: string; role?: OpenDeskAccessibilityRole; name?: string; identifier?: string }
    | { text?: string; role: OpenDeskAccessibilityRole; name?: string; identifier?: string }
    | { text?: string; role?: OpenDeskAccessibilityRole; name: string; identifier?: string }
    | { text?: string; role?: OpenDeskAccessibilityRole; name?: string; identifier: string };

  interface OpenDeskUISemanticTapTargetsOptions {
    /** Pins the sequence to this resolved window. Defaults to the active window resolved once before the first step. */
    within?: OpenDeskWindowInfo;
    /** Per resolver operation budget in milliseconds. Defaults to 3000; range 1..30000. */
    timeout?: number;
    /** Prevents later resolver observations/actions; cannot retract an already submitted native action or mouse input. */
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

  interface OpenDeskUI {
    /**
     * Activates lightweight semantic targets strictly in order. Text-only
     * targets use OCR first and may fall through to exact native semantic
     * lookup on safe pre-input discovery failures. Targets carrying role,
     * name, or identifier use Accessibility directly so supplied constraints
     * are never discarded. Resolver/fallback policy is Runtime-owned.
     *
     * Existing { locator } calls keep the legacy overload in UI.d.ts.
     */
    tapTargets(
      targets: OpenDeskUISemanticTapTarget[],
      options?: OpenDeskUISemanticTapTargetsOptions,
    ): Promise<OpenDeskUISemanticTapTargetsResult>;
  }
}
