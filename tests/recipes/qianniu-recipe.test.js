'use strict';
// Host-side synthetic checks only. This is not a Qianniu or OpenDesk live run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const source = read('examples/app/qianniu-recipe.js');
const sandbox = vm.createContext({});
vm.runInContext('globalThis.mouse = {click: function(){throw new Error("no real input");}};', sandbox);
vm.runInContext(read('polyfills/005-geometry.js'), sandbox);
vm.runInContext(read('tests/recipes/qianniu-recipe.contract.js'), sandbox);
test('ordinary Recipe remains a single explicit async main, with no send/ship/input fallback', () => {
  assert.doesNotThrow(() => new vm.Script('(async function(){\n' + source + '\n})'));
  assert.match(source, /await main\(\);\s*$/);
  assert.doesNotMatch(source, /\b(?:keyboard|mouse|ImageColor)\s*\.|window\.(?:setHeight|closeWindow)|while\s*\(true\)|\b(?:require|import)\s*\(/);
  assert.doesNotMatch(source, /\.tapText\(\s*['"](?:发送|发货|确认发货|确定发货)['"]/);
});
for (const item of sandbox.qianniuRecipeCases(source, sandbox.Geometry)) test(item.name, item.run);
