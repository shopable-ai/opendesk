// Disposable, operator-owned loopback echo fixture; never a production Desktop HTTP service.
import {createServer} from 'node:http';

export function createEchoServer() {
  return createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if (req.url === '/headers') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({fixture: 'scrapyjs-headers-v1', headers: {
        accept: req.headers.accept ?? null,
        'accept-language': req.headers['accept-language'] ?? null,
        'user-agent': req.headers['user-agent'] ?? null,
        // An unexpected authorization header is observable to the test fixture only.
        authorizationPresent: Boolean(req.headers.authorization),
        cookiePresent: Boolean(req.headers.cookie),
      }}));
      return;
    }
    if (req.url === '/html') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><body>owned fixture</body></html>'); return; }
    if (req.url === '/rows') { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify([{id: 1}, {id: 2}])); return; }
    if (req.url === '/oversized') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<html>' + 'X'.repeat(16384) + '</html>'); return; }
    if (req.url === '/redirect-cross-origin') { res.writeHead(302, {Location: 'https://example.org/'}); res.end(); return; }
    res.writeHead(404); res.end();
  });
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const server = createEchoServer();
  server.listen(43111, '127.0.0.1', () => console.log('ScrapyJS owned fixture: http://127.0.0.1:43111'));
  for (const name of ['SIGINT', 'SIGTERM']) process.on(name, () => server.close(() => process.exit(0)));
}
