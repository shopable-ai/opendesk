// Formal Runtime contract test. The MCP harness supplies an isolated .runtime
// fixture directory and independently checks the resulting files with Node.
function check(value, message) {
  if (!value) throw new Error(`mcp-file: ${message}`);
}
function throws(action, message) {
  let error;
  try { action(); } catch (caught) { error = caught; }
  check(error && typeof error.message === 'string', message);
}
const root = Execution.input.root;
check(typeof root === 'string' && File.isDir(root), 'existing fixture root');
const at = name => File.join(root, name);
const bytes = value => Array.from(new Uint8Array(value));

// Same-path, hard-link and symlink aliases must not truncate their source.
for (const target of ['copy-source', 'copy-hard-link', 'copy-symbolic-link']) {
  throws(() => File.copy(at('copy-source'), at(target)), 'copy same inode is rejected');
  check(File.read(at('copy-source')) === 'copy-fixture-original', 'copy source preserved');
}
check(File.copy(at('copy-source'), at('copy-destination')) === undefined, 'copy return');
check(File.read(at('copy-destination')) === 'copy-fixture-original', 'normal copy overwrites');

check(File.create(at('created.txt')) === undefined, 'create returns undefined');
File.appendBytes(at('created.txt'), [65, 0, 255]);
check(JSON.stringify(bytes(File.readBytes(at('created.txt')))) === '[65,0,255]', 'create and append');
File.create(at('created.txt'));
check(File.readBytes(at('created.txt')).byteLength === 0, 'create truncates existing file');
File.createIfNotExists(at('kept.bin'));
File.appendBytes(at('kept.bin'), [1, 2]);
File.createIfNotExists(at('kept.bin'));
File.appendBytes(at('kept.bin'), new Uint8Array([128, 255]));
File.appendBytes(at('kept.bin'), new Uint8Array([0, 65]).buffer);
check(JSON.stringify(bytes(File.readBytes(at('kept.bin')))) === '[1,2,128,255,0,65]', 'all byte input forms and preserve existing');
File.appendBytes(at('empty.bin'), []);
check(File.readBytes(at('empty.bin')).byteLength === 0, 'empty append creates');
File.ensureDir(at('existing-dir'));
check(Array.isArray(File.listDir(at('existing-dir'))) && File.listDir(at('existing-dir')).length === 0, 'empty listDir is an array');
File.createIfNotExists(at('existing-dir'));
check(File.isDir(at('existing-dir')), 'existing directory unchanged');
throws(() => File.create(at('missing-parent/a')), 'create missing parent');
throws(() => File.createIfNotExists(at('missing-parent/a')), 'conditional create missing parent');
throws(() => File.create(at('existing-dir')), 'create directory');
throws(() => File.appendBytes(at('existing-dir'), [1]), 'append directory');
throws(() => File.appendBytes(at('missing-parent/a'), [1]), 'append missing parent');

File.create(at('source.tar.gz'));
File.appendBytes(at('source.tar.gz'), [9, 8]);
check(File.renameWithoutExtension(at('source.tar.gz'), 'renamed') === undefined, 'renameWithoutExtension return');
check(!File.exists(at('source.tar.gz')) && File.exists(at('renamed.gz')), 'only final extension kept');
check(File.rename(at('renamed.gz'), 'renamed.final') === undefined, 'rename return');
File.ensureDir(at('directory-before'));
File.rename(at('directory-before'), 'directory-after');
throws(() => File.rename(at('missing'), 'unused'), 'rename absent source');
throws(() => File.renameWithoutExtension(at('missing'), 'unused'), 'renameWithoutExtension absent source');
throws(() => File.rename(at('renamed.final'), 'missing-parent/unavailable'), 'rename missing target parent');

check(File.getExtension('archive.tar.gz') === '.gz', 'last extension');
check(File.getExtension('plain') === '' && File.getExtension('.env') === '.env', 'absent and dotfile extensions');
check(File.getName(at('archive.tar.gz')) === 'archive.tar.gz', 'basename');
check(File.getName('') === '.', 'empty basename');
check(File.getNameWithoutExtension(at('archive.tar.gz')) === 'archive.tar', 'remove final extension');
check(File.getNameWithoutExtension('.env') === '', 'dotfile name');
check(File.getSimplifiedPath('one/./two/../three') === File.join('one', 'three'), 'lexical clean');
check(File.getSimplifiedPath('') === '.', 'empty clean');
check(File.getHumanReadableSize(0) === '0 B' && File.getHumanReadableSize(1023) === '1023 B', 'byte units');
check(File.getHumanReadableSize(1024) === '1.0 KB' && File.getHumanReadableSize(1536) === '1.5 KB', '1024 units');
check(File.getHumanReadableSize(1048576) === '1.0 MB' && File.getHumanReadableSize(-1) === '-1 B', 'megabyte and negative');

File.create(at('removed-file'));
check(File.remove(at('removed-file')) === undefined, 'remove return');
throws(() => File.remove(at('removed-file')), 'remove absent path');
File.ensureDir(at('removed-empty-dir'));
File.remove(at('removed-empty-dir'));
File.ensureDir(at('tree/child'));
File.create(at('tree/child/file'));
throws(() => File.remove(at('tree')), 'remove nonempty directory');
check(File.removeDir(at('tree')) === undefined, 'recursive remove return');
File.removeDir(at('tree'));
File.create(at('removeDir-file'));
File.removeDir(at('removeDir-file'));
// Final symlinks are supplied by the harness; deleting them must leave the
// independent referents intact. No system or user paths are used.
File.remove(at('file-link'));
File.removeDir(at('directory-link'));
console.log(JSON.stringify({test: 'mcp-file', ok: true, root}));
