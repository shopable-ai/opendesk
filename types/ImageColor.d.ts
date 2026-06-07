interface ColorBlock {
    x: number;
    y: number;
    width: number;
    height: number;
    area: number;
    shape: "rectangle" | "circle" | "ellipse";
    match: number;
}

interface LayoutSeparator {
    orientation: "vertical" | "horizontal";
    position: number;
    thickness: number;
    score: number;
    source: string;
    confidence: number;
    meta?: Record<string, any>;
}

interface LayoutRegion {
    id: string;
    role: string;
    label: string;
    bbox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    center?: { x: number; y: number };
    avgColor?: string;
    confidence?: number;
    meta?: Record<string, any>;
}

interface LayoutSeparatorHint {
    label?: string;
    from: number;
    to: number;
}

interface LayoutAnalyzeOptions {
    cellSize?: number;
    quantize?: number;
    tolerance?: number;
    minRegionArea?: number;
    maxRegions?: number;
    maxDepth?: number;
    minSplitSpan?: number;
    minSeparatorScore?: number;
    maxSeparatorCandidates?: number;
    separatorHints?: {
        vertical?: LayoutSeparatorHint[];
        horizontal?: LayoutSeparatorHint[];
    };
    profile?: string;
    /**
     * Cell color computation mode
     * - "mean": arithmetic mean (original, faster but sensitive to text noise)
     * - "median": median value (default, more robust against text/foreground noise)
     * - "trimmed": trimmed mean (removes outliers)
     * - "dominant": dominant color (most frequent)
     * @default "median"
     */
    cellColorMode?: "mean" | "median" | "trimmed" | "dominant";
    /**
     * Boundary span width for region contrast calculation
     * Defines how many cells on each side to consider when computing region-level color contrast
     * Higher values provide more stable boundaries but may miss narrow separators
     * @default 3
     * @range 1-8
     */
    boundarySpanWidth?: number;
}

interface LayoutAnalyzeResult {
    width: number;
    height: number;
    grid: {
        cellSize: number;
        gridWidth: number;
        gridHeight: number;
        quantize: number;
        tolerance: number;
        minRegionArea: number;
        maxDepth: number;
        minSplitSpan: number;
        minSeparatorScore: number;
        maxSeparatorCandidates: number;
    };
    regions: LayoutRegion[];
    separators: {
        vertical: LayoutSeparator[];
        horizontal: LayoutSeparator[];
    };
    floodRegions: Array<{
        label: number;
        bbox: { x: number; y: number; width: number; height: number };
        area: number;
        fillRatio: number;
        avgColor: string;
    }>;
    warnings: string[];
    debug: {
        separatorHints: {
            vertical: LayoutSeparatorHint[];
            horizontal: LayoutSeparatorHint[];
        };
        rootCandidates: {
            vertical: LayoutSeparator[];
            horizontal: LayoutSeparator[];
        };
        tree: Record<string, any>;
    };
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
    isGrey(imageStr: string, x: number, y: number, width?: number, height?: number, threshold?: number): Promise<boolean>;

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
    clip(imageStr: string, options?: CropOptions): Promise<string>;

    resize(imageStr: string, width: number, height: number): Promise<string>;

    /**
     * Saves an image to a file
     * @param imageStr Base64 encoded image string
     * @param path File path to save to
     * @param format Image format ("png" or "jpeg"/"jpg")
     * @param quality JPEG quality (1-100)
     * @returns true if successful
     */
    save(imageStr: string, path: string, format?: string, quality?: number): Promise<boolean>;
    
    findPos(sourceImgStr: string, templateImgStr: string, args?: number[]): Promise<{confidence,found,x,y,width,height}>;

    loadBase64(path: string): Promise<string>;

    analyzeLayout(imageStr: string, options?: LayoutAnalyzeOptions): Promise<LayoutAnalyzeResult>;
}

declare global {
    var ImageColor: ImageColor;
}

export {};
