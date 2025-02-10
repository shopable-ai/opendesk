interface ClipOptions {
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
     * Path to save the screenshot
     */
    path?: string;

    /**
     * Clip region of the screenshot
     */
    clip?: ClipOptions;
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
     * @returns Base64 encoded image string
     * @throws Error if the screenshot fails
     */
    screenshot(options?: ScreenshotOptions): Promise<string>;

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