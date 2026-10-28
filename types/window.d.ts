import './App';
export {};

declare global {
  interface OpenDeskWindowInfo {
    /** Current observation identity; values ending in :unresolved are not stable native identities. */
    id: string;
    title: string;
    pid: number;
    processId?: number;
    processID?: number;
    x: number;
    y: number;
    width: number;
    height: number;
    exeName: string;
    exePath: string;
    isForeground: boolean;
    hasFocus: boolean;
    handle: number;
    isPopup: boolean;
    index: number;
  }

  /**
   * One target for the current execution: one identity optionally ANDed with an exact title,
   * or an exact title alone. Deployment/platform routing is outside this Runtime type.
   */
  type OpenDeskWindowTarget = { title?: string } & (
    | { id: string; pid?: never; app?: never; exePath?: never; exeName?: never }
    | { pid: number; id?: never; app?: never; exePath?: never; exeName?: never }
    | { app: OpenDeskAppTarget; id?: never; pid?: never; exePath?: never; exeName?: never }
    | { exePath: string; id?: never; pid?: never; app?: never; exeName?: never }
    | { exeName: string; id?: never; pid?: never; app?: never; exePath?: never }
    | { title: string; id?: never; pid?: never; app?: never; exePath?: never; exeName?: never }
  );

  /** Exact executable file identity; no app aliases, bundle paths or extra fields. */
  interface OpenDeskAppWindowTarget {
    /** Positive int32 process ID (1..2147483647). */
    pid: number;
    /** Absolute executable file path, matched byte-for-byte; no NUL. Watch limit: 4095 UTF-8 bytes. */
    exePath: string;
  }

  interface OpenDeskAppWindowWatchCapabilities {
    platform: 'darwin';
    backend: 'per-pid-kvo-ax';
    registrations: Record<'appActive' | 'appTerminated' | 'axObserver' | 'focusedWindow' |
      'windowCreated' | 'mainWindow' | 'focusedUIElement' | 'layoutChanged' | 'windowMoved' | 'windowResized' | 'windowDestroyed' | 'axAppActivated' | 'axAppDeactivated', {
      supported: boolean;
      state: 'registered' | 'not_registered' | 'failed';
      /** 0: registered; -1: not registered; otherwise native AXError. */
      status: number;
    }>;
    fallback: boolean;
    fallbackMode: 'caller-revalidation';
    /** Registration is not live delivery verification or foreground qualification. */
    verified: false;
  }

  type OpenDeskAppWindowHintReason = 'subscribed' | 'app-active-changed' | 'app-terminated-changed' |
    'focused-window-changed' | 'window-moved' | 'window-resized' | 'window-destroyed' |
    'target-invalidated' | 'capabilities-changed' | 'app-activated' | 'app-deactivated' |
    'focused-ui-element-changed' | 'layout-changed' | 'window-created' | 'main-window-changed';

  interface OpenDeskAppWindowHint {
    reason: OpenDeskAppWindowHintReason | 'coalesced';
    /** Union of all pending transitions; coalescing never drops deactivation/window-change hints. */
    reasons: OpenDeskAppWindowHintReason[];
    /** Latest target-local KVO/AX activation hint, null when unknown; never foreground authorization. */
    active: boolean | null;
    /** Subscription-local sequence; gaps are expected when hints coalesce. */
    sequence: number;
    /** Monotonic elapsed milliseconds since subscription, not wall time. */
    monotonicMs: number;
    capabilities: OpenDeskAppWindowWatchCapabilities;
  }

  interface OpenDeskAppWindowSubscription {
    /** Idempotent. Native teardown completes when the execution lifecycle joins workers. */
    unsubscribe(): void;
    /** Initial registration snapshot; later snapshots arrive in hints. */
    readonly capabilities: OpenDeskAppWindowWatchCapabilities;
  }

  interface OpenDeskWindowWaitOptions {
    /** Total milliseconds, 0..300000; default 10000. Zero makes one immediate observation. */
    timeout?: number;
    /** Polling interval in milliseconds, 1..10000; default 200. */
    polling?: number;
    /** Cancels waiting, not an already-running synchronous native call. */
    signal?: AbortSignal;
  }

  interface OpenDeskWindowActivateOptions {
    /** Total native activation/read-back budget in milliseconds; default 1000. */
    timeout?: number;
  }

  type OpenDeskWindowCapabilityStatus = 'Stable' | 'Partial' | 'Unsupported' | 'Experimental';

  interface OpenDeskWindowCapability {
    status: OpenDeskWindowCapabilityStatus;
    supported: boolean;
    notes?: string;
  }

  interface OpenDeskWindowCapabilities {
    platform: string;
    backend: string;
    identity: string;
    coordinateSpace: string;
    spaceBehavior: string;
    capabilities: Record<string, OpenDeskWindowCapability>;
  }

  interface OpenDeskWindowError extends Error {
    code: 'INVALID_ARGUMENT' | 'NOT_SUPPORTED' | 'NOT_FOUND' | 'AMBIGUOUS_TARGET' |
      'STALE_TARGET' | 'PERMISSION_DENIED' | 'VERIFICATION_FAILED' | 'TIMEOUT' | 'BACKEND_FAILED' | 'CANCELED';
    operation: string;
    platform: string;
    capability?: string;
    cause?: unknown;
    /** A cleanup dependency failed; settlement still occurs and cleanup is not claimed as successful. */
    cleanupError?: unknown;
  }

  interface OpenDeskWindowManager {
    getCapabilities(): OpenDeskWindowCapabilities;
    getActiveWindow(): Promise<OpenDeskWindowInfo>;
    /** macOS only: observe the target's AX focused window if its PID is frontmost; otherwise null. */
    getAppWindow(target: OpenDeskAppWindowTarget): Promise<OpenDeskWindowInfo | null>;
    /** macOS: invalidation hints only; independently revalidate before any action. */
    watchAppWindow(target: OpenDeskAppWindowTarget,
      callback: (hint: OpenDeskAppWindowHint) => void | Promise<void>): OpenDeskAppWindowSubscription;
    getWindowByTitle(title: string): Promise<OpenDeskWindowInfo>;
    /** Read-only unique query; no implicit launch, focus, fallback or first-match selection. */
    get(target: OpenDeskWindowTarget): Promise<OpenDeskWindowInfo>;
    /** Retry empty successful queries only; all backend and ambiguity errors are terminal. */
    wait(target: OpenDeskWindowTarget, options?: OpenDeskWindowWaitOptions): Promise<OpenDeskWindowInfo>;
    /** Refresh the same resolved PID/native-handle identity without title/all-window selection. */
    current(target: OpenDeskWindowInfo): Promise<OpenDeskWindowInfo>;
    /** If needed, submit one exact activation and return only after exact foreground read-back. */
    activate(target: OpenDeskWindowInfo, options?: OpenDeskWindowActivateOptions): Promise<OpenDeskWindowInfo>;
    getFocusWindow(): OpenDeskWindowInfo | null;
    focus(title: string): void;
    setWindowBounds(title: string, x: number, y: number, width: number, height: number): void;
    setWidth(title: string, width: number): void;
    setHeight(title: string, height: number): void;
    maximize(title: string): void;
    minimize(title: string): void;
    restore(title: string): void;
    restoreByPID(pid: number): void;
    minimizeByPID(pid: number): void;
    maximizeByPID(pid: number): void;
    closeWindow(title: string): void;
    closeActiveWindow(): void;
    kill(processId: number): void;
    title(): string;
    getTitle(selector: string): string;
    content(): string;
    getContent(selector: string): string;
    /** Synchronous snapshot; existing await window.list() remains valid. */
    list(target?: OpenDeskWindowTarget): OpenDeskWindowInfo[];
    setAlwaysOnTop(title: string, alwaysOnTop: boolean): void;
    unsetTopMost(title: string): void;
    bringToTop(title: string, pid?: number): void;
    js_beautify(source: string, options?: Record<string, unknown>): string;
  }

  var window: OpenDeskWindowManager;
}
