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
     * @default "base64"
     */
    encoding?: "base64";
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
     * @returns Base64 encoded image string or empty string if saved to file
     * @throws Error if screenshot fails
     */
    screenshot(options?: ScreenshotOptions): Promise<string>;
}

declare global {
    // @ts-ignore
    var Screen: Screen;
}

export {};