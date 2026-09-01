export {};

declare global {
  interface OpenDeskPageClip {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface OpenDeskPageScreenshotOptions {
    path?: string;
    type?: string;
    quality?: number;
    fullPage?: boolean;
    omitBackground?: boolean;
    encoding?: "binary" | "base64";
    returnType?: "base64" | "bytes" | "path" | "object" | "none";
    target?: "activeWindow" | "screen";
    displayIndex?: number;
    clip?: OpenDeskPageClip;
  }

  type OpenDeskPermissionCapability =
    | "screenCapture"
    | "accessibility"
    | "inputMonitoring"
    | "automation";

  interface OpenDeskPermissionCapabilityState {
    /**
     * On macOS, `inputMonitoring` always remains `unknown` with
     * `granted: false`: the OS has no reliable third-party status preflight.
     */
    state: "granted" | "denied" | "unknown" | "unsupported";
    granted: boolean;
    reason?: string;
    capabilityOptional?: boolean;
  }

  interface OpenDeskPermissionSnapshot {
    ok: boolean;
    capabilities: Record<string, OpenDeskPermissionCapabilityState>;
  }

  interface OpenDeskPermissionOptions {
    capabilities?: OpenDeskPermissionCapability[];
    /** `globalShortcut` opens the Accessibility and Input Monitoring guides together. */
    section?: "all" | "baseline" | "browserBaseline" | "browser" | "accessibility" | "inputMonitoring" | "globalShortcut" | "screenCapture" | "screen" | "automation";
    openSettings?: boolean;
    strict?: boolean;
  }

  interface OpenDeskPermissionReport {
    os: string;
    ok: boolean;
    skipped?: boolean;
    capabilities: OpenDeskPermissionCapability[];
    permissions: OpenDeskPermissionSnapshot;
    section?: string;
    raw?: Record<string, unknown> | null;
    flow?: Record<string, unknown> | null;
    message?: string;
    reason?: string;
  }

  interface OpenDeskPageWaitOptions {
    timeout?: number;
    polling?: number;
  }

  interface OpenDeskPage {
    mouse: OpenDeskMouse;
    keyboard: OpenDeskKeyboard;
    touchscreen: OpenDeskTouchscreen;

    screenshot(options?: OpenDeskPageScreenshotOptions): Promise<string | ArrayBuffer | OpenDeskScreenshotResult | null>;
    captureScreen(options?: OpenDeskPageScreenshotOptions): Promise<string | ArrayBuffer | OpenDeskScreenshotResult | null>;

    goto(url: string): Promise<void>;
    openURL(url: string): void;
    openApp(appName: string): void;
    openURLInApp(appName: string, url: string): void;

    title(): string;
    url(): string;

    waitFor(milliseconds: number): Promise<void>;
    waitFor<T>(predicate: (...args: any[]) => T | Promise<T>, options?: OpenDeskPageWaitOptions): Promise<T>;
    waitForTimeout(milliseconds: number): Promise<void>;
    waitForNavigation(options?: { timeout?: number }): Promise<void>;
    waitForFunction<T>(predicate: (...args: any[]) => T | Promise<T>, options?: OpenDeskPageWaitOptions, ...args: any[]): Promise<T>;
    waitForAll<T>(promises: Array<Promise<T> | T>, options?: { timeout?: number }): Promise<T[]>;

    checkPermissions(options?: OpenDeskPermissionOptions): Promise<OpenDeskPermissionReport>;
    requestPermissions(options?: OpenDeskPermissionOptions): Promise<OpenDeskPermissionReport>;
    ensurePermissions(options?: OpenDeskPermissionOptions): Promise<OpenDeskPermissionReport>;

    checkScreenshotPermissions(): Record<string, unknown>;
    openMacOSPrivacySettings(section?: string): Record<string, unknown>;
    requestMacPermissions(options?: Record<string, unknown>): Record<string, unknown>;
    ensureMacPermissions(options?: Record<string, unknown>): Promise<OpenDeskPermissionReport>;
    requestMacAutomationPermission(targetApp?: string): Record<string, unknown>;

    browser(): OpenDeskBrowser;
    context(): OpenDeskBrowserContext;
  }

  var page: OpenDeskPage;
}
