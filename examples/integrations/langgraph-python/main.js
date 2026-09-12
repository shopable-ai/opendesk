'use strict';

// Minimal direction A:
// OpenDesk JavaScript owner -> Python/LangGraph decision worker -> validated data.
// This file intentionally does not start a second OpenDesk execution.

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object`);
  }
  return value;
}

function validateResponse(value, requestId) {
  const response = requireObject(value, 'response');
  const expectedKeys = ['data', 'error', 'ok', 'requestId', 'schemaVersion'];
  const actualKeys = Object.keys(response).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error('Python response fields do not match the bridge contract');
  }
  if (response.schemaVersion !== 1) throw new Error('Python response schemaVersion must be 1');
  if (response.requestId !== requestId) throw new Error('Python response requestId mismatch');
  if (response.ok !== true) {
    const failure = requireObject(response.error, 'response.error');
    throw new Error(`Python decision failed: ${String(failure.code)}: ${String(failure.message)}`);
  }
  if (response.error !== null) throw new Error('Successful Python response.error must be null');
  return requireObject(response.data, 'response.data');
}

function requireIncrement(value) {
  if (!Number.isInteger(value) || value < 5 || value > 15) {
    throw new Error('Python increment must be an integer between 5 and 15');
  }
  return value;
}

const python = Execution.env.OPENDESK_LANGGRAPH_PYTHON;
if (!python) {
  throw new Error(
    'Set OPENDESK_LANGGRAPH_PYTHON to the integration virtualenv Python executable'
  );
}
if (!Execution.scriptDir) throw new Error('This example requires a file-backed script');

const worker = File.join(Execution.scriptDir, 'decision.py');
const requestId = `${Execution.id}:decision`;
const baseResult = 100;
const request = {
  schemaVersion: 1,
  requestId,
  data: {baseResult, minimum: 5, maximum: 15},
};

const result = await Command.run(python, [worker], {
  cwd: Execution.scriptDir,
  input: JSON.stringify(request),
  timeout: 30000,
  maxOutputBytes: 256 * 1024,
});

let response;
try {
  response = JSON.parse(result.stdout);
} catch (error) {
  throw new Error('Python worker stdout must contain one JSON response');
}

const data = validateResponse(response, requestId);
const increment = requireIncrement(data.value);

console.log(
  `[DONE] Python/LangGraph returned increment=${increment}, source=${String(data.source || 'unknown')}`
);
