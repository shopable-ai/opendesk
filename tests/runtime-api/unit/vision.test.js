(() => {
  const { assert, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('OCR');
  RuntimeAPITest.contractObject('Vision');

  test({ name: 'OCR.extractText rejects empty input before invoking tesseract', tier: 'unit', covers: ['OCR.extractText'] }, async () => {
    await expectThrow(() => OCR.extractText(''), 'cannot be empty');
  });

  test({ name: 'Vision.getCapabilities returns provider metadata', tier: 'unit', covers: ['Vision.getCapabilities'] }, async () => {
    const result = await Vision.getCapabilities({});
    assert(result && Array.isArray(result.providers) && typeof result.providerCount === 'number', JSON.stringify(result));
  });

  test({ name: 'Vision.runOCR uses packaged Apple Vision accurately on macOS', tier: 'unit', covers: ['Vision.runOCR', 'Vision.detectUI'] }, async () => {
    const platform = await System.getPlatformInfo();
    if (platform.os !== 'darwin') return;

    const caps = await Vision.getCapabilities({ provider: 'apple' });
    const apple = caps && caps.providers && caps.providers[0];
    assert(apple && apple.provider === 'apple' && apple.available === true, JSON.stringify(caps));
    assert(caps.defaultProvider === 'apple', JSON.stringify(caps));

    const fixture = File.path('tests/extensions/native-process/fixtures/ocr/opendesk-ocr-123.png');
    const result = await Vision.runOCR({ imagePath: fixture, lang: 'ch', includeRaw: true });
    assert(result.provider === 'apple', JSON.stringify(result));
    assert(result.text.includes('OPENDESK OCR 123') && result.text.includes('你好 456'), JSON.stringify(result));
    assert(result.lineCount >= 2, JSON.stringify(result));
    assert(result.lines.every((line) => line.bbox.x >= 0 && line.bbox.y >= 0 && line.bbox.width > 0 && line.bbox.height > 0), JSON.stringify(result));
    assert(result.raw && result.raw.backend === 'Apple Vision', JSON.stringify(result));

    const detected = await Vision.detectUI({ imagePath: fixture, provider: 'apple', lang: 'ch', targetText: '你好', minConfidence: 0.4 });
    assert(detected.count >= 1 && detected.elements[0].bbox.width > 0 && detected.elements[0].clickPoint.x > 0, JSON.stringify(detected));
  });
})();
