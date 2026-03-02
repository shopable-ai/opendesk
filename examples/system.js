
// Get complete system information
const sysInfo = System.getSystemInfo();
console.log('System Info:', sysInfo);

await sleep(500);

// 测试进程列表
console.log("Getting process list...");
const processes = System.getProcessList();
console.log("Process list:", processes);
await sleep(500);

// 测试网络接口
console.log("Getting network interfaces...");
const interfaces = System.getNetworkInterfaces();
console.log("Network interfaces:", interfaces);
await sleep(500);

// 测试系统指标
console.log("Getting system metrics...");
const metrics = System.getSystemMetrics();
console.log("System metrics:", metrics);
await sleep(500);

// 测试目录内容
console.log("Getting directory contents...");
const contents = System.getDirectoryContents(".");
console.log("Directory contents:", contents);
await sleep(500);

// 测试用户信息
console.log("Getting user info...");
const userInfo = System.getUserInfo();
console.log("User info:", userInfo);
await sleep(500);

// 测试硬件指纹
console.log("Getting hardware fingerprint...");
const fingerprint = System.getFingerprint();
console.log("Hardware fingerprint:", fingerprint);
await sleep(500);

console.log("System testing complete!");
