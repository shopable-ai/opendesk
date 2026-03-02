declare class Keyboard {
    /**
     * Creates a new instance of Keyboard
     */
    constructor();

    /**
     * Types the given text string
     * @param text The text to type
     * @throws Error if the input text is empty
     */
    type(text: string): Promise<void>;

    /**
     * Presses and releases a single key
     * @param key The key to press
     * @throws Error if the key is empty
     */
    press(key: string): Promise<void>;

    /**
     * Holds down a key
     * @param key The key to hold down
     * @throws Error if the key is empty
     */
    down(key: string): Promise<void>;

    /**
     * Releases a key
     * @param key The key to release
     * @throws Error if the key is empty
     */
    up(key: string): Promise<void>;

    /**
     * Presses multiple keys simultaneously
     * @param keys The keys to press in combination
     * @throws Error if no keys are provided
     */
    combination(...keys: string[]): Promise<void>;
}

declare global {
    var keyboard: Keyboard;
}

export {};