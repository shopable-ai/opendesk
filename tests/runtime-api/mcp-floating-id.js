// Formal Runtime contract for an explicitly Custom-UI-authorized execution
// (leader: resources-authorized MCP session), without showing native UI.
// Only constructs declarations and reads id; never invokes any instance method,
// native host, permission request or desktop operation. No input is required.
// A pass proves constructor/id behavior only, never Custom UI host availability.
// Disabled ordinary MCP executions do not inject FloatingWindow; the leader's
// disabled diagnostic asserts absence separately, not by running this case.
// Prior disabled-execution failure evidence is retained at:
// .runtime/tests/mcp-contracts/1794989601034-sY8Oyv
function check(value, message) {
  if (!value) throw new Error(`mcp-floating-id: ${message}`);
}

function constructorError(options, code) {
  let failure;
  try { new FloatingWindow(options); } catch (error) { failure = error; }
  check(failure && failure.code === code, `constructor must throw ${code}`);
  check(failure.operation === 'FloatingWindow.constructor', 'constructor error operation');
  check(failure.capability === 'id', 'constructor error capability');
}

check(typeof FloatingWindow === 'function',
  'requires explicit host Custom UI authorization and constructor injection; use resources-authorized, not disabled ordinary MCP');
const explicit = new FloatingWindow({ id: ' \tMcp_contract-Id\n ' });
check(explicit.id === 'Mcp_contract-Id', 'explicit id trims surrounding whitespace and preserves case');
check(explicit.id === 'Mcp_contract-Id', 'repeated id reads are stable');

// Do not assume the execution counter begins at one: other declarations may
// already exist. These adjacent constructions must allocate distinct ids.
const generated = [
  new FloatingWindow().id,
  new FloatingWindow({}).id,
  new FloatingWindow({ id: '' }).id,
  new FloatingWindow({ id: ' \t\n ' }).id,
];
check(generated.every((id) => typeof id === 'string' && /^floating-toolbar-[1-9][0-9]*$/.test(id)),
  'omitted, empty and whitespace ids use the generated form');
check(new Set(generated).size === generated.length, 'generated ids are unique');

const longest = `M${'a'.repeat(63)}`;
check(new FloatingWindow({ id: longest }).id === longest, '64-character id is valid');
for (const id of ['1bad', 'bad id', 'bad/id', 'bad\\id', 'bad.id', 'bad\u0000id', `M${'a'.repeat(64)}`]) {
  constructorError({ id }, 'INVALID_SPEC');
}
constructorError({ id: 'Mcp_contract-Id' }, 'DUPLICATE_ID');
constructorError({ id: '  Mcp_contract-Id  ' }, 'DUPLICATE_ID');
constructorError({ id: generated[0] }, 'DUPLICATE_ID');
check(explicit.id === 'Mcp_contract-Id', 'failed constructions preserve the original id');

console.log(JSON.stringify({
  test: 'mcp-floating-id', ok: true,
  explicitNormalized: true, generatedUnique: true,
  invalidRejected: true, duplicateRejected: true,
  scope: 'constructor-and-id-only',
}));
