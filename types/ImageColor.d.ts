export {};

declare global {
  interface ClawdeskColorBlock {
    x: number;
    y: number;
    width: number;
    height: number;
    area: number;
    shape: "rectangle" | "circle" | "ellipse";
    match: number;
  }

  interface ClawdeskFindColorOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    threshold?: number;
  }

  interface ClawdeskImageCropOptions {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }

  interface ClawdeskTemplateMatchResult {
    confidence: number;
    found: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface ClawdeskColorSimilarityResult {
    data: boolean;
    similarity: number;
    details?: Record<string, unknown>;
    [key: string]: unknown;
  }

  interface ClawdeskLayoutAnalyzeOptions {
    cellSize?: number;
    quantize?: number;
    tolerance?: number;
    minRegionArea?: number;
    maxRegions?: number;
    maxDepth?: number;
    minSplitSpan?: number;
    minSeparatorScore?: number;
    maxSeparatorCandidates?: number;
    profile?: string;
    cellColorMode?: "mean" | "median" | "trimmed" | "dominant";
    boundarySpanWidth?: number;
    separatorHints?: {
      vertical?: Array<{ label?: string; from: number; to: number }>;
      horizontal?: Array<{ label?: string; from: number; to: number }>;
    };
  }

  interface ClawdeskImageColor {
    findPos(sourceImage: string, templateImage: string, threshold?: number): ClawdeskTemplateMatchResult;
    loadBase64(path: string): string;
    resize(image: string, width: number, height: number): string;
    pixel(image: string, x: number, y: number): string;
    findColor(image: string, color: string, options?: ClawdeskFindColorOptions): string;
    findColorBlocks(image: string, color: string, options?: ClawdeskFindColorOptions): ClawdeskColorBlock[];
    hasColor(image: string, color: string, x: number, y: number, width?: number, height?: number, threshold?: number): boolean;
    isGray(imageOrColor: string, x?: number, y?: number, width?: number, height?: number, threshold?: number): boolean;
    getSize(image: string): [number, number] | null;
    clip(image: string, options?: ClawdeskImageCropOptions): string;
    save(image: string, path: string, format?: "png" | "jpeg" | "jpg" | string, quality?: number): boolean;
    findRedChannel(image: string, x: number, y: number, width?: number, height?: number): string;
    findGreenChannel(image: string, x: number, y: number, width?: number, height?: number): string;
    findBlueChannel(image: string, x: number, y: number, width?: number, height?: number): string;
    toRGB(color: string): string;
    toRGBA(color: string): string;
    toHSL(color: string): string;
    toHSLA(color: string): string;
    isColorSimilar(targetColor: string, compareColor: string, tolerance?: number): ClawdeskColorSimilarityResult;
    analyzeLayout(image: string, options?: ClawdeskLayoutAnalyzeOptions): Record<string, unknown>;
  }

  var ImageColor: ClawdeskImageColor;
}
