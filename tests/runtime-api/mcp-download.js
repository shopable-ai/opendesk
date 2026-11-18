// Real Runtime contract cases. The host supplies only its task-owned loopback
// fixture and destination; it independently checks network and disk effects.
function check(value, message) {
  if (!value) throw new Error(`mcp-download: ${message}`);
}

async function rejected(promise, code) {
  let caught;
  try { await promise; } catch (error) { caught = error; }
  check(caught && caught.name === 'HTTPDownloadError', 'structured download error');
  check(caught.code === code, `expected ${code}, got ${caught && caught.code}`);
  check(caught.operation === 'http.download' && caught.committed === false, 'uncommitted failure');
  check(!String(caught.message).includes('PRIVATE_DOWNLOAD_GETTER'), 'private getter error is not exposed');
  return {code: caught.code, status: caught.status, committed: caught.committed};
}

const input = Execution.input;
check(input && /^http:\/\/127\.0\.0\.1:[1-9][0-9]*$/.test(input.baseURL), 'explicit loopback fixture required');
const url = input.baseURL + (input.endpoint || '/bytes');
const options = Object.assign({path: input.path}, input.options || {});
let result;
if (input.mode === 'getter') {
  Object.defineProperty(options, input.field, {get() {throw new Error('PRIVATE_DOWNLOAD_GETTER');}});
  let promise;
  try { promise = http.download(url, options); }
  catch (_) { throw new Error('download option getter must reject its Promise'); }
  check(promise && typeof promise.then === 'function', 'download returns a Promise');
  result = await rejected(promise, 'INVALID_ARGUMENT');
} else if (input.mode === 'abort' || input.mode === 'slots') {
  const count = input.mode === 'slots' ? 4 : 1;
  const controllers = Array.from({length: count}, () => new AbortController());
  const pending = controllers.map((controller, index) => rejected(http.download(url, Object.assign({}, input.options || {}, {
    path: input.path + index, signal: controller.signal, timeout: 0,
  })), 'CANCELED'));
  // The fixture releases this barrier only after all response headers have
  // been sent, ensuring cancellation occurs during body/header decoding.
  await http.get(input.baseURL + '/barrier/' + count);
  if (count === 4) await rejected(http.download(input.baseURL + '/bytes', {path: input.path + 'overflow'}), 'CONCURRENCY_LIMIT');
  for (const controller of controllers) controller.abort();
  result = {canceled: await Promise.all(pending)};
  result.reused = await http.download(input.baseURL + '/bytes', {path: input.path + 'reused'});
} else if (input.expectedError) {
  result = await rejected(http.download(url, options), input.expectedError);
} else {
  result = await http.download(url, options);
  check(result.committed && result.status === 200, 'successful commit');
}
console.log(JSON.stringify({test: 'mcp-download', result}));
