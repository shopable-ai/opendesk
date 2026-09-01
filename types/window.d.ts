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
      'STALE_TARGET' | 'PERMISSION_DENIED' | 'VERIFICATION_FAILED' | 'TIMEOUT' | 'BACKEND_FAILED';
    operation: string;
    platform: string;
    capability?: string;
  }

  interface OpenDeskWindowManager {
    getCapabilities(): OpenDeskWindowCapabilities;
    getActiveWindow(): Promise<OpenDeskWindowInfo>;
    getWindowByTitle(title: string): Promise<OpenDeskWindowInfo>;
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
    list(): Array<Record<string, unknown>>;
    setAlwaysOnTop(title: string, alwaysOnTop: boolean): void;
    unsetTopMost(title: string): void;
    bringToTop(title: string, pid?: number): void;
    js_beautify(source: string, options?: Record<string, unknown>): string;
  }

  var window: OpenDeskWindowManager;
}
