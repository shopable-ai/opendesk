// Deterministic P0 LLM HTTP protocol qualification. The loopback endpoint and
// credentials are supplied by tests/runtime-api/ai-runtime.js.
'use strict';

(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');

const protocol = Execution.env.OPENDESK_LLM_PROTOCOL;
const expectedText = protocol === 'openai-responses' ? 'responses-text' : 'chat-text';

const integerOutput = (validation) => ({
  type: 'json',
  name: 'integer_5_to_15',
  validation,
  schema: {
    type: 'object',
    properties: {value: {type: 'integer', minimum: 5, maximum: 15}},
    required: ['value'],
    additionalProperties: false,
  },
});

async function expectCode(options, expected) {
  let error = null;
  try {
    await LLM.generate(options);
  } catch (caught) {
    error = caught;
  }
  RuntimeAPITest.assert(error, 'expected LLM.generate to reject with ' + expected);
  RuntimeAPITest.equal(error.code, expected, String(error && error.stack || error));
  RuntimeAPITest.assert(!String(error.message).includes('fixture-secret'), 'error leaked Authorization credential');
  RuntimeAPITest.assert(!String(error.message).includes('must-not-leak'), 'error leaked raw fixture response');
  return error;
}

(() => {
  const {assert, equal, test} = RuntimeAPITest;

  test({
    name: 'LLM globals, capabilities, text result, and minimal metadata are stable',
    tier: 'unit',
    covers: ['LLM.getCapabilities', 'LLM.generate'],
  }, async () => {
    equal(typeof LLM, 'object');
    equal(typeof LLM.generate, 'function');
    equal(typeof LLM.getCapabilities, 'function');
    const caps = LLM.getCapabilities();
    equal(caps.enabled, true);
    equal(caps.configured, true);
    equal(caps.supported, true);
    equal(caps.checked, false);
    equal(caps.available, null);
    equal(caps.protocol, protocol);
    const result = await LLM.generate({prompt: 'CASE:text-ok'});
    equal(result.data, expectedText);
    equal(Object.keys(result).sort().join(','), 'data,meta');
    equal(result.meta.kind, 'llm');
    equal(result.meta.adapter, protocol);
    assert(result.meta.usage && typeof result.meta.usage === 'object');
    assert(!('raw' in result) && !('response' in result));

    const namedCaps = LLM.getCapabilities({profile: 'chat-profile'});
    equal(namedCaps.profile, 'chat-profile');
    equal(namedCaps.protocol, 'openai-chat-completions');
    equal(namedCaps.configured, true);
    const named = await LLM.generate({profile: 'chat-profile', prompt: 'CASE:text-ok'});
    equal(named.data, 'chat-text');
    equal(named.meta.profile, 'chat-profile');
    equal(named.meta.adapter, 'openai-chat-completions');
    equal(named.meta.requestedModel, 'fixture-profile-chat-model');
    equal(named.meta.model, 'fixture-chat');
  });

  test({
    name: 'LLM prompt/messages/system/generation mapping remains protocol-specific',
    tier: 'unit',
    covers: ['LLM.generate'],
  }, async () => {
    const result = await LLM.generate({
      messages: [
        {role: 'assistant', content: 'fixture-history'},
        {role: 'user', content: 'CASE:inspect'},
      ],
      system: 'fixture-system',
      generation: {maxOutputTokens: 77, reasoningEffort: 'low'},
    });
    const mapped = JSON.parse(result.data);
    if (protocol === 'openai-responses') {
      equal(mapped.hasInstructions, true);
      equal(mapped.messageCount, 2);
    } else {
      equal(mapped.hasSystem, true);
      equal(mapped.messageCount, 3);
    }
    equal(mapped.hasMaxTokens, true);
    equal(mapped.hasReasoning, true);
  });

  test({
    name: 'LLM structured output validates endpoints and rejects coercion or extraction',
    tier: 'unit',
    covers: ['LLM.generate'],
  }, async () => {
    for (const value of [5, 10, 15]) {
      const result = await LLM.generate({prompt: 'CASE:native-' + value, output: integerOutput('native')});
      equal(result.data.value, value);
    }
    for (const name of ['string', 'low', 'high', 'float', 'extra', 'missing']) {
      await expectCode({prompt: 'CASE:native-' + name, output: integerOutput('native')}, 'OUTPUT_VALIDATION_FAILED');
    }
    await expectCode({prompt: 'CASE:native-explanation', output: integerOutput('native')}, 'OUTPUT_PARSE_FAILED');
    const local = await LLM.generate({prompt: 'CASE:local-ok', output: integerOutput('local')});
    equal(local.data.value, 11);
    const calculator = await LLM.generate({
      prompt: '给定计算器真实显示值 100，返回一个 5 到 15 的整数。只决定增量，不执行计算器操作。',
      output: integerOutput('native'),
    });
    equal(calculator.data.value, 12);
  });

  test({
    name: 'LLM validates prompt/message exclusivity and input types before HTTP',
    tier: 'unit',
    covers: ['LLM.generate'],
  }, async () => {
    await expectCode({prompt: 'CASE:text-ok', messages: [{role: 'user', content: 'CASE:text-ok'}]}, 'INVALID_ARGUMENT');
    await expectCode({}, 'INVALID_ARGUMENT');
    await expectCode({prompt: 'CASE:text-ok', generation: {unknown: true}}, 'INVALID_ARGUMENT');
    await expectCode({prompt: 'CASE:text-ok', timeoutMs: '100'}, 'INVALID_ARGUMENT');
    await expectCode({prompt: 'CASE:text-ok', profile: 'missing'}, 'PROFILE_NOT_FOUND');
  });

  test({
    name: 'LLM rejects HTTP, incomplete, refusal, empty, and malformed protocol results',
    tier: 'unit',
    covers: ['LLM.generate'],
  }, async () => {
    await expectCode({prompt: 'CASE:http-error'}, 'HTTP_FAILED');
    const retried = await LLM.generate({prompt: 'CASE:retry-once'});
    equal(retried.data, expectedText);
    await expectCode({prompt: 'CASE:non-retriable'}, 'HTTP_FAILED');
    await expectCode({prompt: 'CASE:incomplete'}, 'PROTOCOL_INCOMPLETE');
    await expectCode({prompt: 'CASE:refusal'}, 'MODEL_REFUSAL');
    await expectCode({prompt: 'CASE:no-output'}, 'PROTOCOL_INCOMPLETE');
    await expectCode({prompt: 'CASE:protocol-error'}, 'PROTOCOL_ERROR');
    await expectCode({prompt: 'CASE:protocol-specific-invalid'}, protocol === 'openai-responses' ? 'PROTOCOL_INCOMPLETE' : 'PROTOCOL_ERROR');
    await expectCode({prompt: 'CASE:protocol-tool'}, 'PROTOCOL_ERROR');
    await expectCode({prompt: 'CASE:invalid-http-json'}, 'PROTOCOL_ERROR');
  });

  test({
    name: 'LLM timeout and AbortSignal cancel the owned HTTP request and reject late results',
    tier: 'unit',
    covers: ['LLM.generate'],
  }, async () => {
    const pre = new AbortController();
    pre.abort('before request');
    await expectCode({prompt: 'CASE:text-ok', signal: pre.signal}, 'CANCELED');
    await expectCode({prompt: 'CASE:timeout', timeoutMs: 60}, 'TIMEOUT');
    const controller = new AbortController();
    const pending = LLM.generate({prompt: 'CASE:cancel', timeoutMs: 2000, signal: controller.signal});
    setTimeout(() => controller.abort('fixture cancel'), 50);
    let error = null;
    try { await pending; } catch (caught) { error = caught; }
    assert(error && error.code === 'CANCELED', String(error));
  });
})();

await RuntimeAPITest.run('RUNTIME-API-LLM-' + protocol.toUpperCase());
