// Formal execution-teardown probe. The shell writes its process IDs to an
// execution artifact while Command.run remains pending. The gate then sends
// SIGINT to the Runtime and verifies that the whole process group disappears.
(async () => {
  if (!Command.getCapabilities().enabled) throw new Error('Command is unavailable');
  const pidPath = File.join(Execution.artifactDir, 'command-cancel-pids.txt');
  const pending = Command.run('/bin/sh', [
    '-c',
    'printf "COMMAND_CHILD_PID=%s\\n" "$$" > "$1"; sleep 30 & child=$!; printf "COMMAND_DESCENDANT_PID=%s\\n" "$child" >> "$1"; wait',
    'opendesk-command-cancel',
    pidPath,
  ]);
  let evidence = '';
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (File.exists(pidPath)) evidence = File.read(pidPath);
    if (evidence.includes('COMMAND_DESCENDANT_PID=')) break;
    await delay(10);
  }
  if (!evidence.includes('COMMAND_DESCENDANT_PID=')) throw new Error('command PID evidence was not created');
  console.log(evidence.trim());
  console.log('COMMAND_CANCEL_READY=1');
  await pending;
  throw new Error('command cancellation probe returned without external SIGINT');
})();
