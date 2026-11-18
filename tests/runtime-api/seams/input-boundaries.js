// Runs with keyboard and Screen bound by the owner to recording backends.
(() => {
  function equal(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(JSON.stringify({actual, expected}));
    }
  }

  function rejects(call, message, readCalls) {
    const before = readCalls();
    let error;
    try {
      call();
    } catch (caught) {
      error = caught;
    }
    if (!error || !String(error).includes(message)) {
      throw new Error(`Expected ${message}, got ${error}`);
    }
    equal(readCalls(), before);
  }

  const keys = () => inputBoundaryCalls().keys;
  const pixels = () => inputBoundaryCalls().pixels;
  for (const operation of ['press', 'down', 'up']) {
    rejects(() => keyboard[operation]('unknown-key'), 'unsupported key', keys);
    rejects(() => keyboard[operation]('  '), 'key cannot be empty', keys);
    for (const value of [1, true, null, undefined, new String('a'), {toString: () => 'a'}]) {
      rejects(() => keyboard[operation](value), 'must be a string', keys);
    }
  }
  rejects(() => page.keyboard.press('unknown-key'), 'unsupported key', keys);
  rejects(() => keyboard.combination(), 'no keys provided', keys);
  rejects(() => keyboard.combination('Shift', 'unknown-key'), 'unsupported key', keys);
  rejects(() => keyboard.combination('unknown-key'), 'unsupported key', keys);
  rejects(() => keyboard.combination('Shift', 1), 'must be a string', keys);
  rejects(() => keyboard.combination(new String('Shift'), 'p'), 'must be a string', keys);
  for (const modifier of ['p', 'unknown-key', '', 'none', 'CapsLock']) {
    rejects(() => keyboard.combination('Meta', modifier, 'q'), 'invalid modifier', keys);
  }
  keyboard.press('Enter');
  page.keyboard.down('Shift');
  page.keyboard.up('Shift');
  keyboard.combination('a');
  page.keyboard.combination('Meta', 'Control', 'RShift', 'Q');
  keyboard.press('NumpadDivide');
  rejects(() => keyboard.press('F24'), 'fixture backend refused key', pixels);
  equal(keys(), [
    ['enter', '', []], ['shift', 'down', []], ['shift', 'up', []], ['a', '', []],
    ['q', '', ['cmd', 'ctrl', 'rshift']], ['num/', '', []], ['F24', '', []],
  ]);

  rejects(() => Screen.pixels(), 'points must be an array', pixels);
  for (const list of [null, false, '12', {0: [1, 2], length: 1}, new Int8Array([1, 2])]) {
    rejects(() => Screen.pixels(list), 'points must be an array', pixels);
  }
  for (const point of [
    null, 1, [1], [1, 2, 3], [1, ,], {x: 1}, {y: 2}, [null, 1], [true, 2],
    ['12', 2], [1n, 2], {x: NaN, y: 1}, [1, Infinity], [1, -Infinity],
    [2147483648, 2], [-2147483649, 2],
  ]) {
    rejects(() => Screen.pixels([[42, 43], point]), 'points[1]', pixels);
  }
  rejects(() => Screen.pixels(new Array(1)), 'points[0]', pixels);
  equal(Screen.pixels([]), []);
  equal(pixels(), []);
  equal(Screen.pixels([[1.9, -2.9], {x: -2147483648, y: 2147483647}, [0, 0]], false),
    ['#aabbcc', '#ddeeff', '']);
  equal(pixels(), [[1, -2], [-2147483648, 2147483647], [0, 0]]);
})();
