// Shared assertions for the native http.download public contract. Loading this
// module is inert: fixture ownership and test execution stay with their entry
// scripts. Callers must load tests/runtime-api/crypto.js first.
(function createHTTPDownloadAssertions() {
'use strict';

function requireCondition(condition, message) {
  if (!condition) throw new Error(message || 'http.download assertion failed');
}

function verifyDownload(result, expected) {
  requireCondition(result && typeof result === 'object', 'download result is missing');
  requireCondition(result.committed === true, 'download result must be committed');
  requireCondition(result.status === 200, 'download status=' + result.status);
  requireCondition(result.path === expected.path, 'download path mismatch');
  requireCondition(result.bytesWritten === expected.bytesWritten, 'download bytesWritten=' + result.bytesWritten);
  requireCondition(result.sha256 === expected.sha256, 'download result sha256=' + result.sha256);
  requireCondition(File.isFile(expected.path), 'download destination is not a regular file');
  const bytes = new Uint8Array(File.readBytes(expected.path));
  requireCondition(bytes.length === expected.bytesWritten, 'downloaded file byte length=' + bytes.length);
  if (expected.verifyFileSHA !== false) {
    requireCondition(RuntimeAPICrypto.sha256(bytes) === expected.sha256, 'downloaded file SHA-256 mismatch');
  }
  return bytes;
}

function verifyDownloadError(error, code, status, committed) {
  requireCondition(error && typeof error === 'object', 'expected HTTPDownloadError');
  requireCondition(error.name === 'HTTPDownloadError', 'error name=' + error.name);
  requireCondition(error.operation === 'http.download', 'error operation=' + error.operation);
  requireCondition(error.code === code, 'error code=' + error.code + ' expected=' + code);
  if (status !== undefined) requireCondition(error.status === status, 'error status=' + error.status + ' expected=' + status);
  if (committed !== undefined) requireCondition(error.committed === committed, 'error committed=' + error.committed + ' expected=' + committed);
  return error;
}

async function expectDownloadError(action, code, status, committed) {
  let caught = null;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  requireCondition(caught, 'expected http.download rejection ' + code);
  return verifyDownloadError(caught, code, status, committed);
}

return Object.freeze({ verifyDownload, verifyDownloadError, expectDownloadError });
})()
