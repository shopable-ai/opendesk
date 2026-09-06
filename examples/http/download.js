// From the repository root:
// ./dist/opendesk -script examples/http/download.js -console-mode script
//
// This public example intentionally uses a small read-only HTTPS document. It
// writes only below .runtime/tests/http-download/<runId>/ and does not send
// credentials, request headers, or a request body.
'use strict';

const runId = Execution.id;
const outputDir = File.join(Execution.workdir, '.runtime', 'tests', 'http-download', runId, 'example');
const outputPath = File.join(outputDir, 'example.com.html');
File.ensureDir(outputDir);

console.log('[HTTP-DOWNLOAD-EXAMPLE] step=download-start');
try {
  const result = await http.download('https://www.example.com/', {
    path: outputPath,
    timeout: 30000,
    maxBytes: 1024 * 1024,
  });
  console.log('[HTTP-DOWNLOAD-EXAMPLE] ' + JSON.stringify({
    status: 'success',
    path: result.path,
    bytesWritten: result.bytesWritten,
    sha256: result.sha256,
    committed: result.committed,
  }));
} catch (error) {
  console.error('[HTTP-DOWNLOAD-EXAMPLE] ' + JSON.stringify({
    status: 'failed',
    code: error && error.code || 'UNKNOWN',
    operation: error && error.operation || 'http.download',
    committed: Boolean(error && error.committed),
  }));
  throw error;
}
