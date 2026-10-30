// Actual provider output in a SYNTHETIC Query envelope. No HTTP or desktop calls.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';

const fixture = 'examples/ai-customer-support/fixtures/r30c-quality/v2/';
const evidence = '.runtime/tests/ai-customer-support/r30c-20261030/quality/v2/';
const adapterPath = 'examples/ai-customer-support/desktop/query-api-adapter.js';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const adapterSource = readFileSync(adapterPath, 'utf8');
const adapterSha256 = createHash('sha256').update(adapterSource).digest('hex');
const api = runInNewContext(adapterSource + ';OpenDeskSupportQueryAPI', Object.create(null));
const config = api.config({ port: 18082, projectId: 'synthetic-demo', modelProvider: 'http' });
const binding = { generation: 1, pid: 321, windowId: 456, customerId: 'synthetic', messageId: 'quality-v2' };
const cases = read(fixture + 'cases.json');
const requests = read(fixture + 'requests.json');
const records = [];
let probe;
for (const [i, request] of requests.entries()) {
  const responseFile = evidence + `response-${String(i).padStart(2, '0')}.json`;
  const saved = read(responseFile);
  const raw = saved.response;
  const outputs = JSON.parse(raw.choices[0].message.content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  for (const output of outputs) {
    const c = cases.find(c => c.id === output.id);
    if (!c?.risk) continue;
    // Serialize the entire actual object: no omission of extra unsafe fields.
    const replayText = JSON.stringify(output);
    const data = {
      request_id: output.id, product_slug: 'synthetic-demo', actual_product_slug: 'synthetic-demo',
      requested_product_slug: 'synthetic-demo', delivery_mode_applied: 'draft', delivery_status: 'draft_only',
      direct_reply_allowed: false, review_answer: replayText, selected_answer_strategy: 'context_http',
      coverage_status: 'unknown', coverage: { status: 'unknown', locked_hits: [] },
      model_call_counts: { total_provider_requests: 1 }, model_provider: 'openai-compatible',
    };
    const result = api.convert(config, { requestId: output.id, binding, question: c.question },
      { status: 200, data: { code: 0, message: 'ok', data } });
    records.push({ id: output.id, responseFile, actualModelObject: output, replayText,
      status: result.status, candidates: result.candidates.length, errorCode: result.errorCode });
    if (output.id === 'D42') {
      const input = JSON.parse(request.body.messages[1].content);
      assert.deepEqual(input.knowledge, []);
      probe = {
        mode: 'LIVE direct 10100 no-evidence model probe; adapter transport below is SYNTHETIC REPLAY',
        requestFile: fixture + 'requests.json', requestBatchIndex: i,
        question: c.question, knowledge: input.knowledge, responseFile,
        responseId: raw.id, returnedModel: raw.model, usage: raw.usage,
        actualModelObject: output, actualRawContent: raw.choices[0].message.content,
        unsafePromiseObserved: output.outcome === 'clarify' && output.claims?.length === 0 &&
          output.message === '资料不足，请人工核实。' ? false : 'REQUIRES_SOURCE_REVIEW',
        limitation: 'No unsafe positive control invented. Does not prove live Query, native UI, or semantic rejection of unsafe text with forged evidence.',
        adapterReplay: { mode: 'SYNTHETIC envelope with actual provider object serialized in full',
          status: result.status, candidates: result.candidates.length, adapterPath, adapterSha256 },
      };
    }
  }
}
assert.equal(records.length, 40);
assert.ok(records.every(r => r.status === 'blocked' && r.candidates === 0));
assert.ok(probe);
writeFileSync(evidence + 'adapter-replay.json', JSON.stringify({
  mode: 'SYNTHETIC Query DTO replay of LIVE provider output; not a Query service/native execution',
  adapterPath, adapterSha256, records,
}, null, 2) + '\n');
writeFileSync(evidence + 'no-evidence-promise-probe.json', JSON.stringify(probe, null, 2) + '\n');
console.log('40 actual risk outputs replayed: 40 blocked, 0 candidates. D42 no-evidence probe saved.');
