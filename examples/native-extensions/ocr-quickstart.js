function main() {
  // The public OCR example is run from <program-directory>. The input image is
  // intentionally outside the extension bundle: it is caller-owned business
  // data, not executable/plugin installation content.
  const ocr = NativeExtensions.macosVision.ocr({
    imagePath: File.path("./ocr-test.png"),
    recognitionLevel: "accurate",
    languages: ["zh-Hans", "en-US"]
  });
  console.log(JSON.stringify({ text: ocr.text }));
}

main();
