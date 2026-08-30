export {};

declare global {
  interface ClawdeskPageClip {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface ClawdeskPageScreenshotOptions {
    path?: string;
    type?: string;
    quality?: number;
    fullPage?: boolean;
    omitBackground?: boolean;
    encoding?: "binary" | "base64";
    returnType?: "base64" | "bytes" | "path" | "object" | "none";
    target?: "activeWindow" | "screen";
    displayIndex?: number;
    clip?: ClawdeskPageClip;
  }

  type ClawdeskPermissionCapability =
    | "screenCapture"
    | "accessibility"
    | "inputMonitoring"
    | "automation";

  interface ClawdeskPermissionCapabilityState {
    state: "granted" | "denied" | "unknown" | "unsupported";
    granted: boolean;
    reason?: string;
    capabilityOptional?: boolean;
  }

  interface ClawdeskPermissionSnapshot {
    ok: boolean;
    capabilities: Record<string, ClawdeskPermissionCapabilityState>;
  }

  interface ClawdeskPermissionOptions {
    capabilities?: ClawdeskPermissionCapability[];
    section?: "all" | "baseline" | "browserBaseline" | "browser" | "accessibility" | "inputMonitoring" | "screenCapture" | "screen" | "automation";
    openSettings?: boolean;
    strict?: boolean;
  }

  interface ClawdeskPermissionReport {
    os: string;
    ok: boolean;
    skipped?: boolean;
    capabilities: ClawdeskPermissionCapability[];
    permissions: ClawdeskPermissionSnapshot;
    section?: string;
    raw?: Record<string, unknown> | null;
    flow?: Record<string, unknown> | null;
    message?: string;
    reason?: string;
  }

  interface ClawdeskPageWaitOptions {
    timeout?: number;
    polling?: number;
  }

  interface ClawdeskPage {
    mouse: ClawdeskMouse;
    keyboard: ClawdeskKeyboard;
    touchscreen: ClawdeskTouchscreen;

    screenshot(options?: ClawdeskPageScreenshotOptions): Promise<string | ArrayBuffer | ClawdeskScreenshotResult | null>;

    goto(url: string): Promise<void>;
    openURL(url: string): void;
    openApp(appName: string): void;
    openURLInApp(appName: string, url: string): void;

    title(): string;
    url(): string;

    waitFor(milliseconds: number): Promise<void>;
    waitFor<T>(predicate: (...args: any[]) => T | Promise<T>, options?: ClawdeskPageWaitOptions): Promise<T>;
    waitForTimeout(milliseconds: number): Promise<void>;
    waitForNavigation(options?: { timeout?: number }): Promise<void>;
    waitForFunction<T>(predicate: (...args: any[]) => T | Promise<T>, options?: ClawdeskPageWaitOptions, ...args: any[]): Promise<T>;

    checkPermissions(options?: ClawdeskPermissionOptions): Promise<ClawdeskPermissionReport>;
    requestPermissions(options?: ClawdeskPermissionOptions): Promise<ClawdeskPermissionReport>;
    ensurePermissions(options?: ClawdeskPermissionOptions): Promise<ClawdeskPermissionReport>;

    checkScreenshotPermissions(): Record<string, unknown>;
    openMacOSPrivacySettings(section?: string): Record<string, unknown>;
    requestMacPermissions(options?: Record<string, unknown>): Record<string, unknown>;
    ensureMacPermissions(options?: Record<string, unknown>): Promise<ClawdeskPermissionReport>;
    requestMacAutomationPermission(targetApp?: string): Record<string, unknown>;
  }

  var page: ClawdeskPage;
}
