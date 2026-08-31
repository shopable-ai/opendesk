export {};

declare global {
interface VisionBBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface VisionOCRLine {
    text: string;
    confidence: number;
    bbox: VisionBBox;
}

interface VisionProfile {
    provider?: "paddle" | "paddleocr" | "local" | "tesseract" | "openai" | "azure" | "google" | "aws";
    language?: string;
    lang?: string;
    timeoutMs?: number;
    minConfidence?: number;
    includeRaw?: boolean;
    detectOrientation?: boolean;
    recognizeDirection?: boolean;
    targetText?: string;
    matchMode?: "contains" | "exact";
    defaultRole?: string;
}

interface VisionImageInput {
    path?: string;
    imagePath?: string;
    base64?: string;
    imageBase64?: string;
    bytes?: Uint8Array | ArrayBuffer | number[];
    imageBytes?: Uint8Array | ArrayBuffer | number[];
    dataBytes?: Uint8Array | ArrayBuffer | number[];
    byteArray?: Uint8Array | ArrayBuffer | number[];
    data?: string;
    url?: string;
    mediaId?: string;
    mimeType?: string;
    name?: string;
}

interface VisionOCROptions {
    provider?: "paddle" | "paddleocr" | "local" | "tesseract" | "openai" | "azure" | "google" | "aws";
    image?: string | VisionImageInput | Uint8Array | ArrayBuffer | number[];
    imageBytes?: Uint8Array | ArrayBuffer | number[];
    imageBase64?: string;
    imagePath?: string;
    visionProfile?: VisionProfile;
    language?: string;
    lang?: string;
    timeoutMs?: number;
    minConfidence?: number;
    includeRaw?: boolean;
}

interface VisionOCRResult {
    provider: string;
    lang: string;
    text: string;
    lineCount: number;
    lines: VisionOCRLine[];
    raw?: any;
}

interface VisionDetectUIOptions extends VisionOCROptions {
    targetText?: string;
    matchMode?: "contains" | "exact";
    defaultRole?: string;
}

interface VisionUIElement {
    role: string;
    text: string;
    bbox: VisionBBox;
    score: number;
    clickPoint: { x: number; y: number };
}

interface VisionDetectUIResult {
    provider: string;
    lang: string;
    text: string;
    count: number;
    elements: VisionUIElement[];
}

interface VisionProviderCapabilities {
    provider: string;
    alias?: string;
    aliases?: string[];
    implemented: boolean;
    isDefault: boolean;
    switchReady: boolean;
    defaultLang: string;
    supportedLangs: string[];
    endpointRequired?: boolean;
    endpointConfigured?: boolean;
    note?: string;
}

interface VisionCapabilitiesResult {
    defaultProvider: string;
    defaultLang: string;
    providerCount: number;
    providers: VisionProviderCapabilities[];
}

// Keep the Clawdesk-prefixed names used by the shared Runtime API declarations
// available alongside the more focused Vision* types above.
interface ClawdeskVisionBBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ClawdeskVisionLine {
    text: string;
    confidence: number;
    bbox: ClawdeskVisionBBox;
}

interface ClawdeskVisionImageSource {
    path?: string;
    imagePath?: string;
    base64?: string;
    imageBase64?: string;
    bytes?: ClawdeskByteInput;
    imageBytes?: ClawdeskByteInput;
    dataBytes?: ClawdeskByteInput;
    byteArray?: ClawdeskByteInput;
}

interface ClawdeskVisionOptions {
    provider?: string;
    providerName?: string;
    providerChain?: string[];
    lang?: string;
    language?: string;
    timeoutMs?: number;
    detectOrientation?: boolean;
    recognizeDirection?: boolean;
    includeRaw?: boolean;
    image?: string | ClawdeskByteInput | ClawdeskVisionImageSource;
    imageBytes?: ClawdeskByteInput;
    imageBase64?: string;
    imagePath?: string;
    targetText?: string;
    matchMode?: string;
    minConfidence?: number;
    defaultRole?: string;
    [key: string]: unknown;
}

interface ClawdeskVisionOCRResult {
    provider: string;
    lang: string;
    text: string;
    lines: ClawdeskVisionLine[];
    lineCount: number;
    raw?: unknown;
}

interface ClawdeskVisionElement {
    role: string;
    text: string;
    bbox: ClawdeskVisionBBox;
    score: number;
    clickPoint: ClawdeskPoint;
}

interface ClawdeskVisionDetectUIResult {
    provider: string;
    lang: string;
    text: string;
    count: number;
    elements: ClawdeskVisionElement[];
}

interface ClawdeskVisionProviderCapability {
    provider: string;
    alias?: string;
    aliases?: string[];
    isDefault?: boolean;
    implemented: boolean;
    switchReady?: boolean;
    defaultLang?: string;
    supportedLangs?: string[];
    endpointRequired?: boolean;
    endpointConfigured?: boolean;
    [key: string]: unknown;
}

interface ClawdeskVisionCapabilities {
    defaultProvider: string;
    defaultLang: string;
    providers: ClawdeskVisionProviderCapability[];
    providerCount: number;
}

interface ClawdeskVision {
    runOCR(options: ClawdeskVisionOptions): ClawdeskVisionOCRResult;
    detectUI(options: ClawdeskVisionOptions): ClawdeskVisionDetectUIResult;
    getCapabilities(options?: Pick<ClawdeskVisionOptions, "provider" | "providerName">): ClawdeskVisionCapabilities;
    analyzeLayout(options: ClawdeskVisionOptions & { image: string | ClawdeskByteInput | ClawdeskVisionImageSource }): Record<string, unknown>;
    annotateRegions(options: ClawdeskVisionOptions & { image: string | ClawdeskByteInput | ClawdeskVisionImageSource; regions?: unknown[]; separators?: unknown[] }): Record<string, unknown>;
}

interface ClawdeskOCR {
    extractText(image: string, lang?: string): string;
}

interface VisionLayoutSeparator {
    orientation: "vertical" | "horizontal";
    position: number;
    thickness: number;
    score: number;
    source: string;
    confidence: number;
    meta?: Record<string, any>;
}

interface VisionLayoutRegion {
    id: string;
    role: string;
    label: string;
    bbox: VisionBBox;
    avgColor: string;
    center: { x: number; y: number };
    confidence: number;
    meta?: Record<string, any>;
}

interface VisionAnalyzeLayoutOptions {
    image?: string | VisionImageInput | Uint8Array | ArrayBuffer | number[];
    imageBytes?: Uint8Array | ArrayBuffer | number[];
    imageBase64?: string;
    imagePath?: string;
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
        vertical?: Array<{ label?: string; from: number; to: number }>;
        horizontal?: Array<{ label?: string; from: number; to: number }>;
    };
    profile?: string;
}

