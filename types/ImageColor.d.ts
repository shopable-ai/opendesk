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
