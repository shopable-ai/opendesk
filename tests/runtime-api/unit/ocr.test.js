(() => {
  const { expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('OCR');
  test({ name: 'OCR.extractText rejects an empty image before provider selection', tier: 'unit', covers: ['OCR.extractText'] }, async () => {
    await expectThrow(() => OCR.extractText(''), 'cannot be empty');
  });
})();