interface VisionAnalyzeLayoutResult {
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
    regions: VisionLayoutRegion[];
    separators: {
        vertical: VisionLayoutSeparator[];
        horizontal: VisionLayoutSeparator[];
    };
    floodRegions: Array<{
        label: number;
        bbox: VisionBBox;
        area: number;
        fillRatio: number;
        avgColor: string;
    }>;
    warnings: string[];
    debug: {
        separatorHints: {
            vertical: Array<{ label?: string; from: number; to: number }>;
            horizontal: Array<{ label?: string; from: number; to: number }>;
        };
        rootCandidates: {
            vertical: VisionLayoutSeparator[];
            horizontal: VisionLayoutSeparator[];
        };
        tree: Record<string, any>;
    };
}

interface VisionAnnotateRegionsOptions extends VisionAnalyzeLayoutOptions {
    regions?: VisionLayoutRegion[];
    separators?: {
        vertical?: VisionLayoutSeparator[];
        horizontal?: VisionLayoutSeparator[];
    };
    outputPath?: string;
    title?: string;
}

interface VisionAnnotateRegionsResult {
    width: number;
    height: number;
    count: number;
    outputPath?: string;
    image: string;
}

class AppVision {
    runOCR(options: ClawdeskVisionOptions): VisionOCRResult;
    detectUI(options: ClawdeskVisionOptions): VisionDetectUIResult;
    getCapabilities(options?: { provider?: string; providerName?: string }): VisionCapabilitiesResult;
    analyzeLayout(options: VisionAnalyzeLayoutOptions): VisionAnalyzeLayoutResult;
    analyzeLayout(options: ClawdeskVisionOptions & { image: string | ClawdeskByteInput | ClawdeskVisionImageSource }): VisionAnalyzeLayoutResult;
    annotateRegions(options: VisionAnnotateRegionsOptions): VisionAnnotateRegionsResult;
    annotateRegions(options: ClawdeskVisionOptions & { image: string | ClawdeskByteInput | ClawdeskVisionImageSource; regions?: unknown[]; separators?: unknown[] }): VisionAnnotateRegionsResult;
}

    // @ts-ignore
    var Vision: AppVision;
    var OCR: ClawdeskOCR;
}
