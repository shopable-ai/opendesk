// Safe live Scheduler smoke fixture: writes local Evidence and never controls the desktop.
function main() {
  const evidenceDir = '.runtime/tests/scheduler/live';
  const markerPath = File.join(evidenceDir, 'script-executed.txt');
  File.ensureDir(evidenceDir);
  File.write(markerPath, `scheduler live smoke ${new Date().toISOString()}\n`);
  console.log(`scheduler live smoke wrote ${markerPath}`);
  return { ok: true, markerPath };
}

main();
