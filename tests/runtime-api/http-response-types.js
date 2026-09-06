// Isolated loopback Runtime test for buffered response decoding and the axios
// request chain. Streaming file I/O belongs exclusively to http-download.js.
(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');

if (!globalThis.RUNTIME_API_FIXTURE) throw new Error('RUNTIME_API_FIXTURE was not injected for response-type tests');

(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const url = (suffix) => RUNTIME_API_FIXTURE.baseURL + suffix;
  test({
    name: '[HTTP-DOWNLOAD-001] http and axios preserve text, ArrayBuffer, defaults, params and headers',
    tier: 'unit',
    covers: ['http.request', 'http.get', 'axios.request', 'axios.get'],
  }, async () => {
    const text = await http.get(url('/download/json-looking-text'), { responseType: 'text' });
    equal(text.data, 'plain text that looks like json: {"not":"parsed"}');
    const raw = await http.request({ method: 'GET', url: url('/download/binary'), responseType: 'arraybuffer' });
    assert(raw.data instanceof ArrayBuffer, 'http arraybuffer response is not an ArrayBuffer');
    equal(JSON.stringify(Array.from(new Uint8Array(raw.data))), JSON.stringify([0, 255, 128, 79, 112, 101, 110, 68, 101, 115, 107, 10]));
    const axiosText = await axios.get(url('/download/json-looking-text'), { responseType: 'text', params: { source: 'axios' }, headers: { 'X-HTTP-Download-Test': 'present' } });
    equal(axiosText.data, 'plain text that looks like json: {"not":"parsed"}');
    const axiosDefault = await axios.get(url('/download/request-echo'), { params: { source: 'axios' }, headers: { 'X-HTTP-Download-Test': 'present' } });
    equal(axiosDefault.data.query, 'source=axios');
    equal(axiosDefault.data.header, 'present');
    await RuntimeAPITest.expectThrow(() => http.get(url('/download/binary'), { responseType: 'blob' }), 'unsupported responseType');
  });
})();

await RuntimeAPITest.run('RUNTIME-API-HTTP-RESPONSE-TYPES');
