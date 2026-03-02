interface MouseClickOptions {
    /**
     * The mouse button to use for the click
     * @default "left"
     */
    button?: "left" | "right" | "middle";
    
    /**
     * Number of times to click
     * @default 1
     */
    clickCount?: number;
    
    /**
     * Delay between clicks in milliseconds
     * @default 0
     */
    delay?: number;
}

interface MouseMoveOptions {
    /**
     * Number of steps to take during movement for smooth motion
     * @default 1
     */
    steps?: number;
}

interface MouseButtonOptions {
    /**
     * The mouse button to use
     * @default "left"
     */
    button?: "left" | "right" | "middle";
}

interface MouseWheelOptions {
    /**
     * Horizontal scroll distance
     * @default 0
     */
    deltaX?: number;
    
    /**
     * Vertical scroll distance
     * @default 0
     */
    deltaY?: number;
    
    /**
     * Number of steps for smooth scrolling
     * @default 1
     */
    steps?: number;
    
    /**
     * Delay between steps in milliseconds
     * @default 0
     */
    delay?: number;
}

declare class Mouse {
    /**
     * Creates a new instance of Mouse
     */
    constructor();

    /**
     * Clicks at the specified coordinates
     * @param x The x coordinate
     * @param y The y coordinate
     * @param options Click options
     * @throws Error if the button type is invalid
     */
    click(x: number, y: number, options?: MouseClickOptions): Promise<void>;

    /**
     * Moves the mouse to the specified coordinates
     * @param x The x coordinate
     * @param y The y coordinate
     * @param options Move options
     */
    move(x: number, y: number, options?: MouseMoveOptions): Promise<void>;

    /**
     * Presses down a mouse button
     * @param options Button options
     * @throws Error if the button type is invalid
     */
    down(options?: MouseButtonOptions): Promise<void>;

    /**
     * Releases a mouse button
     * @param options Button options
     * @throws Error if the button type is invalid
     */
    up(options?: MouseButtonOptions): Promise<void>;

    /**
     * Gets the current mouse position
     * @returns The current mouse position
     * @throws Error if the mouse_event procedure fails
     * */
    getPos(): Promise<object>;

    /**
     * Performs mouse wheel scrolling
     * @param options Wheel options
     * @throws Error if the mouse_event procedure fails
     */
    wheel(options?: MouseWheelOptions): Promise<void>;
}

declare global {
    var mouse: Mouse;
}

export {};