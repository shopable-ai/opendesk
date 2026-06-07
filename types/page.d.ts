interface ClipOptions {
    /**
     * X coordinate of the clip region
     * - On macOS with `displayIndex > 0`, negative values are anchored from the right edge.
     */
    x: number;

    /**
     * Y coordinate of the clip region
     * - On macOS with `displayIndex > 0`, negative values are anchored from the bottom edge.
     */
    y: number;

    /**
     * Width of the clip region
     */
    width: number;

    /**
     * Height of the clip region
     */
    height: number;
}

interface ScreenshotOptions {
    /**
     * Output type of the screenshot
     * @default "png"
     */
    type?: string;

    /**
     * Quality of the screenshot (1-100)
     * @default 100
     */
    quality?: number;

    /**
     * Whether to capture the full page
     * @default false
     */
    fullPage?: boolean;

    /**
     * Whether to omit the background
     * @default false
     */
    omitBackground?: boolean;

    /**
     * Encoding of the screenshot
     * @default "binary"
     */
    encoding?: "binary" | "base64";

    /**
     * Controls what the API returns.
     * - "base64": return a data URL string (legacy default)
     * - "bytes": return an ArrayBuffer
     * - "path": return the saved file path
     * - "object": return structured screenshot metadata
     * - "none": do not return screenshot content
     */
    returnType?: "base64" | "bytes" | "path" | "object" | "none";

    /**
     * Path to save the screenshot
     */
    path?: string;

    /**
     * Screenshot target when clip is not provided.
     * - "activeWindow": capture current active window bounds (default)
     * - "screen": capture the whole primary screen
     * @default "activeWindow"
     */
    target?: "activeWindow" | "screen";

    /**
     * macOS display index used by native screencapture (`-D`).
     * - 0: default behavior
     * - 1..N: explicit display index
     * @default 0
     */
    displayIndex?: number;

    /**
     * Clip region of the screenshot
     */
    clip?: ClipOptions;
}

interface ScreenshotResult {
    path: string;
    mimeType: string;
    width: number;
    height: number;
    sizeBytes: number;
    source: string;
    backend: string;
}

interface ScreenshotPermissionReport {
    os: string;
    screenCapture: boolean;
    accessibility: boolean;
    automation?: string | null;
    ok: boolean;
    screenCaptureError?: string;
    accessibilityError?: string;
    guideScript?: string;
    stableRunner?: string;
}

interface MacPermissionSettingsReport {
    os: string;
    section: string;
    opened: string[];
    failed: string[];
    ok: boolean;
    canAutoAdd: false;
    message: string;
}

interface MacPermissionRequestOptions {
    /**
     * Whether to open macOS privacy settings pages.
     * @default true
     */
    openSettings?: boolean;

    /**
     * Which privacy section to open.
     * @default "screenCapture"
     */
    section?: "all" | "accessibility" | "inputMonitoring" | "screenCapture" | "automation";
}

interface EnsureMacPermissionsOptions {
    /**
     * Open macOS privacy settings when permissions are missing.
     * @default true
     */
    openSettingsOnFail?: boolean;

    /**
     * Which privacy section to focus.
     * @default "screenCapture"
     */
    section?: "all" | "accessibility" | "inputMonitoring" | "screenCapture" | "automation";

    /**
     * Throw when permissions are still missing after request flow.
     * @default true
     */
    strict?: boolean;
}

interface MacPermissionRequestReport {
    os: string;
    ok: boolean;
    okBefore?: boolean;
    okAfter?: boolean;
    canAutoAdd: false;
    message: string;
    before?: ScreenshotPermissionReport;
    after?: ScreenshotPermissionReport;
    settings?: MacPermissionSettingsReport;
    probes?: {
        ok: boolean;
        screenCaptureProbe: { ok: boolean; error?: string };
        accessibilityProbe: { ok: boolean; error?: string };
        automationProbe?: { ok: boolean; target?: string; message?: string; error?: string };
    };
}

type PermissionCapability =
    | "screenCapture"
    | "accessibility"
    | "inputMonitoring"
    | "automation";

interface PermissionCapabilityState {
    state: "granted" | "denied" | "unknown" | "unsupported";
    granted: boolean;
    reason?: string;
}

interface PermissionSnapshot {
    ok: boolean;
    capabilities: Record<string, PermissionCapabilityState>;
}

interface PermissionCheckOptions {
    capabilities?: PermissionCapability[];

