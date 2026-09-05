(() => {
  const { assert, equal, test } = RuntimeAPITest;

  async function expectCode(action, code, operation) {
    let caught = null;
    try {
      await action();
    } catch (error) {
      caught = error;
    }
    assert(caught, `expected ${code}`);
    equal(caught.code, code, `error code for ${operation}`);
    equal(caught.operation, operation, `error operation for ${operation}`);
    return caught;
  }

  test({
    name: 'File.readJSON and File.writeJSON persist JavaScript JSON values with documented defaults',
    tier: 'unit',
    covers: ['File.readJSON', 'File.writeJSON'],
  }, async () => {
    const root = File.join(Execution.artifactDir, 'file-json-' + Date.now());
    const target = File.join(root, 'nested path', 'unicode 雪', 'settings.json');
    try {
      const absent = File.join(root, 'absent.json');
      const promise = File.readJSON(absent, { defaultValue: false });
      assert(promise && typeof promise.then === 'function', 'readJSON must return a Promise');
      equal(await promise, false);
      equal(File.exists(absent), false, 'defaultValue must not create a file');
      equal(await File.readJSON(File.join(root, 'zero.json'), { defaultValue: 0 }), 0);
      equal(await File.readJSON(File.join(root, 'empty.json'), { defaultValue: '' }), '');
      equal(await File.readJSON(File.join(root, 'null.json'), { defaultValue: null }), null);

      await File.writeJSON(target, { enabled: true, unicode: '雪', list: [1, null, false] });
      equal(await File.read(target), '{\n  "enabled": true,\n  "unicode": "雪",\n  "list": [\n    1,\n    null,\n    false\n  ]\n}\n');
      const restored = await File.readJSON(target);
      assert(restored.enabled && restored.unicode === '雪' && restored.list.length === 3, 'round trip mismatch');

      await File.writeJSON(File.join(root, 'compact.json'), { n: NaN, infinity: Infinity, sparse: [, 2] }, { spaces: 0 });
      equal(await File.read(File.join(root, 'compact.json')), '{"n":null,"infinity":null,"sparse":[null,2]}\n');

      const primitiveValues = [true, false, 0, '', null, [1, 'two', false]];
      for (let index = 0; index < primitiveValues.length; index += 1) {
        const primitivePath = File.join(root, 'primitive-' + index + '.json');
        await File.writeJSON(primitivePath, primitiveValues[index]);
        const restoredPrimitive = await File.readJSON(primitivePath);
        if (Array.isArray(primitiveValues[index])) {
          assert(Array.isArray(restoredPrimitive) && restoredPrimitive.length === primitiveValues[index].length, 'array top-level value mismatch');
        } else {
          equal(restoredPrimitive, primitiveValues[index], 'primitive top-level value mismatch');
        }
      }

      await File.writeJSON(File.join(root, 'date.json'), { value: new Date('2024-01-02T03:04:05.000Z') }, { spaces: 0 });
      equal((await File.readJSON(File.join(root, 'date.json'))).value, '2024-01-02T03:04:05.000Z');
    } finally {
      if (File.exists(root)) File.removeDir(root);
    }
  });

  test({
    name: 'File JSON rejects invalid input, malformed files, depth and serialization without replacing prior content',
    tier: 'unit',
    covers: ['File.readJSON', 'File.writeJSON'],
  }, async () => {
    const root = File.join(Execution.artifactDir, 'file-json-errors-' + Date.now());
    const malformed = File.join(root, 'malformed.json');
    const invalidEncoding = File.join(root, 'invalid-encoding.json');
    const original = File.join(root, 'original.json');
    try {
      File.ensureDir(root);
      File.write(malformed, '{ invalid');
      File.writeBytes(invalidEncoding, [0xff, 0xfe]);
      await expectCode(() => File.readJSON(malformed), 'JSON_PARSE_FAILED', 'File.readJSON');
      await expectCode(() => File.readJSON(root, { defaultValue: { fallback: true } }), 'UNSUPPORTED_FILE_TYPE', 'File.readJSON');
      await expectCode(() => File.readJSON(invalidEncoding), 'INVALID_ENCODING', 'File.readJSON');
      await expectCode(() => File.readJSON(''), 'INVALID_ARGUMENT', 'File.readJSON');
      await expectCode(() => File.readJSON('nul\x00path'), 'INVALID_ARGUMENT', 'File.readJSON');
      await expectCode(() => File.readJSON(malformed, { unknown: true }), 'INVALID_ARGUMENT', 'File.readJSON');
      await expectCode(() => File.readJSON(malformed, { maxBytes: 0 }), 'INVALID_ARGUMENT', 'File.readJSON');
      await expectCode(() => File.readJSON(malformed, { get maxBytes() { throw new Error('read option accessor'); } }), 'INVALID_ARGUMENT', 'File.readJSON');

      const tooDeep = '['.repeat(129) + '0' + ']'.repeat(129);
      File.write(File.join(root, 'deep.json'), tooDeep);
      await expectCode(() => File.readJSON(File.join(root, 'deep.json')), 'JSON_DEPTH_EXCEEDED', 'File.readJSON');
      await expectCode(() => File.writeJSON(File.join(root, 'write-deep.json'), JSON.parse(tooDeep)), 'JSON_DEPTH_EXCEEDED', 'File.writeJSON');

      await File.writeJSON(original, { state: 'before' });
      const circular = {}; circular.self = circular;
      await expectCode(() => File.writeJSON(original, circular), 'JSON_SERIALIZATION_FAILED', 'File.writeJSON');
      await expectCode(() => File.writeJSON(original, undefined), 'JSON_SERIALIZATION_FAILED', 'File.writeJSON');
      await expectCode(() => File.writeJSON(original, { toJSON() { throw new Error('toJSON failure'); } }), 'JSON_SERIALIZATION_FAILED', 'File.writeJSON');
      equal((await File.readJSON(original)).state, 'before');
      await expectCode(() => File.writeJSON(File.join(root, 'missing', 'no.json'), { ok: true }, { createDirs: false }), 'FILE_NOT_FOUND', 'File.writeJSON');
      await expectCode(() => File.writeJSON(original, { ok: true }, { spaces: 11 }), 'INVALID_ARGUMENT', 'File.writeJSON');
      await expectCode(() => File.writeJSON(original, { ok: true }, { get spaces() { throw new Error('write option accessor'); } }), 'INVALID_ARGUMENT', 'File.writeJSON');
    } finally {
      if (File.exists(root)) File.removeDir(root);
    }
  });

  test({
    name: 'File JSON honors BOM, byte budgets, AbortSignal cancellation, and Execution workdir',
    tier: 'unit',
    covers: ['File.readJSON', 'File.writeJSON'],
  }, async () => {
    const root = File.join(Execution.artifactDir, 'file-json-boundaries-' + Date.now());
    try {
      File.ensureDir(root);
      const bom = File.join(root, 'bom.json');
      File.writeBytes(bom, [0xef, 0xbb, 0xbf, 116, 114, 117, 101]);
      equal(await File.readJSON(bom), true);
      await expectCode(() => File.readJSON(bom, { maxBytes: 3 }), 'FILE_TOO_LARGE', 'File.readJSON');
      await expectCode(() => File.writeJSON(File.join(root, 'small.json'), { text: '12345' }, { maxBytes: 5 }), 'FILE_TOO_LARGE', 'File.writeJSON');
      const controller = new AbortController();
      controller.abort();
      await expectCode(() => File.writeJSON(File.join(root, 'canceled.json'), { ok: true }, { signal: controller.signal }), 'CANCELED', 'File.writeJSON');
      equal(File.cwd(), Execution.workdir);
      assert(File.path('relative-file-json-check').startsWith(Execution.workdir), 'File relative path must use Execution.workdir');
    } finally {
      if (File.exists(root)) File.removeDir(root);
    }
  });
})();
