const fileDemoDir = ".runtime/temp/file-demo";
const fileDemoInput = `${fileDemoDir}/test.txt`;
const fileDemoOutput = `${fileDemoDir}/new.txt`;

File.ensureDir(fileDemoDir);
File.create(fileDemoInput);
File.write(fileDemoInput, "Hello World!");

const content = File.read(fileDemoInput);
console.log("file demo input:", content);

const entries = File.listDir(".");
console.log("entries:", entries.slice(0, 10));

File.write(`${fileDemoDir}/demo.json`, JSON.stringify({ ok: true }, null, 2));

const isFile = File.isFile(fileDemoInput);
const isDir = File.isDir(fileDemoDir);
console.log("isFile:", isFile, "isDir:", isDir);

File.copy(fileDemoInput, `${fileDemoDir}/dest.txt`);
File.move(`${fileDemoDir}/dest.txt`, fileDemoOutput);