    /**
     * Optional section shorthand (mainly for compatibility with old macOS API style).
     */
    section?: "all" | "accessibility" | "inputMonitoring" | "screenCapture" | "automation";
}

interface PermissionRequestOptions extends PermissionCheckOptions {
    /**
     * Open system settings page when possible.
     * @default true
     */
    openSettings?: boolean;

    /**
     * Throw when requested permissions are still not ready.
     * @default false
     */
    strict?: boolean;

    /**
     * Backward-compatible section mapping for macOS flow.
     * If provided and `capabilities` is omitted, this value will be mapped to capabilities.
     * @default "screenCapture"
     */
    section?: "all" | "accessibility" | "inputMonitoring" | "screenCapture" | "automation";
}

interface PermissionRequestReport {
    os: string;
    ok: boolean;
    skipped?: boolean;
    section?: string;
    capabilities: PermissionCapability[];
    permissions: PermissionSnapshot;
    raw?: ScreenshotPermissionReport | null;
    flow?: MacPermissionRequestReport | null;
    message?: string;
    reason?: string;
}

declare class Page {
    /**
     * Mouse instance for interacting with the mouse
     */
    // @ts-ignore
    mouse: Mouse;

    /**
     * Keyboard instance for interacting with the keyboard
     */
    // @ts-ignore
    keyboard: Keyboard;

    /**
     * Touchscreen instance for interacting with touch devices
     */
    // @ts-ignore
    touchscreen: Touchscreen;

    /**
     * Process ID of the current page
     */
    pid: number;

    /**
     * Path to the executable
     */
    executable: string;

    /**
     * Creates a new instance of Page
     */
    constructor();

    /**
     * Takes a screenshot of the current page
     * @param options Screenshot options
     * @returns Base64 data URL string, ArrayBuffer, saved path, structured metadata, or null when returnType is "none"
     * @throws Error if the screenshot fails
     */
    screenshot(options?: ScreenshotOptions): Promise<string | ArrayBuffer | ScreenshotResult | null>;

    /**
     * Cross-platform permission preflight check.
     */
    checkPermissions(options?: PermissionCheckOptions): Promise<PermissionRequestReport>;

    /**
     * Cross-platform permission request API.
     * Uses platform-specific flow under the hood (e.g. macOS TCC).
     */
    requestPermissions(options?: PermissionRequestOptions): Promise<PermissionRequestReport>;

    /**
     * Strict guard version of requestPermissions (strict=true by default).
     */
    ensurePermissions(options?: PermissionRequestOptions): Promise<PermissionRequestReport>;

    /**
     * Runs screenshot permission preflight checks.
     * On macOS this validates screen capture + accessibility/automation access.
     */
    checkScreenshotPermissions(): ScreenshotPermissionReport;

    /**
     * Open macOS privacy settings pages for the requested section.
     * section: "all" | "accessibility" | "inputMonitoring" | "screenCapture" | "automation"
     */
    openMacOSPrivacySettings(section?: string): MacPermissionSettingsReport;

    /**
     * Trigger macOS permission probe calls and optionally open settings pages.
     * This cannot auto-grant permissions; user still needs to toggle manually in System Settings.
     */
    requestMacPermissions(options?: MacPermissionRequestOptions): MacPermissionRequestReport;

    /**
     * High-level guard for macOS automation permissions.
     * Throws when strict=true and permissions are still missing.
     */
    ensureMacPermissions(options?: EnsureMacPermissionsOptions): MacPermissionRequestReport;

    /**
     * Explicitly trigger AppleEvents automation permission popup.
     * targetApp examples: "System Events", "Finder", "Safari", "WeChat".
     */
    requestMacAutomationPermission(targetApp?: string): {
        os: string;
        targetApp: string;
        ok: boolean;
        canAutoAdd: false;
        message: string;
        next?: string;
        error?: string;
    };

    /**
     * Navigates to a specified URL
     * @param url The URL to navigate to
     * @throws Error if navigation fails
     */
    goto(url: string): Promise<void>;

    /**
     * Gets the title of the current page
     * @returns The page title
     */
    title(): string;

    /**
     * Gets the URL of the current page
     * @returns The page URL
     */
    url(): string;

    /**
     * Waits for a specified amount of time
     * @param milliseconds Time to wait in milliseconds (max 30000)
     * @throws Error if milliseconds is negative or exceeds maximum wait time
     */
    waitFor(milliseconds: number): Promise<void>;
}

declare global {
    var page: Page;
}

export {};
