// Create a file
File.create("test.txt");

// Write some content
File.write("test.txt", "Hello World!");

// Read the content
const content = File.read("test.txt");

console.log("test.txt file:", content);

// List directory contents
const entries = File.listDir(".");
console.log("entries:", entries.slice(0, 10));

// Ensure a directory exists
File.ensureDir("temp/file-demo");
File.write("temp/file-demo/demo.json", JSON.stringify({ ok: true }, null, 2));

// Check if path is a file or directory
const isFile = File.isFile("test.txt");
const isDir = File.isDir("temp/file-demo");
console.log("isFile:", isFile, "isDir:", isDir);

// Copy and move files
File.copy("test.txt", "dest.txt");
File.move("dest.txt", "new.txt");
