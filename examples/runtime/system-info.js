// This example intentionally prints detailed local system information.
// Review the output before sharing logs because some fields can identify the host or user.
console.log('System Info:', System.getSystemInfo());
console.log('Process list:', System.getProcessList());
console.log('Network interfaces:', System.getNetworkInterfaces());
console.log('System metrics:', System.getSystemMetrics());
console.log('Directory contents:', System.getDirectoryContents('.'));
console.log('User info:', System.getUserInfo());
console.log('Hardware fingerprint:', System.getFingerprint());
