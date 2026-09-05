// Focused JavaScript authoring baseline. Run from the repository root:
// OPENDESK_RUNTIME_API_MODE=language ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
'use strict';

const checks = [];

function check(name, condition) {
  if (!condition) throw new Error(`JavaScript language check failed: ${name}`);
  checks.push(name);
}

// ES2015 (ES6)
let mutable = 1;
const offset = 2;
mutable += offset;
const collect = (head = 0, ...tail) => [head, ...tail];
const [first, ...tail] = collect(3, 4, 5);
const { label, nested: { value } } = { label: 'baseline', nested: { value: 6 } };

class Counter {
  constructor(initial) {
    this.value = initial;
  }

  increment() {
    this.value += 1;
    return this.value;
  }
}

const unique = new Set([1, 2, 2]);
const keyed = new Map([['counter', new Counter(6)]]);
let total = 0;
for (const item of unique) total += item;
check('es2015-core', mutable === 3
  && first === 3
  && tail.join(',') === '4,5'
  && label === 'baseline'
  && value === 6
  && total === 3
  && typeof Promise === 'function'
  && keyed.get('counter').increment() === 7);

const template = `first=${first}
literal=\${NAME}
`;
check('es2015-template-literal', template === ['first=3', 'literal=${NAME}', ''].join('\n'));

// ES2016 (ES7)
check('es2016', 2 ** 5 === 32 && [1, 2, 3].includes(2));

// ES2017 (ES8)
const asyncValue = await (async () => Promise.resolve(7))();
const entrySource = { alpha: 1, beta: 2 };
check('es2017', asyncValue === 7
  && Object.keys(entrySource).join(',') === 'alpha,beta'
  && Object.values(entrySource).join(',') === '1,2'
  && Object.entries(entrySource)[1].join('=') === 'beta=2');

// ES2018
const { omitted, ...remaining } = { omitted: 0, kept: 8 };
const merged = { ...remaining, added: 9 };
check('es2018', omitted === 0 && merged.kept === 8 && merged.added === 9);

// ES2019
const rebuilt = Object.fromEntries([['left', 10], ['right', 11]]);
const flattened = [1, 2].flatMap((item) => [item, item * 10]);
check('es2019', rebuilt.left === 10
  && rebuilt.right === 11
  && flattened.join(',') === '1,10,2,20');

// ES2020
const nestedValue = { result: { value: 12 } };
const absent = null;
check('es2020', nestedValue?.result?.value === 12
  && (absent?.result ?? 'fallback') === 'fallback'
  && (0 ?? 13) === 0
  && globalThis === globalThis.globalThis
  && 1n + 2n === 3n
  && (await Promise.allSettled([Promise.resolve(1), Promise.reject(new Error('expected'))]))[1].status === 'rejected');

// ES2021
let assigned = 0;
assigned ||= 14;
const anyValue = await Promise.any([Promise.reject(new Error('expected')), Promise.resolve(15)]);
check('es2021', 10_000 === 10000
  && assigned === 14
  && anyValue === 15
  && 'aa'.replaceAll('a', 'b') === 'bb');

// ES2022
class ModernCounter {
  publicValue = 16;

  #secret = 17;

  static total = 18;

  static {
    this.total += 1;
  }

  readSecret() {
    return this.#secret;
  }
}

const modern = new ModernCounter();
const caused = new Error('outer', { cause: 'inner' });
check('es2022', modern.publicValue === 16
  && modern.readSecret() === 17
  && ModernCounter.total === 19
  && Object.hasOwn(modern, 'publicValue')
  && [18, 19].at(-1) === 19
  && caused.cause === 'inner');

// ES2023
const copySource = [3, 1, 2];
check('es2023', copySource.findLast((item) => item < 3) === 2
  && copySource.findLastIndex((item) => item < 3) === 2
  && copySource.toSorted().join(',') === '1,2,3'
  && copySource.toReversed().join(',') === '2,1,3'
  && copySource.toSpliced(1, 1, 4).join(',') === '3,4,2'
  && copySource.with(1, 5).join(',') === '3,5,2'
  && copySource.join(',') === '3,1,2');

// OpenDesk script host behavior; this is not ESM top-level await.
check('opendesk-script-level-await', asyncValue === 7);

console.log(`[RUNTIME-JS-LANGUAGE] ${JSON.stringify({ status: 'passed', checks })}`);
