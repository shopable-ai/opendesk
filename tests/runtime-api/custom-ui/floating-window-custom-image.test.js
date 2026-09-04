(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const helper = FloatingToolbarTest;

  test({
    name: 'FloatingWindow accepts bounded script-local PNG/JPEG icons, preserves native states and rejects unsafe declarations',
    tier: 'custom-ui',
    covers: ['FloatingWindow.addButton', 'FloatingWindow.updateButton', 'FloatingWindow.getButtonState'],
  }, async () => {
    const generatedDir = File.join(RuntimeAPITest.context.runDir, 'generated');
    const sourcePNG = File.join(File.cwd(), 'examples/custom-ui/recording-console/icons/quick-spotlight.png');
    const sourceJPEG = File.join(File.cwd(), 'examples/custom-ui/recording-console/ApowerREC-more.jpeg');
    const iconPath = File.join(generatedDir, 'floating-window-custom-icon.png');
    const jpegPath = File.join(generatedDir, 'floating-window-custom-photo.jpeg');
    const mismatchPath = File.join(generatedDir, 'floating-window-custom-icon.jpg');
    const unsupportedPath = File.join(generatedDir, 'floating-window-custom-icon.svg');
    const oversizedPath = File.join(generatedDir, 'floating-window-custom-icon-oversized.png');
    const imageBytes = File.readBytes(sourcePNG);
    File.writeBytes(iconPath, imageBytes);
    File.writeBytes(jpegPath, File.readBytes(sourceJPEG));
    File.writeBytes(mismatchPath, imageBytes);
    File.writeBytes(unsupportedPath, imageBytes);
    File.writeBytes(oversizedPath, new Uint8Array(524289));

    const toolbar = new FloatingWindow({ x: 260, y: 180 });
    toolbar.addButton('original', 'Original custom image', {
      path: './floating-window-custom-icon.png',
    });
    toolbar.addButton('template', 'Template custom image', {
      path: './floating-window-custom-icon.png',
      renderingMode: 'template',
    });
    toolbar.addButton('jpeg', 'JPEG custom image', {
      path: './floating-window-custom-photo.jpeg',
    });
    toolbar.addButton('absolute', 'Contained absolute custom image', {
      path: iconPath,
    });
    toolbar.addButton('replace', 'Replace built-in image', 'gearshape.fill');

    const declared = await toolbar.getButtonState('original');
    equal(declared.icon.path, './floating-window-custom-icon.png');
    equal(declared.icon.renderingMode, 'original');
    equal(declared.iconPresentation.kind, 'image');
    equal(declared.iconPresentation.mediaType, 'image/png');
    equal(declared.iconPresentation.pixelWidth, 128);
    equal(declared.iconPresentation.pixelHeight, 128);
    equal(declared.iconPresentation.renderingMode, 'original');
    assert(!('dataBase64' in declared.iconPresentation), 'image presentation leaked encoded bytes');

    const shown = await toolbar.show();
    equal(shown.visible, true);
    const nativeOriginal = await helper.state(toolbar, 'original');
    const nativeTemplate = await helper.state(toolbar, 'template');
    const nativeJPEG = await helper.state(toolbar, 'jpeg');
    const nativeAbsolute = await helper.state(toolbar, 'absolute');
    equal(nativeOriginal.iconPresentation.kind, 'image');
    equal(nativeTemplate.iconPresentation.renderingMode, 'template');
    equal(nativeJPEG.iconPresentation.kind, 'image');
    equal(nativeJPEG.iconPresentation.mediaType, 'image/jpeg');
    equal(nativeJPEG.iconPresentation.pixelWidth, 738);
    equal(nativeJPEG.iconPresentation.pixelHeight, 354);
    equal(nativeAbsolute.icon.path, iconPath);
    equal(nativeAbsolute.iconPresentation.mediaType, 'image/png');
    await toolbar.updateButton('replace', {
      icon: { path: './floating-window-custom-icon.png', renderingMode: 'template' },
    });
    const replaced = await helper.state(toolbar, 'replace');
    equal(replaced.icon.path, './floating-window-custom-icon.png');
    equal(replaced.iconPresentation.kind, 'image');
    equal(replaced.iconPresentation.renderingMode, 'template');
    equal(nativeOriginal.accessibilityName, 'Original custom image');
    equal(nativeTemplate.accessibilityName, 'Template custom image');
    const defaultScreenshot = await helper.screenshot('custom-image-icons', shown.bounds);

    await toolbar.updateButton('original', { disabled: true });
    await toolbar.updateButton('template', { error: 'Template image error state' });
    const disabledOriginal = await helper.state(toolbar, 'original');
    const erroredTemplate = await helper.state(toolbar, 'template');
    equal(disabledOriginal.disabled, true);
    equal(disabledOriginal.iconPresentation.kind, 'image');
    equal(disabledOriginal.iconPresentation.renderingMode, 'original');
    equal(disabledOriginal.accessibilityName, 'Original custom image');
    equal(erroredTemplate.error, 'Template image error state');
    equal(erroredTemplate.iconPresentation.kind, 'image');
    equal(erroredTemplate.iconPresentation.renderingMode, 'template');
    equal(erroredTemplate.accessibilityName, 'Template custom image');
    for (const key of ['x', 'y', 'width', 'height']) {
      equal(disabledOriginal.localBounds[key], nativeOriginal.localBounds[key], 'disabled original image changed ' + key);
      equal(erroredTemplate.localBounds[key], nativeTemplate.localBounds[key], 'errored template image changed ' + key);
    }
    const stateScreenshot = await helper.screenshot('custom-image-icon-states', shown.bounds);
    await toolbar.close();

    const rejected = [];
    for (const icon of [
      { path: 'https://example.com/icon.png' },
      { path: '../../../../../examples/custom-ui/recording-console/icons/quick-spotlight.png' },
      { path: sourcePNG },
      { path: './floating-window-custom-icon.svg' },
      { path: './floating-window-custom-icon.jpg' },
      { path: './floating-window-custom-icon-oversized.png' },
      { path: './missing-custom-icon.png' },
      { path: './floating-window-custom-icon.png', renderingMode: 'multicolor' },
      { path: './floating-window-custom-icon.png', source: 'shadow-field' },
    ]) {
      const invalid = new FloatingWindow();
      const error = await helper.expectUIError(
        () => invalid.addButton('unsafe', 'Unsafe image', icon),
        'INVALID_SPEC',
        'FloatingWindow.addButton',
      );
      equal(error.capability, 'icon');
      rejected.push(icon.path);
    }

    helper.evidence.customImages = {
      status: 'passed',
      accepted: [
        'relative-png:original', 'relative-png:template', 'relative-jpeg:original',
        'contained-absolute-png', 'built-in-to-image-update',
        'original-disabled-opacity', 'template-error-tint',
      ],
      rejected: rejected.length,
      states: {
        disabledOriginal: { disabled: disabledOriginal.disabled, iconPresentation: disabledOriginal.iconPresentation, localBounds: disabledOriginal.localBounds },
        erroredTemplate: { error: erroredTemplate.error, iconPresentation: erroredTemplate.iconPresentation, localBounds: erroredTemplate.localBounds },
      },
      visuals: { default: defaultScreenshot, nativeStates: stateScreenshot },
    };
    helper.persist();
  });
})();
