import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, EVIDENCE } from '../../lab/browser-automation-core/config.mjs';

export async function startFixture() {
  const directory = path.join(EVIDENCE, `fixture-${Date.now()}`); fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const instance = crypto.randomUUID();
  const verifierCredential = crypto.randomBytes(32).toString('hex'), records = new Map(), amounts = new Set();
  let confirmAttemptCount = 0;
  const evidenceFile = path.join(directory, 'submissions.json');
  const fixtureFiles = new Set(['order.html', 'order.js', 'frame.html', 'frame.js', 'resources.html', 'resources.js']);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const json = (status, data) => { res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(data)); };
    try {
      if (req.method === 'GET' && url.pathname === '/verifier') {
        if (req.headers.authorization !== `Bearer ${verifierCredential}`) return json(403, {error: 'FORBIDDEN'});
        const record = records.get(url.searchParams.get('orderId'));
        return json(200, record ? {instance, ...record, submissionCount: record.submissions.length, confirmAttemptCount} : {instance, submissionCount: 0, submissions: [], confirmAttemptCount});
      }
      const name = url.pathname === '/' ? 'order.html' : url.pathname.slice(1);
      if (req.method === 'GET' && fixtureFiles.has(name)) {
        res.writeHead(200, {'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store'});
        return res.end(fs.readFileSync(path.join(ROOT, 'tests/browser-automation-core/fixtures', name)));
      }
      if (req.method !== 'POST' || !['/query', '/confirm'].includes(url.pathname)) return json(404, {error: 'NOT_FOUND'});
      if (url.pathname === '/confirm') confirmAttemptCount++;
      let body = ''; for await (const bytes of req) { body += bytes; if (Buffer.byteLength(body) > 4096) return json(413, {error: 'TOO_LARGE'}); }
      const input = JSON.parse(body);
      if (typeof input.orderId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(input.orderId)) return json(400, {error: 'INVALID_ORDER'});
      if (url.pathname === '/query') {
        let record = records.get(input.orderId);
        if (!record) {
          let amount; do { amount = (crypto.randomInt(1000, 100000) / 100).toFixed(2); } while (amounts.has(amount)); amounts.add(amount);
          record = {orderId: input.orderId, amount, generatedAt: new Date().toISOString(), submissions: []}; records.set(input.orderId, record);
        }
        await new Promise(resolve => setTimeout(resolve, 80)); return json(200, {amount: record.amount});
      }
      const record = records.get(input.orderId);
      if (!record || typeof input.confirmation !== 'string') return json(400, {completed: false});
      record.submissions.push({confirmation: input.confirmation, recordedAmount: input.confirmation,
        accepted: input.confirmation === record.amount, timestamp: new Date().toISOString()});
      fs.writeFileSync(evidenceFile, JSON.stringify([...records.values()], null, 2), {mode: 0o600});
      return json(200, {completed: input.confirmation === record.amount, submissionCount: record.submissions.length});
    } catch { json(400, {error: 'INVALID_REQUEST'}); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {instance, origin, url: `${origin}/`, directory, evidenceFile, verifierCredential,
    close: () => new Promise(resolve => server.close(resolve))};
}
