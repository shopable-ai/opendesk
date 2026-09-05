// From the repository root:
// ./dist/opendesk -script examples/command.js -console-mode script

async function main() {
  const platform = System.getPlatformInfo().os;
  const command = platform === 'windows' ? 'cmd.exe' : '/bin/echo';
  const args = platform === 'windows'
    ? ['/d', '/s', '/c', 'echo OpenDesk command']
    : ['OpenDesk command'];

  const result = await Command.run(command, args, { timeout: 5_000 });
  console.log(result.stdout.trim());
}

await main();
