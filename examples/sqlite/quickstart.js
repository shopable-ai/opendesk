// Run from the repository root:
// ./dist/opendesk -script examples/sqlite/quickstart.js -console-mode script

async function main() {
  const outputDir = File.join('.runtime', 'tests', 'sqlite', 'quickstart');
  const databasePath = File.join(outputDir, 'tasks.sqlite');
  File.ensureDir(outputDir); // SQLite deliberately does not create parent directories for us.

  const db = await SQLite.open({ path: databasePath, mode: 'rwc' });
  try {
    await db.exec(
      'CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, title TEXT NOT NULL, priority INTEGER NOT NULL)',
    );
    await db.exec('DELETE FROM tasks');

    // Values are bound as parameters. Do not build SQL by interpolating a title.
    const first = await db.exec(
      'INSERT INTO tasks (title, priority) VALUES (?, ?)',
      ['Write the SQLite quickstart', 1],
    );

    // batch() is one real transaction on this handle: every element commits,
    // or a failure rolls every element back.
    const batch = await db.batch([
      { sql: 'INSERT INTO tasks (title, priority) VALUES (?, ?)', params: ['Review transaction result', 2] },
      { sql: 'INSERT INTO tasks (title, priority) VALUES (?, ?)', params: ['Ship a script', 3] },
    ]);

    const rows = await db.query(
      'SELECT id, title, priority FROM tasks WHERE priority >= ? ORDER BY priority',
      [1],
    );
    console.log(JSON.stringify({
      databasePath,
      firstInsertChanges: first.changes,
      batchChanges: batch.results.map((item) => item.changes),
      rows,
    }, null, 2));
  } finally {
    await db.close();
  }
}

await main();
