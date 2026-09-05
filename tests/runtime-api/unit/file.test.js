(() => {
  const { assert, equal, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('File');

  test({
    name: 'File methods complete an isolated create-write-copy-rename-move-remove lifecycle',
    tier: 'unit',
    covers: [
      'File.path', 'File.cwd', 'File.create', 'File.createIfNotExists', 'File.createWithDirs', 'File.exists', 'File.ensureDir',
      'File.read', 'File.readBytes', 'File.write', 'File.append', 'File.writeBytes', 'File.appendBytes', 'File.copy',
      'File.renameWithoutExtension', 'File.rename', 'File.move', 'File.getExtension', 'File.getName',
      'File.getNameWithoutExtension', 'File.remove', 'File.removeDir', 'File.listDir', 'File.isFile', 'File.isDir',
      'File.isEmptyDir', 'File.getHumanReadableSize', 'File.getSimplifiedPath', 'File.join',
    ],
  }, async () => {
    const root = `${Execution.artifactDir}/host-api-file-${Date.now()}`;
    const empty = File.join(root, 'empty');
    const nested = File.join(root, 'nested', 'created.txt');
    const source = File.join(root, 'source.txt');
    const copy = File.join(root, 'copy.txt');
    const moved = File.join(root, 'moved.bin');
    const blockingFile = File.join(root, 'not-a-directory');
    try {
      await File.ensureDir(empty);
      assert(await File.isDir(empty));
      assert(await File.isEmptyDir(empty));
      await File.create(source);
      await File.createIfNotExists(source);
      File.write(blockingFile, 'regular file');
      let createThroughFileFailed = false;
      try {
        File.createIfNotExists(File.join(blockingFile, 'child.txt'));
      } catch (_) {
        createThroughFileFailed = true;
      }
      assert(createThroughFileFailed, 'File.createIfNotExists must not hide filesystem errors');
      await File.createWithDirs(nested);
      const multilineText = `alpha
beta
`;
      equal(multilineText, ['alpha', 'beta', ''].join('\n'), 'multiline template literal value');
      await File.write(source, multilineText);
      await File.append(source, 'gamma');
      equal(await File.read(source), ['alpha', 'beta', 'gamma'].join('\n'));
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
      equal(File.cwd(), Execution.workdir);
      assert(File.getHumanReadableSize(1024).includes('KB'));
      assert(typeof File.getSimplifiedPath(`${root}/../${File.getName(root)}`) === 'string');
      await File.remove(moved);
      assert(!(await File.exists(moved)));
    } finally {
      if (await File.exists(root)) await File.removeDir(root);
    }
  });

  test({ name: 'File.open returns a constrained, usable FileHandle and rejects unsupported modes', tier: 'unit', covers: ['File.open'] }, async () => {
    const path = File.join(Execution.artifactDir, `file-handle-${Date.now()}.txt`);
    try {
      const writer = File.open(path, 'w');
      equal(typeof writer.close, 'function');
      equal(typeof writer.write, 'function');
      equal(typeof writer.writeBytes, 'function');
      equal(typeof writer.seek, 'function');
      equal(typeof writer.Chdir, 'undefined');
      equal(typeof writer.Fd, 'undefined');
      writer.write('alpha');
      writer.writeBytes([45, 66]);
      writer.sync();
      writer.close();
      writer.close();
      await expectThrow(() => writer.write('again'), 'file handle is closed');

      const reader = File.open(path, 'r');
      equal(reader.read(7), 'alpha-B');
      equal(reader.seek(0), 0);
      await expectThrow(() => reader.readBytes(6), 'file handle read exceeds maxBytes');
      const afterBoundedFailure = reader.readBytes(7);
      const afterFailureLength = afterBoundedFailure && (afterBoundedFailure.byteLength === undefined ? afterBoundedFailure.length : afterBoundedFailure.byteLength);
      equal(afterFailureLength, 7);
      equal(reader.seek(0), 0);
      const bytes = reader.readBytes(7);
      const byteLength = bytes && (bytes.byteLength === undefined ? bytes.length : bytes.byteLength);
      equal(byteLength, 7);
      reader.close();
      await expectThrow(() => File.open(path, 'invalid'), 'invalid file mode');

      // Do not close this handle: the formal unit gate checks the Runtime
      // cleanup event, which proves teardown owns forgotten File handles.
      const orphan = File.open(File.join(Execution.artifactDir, `file-handle-teardown-${Date.now()}.txt`), 'w');
      orphan.write('Runtime teardown closes this handle.');
    } finally {
      if (File.exists(path)) File.remove(path);
    }
  });
})();
