'use strict';

// Python/LangGraph -> OpenDesk Agent.run -> strict request-scoped result file.

function requireExactKeys(value, expected, name) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${name} fields do not match the bridge contract`);
  }
}

function requireJSONInteger(value, name) {
  let normalized = value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value).sort();
    const hostNumberKeys = ['Float64', 'Int64', 'String'];
    const isHostJSONNumber = JSON.stringify(keys) === JSON.stringify(hostNumberKeys)
      && hostNumberKeys.every((key) => typeof value[key] === 'function');
    if (!isHostJSONNumber) throw new Error(`${name} must be an integer`);
    const raw = String(value);
    if (!/^-?(?:0|[1-9]\d*)$/.test(raw)) throw new Error(`${name} must be an integer`);
    normalized = Number(raw);
  }
  if (!Number.isSafeInteger(normalized)) throw new Error(`${name} must be an integer`);
  return normalized;
}

function requireText(value, name, maximumLength = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximumLength) {
    throw new Error(`${name} must be a non-empty string no longer than ${maximumLength} characters`);
  }
  return value;
}

function requireBridgeInput() {
  const input = Execution.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Execution.input must be an object');
  }
  requireExactKeys(input, ['schemaVersion', 'requestId', 'data', 'meta'], 'Execution.input');
  if (requireJSONInteger(input.schemaVersion, 'schemaVersion') !== 1) {
    throw new Error('schemaVersion must be 1');
  }
  if (typeof input.requestId !== 'string' || !input.requestId || input.requestId.length > 256) {
    throw new Error('requestId must be a non-empty string');
  }
  if (!input.data || typeof input.data !== 'object' || Array.isArray(input.data)) {
    throw new Error('data must be an object');
  }
  requireExactKeys(input.data, [
    'baseExpression',
    'decisionInstruction',
    'humanGoal',
    'maximum',
    'minimum',
    'verifiedBaseResult',
  ], 'data');
  const humanGoal = requireText(input.data.humanGoal, 'data.humanGoal');
  const baseExpression = requireText(input.data.baseExpression, 'data.baseExpression', 200);
  const verifiedBaseResult = requireJSONInteger(
    input.data.verifiedBaseResult,
    'data.verifiedBaseResult',
  );
  const decisionInstruction = requireText(
    input.data.decisionInstruction,
    'data.decisionInstruction',
  );
  const minimum = requireJSONInteger(input.data.minimum, 'data.minimum');
  const maximum = requireJSONInteger(input.data.maximum, 'data.maximum');
  if (minimum > maximum) throw new Error('data.minimum must be <= data.maximum');
  if (!input.meta || typeof input.meta !== 'object' || Array.isArray(input.meta)) {
    throw new Error('meta must be an object');
  }
  requireExactKeys(input.meta, ['resultPath'], 'meta');
  const resultPath = input.meta.resultPath;
  if (
    typeof resultPath !== 'string'
    || !/^\.runtime\/external-workflow-results\/[A-Za-z0-9._-]+\.json$/.test(resultPath)
  ) {
    throw new Error('meta.resultPath is outside the bridge result namespace');
  }
  return {
    requestId: input.requestId,
    resultPath,
    humanGoal,
    baseExpression,
    verifiedBaseResult,
    decisionInstruction,
    minimum,
    maximum,
  };
}

function response(requestId, ok, data, error) {
  return {schemaVersion: 1, requestId, ok, data, error};
}

async function writeFailure(contract, error) {
  if (!contract) return;
  try {
    await File.writeJSON(
      contract.resultPath,
      response(contract.requestId, false, null, {
        code: String(error && error.code || error && error.name || 'AGENT_DECISION_ERROR'),
        message: String(error && error.message || error || 'Agent decision failed'),
      }),
    );
  } catch (_) {
    // Preserve the original Agent.run failure.
  }
}

let contract = null;
try {
  contract = requireBridgeInput();
  const result = await Agent.run({
    prompt: [
      `Human goal: ${contract.humanGoal}`,
      `Verified desktop state: macOS Calculator displays ${contract.verifiedBaseResult} after ${contract.baseExpression}.`,
      `Decision instruction: ${contract.decisionInstruction}`,
      `Required bounds: ${contract.minimum} through ${contract.maximum}, inclusive.`,
      `Correlation requestId: ${contract.requestId}.`,
      'Only decide the integer. Do not use tools or act on the desktop.',
    ].join('\n'),
    output: {
      type: 'json',
      name: 'langgraph_integer_decision',
      validation: 'native',
      schema: {
        type: 'object',
        properties: {
          value: {type: 'integer', minimum: contract.minimum, maximum: contract.maximum},
        },
        required: ['value'],
        additionalProperties: false,
      },
    },
    timeoutMs: 120000,
  });
  if (
    !result
    || !result.data
    || !Number.isSafeInteger(result.data.value)
    || result.data.value < contract.minimum
    || result.data.value > contract.maximum
    || !result.meta
    || typeof result.meta !== 'object'
    || Array.isArray(result.meta)
  ) {
    throw new Error('Agent.run returned an invalid decision');
  }
  await File.writeJSON(
    contract.resultPath,
    response(contract.requestId, true, {
      value: result.data.value,
      source: 'opendesk-agent',
      meta: result.meta,
    }, null),
  );
  console.log(`[DONE] Agent.run selected a validated integer for requestId=${contract.requestId}`);
} catch (error) {
  await writeFailure(contract, error);
  throw error;
}
