function main() {
  // The public OCR example is run from <program-directory>. The input image is
  // intentionally outside the extension bundle: it is caller-owned business
  // data, not executable/plugin installation content.
  // Prefer the repository's JPEG example. The deterministic PNG fixture used
  // by the formal plugin gate remains a supported fallback.
  const copySources = [
    ["./dist/ocr-test.jpg", "./examples/native-extensions/ocr-test.jpg"],
    ["./ocr-test.jpg", "../examples/native-extensions/ocr-test.jpg"]
  ];
  for (const [destinationName, sourceName] of copySources) {
    const destination = File.path(destinationName);
    const source = File.path(sourceName);
    if (!File.exists(destination) && File.exists(source)) {
      File.copy(source, destination);
    }
  }

  const imageNames = [
    "./dist/ocr-test.jpg",
    "./dist/ocr-test.png",
    "./ocr-test.jpg",
    "./ocr-test.png",
    "./examples/native-extensions/ocr-test.jpg"
  ];
  let imagePath = null;
  for (const imageName of imageNames) {
    const candidate = File.path(imageName);
    if (File.exists(candidate)) {
      imagePath = candidate;
      break;
    }
  }
  if (!imagePath) {
    throw new Error("OCR image is missing; expected ocr-test.jpg or ocr-test.png in <program-directory>");
  }

  const ocr = NativeExtensions.macosVision.ocr({
    imagePath,
    recognitionLevel: "accurate",
    languages: ["zh-Hans", "en-US"]
  });
  console.log(JSON.stringify({ text: ocr.text }));
}

main();
