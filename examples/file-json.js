const settings = await File.readJSON('config/settings.json', {
  defaultValue: { enabled: true, retryCount: 2 },
});

const reportPath = File.join(Execution.artifactDir, 'file-json-example', 'settings-copy.json');
await File.writeJSON(reportPath, settings);
console.log('Saved JSON copy: ' + reportPath);
