(0, eval)(File.read(File.join(File.cwd(), 'tests/runtime-api/framework.js')));
RuntimeAPITest.load('tests/runtime-api/manifest.js');

const processPath = File.join(RuntimeAPITest.context.runDir, 'processes.json');
const processRecord = File.exists(processPath) ? JSON.parse(File.read(processPath)) : { records: [] };
const expected = (processRecord.records || []).filter((record) => ['runtime', 'watchdog', 'fixture-server'].includes(record.role) && Number(record.pid) > 0);
const active = await System.getProcessList();
const activePids = new Set(active.map((process) => Number(process.pid)));
const leaked = expected.filter((record) => activePids.has(Number(record.pid)));
const result = {
  status: leaked.length === 0 ? 'passed' : 'failed',
  confirmed: leaked.length === 0,
  records: expected,
  leaked,
  checkedAt: new Date().toISOString(),
};
RuntimeAPITest.writeGate('cleanup', result);
console.log('[RUNTIME-API-CLEANUP RESULT] ' + JSON.stringify(result));
if (!result.confirmed) throw new Error('Runtime API cleanup failed: ' + JSON.stringify(leaked));
