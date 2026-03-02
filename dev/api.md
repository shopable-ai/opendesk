
// Comprehensive type declarations

// Window Management
interface WindowInfo {
    /**
     * Window title
     */
    title: string;

    /**
     * Process ID of the window
     */
    pid: number;

    /**
     * X coordinate of the window
     */
    x: number;

    /**
     * Y coordinate of the window
     */
    y: number;

    /**
     * Width of the window
     */
    width: number;

    /**
     * Height of the window
     */
    height: number;

    /**
     * Name of the executable
     */
    exe_name: string;

    /**
     * Full path to the executable
     */
    exe_path: string;

    /**
     * Whether the window is currently in the foreground
     */
    is_foreground: boolean;

    /**
     * Whether the window has input focus
     */
    has_focus: boolean;

    /**
     * Window handle
     */
    handle: number;

    /**
     * Whether the window is a popup
     */
    is_popup: boolean;
}

declare class window {
    constructor();
    getActiveWindow(): Promise<WindowInfo>;
    getWindowByTitle(title: string): Promise<WindowInfo>;
    getFocusWindow(): Promise<WindowInfo | null>;
    focus(title: string): Promise<void>;
    setWindowBounds(title: string, x: number, y: number, width: number, height: number): Promise<void>;
    maximize(title: string): Promise<void>;
    minimize(title: string): Promise<void>;
    restore(title: string): Promise<void>;
    closeWindow(title: string): Promise<void>;
    closeActiveWindow(): Promise<void>;
    kill(processId: number): Promise<void>;
    title(): string;
    getTitle(selector: string): Promise<string>;
    content(): string;
    getContent(selector: string): Promise<string>;
    list(): Promise<Record<string, any>[]>;
    setAlwaysOnTop(title: string, alwaysOnTop: boolean): Promise<void>;
    unsetTopMost(title: string): Promise<void>;
    bringToTop(title: string): Promise<void>;
}

// Image Color Management
interface ColorBlock {
    x: number;
    y: number;
    width: number;
    height: number;
    area: number;
    shape: "rectangle" | "circle" | "ellipse";
    match: number;
}

interface CropOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
}

interface FindColorResult {
    x: number;
    y: number;
}

interface FindColorOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    threshold?: number;
}

declare class ImageColor {
    constructor();
    pixel(imageStr: string, x: number, y: number): Promise<string>;
    findColor(imageStr: string, colorStr: string, options?: string): Promise<string>;
    findColorBlocks(imageStr: string, colorStr: string, options?: string): Promise<string>;
    hasColor(imageStr: string, colorStr: string, x: number, y: number, width?: number, height?: number, threshold?: number): Promise<boolean>;
    isGray(imageStr: string, x: number, y: number, width?: number, height?: number, threshold?: number): Promise<boolean>;
    getSize(imageStr: string): number[];
    crop(imageStr: string, options?: CropOptions): Promise<string>;
    save(imageStr: string, path: string, format?: string, quality?: number): Promise<boolean>;
}

// HTTP Request Management
declare namespace axios {
    interface Config {
        headers?: Record<string, string>;
        timeout?: number;
        params?: Record<string, any>;
        [key: string]: any;
    }

    interface Response<T = any> {
        data: T;
        status: number;
        statusText: string;
        headers: Record<string, string>;
        config: Config;
        request?: any;
    }

    interface AppHttpInstance {
        get<T = any>(url: string, config?: Config): Promise<Response<T>>;
        post<T = any>(url: string, data?: any, config?: Config): Promise<Response<T>>;
        put<T = any>(url: string, data?: any, config?: Config): Promise<Response<T>>;
        delete<T = any>(url: string, config?: Config): Promise<Response<T>>;
        patch<T = any>(url: string, data?: any, config?: Config): Promise<Response<T>>;
    }
}

// Clipboard Management
declare class Clipboard {
    constructor();
    copy(text: string): Promise<void>;
    paste(): Promise<string>;
    clear(): Promise<void>;
}

// Keyboard Interactions
declare class Keyboard {
    constructor();
    type(text: string): Promise<void>;
    press(key: string): Promise<void>;
    down(key: string): Promise<void>;
    up(key: string): Promise<void>;
    combination(...keys: string[]): Promise<void>;
}

// Mouse Interactions
interface MouseClickOptions {
    button?: "left" | "right" | "middle";
    clickCount?: number;
    delay?: number;
}

interface MouseMoveOptions {
    steps?: number;
}

interface MouseButtonOptions {
    button?: "left" | "right" | "middle";
}

interface MouseWheelOptions {
    deltaX?: number;
    deltaY?: number;
    steps?: number;
    delay?: number;
}

declare class Mouse {
    constructor();
    click(x: number, y: number, options?: MouseClickOptions): Promise<void>;
    move(x: number, y: number, options?: MouseMoveOptions): Promise<void>;
    down(options?: MouseButtonOptions): Promise<void>;
    up(options?: MouseButtonOptions): Promise<void>;
    wheel(options?: MouseWheelOptions): Promise<void>;
}

// Screen Interactions
interface Point {
    x: number;
    y: number;
}

interface ClipRegion {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ScreenshotOptions {
    path?: string;
    fullPage?: boolean;
    clip?: ClipRegion;
    encoding?: "base64";
}

declare class Screen {
    constructor();
    getWidth(): number;
    getHeight(): number;
    pixel(x: number, y: number): string;
    pixels(points: (Point | [number, number])[], scaled?: boolean): string[];
    screenshot(options?: ScreenshotOptions): Promise<string>;
}

// Sound Interactions
declare class AppSound {
    playSuccess: () => Promise<void>;
    playFail: () => Promise<void>;
    playWarning: () => Promise<void>;
    playError: () => Promise<void>;
    playSound: (sound: any) => Promise<void>;
    play: (sound: any) => Promise<void>;
}

// Page Interactions
interface ClipOptions {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface PageScreenshotOptions {
    type?: string;
    quality?: number;
    fullPage?: boolean;
    omitBackground?: boolean;
    encoding?: "binary" | "base64";
    path?: string;
    clip?: ClipOptions;
}

declare class Page {
    mouse: Mouse;
    keyboard: Keyboard;
    touchscreen: any; // Placeholder for Touchscreen type
    pid: number;
    executable: string;

    constructor();
    screenshot(options?: PageScreenshotOptions): Promise<string>;
    goto(url: string): Promise<void>;
    title(): string;
    url(): string;
    waitFor(milliseconds: number): Promise<void>;
}

// Global Variables
declare global {
    var window: WindowManager;
    var ImageColor: ImageColor;
    var axios: AppHttp.AppHttpInstance;
    var clipboard: Clipboard;
    var keyboard: Keyboard;
    var mouse: Mouse;
    var Screen: Screen;
    var Sound: AppSound;
    var page: Page;

    // Utility Functions
    function encodeURIComponent(str: string): string;
    function encodeURI(uri: string, allowedChars: string): string;
    function decodeURIComponent(str: string): string;
    function decodeURI(uri: string): string;
    function copyToClipboard(text: string): void;
    function getClipboard(): string;    
    async function sleep(ms: number): Promise<void>;
}

// Ensure this is treated as a module
export {};

上面的类不需要新建，直接调用。
