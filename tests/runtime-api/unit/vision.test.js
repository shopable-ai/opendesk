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
})();
