// The shell harness prepends NATIVE_PROCESS_TEST_CONFIG in a generated copy
// under .runtime. This tracked file remains free of machine-local paths.
const config = globalThis.NATIVE_PROCESS_TEST_CONFIG;
if (!config) throw new Error('NATIVE_PROCESS_TEST_CONFIG is required');

function errorView(error) {
  return {
    message: String(error && error.message ? error.message : error),
    code: error && error.code ? String(error.code) : '',
    extensionCode: error && error.extensionCode ? String(error.extensionCode) : '',
    extensionError: error && error.extensionError ? error.extensionError : null,
    evidence: error && error.evidence ? error.evidence : null,
  };
}

async function expectError(options) {
  try {
    await NativeExtension.call(options);
    throw new Error('expected NativeExtension.call to fail');
  } catch (error) {
    if (String(error && error.message ? error.message : error).includes('expected NativeExtension.call to fail')) {
      throw error;
    }
    return errorView(error);
  }
}

async function main() {
  const hello = await NativeExtension.call({
    extension: config.goExtensionName,
    method: 'hello',
    params: { name: 'OpenDesk' },
    timeoutMs: 3000,
  });
  const add = await NativeExtension.call({
    extension: config.goExtensionName,
    method: 'add',
    params: { a: 20, b: 22 },
    timeoutMs: 3000,
  });
  const ocr = await NativeExtension.call({
    extension: config.swiftExtensionName,
    method: 'ocr',
    params: {
      imagePath: config.ocrImage,
      recognitionLevel: 'accurate',
      languages: ['zh-Hans', 'en-US'],
    },
    timeoutMs: 10000,
  });
  const invalidParams = await expectError({
    extension: config.goExtensionName,
    method: 'add',
    params: { a: 20 },
    timeoutMs: 3000,
  });

  console.log('NATIVE_PROCESS_JS_RESULT ' + JSON.stringify({
    hello,
    add,
    ocr,
    invalidParams,
  }));
}

await main();
