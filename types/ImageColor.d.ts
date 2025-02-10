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
    /**
     * X coordinate of the crop start point
     */
    x?: number;
    
    /**
     * Y coordinate of the crop start point
     */
    y?: number;
    
    /**
     * Width of the cropped area
     */
    width?: number;
    
    /**
     * Height of the cropped area
     */
    height?: number;
}

interface FindColorResult {
    x: number;
    y: number;
}

interface FindColorOptions {
    /**
     * X coordinate of the search start point
     */
    x?: number;
    
    /**
     * Y coordinate of the search start point
     */
    y?: number;
    
    /**
     * Width of the search area
     */
    width?: number;
    
    /**
     * Height of the search area
     */
    height?: number;
    
    /**
     * Color matching threshold (0-255)
     */
    threshold?: number;
}

declare class ImageColor {
    /**
     * Creates a new instance of ImageColor
     */
    constructor();

    /**
     * Gets the color of a specific pixel
     * @param imageStr Base64 encoded image string
     * @param x X coordinate
     * @param y Y coordinate
     * @returns Hex color string (e.g., "#ff0000")
     * @throws Error if coordinates are out of bounds
     */
    pixel(imageStr: string, x: number, y: number): Promise<string>;

    /**
     * Searches for a specific color in the image
     * @param imageStr Base64 encoded image string
     * @param colorStr Hex color string (e.g., "#ff0000")
     * @param options Search options
     * @returns Location of the first matching pixel or {found: false}
     */
    findColor(imageStr: string, colorStr: string, options?: string): Promise<string>;

    /**
     * Searches for blocks of a specific color
     * @param imageStr Base64 encoded image string
     * @param colorStr Hex color string (e.g., "#ff0000")
     * @param options Search options
     * @returns JSON string containing array of ColorBlock objects
     */
    findColorBlocks(imageStr: string, colorStr: string, options?: string): Promise<string>;

    /**
     * Checks if a color exists in a specified region
     * @param imageStr Base64 encoded image string
     * @param colorStr Hex color string (e.g., "#ff0000")
     * @param x X coordinate
     * @param y Y coordinate
     * @param width Width of the region (optional)
     * @param height Height of the region (optional)
     * @param threshold Color matching threshold (0-255)
     */
    hasColor(imageStr: string, colorStr: string, x: number, y: number, width?: number, height?: number, threshold?: number): Promise<boolean>;

    /**
     * Checks if a region contains only gray colors
     * @param imageStr Base64 encoded image string
     * @param x X coordinate
     * @param y Y coordinate
     * @param width Width of the region (optional)
     * @param height Height of the region (optional)
     * @param threshold Gray color threshold (0-255)
     */
    isGray(imageStr: string, x: number, y: number, width?: number, height?: number, threshold?: number): Promise<boolean>;

    /**
     * Gets the dimensions of an image
     * @param imageStr Base64 encoded image string
     * @returns Array containing [width, height]
     */
    getSize(imageStr: string): number[];

    /**
     * Crops an image to specified dimensions
     * @param imageStr Base64 encoded image string
     * @param options Crop options
     * @returns Base64 encoded cropped image string
     */
    crop(imageStr: string, options?: CropOptions): Promise<string>;

    /**
     * Saves an image to a file
     * @param imageStr Base64 encoded image string
     * @param path File path to save to
     * @param format Image format ("png" or "jpeg"/"jpg")
     * @param quality JPEG quality (1-100)
     * @returns true if successful
     */
    save(imageStr: string, path: string, format?: string, quality?: number): Promise<boolean>;
}

declare global {
    var ImageColor: ImageColor;
}

export {};