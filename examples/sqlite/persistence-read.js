// Run after persistence-write.js exits with status 0, from the repository root:
// ./dist/opendesk -script examples/sqlite/persistence-read.js -console-mode script

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const metadataPath = File.join('.runtime', 'tests', 'sqlite', 'persistence', 'writer-metadata.json');
  assert(File.exists(metadataPath), 'persistence metadata is missing; run persistence-write.js successfully first');
  const metadata = JSON.parse(File.read(metadataPath));
  assert(metadata && typeof metadata.databasePath === 'string' && metadata.databasePath.length > 0, 'writer metadata has no databasePath');
  assert(typeof metadata.nonce === 'string' && metadata.nonce.length > 0, 'writer metadata has no nonce');
  assert(File.exists(metadata.databasePath), 'writer database is missing; do not create or replace it from the reader');

  // The reader neither creates the database nor performs a write. SQLite itself
  // enforces mode: "ro" at the connection layer.
  const db = await SQLite.open({ path: metadata.databasePath, mode: 'ro' });
  try {
    const rows = await db.query('SELECT nonce FROM persistence_probe WHERE id = ?', [1]);
    assert(Array.isArray(rows) && rows.length === 1, 'reader expected the one writer row');
    assert(rows[0].nonce === metadata.nonce, 'reader nonce does not match this writer run');
    console.log(JSON.stringify({ ok: true, databasePath: metadata.databasePath, nonce: metadata.nonce }, null, 2));
  } finally {
    await db.close();
  }
}

await main();
