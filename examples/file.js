// Create a file
File.create("test.txt");

// Write some content
File.write("test.txt", "Hello World!");

// Read the content
const content = File.read("test.txt");

console.log("test.txt file:", content);

// List directory contents
const entries = File.listDir(".");

// Check if path is a file or directory
const isFile = File.isFile("test.txt");
const isDir = File.isDir("somedir");

// Copy and move files
File.copy("test.txt", "dest.txt");
File.move("dest.txt", "new.txt");