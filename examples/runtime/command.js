// From the repository root: ./dist/opendesk -script examples/runtime/command.js -console-mode script
// Local execution only. Runs a fixed echo command, with no caller-controlled shell text.
// Expected: [COMMAND-EXAMPLE] passed. Timeout/nonzero/mismatched output propagate as failures.
'use strict';
const capability = Command.getCapabilities();
if (!capability.enabled || !capability.supported) throw new Error('Command example requires local command execution');
const platform = System.getPlatformInfo().os;
const program = platform === 'windows' ? 'cmd.exe' : '/bin/echo';
const args = platform === 'windows'
  ? ['/d', '/s', '/c', 'echo OpenDesk command']
  : ['OpenDesk command'];
const result = await Command.run(program, args, { timeout: 5000, maxOutputBytes: 4096 });
if (result.exitCode !== 0 || result.stdout.trim() !== 'OpenDesk command' || result.stderr.trim() !== '') {
  throw new Error('Command example: unexpected echo result');
}
console.log(result.stdout.trim());
console.log('[COMMAND-EXAMPLE] passed');
