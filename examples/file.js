// Run from the repository root:
// ./opendesk -script examples/file.js -console-mode script

const fileDemoDir = ".runtime/examples/file-demo";
const fileDemoInput = `${fileDemoDir}/test.txt`;
const fileDemoOutput = `${fileDemoDir}/new.txt`;
const multilineText = `Hello from OpenDesk.
This text spans multiple lines.
`;

// Create a file
File.ensureDir(fileDemoDir);
File.create(fileDemoInput);

// Write some content
File.write(fileDemoInput, multilineText);

// Read the content
const content = File.read(fileDemoInput);
if (content !== multilineText) {
  throw new Error('multiline template literal did not round-trip through File.write');
}
console.log('[FILE-EXAMPLE] multiline template literal round-trip passed');

console.log("file demo input:", content);

// List directory contents
const entries = File.listDir(".");
console.log("entries:", entries.slice(0, 10));

// Ensure a directory exists
File.write(File.join(fileDemoDir, "demo.json"), JSON.stringify({ ok: true }, null, 2));

// Check if path is a file or directory
const isFile = File.isFile(fileDemoInput);
const isDir = File.isDir(fileDemoDir);
console.log("isFile:", isFile, "isDir:", isDir);

// Copy and move files
File.copy(fileDemoInput, `${fileDemoDir}/dest.txt`);
File.move(`${fileDemoDir}/dest.txt`, fileDemoOutput);
