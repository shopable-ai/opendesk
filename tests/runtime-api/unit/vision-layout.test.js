(() => {
  const { assert, test } = RuntimeAPITest;
  test({ name: 'Vision layout methods analyze and annotate a real Runtime screenshot', tier: 'unit', covers: ['Vision.analyzeLayout', 'Vision.annotateRegions'] }, async () => {
    const image = await Screen.screenshot({ clip: { x: 0, y: 0, width: 64, height: 64 }, returnType: 'base64' });
    assert(typeof image === 'string' && image.includes('base64,'), 'Screen did not return a base64 screenshot');
    const layout = await Vision.analyzeLayout({ image, cellSize: 8 });
    assert(layout && Array.isArray(layout.regions), 'Vision.analyzeLayout returned no regions');
    const annotated = await Vision.annotateRegions({ image, regions: layout.regions, separators: layout.separators });
    assert(annotated && annotated.width > 0 && typeof annotated.image === 'string', 'Vision.annotateRegions returned no image');
  });
})();
