interface Point {
    x: number;
    y: number;
}

interface ClipRegion {
    /**
     * X coordinate of the clip region
     */
    x: number;

    /**
     * Y coordinate of the clip region
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

interface DisplayInfo {
    /**
     * 1-based display index, aligned with macOS screencapture -D.
     */
    index: number;

    /**
     * Platform display identifier string.
     */
    id: string;

    /**
     * Whether this is the primary display.
     */
    isPrimary: boolean;

    /**
     * Display origin in virtual desktop coordinates.
     */
    x: number;

    /**
     * Display origin in virtual desktop coordinates.
     */
    y: number;

    /**
     * Display logical width.
     */
    width: number;

    /**
     * Display logical height.
     */
    height: number;

    /**
     * Physical pixel width.
     */
    pixelWidth: number;

    /**
     * Physical pixel height.
     */
    pixelHeight: number;

    /**
     * Pixel ratio (pixelWidth / width).
     */
    scale: number;
}

interface ScreenshotOptions {
    /**
     * Path to save the screenshot
     */
    path?: string;

    /**
     * Whether to capture the full screen
     * @default false
     */
    fullPage?: boolean;

    /**
     * Region to capture
     */
    clip?: ClipRegion;

    /**
     * Encoding type for the screenshot
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
     * Screenshot target when clip is not provided.
     * - "activeWindow": capture current active window bounds (default)
     * - "screen": capture current screen/display
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

declare class Screen {
    /**
     * Creates a new instance of Screen
     */
    constructor();

    /**
     * Returns the width of the primary screen
     */
    getWidth(): number;

    /**
     * Returns the height of the primary screen
     */
    getHeight(): number;

    /**
     * Returns all currently available displays.
     */
    getDisplays(): DisplayInfo[];

    /**
     * Returns metadata of the primary display.
     */
    getPrimaryDisplay(): DisplayInfo | null;

    /**
     * Returns metadata by 1-based display index.
     */
    getDisplay(index: number): DisplayInfo | null;

    /**
     * Returns the union bounds of all displays in virtual coordinates.
     */
    getVirtualBounds(): ClipRegion;

    /**
     * Returns the color of a specific pixel
     * @param x X coordinate
     * @param y Y coordinate
     * @returns Hex color string (e.g., "#ff0000") or empty string if color cannot be retrieved
     */
    pixel(x: number, y: number): string;

    /**
     * Returns colors for multiple points
     * @param points Array of points, each point can be [x, y] array or {x, y} object
     * @param scaled Whether to use scaled coordinates
     * @returns Array of hex color strings (e.g., ["#ff0000", "#00ff00"])
     */
    pixels(points: (Point | [number, number])[], scaled?: boolean): string[];

    /**
     * Captures a screenshot of the screen
     * @param options Screenshot options
     * @returns Base64 data URL string, ArrayBuffer, saved path, structured metadata, or null when returnType is "none"
     * @throws Error if screenshot fails
     */
    screenshot(options?: ScreenshotOptions): Promise<string | ArrayBuffer | ScreenshotResult | null>;
}

declare global {
    // @ts-ignore
    var Screen: Screen;
}

export {};
