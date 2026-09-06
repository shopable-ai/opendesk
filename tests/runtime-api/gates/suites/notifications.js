// notifications: suite implementation loaded by catalog-runner.js; not a standalone entry.
// Runtime assertions remain in their existing tests/runtime-api files.
(function createSuite(context) {
'use strict';
const { ROOT_DIR, CONTEXT, fail, readJSON, absolutePath, sha256, assertExecutable, updateContext, runJS } = context;

async function notifyIconLive() {
  const context = await readJSON(CONTEXT);
  if (context.environment.os !== 'Darwin') fail('macOS notify icon live test requires Darwin');
  const installed = absolutePath(String(Execution.env.OPENDESK_BINARY || '/Applications/OpenDesk.app/Contents/MacOS/opendesk'));
  await assertExecutable(installed, 'installed OpenDesk.app executable');
  if (!installed.endsWith('/OpenDesk.app/Contents/MacOS/opendesk')) fail(`notify-icon-live requires the executable inside OpenDesk.app: ${installed}`);
  const digest = await sha256(installed);
  await updateContext((value) => {
    value.binary = {
      path: installed, sha256: digest, buildSource: 'installed OpenDesk.app executable',
      provenance: 'installed_app', originalPath: installed, originalSha256: digest,
    };
  });
  await runJS('notify-icon-live', File.join(ROOT_DIR, 'tests', 'runtime-api', 'live', 'notify-icon.test.js'), 1, 60, {
    binary: installed,
  });
}

return Object.freeze({ notifyIconLive });
})
