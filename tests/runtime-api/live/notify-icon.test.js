(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));

const { assert, context, test } = RuntimeAPITest;

test({
  name: 'installed macOS runtime submits a notification for bundle icon inspection',
  tier: 'live',
  covers: ['global.notify'],
}, async () => {
  assert(context.environment && context.environment.os === 'Darwin', 'notify icon inspection requires macOS');
  const title = 'OpenDesk Notify 图标验证';
  const message = '已安装应用通知 · ' + context.runId;

  const result = notify({ title, message, sound: false });
  assert(result === undefined, 'notify should return undefined after native submission');
  console.log('[RUNTIME-API-NOTIFY-ICON] submitted ' + JSON.stringify({ title, message, runId: context.runId }));

  // Keep the installed app process alive long enough for an operator or CI host
  // to capture the transient system banner as visual evidence.
  await sleep(15000);
});

await RuntimeAPITest.run('RUNTIME-API-NOTIFY-ICON-LIVE');
