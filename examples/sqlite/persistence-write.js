// Run first, from the repository root:
// ./dist/opendesk -script examples/sqlite/persistence-write.js -console-mode script

function removeIfPresent(path) {
  if (File.exists(path)) File.remove(path);
}

async function main() {
  const outputDir = File.join('.runtime', 'tests', 'sqlite', 'persistence');
  const databasePath = File.join(outputDir, 'persistence.sqlite');
  const metadataPath = File.join(outputDir, 'writer-metadata.json');
  const executionID = globalThis.Execution && Execution.executionId ? String(Execution.executionId) : 'direct';
  const nonce = 'sqlite-persistence-' + executionID + '-' + Date.now() + '-' + Math.floor(Math.random() * 1_000_000_000);

  File.ensureDir(outputDir);
  // A reader only trusts metadata written after this writer closed the handle.
  removeIfPresent(metadataPath);
  for (const candidate of [databasePath, databasePath + '-journal', databasePath + '-wal', databasePath + '-shm']) {
    removeIfPresent(candidate);
  }

  const db = await SQLite.open({ path: databasePath, mode: 'rwc' });
  try {
    await db.exec('CREATE TABLE persistence_probe (id INTEGER PRIMARY KEY, nonce TEXT NOT NULL)');
    const write = await db.exec('INSERT INTO persistence_probe (id, nonce) VALUES (?, ?)', [1, nonce]);
    if (write.changes !== 1) throw new Error('persistence writer expected exactly one inserted row');
  } finally {
    await db.close();
  }

  File.write(metadataPath, JSON.stringify({ schemaVersion: 1, databasePath, nonce }, null, 2));
  console.log(JSON.stringify({ ok: true, databasePath, metadataPath, nonce }, null, 2));
}

await main();
