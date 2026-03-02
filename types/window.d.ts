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

declare class WindowManager {
    /**
     * Creates a new instance of WindowManager
     */
    constructor();

    /**
     * Gets information about the currently active window
     * @returns Information about the active window
     * @throws Error if no active window is found
     */
    getActiveWindow(): Promise<WindowInfo>;

    /**
     * Gets information about a window by its title
     * @param title The window title to search for
     * @returns Information about the window
     * @throws Error if the window is not found
     */
    getWindowByTitle(title: string): Promise<WindowInfo>;

    /**
     * Gets information about the currently focused window
     * @returns Information about the focused window or null if none
     */
    getFocusWindow(): Promise<WindowInfo | null>;

    /**
     * Activates and brings the specified window to the front
     * @param title The window title
     * @throws Error if the window is not found
     */
    focus(title: string): Promise<void>;

    /**
     * Sets the position and size of a window
     * @param title The window title
     * @param x X coordinate
     * @param y Y coordinate
     * @param width Window width
     * @param height Window height
     * @throws Error if the window is not found
     */
    setWindowBounds(title: string, x: number, y: number, width: number, height: number): Promise<void>;

    setWidth(title: string, width: number): Promise<void>;
    setHeight(title: string, height: number): Promise<void>;
    
    /**
     * Maximizes the specified window
     * @param title The window title
     * @throws Error if the window is not found
     */
    maximize(title: string): Promise<void>;

    /**
     * Minimizes the specified window
     * @param title The window title
     * @throws Error if the window is not found
     */
    minimize(title: string): Promise<void>;

    /**
     * Restores a minimized or maximized window to its normal state
     * @param title The window title
     * @throws Error if the window is not found
     */
    restore(title: string): Promise<void>;

    /**
     * Closes the specified window
     * @param title The window title
     * @throws Error if the window is not found
     */
    closeWindow(title: string): Promise<void>;

    /**
     * Closes the currently active window
     * @throws Error if no active window is found
     */
    closeActiveWindow(): Promise<void>;

    /**
     * Terminates a process by its ID
     * @param processId The process ID to terminate
     * @throws Error if the process cannot be terminated
     */
    kill(processId: number): Promise<void>;

    /**
     * Gets the title of the currently active window
     * @returns The window title or empty string if none
     */
    title(): string;

    /**
     * Gets the title of a specific window
     * @param selector The window selector
     * @returns The window title
     * @throws Error if the window is not found
     */
    getTitle(selector: string): Promise<string>;

    /**
     * Gets the content of the currently active window
     * @returns The window content
     */
    content(): string;

    /**
     * Gets the content of a specific window
     * @param selector The window selector
     * @returns The window content
     * @throws Error if the window is not found
     */
    getContent(selector: string): Promise<string>;

    /**
     * Lists all visible windows
     * @returns Array of window information
     * @throws Error if the enumeration fails
     */
    list(): Promise<Record<string, any>[]>;

    /**
     * Sets whether a window should stay on top of other windows
     * @param title The window title
     * @param alwaysOnTop Whether the window should stay on top
     * @throws Error if the window is not found or the operation fails
     */
    setAlwaysOnTop(title: string, alwaysOnTop: boolean): Promise<void>;

    /**
     * Removes the always-on-top state of a window
     * @param title The window title
     * @throws Error if the window is not found or the operation fails
     */
    unsetTopMost(title: string): Promise<void>;

    /**
     * Brings a window to the top (one-time)
     * @param title The window title
     * @throws Error if the window is not found or the operation fails
     */
    bringToTop(title: string): Promise<void>;
}

declare global {
    // @ts-ignore
    var window: WindowManager;
}

export {};