const fileDemoDir = ".runtime/temp/file-demo";
const fileDemoInput = `${fileDemoDir}/test.txt`;
const fileDemoOutput = `${fileDemoDir}/new.txt`;

// Create a file
File.ensureDir(fileDemoDir);
File.create(fileDemoInput);

// Write some content
File.write(fileDemoInput, "Hello World!");

// Read the content
const content = File.read(fileDemoInput);

console.log("file demo input:", content);

// List directory contents
const entries = File.listDir(".");
console.log("entries:", entries.slice(0, 10));

// Ensure a directory exists
File.write(".runtime/temp/file-demo/demo.json", JSON.stringify({ ok: true }, null, 2));

// Check if path is a file or directory
const isFile = File.isFile(fileDemoInput);
const isDir = File.isDir(".runtime/temp/file-demo");
console.log("isFile:", isFile, "isDir:", isDir);

// Copy and move files
File.copy(fileDemoInput, `${fileDemoDir}/dest.txt`);
File.move(`${fileDemoDir}/dest.txt`, fileDemoOutput);
