export {};

declare global {
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

  var Vision: ClawdeskVision;
  var OCR: ClawdeskOCR;
}
