declare global {
  interface MacOSVisionNativeExtension {
    readonly ocr: OpenDeskNativeExtensionMethod<{
      imagePath: string;
      recognitionLevel?: "accurate" | "fast";
      languages?: string[];
    }, {
      text: string;
      items: Array<{
        text: string;
        confidence: number;
        boundingBox: { x: number; y: number; width: number; height: number };
      }>;
      image: { width: number; height: number };
      coordinateSystem: { unit: "normalized"; origin: "lower-left"; reference: "processed-image" };
    }>;
  }

  interface OpenDeskNativeExtensionNamespaceMap {
    readonly macosVision: MacOSVisionNativeExtension;
  }

  interface OpenDeskNativeExtensionPluginById {
    readonly "com.example.macos-vision": MacOSVisionNativeExtension;
  }
}

export {};
