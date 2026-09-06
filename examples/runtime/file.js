// From the repository root: ./opendesk -script examples/runtime/file.js -console-mode script
// Only creates files in a new directory under this Execution.artifactDir. No desktop or network access.
// Expected: [FILE-EXAMPLE] passed, plus input/copy/move/JSON artifacts. Reusing this directory is an error.
'use strict';
const directory = File.join(Execution.artifactDir, 'file-demo');
if (File.exists(directory)) throw new Error('File example directory already exists; start a new execution');
File.ensureDir(directory);
const input = File.join(directory, 'input.txt');
const copy = File.join(directory, 'copy.txt');
const moved = File.join(directory, 'moved.txt');
const text = `Hello from OpenDesk.
This text spans multiple lines.
`;
File.create(input);
File.write(input, text);
if (!File.isDir(directory) || !File.isFile(input) || File.read(input) !== text) {
  throw new Error('File example: create/write/read verification failed');
}
console.log('[FILE-EXAMPLE] multiline template literal round-trip passed');
File.copy(input, copy);
if (!File.isFile(copy) || File.read(copy) !== text) throw new Error('File example: copy verification failed');
File.move(copy, moved);
if (File.exists(copy) || !File.isFile(moved) || File.read(moved) !== text) {
  throw new Error('File example: move verification failed');
}
const jsonFile = File.join(directory, 'demo.json');
File.write(jsonFile, JSON.stringify({ ok: true }, null, 2));
if (JSON.parse(File.read(jsonFile)).ok !== true) throw new Error('File example: JSON text verification failed');
const entries = File.listDir(directory);
if (!Array.isArray(entries) || entries.length !== 3) throw new Error('File example: directory listing verification failed');
console.log('[FILE-EXAMPLE] passed ' + JSON.stringify({ directory, fileCount: entries.length }));
