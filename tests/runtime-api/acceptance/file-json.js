async function main() {
  const root = File.join(Execution.artifactDir, 'file-json-acceptance');
  const source = File.join(root, 'config', 'settings.json');
  const copy = File.join(root, 'output', 'settings-copy.json');
  const report = File.join(root, 'report.json');

  const settings = await File.readJSON(source, {
    defaultValue: { enabled: true, retryCount: 2 },
  });
  await File.writeJSON(source, settings);
  await File.writeJSON(copy, settings);
  const restored = await File.readJSON(copy);
  if (!restored || restored.enabled !== true || restored.retryCount !== 2) {
    throw new Error('File JSON acceptance round-trip mismatch');
  }
  await File.writeJSON(report, {
    ok: true,
    executionId: Execution.id,
    workdir: Execution.workdir,
    files: [source, copy],
  });
  const savedReport = await File.readJSON(report);
  if (!savedReport || savedReport.ok !== true) throw new Error('File JSON acceptance report was not saved');
  console.log('FILE_JSON_ACCEPTANCE_REPORT=' + report);
}

await main();
