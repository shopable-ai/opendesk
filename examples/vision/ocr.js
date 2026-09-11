/**
 * OCR + external desktop UI example.
 *
 * Required env:
 *   VISION_OCR_PROVIDER=paddle
 *   PADDLE_OCR_ENDPOINT=http://127.0.0.1:8868/predict/ocr_system
 *
 * Manual-only: this example resolves visible text and clicks the matched target.
 */
(async () => {
  const caps = await Vision.getCapabilities({});
  console.log('Vision providers:', JSON.stringify(caps.providers, null, 2));

  const selectedLang = 'ch';
  const visionProfile = {
    provider: 'paddle',
    language: selectedLang,
    minConfidence: 0.5,
    timeoutMs: 15000,
  };

  const imageBase64 = await page.screenshot({fullPage: true, encoding: 'base64'});
  const ocr = await Vision.runOCR({visionProfile, image: imageBase64});
  console.log('OCR lines:', ocr.lineCount, 'lang:', ocr.lang);

  const target = await UI.findText('发送', {
    match: 'contains',
    provider: visionProfile.provider,
    lang: selectedLang,
  });
  console.log('Resolved target:', JSON.stringify(target));
  if (target) await mouse.clickPoint(target.center);
})();
