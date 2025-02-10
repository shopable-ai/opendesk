declare class Clipboard {
    /**
     * Creates a new instance of Clipboard
     */
    constructor();

    /**
     * Writes text to the system clipboard
     * @param text The text to copy to clipboard
     * @throws Error if the text is empty or the operation fails
     */
    copy(text: string): Promise<void>;

    /**
     * Retrieves the current content of the system clipboard
     * @returns The text content of the clipboard
     * @throws Error if the operation fails
     */
    paste(): Promise<string>;

    /**
     * Empties the clipboard
     * @throws Error if the operation fails
     */
    clear(): Promise<void>;
}

declare global {
    var clipboard: Clipboard;
}

export {};