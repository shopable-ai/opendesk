// Focused unit-file gate. It does not execute or claim full catalog coverage.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, runJS, verifyZeroCleanup, noResidual } = context;
async function unitSelected() {
  const factory = (0, eval)(File.read(File.join(ROOT_DIR, 'tests/runtime-api/support/unit-selection.js')));
  const filter = Execution.env.OPENDESK_RUNTIME_API_UNIT_FILTER;
  const ids = factory().parse(filter);
  if (ids.includes('native-extension')) await context.invoke('prepareNativeExtension');
  await runJS('unit-selected', File.join(ROOT_DIR, 'tests/runtime-api/unit-selected.js'), 15, 240, {
    env: { OPENDESK_RUNTIME_API_UNIT_FILTER: filter },
  });
  await verifyZeroCleanup('unit-selected');
  await noResidual();
}
return Object.freeze({ unitSelected });
})
