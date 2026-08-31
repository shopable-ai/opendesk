export {};

declare global {
  interface OpenDeskVisionBBox {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface OpenDeskVisionLine {
    text: string;
    confidence: number;
    bbox: OpenDeskVisionBBox;
  }

  interface OpenDeskVisionImageSource {
    path?: string;
    imagePath?: string;
    base64?: string;
    imageBase64?: string;
    bytes?: OpenDeskByteInput;
    imageBytes?: OpenDeskByteInput;
    dataBytes?: OpenDeskByteInput;
    byteArray?: OpenDeskByteInput;
  }

  interface OpenDeskVisionOptions {
    provider?: string;
    providerName?: string;
    providerChain?: string[];
    lang?: string;
    language?: string;
    timeoutMs?: number;
    detectOrientation?: boolean;
    recognizeDirection?: boolean;
    includeRaw?: boolean;
    image?: string | OpenDeskByteInput | OpenDeskVisionImageSource;
    imageBytes?: OpenDeskByteInput;
    imageBase64?: string;
    imagePath?: string;
    targetText?: string;
    matchMode?: string;
    minConfidence?: number;
    defaultRole?: string;
    [key: string]: unknown;
  }

  interface OpenDeskVisionOCRResult {
    provider: string;
    lang: string;
    text: string;
    lines: OpenDeskVisionLine[];
    lineCount: number;
    raw?: unknown;
  }

  interface OpenDeskVisionElement {
    role: string;
    text: string;
    bbox: OpenDeskVisionBBox;
    score: number;
    clickPoint: OpenDeskPoint;
  }

  interface OpenDeskVisionDetectUIResult {
    provider: string;
    lang: string;
    text: string;
    count: number;
    elements: OpenDeskVisionElement[];
  }

  interface OpenDeskVisionProviderCapability {
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

  interface OpenDeskVisionCapabilities {
    defaultProvider: string;
    defaultLang: string;
    providers: OpenDeskVisionProviderCapability[];
    providerCount: number;
  }

  interface OpenDeskVision {
    runOCR(options: OpenDeskVisionOptions): OpenDeskVisionOCRResult;
    detectUI(options: OpenDeskVisionOptions): OpenDeskVisionDetectUIResult;
    getCapabilities(options?: Pick<OpenDeskVisionOptions, "provider" | "providerName">): OpenDeskVisionCapabilities;
    analyzeLayout(options: OpenDeskVisionOptions & { image: string | OpenDeskByteInput | OpenDeskVisionImageSource }): Record<string, unknown>;
    annotateRegions(options: OpenDeskVisionOptions & { image: string | OpenDeskByteInput | OpenDeskVisionImageSource; regions?: unknown[]; separators?: unknown[] }): Record<string, unknown>;
  }

  interface OpenDeskOCR {
    extractText(image: string, lang?: string): string;
  }

  var Vision: OpenDeskVision;
  var OCR: OpenDeskOCR;
}
