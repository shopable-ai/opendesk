export {};

declare global {
  interface OpenDeskColorBlock {
    x: number;
    y: number;
    width: number;
    height: number;
    area: number;
    shape: "rectangle" | "circle" | "ellipse";
    match: number;
  }

  interface OpenDeskFindColorOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    threshold?: number;
  }

  interface OpenDeskImageCropOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }

  interface OpenDeskTemplateMatchResult {
    confidence: number;
    found: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
  }

  /** One template or ordered visual-state variants of the same control. */
  type OpenDeskImageTemplate = string | string[];

  interface OpenDeskImageRegion {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface OpenDeskFindImageOptions {
    threshold?: number;
    region?: OpenDeskImageRegion;
    scales?: number[];
  }

  interface OpenDeskFindImagesOptions extends OpenDeskFindImageOptions {
    maxResults?: number;
  }

  interface OpenDeskFindImageResult extends OpenDeskTemplateMatchResult {
    centerX: number;
    centerY: number;
    scale: number;
    /** Present for findImage; index of the winning template, or 0 for one template. */
    templateIndex?: number;
  }

  interface OpenDeskImageDiffRegion {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface OpenDeskImageDiffOptions {
    pixelThreshold?: number;
    maxDiffPixels?: number;
    maxDiffRatio?: number;
    includeAlpha?: boolean;
    ignoreRegions?: OpenDeskImageDiffRegion[];
    outputPath?: string;
    includeDiffImage?: boolean;
  }

  interface OpenDeskImageDiffResult {
    matched: boolean;
    width: number;
    height: number;
    totalPixels: number;
    comparedPixels: number;
    ignoredPixels: number;
    diffPixels: number;
    diffRatio: number;
    meanAbsoluteError: number;
    maxChannelDiff: number;
    changedBounds: OpenDeskImageDiffRegion | null;
    pixelThreshold: number;
    includeAlpha: boolean;
    diffPath?: string;
    diffImage?: string;
  }

  interface OpenDeskColorSimilarityResult {
    data: boolean;
    similarity: number;
    details?: Record<string, unknown>;
    [key: string]: unknown;
  }

  interface OpenDeskLayoutAnalyzeOptions {
    cellSize?: number;
    quantize?: number;
    tolerance?: number;
    minRegionArea?: number;
    maxRegions?: number;
    maxDepth?: number;
    minSplitSpan?: number;
    minSeparatorScore?: number;
    minSeparatorSpanRatio?: number;
    separatorThresholdMode?: "adaptive" | "fixed";
    maxSeparatorCandidates?: number;
    profile?: string;
    cellColorMode?: "mean" | "median" | "trimmed" | "dominant";
    boundarySpanWidth?: number;
    separatorHints?: {
      vertical?: Array<{ label?: string; from: number; to: number }>;
      horizontal?: Array<{ label?: string; from: number; to: number }>;
    };
  }

  interface OpenDeskImageColor {
    findPos(sourceImage: string, templateImage: string, threshold?: number): OpenDeskTemplateMatchResult;
    findImage(sourceImage: string, templateImage: OpenDeskImageTemplate, options?: OpenDeskFindImageOptions): OpenDeskFindImageResult;
    findImages(sourceImage: string, templateImage: string, options?: OpenDeskFindImagesOptions): OpenDeskFindImageResult[];
    diff(actualImage: string, expectedImage: string, options?: OpenDeskImageDiffOptions): OpenDeskImageDiffResult;
    loadBase64(path: string): string;
    resize(image: string, width: number, height: number): string;
    pixel(image: string, x: number, y: number): string;
    findColor(image: string, color: string, options?: OpenDeskFindColorOptions): string;
    findColorBlocks(image: string, color: string, options?: OpenDeskFindColorOptions): OpenDeskColorBlock[];
    hasColor(image: string, color: string, x: number, y: number, width?: number, height?: number, threshold?: number): boolean;
    isGray(imageOrColor: string, x?: number, y?: number, width?: number, height?: number, threshold?: number): boolean;
    getSize(image: string): [number, number] | null;
    clip(image: string, options?: OpenDeskImageCropOptions): string;
    save(image: string, path: string, format?: "png" | "jpeg" | "jpg" | string, quality?: number): boolean;
    findRedChannel(image: string, x: number, y: number, width?: number, height?: number): string;
    findGreenChannel(image: string, x: number, y: number, width?: number, height?: number): string;
    findBlueChannel(image: string, x: number, y: number, width?: number, height?: number): string;
    toRGB(color: string): string;
    toRGBA(color: string): string;
    toHSL(color: string): string;
    toHSLA(color: string): string;
    isColorSimilar(targetColor: string, compareColor: string, tolerance?: number): OpenDeskColorSimilarityResult;
    analyzeLayout(image: string, options?: OpenDeskLayoutAnalyzeOptions): Record<string, unknown>;
  }

  var ImageColor: OpenDeskImageColor;
}
