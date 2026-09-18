// From repository root:
// ./dist/opendesk -script tests/recipes/qianniu-recipe-runtime.js -console-mode script
// SYNTHETIC gate: real Runtime parser + current pure Geometry; all desktop,
// clipboard, HTTP and draft methods are controlled doubles. Not live qualification.
const contractSource = File.read('tests/recipes/qianniu-recipe.contract.js');
const recipeSource = File.read('examples/app/qianniu-recipe.js');
const makeCases = new Function(contractSource + '\nreturn qianniuRecipeCases;')();
const cases = makeCases(recipeSource, Geometry);
let passed = 0;
for (const item of cases) {
  await item.run();
  passed++;
  console.log('QIANNIU_SYNTHETIC_PASS ' + item.name);
}
console.log('QIANNIU_SYNTHETIC_RESULT ' + JSON.stringify({
  passed: passed, total: cases.length, evidenceTier: 'synthetic', liveQianniuVerified: false,
}));
