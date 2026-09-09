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

  /** One identity optionally ANDed with an exact title, or an exact title alone. */
  type OpenDeskWindowTarget = { title?: string } & (
    | { id: string; pid?: never; app?: never; exePath?: never; exeName?: never }
    | { pid: number; id?: never; app?: never; exePath?: never; exeName?: never }
    | { app: OpenDeskAppTarget; id?: never; pid?: never; exePath?: never; exeName?: never }
    | { exePath: string; id?: never; pid?: never; app?: never; exeName?: never }
    | { exeName: string; id?: never; pid?: never; app?: never; exePath?: never }
    | { title: string; id?: never; pid?: never; app?: never; exePath?: never; exeName?: never }
  );

  interface OpenDeskWindowWaitOptions {
    /** Total milliseconds, 0..300000; default 10000. Zero makes one immediate observation. */
    timeout?: number;
    /** Polling interval in milliseconds, 1..10000; default 200. */
    polling?: number;
    /** Cancels waiting, not an already-running synchronous native call. */
    signal?: AbortSignal;
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
  }

  interface OpenDeskWindowManager {
    getCapabilities(): OpenDeskWindowCapabilities;
    getActiveWindow(): Promise<OpenDeskWindowInfo>;
    getWindowByTitle(title: string): Promise<OpenDeskWindowInfo>;
    /** Read-only unique query; no implicit launch, focus, fallback or first-match selection. */
    get(target: OpenDeskWindowTarget): Promise<OpenDeskWindowInfo>;
    /** Retry empty successful queries only; all backend and ambiguity errors are terminal. */
    wait(target: OpenDeskWindowTarget, options?: OpenDeskWindowWaitOptions): Promise<OpenDeskWindowInfo>;
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
