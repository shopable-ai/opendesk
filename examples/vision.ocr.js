/**
 * OCR + UI detect demo.
 *
 * Required env:
 *   VISION_OCR_PROVIDER=paddle
 *   PADDLE_OCR_ENDPOINT=http://127.0.0.1:8868/predict/ocr_system
 */
(async () => {
  const caps = await Vision.getCapabilities({});
  console.log("Vision providers:", JSON.stringify(caps.providers, null, 2));

  // User-selected language. You can set this from UI dropdown.
  const selectedLang = "ch";
  const visionProfile = {
    provider: "paddle",
    language: selectedLang,
    minConfidence: 0.5,
    timeoutMs: 15000,
  };

  const imageBase64 = await page.screenshot({
    fullPage: true,
    encoding: "base64",
  });

  const ocr = await Vision.runOCR({
    visionProfile,
    image: imageBase64,
  });
  console.log("OCR lines:", ocr.lineCount, "lang:", ocr.lang);

  const sendButtons = await Vision.detectUI({
    visionProfile,
    image: imageBase64,
    targetText: "发送",
    matchMode: "contains",
  });

  console.log("Detected elements:", sendButtons.count);
  if (sendButtons.count > 0) {
    const target = sendButtons.elements[0];
    console.log("Try click:", JSON.stringify(target));
    await mouse.click(target.clickPoint.x, target.clickPoint.y);
  }
})();
