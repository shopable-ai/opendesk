// Windows live ambiguity check using two repository-owned fixture processes
// with the exact same title.
(async () => {
  const title = System.getEnv('OPENDESK_WINDOW_AMBIGUOUS_TITLE');
  const evidencePath = '.runtime/tests/windows-compat/window-ambiguity-result.json';
  File.ensureDir('.runtime/tests/windows-compat');
  try {
    await window.wait({ title }, { timeout: 8000, polling: 50 });
    throw new Error('window.wait({title}) unexpectedly resolved while two exact-title fixtures exist');
  } catch (error) {
    if (!error || error.code !== 'AMBIGUOUS_TARGET') {
      await File.writeJSON(evidencePath, {
        schemaVersion: 1,
        suite: 'windows-window-manager-ambiguity',
        status: 'failed',
        title,
        error: { code: error && error.code || '', message: String(error && error.message || error) },
        recordedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  try {
    await window.get({ title });
    throw new Error('window.get({title}) unexpectedly resolved while two exact-title fixtures exist');
  } catch (error) {
    if (!error || error.code !== 'AMBIGUOUS_TARGET') throw error;
  }

  const rows = window.list({ title });
  if (!Array.isArray(rows) || rows.length !== 2) {
    throw new Error(`expected two ambiguous fixture rows, got ${rows && rows.length}`);
  }
  await File.writeJSON(evidencePath, {
    schemaVersion: 1,
    suite: 'windows-window-manager-ambiguity',
    status: 'passed',
    title,
    count: rows.length,
    pids: rows.map(row => row.pid).sort((a, b) => a - b),
    recordedAt: new Date().toISOString(),
  });
  console.log('WINDOW_MANAGER_AMBIGUITY_PASS');
})();
