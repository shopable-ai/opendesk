// Host-owned files only; rejected limits must not advance the handle.
const input = Execution.input;
function check(value, message) { if (!value) throw new Error(message); }
if (input.scenario === 'file-handle') {
  File.write('limit.txt', 'x');
  const invalid = [[1.5], ['1'], [null], [undefined], [NaN], [Infinity], [0], [8388609], [1, 2], [new Number(1)], [Symbol('limit')], [1n]];
  for (const method of ['read', 'readBytes']) {
    for (const args of invalid) {
      const handle = File.open('limit.txt', 'r');
      try {
        let error;
        try { handle[method](...args); } catch (caught) { error = caught; }
        check(error && /maxBytes/.test(error.message), `${method} must reject invalid maxBytes`);
        check(handle.seek(0, 'current') === 0, 'invalid limit advanced handle');
        check(handle.read(1) === 'x', 'valid integer read after rejection');
      } finally { handle.close(); }
    }
    const handle = File.open('limit.txt', 'r');
    try {
      const result = handle[method]();
      check(method === 'read' ? result === 'x' : result instanceof ArrayBuffer && new Uint8Array(result)[0] === 120, 'omitted default');
    } finally { handle.close(); }
  }
  console.log(JSON.stringify({test: 'mcp-data-boundaries', scenario: input.scenario, rejected: invalid.length * 2}));
} else if (input.scenario === 'crypto') {
  const backing = new ArrayBuffer(8);
  const fake = {constructor: {name: 'Uint8Array'}, buffer: backing, byteOffset: 0, byteLength: 8};
  const revoked = Proxy.revocable(new Uint8Array(backing), {}); revoked.revoke();
  for (const value of [fake, Object.create(Uint8Array.prototype), new DataView(backing), new Float32Array(backing), new Float64Array(backing),
    new Proxy(new Uint8Array(backing), {}), revoked.proxy, Symbol('random'), 1n]) {
    let error;
    try { crypto.getRandomValues(value); } catch (caught) { error = caught; }
    check(error instanceof TypeError, 'crypto must reject non-integer TypedArray');
  }
  check(Array.from(new Uint8Array(backing)).every(value => value === 0), 'rejected crypto input changed bytes');
  const floatName = Object.getOwnPropertyDescriptor(Float32Array, 'name');
  try {
    Object.defineProperty(Float32Array, 'name', {value: 'Uint8Array'});
    let error;
    try { crypto.getRandomValues(new Float32Array(2)); } catch (caught) { error = caught; }
    check(error instanceof TypeError, 'constructor rename cannot authorize float array');
  } finally { Object.defineProperty(Float32Array, 'name', floatName); }
  const integerName = Object.getOwnPropertyDescriptor(Uint8Array, 'name');
  try {
    Object.defineProperty(Uint8Array, 'name', {value: 'Float32Array'});
    const view = new Uint8Array(2);
    check(crypto.getRandomValues(view) === view, 'constructor rename cannot reject integer array');
  } finally { Object.defineProperty(Uint8Array, 'name', integerName); }
  for (const Type of [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, BigInt64Array, BigUint64Array]) {
    const view = new Type(2);
    check(crypto.getRandomValues(view) === view, 'integer TypedArray identity');
  }
  let tooLarge;
  try { crypto.getRandomValues(new Uint8Array(65537)); } catch (error) { tooLarge = error; }
  check(tooLarge instanceof RangeError, 'random byte limit');
  const maximum = new Uint8Array(65536);
  check(crypto.getRandomValues(maximum) === maximum, 'exact random byte limit');
  const all = new Uint8Array(12); all.fill(0x5a);
  const view = new Uint8Array(all.buffer, 4, 4);
  Object.defineProperties(view, {
    constructor: {value: {name: 'Float64Array'}},
    buffer: {get() {throw new Error('shadow buffer must not be read');}},
    byteOffset: {value: 0}, byteLength: {value: 12},
    [Symbol.toStringTag]: {value: 'Float64Array'},
  });
  check(crypto.getRandomValues(view) === view, 'crypto preserves valid view identity');
  const multiByteView = new Uint16Array(all.buffer, 4, 2);
  check(crypto.getRandomValues(multiByteView) === multiByteView, 'multi-byte offset view identity');
  check(Array.from(all.slice(0, 4)).every(value => value === 0x5a) &&
    Array.from(all.slice(8)).every(value => value === 0x5a), 'crypto wrote outside actual view');
  // Do not assert random values differ: that would introduce a probabilistic failure.
  console.log(JSON.stringify({test: 'mcp-data-boundaries', scenario: input.scenario, bytes: Array.from(all)}));
} else if (input.scenario === 'path') {
  const observed = {};
  for (const key of ['sep', 'delimiter']) {
    const descriptor = Object.getOwnPropertyDescriptor(path, key);
    check(descriptor.writable === false && descriptor.configurable === false, `${key} must be read-only`);
    observed[key] = path[key];
    check(Reflect.set(path, key, 'invalid') === false && path[key] === observed[key], `${key} mutation`);
    check(Reflect.deleteProperty(path, key) === false, `${key} deletion`);
  }
  console.log(JSON.stringify({test: 'mcp-data-boundaries', scenario: input.scenario, observed}));
} else { throw new Error('explicit scenario required'); }
