(() => {
  const { assert, equal, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('File');

  test({
    name: 'File methods complete an isolated create-write-copy-rename-move-remove lifecycle',
    tier: 'unit',
    covers: RuntimeAPIObjects.File.methods.filter((method) => method !== 'open').map((method) => `File.${method}`),
  }, async () => {
    const root = `${Execution.artifactDir}/host-api-file-${Date.now()}`;
    const empty = File.join(root, 'empty');
    const nested = File.join(root, 'nested', 'created.txt');
    const source = File.join(root, 'source.txt');
    const copy = File.join(root, 'copy.txt');
    const moved = File.join(root, 'moved.bin');
    try {
      await File.ensureDir(empty);
      assert(await File.isDir(empty));
      assert(await File.isEmptyDir(empty));
      await File.create(source);
      await File.createIfNotExists(source);
      await File.createWithDirs(nested);
      await File.write(source, 'alpha');
      await File.append(source, '-beta');
      equal(await File.read(source), 'alpha-beta');
      await File.writeBytes(nested, [65, 66]);
      await File.appendBytes(nested, [67]);
      const bytes = await File.readBytes(nested);
      const byteLength = bytes && (bytes.byteLength === undefined ? bytes.length : bytes.byteLength);
      assert(byteLength === 3, `bytes.byteLength=${byteLength}`);
      await File.copy(source, copy);
      await File.renameWithoutExtension(copy, 'copy-renamed');
      const renamedText = File.join(root, 'copy-renamed.txt');
      await File.rename(renamedText, 'renamed.bin');
      const renamed = File.join(root, 'renamed.bin');
      await File.move(renamed, moved);
      assert(await File.exists(moved) && await File.isFile(moved));
      assert((await File.listDir(root)).length >= 3);
      equal(File.getExtension(moved), '.bin');
      equal(File.getName(moved), 'moved.bin');
      equal(File.getNameWithoutExtension(moved), 'moved');
      assert(File.path('README.md').includes('README.md'));
      equal(File.cwd(), await System.getWorkingDirectory());
      assert(File.getHumanReadableSize(1024).includes('KB'));
      assert(typeof File.getSimplifiedPath(`${root}/../${File.getName(root)}`) === 'string');
      await File.remove(moved);
      assert(!(await File.exists(moved)));
    } finally {
      if (await File.exists(root)) await File.removeDir(root);
    }
  });

  test({ name: 'File.open rejects unsupported modes without touching a file', tier: 'unit', covers: ['File.open'] }, async () => {
    await expectThrow(() => File.open(`${Execution.artifactDir}/never-created`, 'invalid'), 'invalid file mode');
  });
})();
