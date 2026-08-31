export {};

declare global {
  interface ClawdeskWindowInfo {
    title: string;
    pid?: number;
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

  interface ClawdeskWindowManager {
    getActiveWindow(): Promise<ClawdeskWindowInfo>;
    getWindowByTitle(title: string): Promise<ClawdeskWindowInfo>;
    getFocusWindow(): ClawdeskWindowInfo | null;
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

  var window: ClawdeskWindowManager;
}
