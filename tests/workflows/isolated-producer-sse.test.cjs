'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseResponse } = require('./tools/isolated-producer.cjs');

const message = { id: 'msg_synthetic', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'SYNTHETIC_OK' }] };
const terminal = output => ({ type: 'response.completed', response: { id: 'resp_synthetic', object: 'response', model: 'gpt-6-astra', status: 'completed', output } });
const textDone = { type: 'response.output_text.done', output_index: 0, content_index: 0, item_id: message.id, text: 'SYNTHETIC_OK' };
const itemDone = { type: 'response.output_item.done', output_index: 0, item: message };
const delta = { type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: message.id, delta: 'SYNTHETIC_OK' };
function parse(events) {
  return parseResponse(Buffer.from(events.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join('') + 'data: [DONE]\r\n\r\n'), true);
}

for (const [name, events] of [
  ['item.done', [itemDone, terminal([])]],
  ['text.done', [textDone, terminal([])]],
  ['delta and text.done', [delta, textDone, terminal([])]],
  ['all snapshots deduplicated', [delta, textDone, itemDone, terminal([message])]],
]) {
  test(`SSE reconstructs ${name}`, () => assert.equal(parse(events).outputText, 'SYNTHETIC_OK'));
}

test('SSE preserves old empty projection without guessing', () => assert.equal(parse([terminal([])]).outputText, ''));
test('SSE output indexes determine order, not event arrival', () => {
  const later = { ...textDone, output_index: 2, item_id: 'msg_later', text: 'SECOND' };
  assert.equal(parse([later, textDone, terminal([])]).outputText, 'SYNTHETIC_OK\nSECOND');
});

for (const [name, events, code] of [
  ['missing completed', [textDone], 'invalid_response'],
  ['delta never finalized', [delta, terminal([])], 'response_text_not_finalized'],
  ['incomplete', [textDone, { type: 'response.incomplete' }], 'response_not_completed'],
  ['failed', [textDone, { type: 'response.failed' }], 'response_not_completed'],
  ['duplicate completed', [terminal([]), terminal([])], 'duplicate_completed_response'],
  ['conflicting item', [textDone, { ...itemDone, item: { ...message, content: [{ type: 'output_text', text: 'CONFLICT' }] } }, terminal([])], 'response_text_conflict'],
  ['conflicting delta', [{ ...delta, delta: 'CONFLICT' }, textDone, terminal([])], 'response_text_conflict'],
  ['conflicting id', [textDone, { ...itemDone, item: { ...message, id: 'other' } }, terminal([])], 'response_item_id_conflict'],
  ['tool event', [{ type: 'response.output_item.done', output_index: 0, item: { type: 'function_call' } }, terminal([])], 'unexpected_response_tool_or_item'],
  ['terminal tool', [terminal([{ type: 'function_call' }])], 'unexpected_response_tool_or_item'],
  ['non-assistant item', [{ ...itemDone, item: { ...message, role: 'user' } }, terminal([])], 'unexpected_response_tool_or_item'],
  ['invalid text index', [{ ...textDone, output_index: -1 }, terminal([])], 'invalid_response_index'],
  ['item still in progress', [{ ...itemDone, item: { ...message, status: 'in_progress' } }, terminal([])], 'response_not_completed'],
  ['text after completion', [terminal([]), textDone], 'event_after_completed_response'],
]) {
  test(`SSE rejects ${name}`, () => assert.throws(() => parse(events), { code }));
}
