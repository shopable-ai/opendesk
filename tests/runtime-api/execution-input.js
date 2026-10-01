// From the repository root:
// ./dist/opendesk ai run tests/runtime-api/execution-input.js --input-file tests/runtime-api/fixtures/execution-input.json
// Additional primitive cases use --input 'null', --input '232', --input '"0011"',
// --input '[232,1.25,true,null,"0011"]', or --input 'false'. No desktop APIs.
'use strict';
function check(value, message) { if (!value) throw new Error(message); }
const input = Execution.input;
if (input === null) {
  check(JSON.stringify(input) === 'null', 'Explicit JSON null became default object');
} else if (typeof input === 'number') {
  check(input === 232 && Number.isInteger(input), 'Root JSON number is not a primitive number');
} else if (typeof input === 'string') {
  check(input === '0011', 'String identity or leading zeros changed');
} else if (typeof input === 'boolean') {
  check(input === false, 'Root JSON boolean changed');
} else if (Array.isArray(input)) {
  check(input.length === 5 && input[0] === 232 && input[1] === 1.25 && input[2] === true
    && input[3] === null && input[4] === '0011', 'Root JSON array values/types changed');
} else {
  check(input && Object.getPrototypeOf(input) === Object.prototype, 'JSON object is not a plain JS object');
  check(typeof input.window.pid === 'number' && Number.isInteger(input.window.pid)
    && input.window.pid === 87465, 'Nested PID number exposed a Go object/string');
  check(input.window.width === 232 && input.window.height === 321, 'Nested dimensions changed type/value');
  check(input.decimal === 1.25 && input.exponent === 1000, 'Decimal/exponent semantics changed');
  check(Object.is(input.negativeZero, -0), 'Negative zero changed');
  check(input.safeInteger === 9007199254740991, 'Safe integer changed');
  check(input.identity === '0011' && input.largeIdentity === '9007199254740993', 'String identifiers changed');
  check(input.items[0] === 232 && input.items[1] === 1.25 && input.items[2] === true
    && input.items[3] === null && input.items[4] === '0011', 'Nested array values/types changed');
  const roundTrip = JSON.parse(JSON.stringify(input.window));
  check(roundTrip.pid === 87465 && roundTrip.width === 232 && roundTrip.height === 321, 'Numeric JSON round-trip changed');
}
console.log(JSON.stringify({executionInputContract: 'pass', inputType: input === null ? 'null' : typeof input}));
