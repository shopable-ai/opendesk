// Run from the repository root:
// ./opendesk -script examples/environment.js

// Read only the keys the automation needs. Avoid logging the complete snapshot:
// local executions may inherit credentials from the OpenDesk process.
const platform = System.getPlatformInfo().os;
const home = System.getEnv(platform === 'windows' ? 'USERPROFILE' : 'HOME');

const summary = {
  mode: System.getEnv('OPENDESK_EXAMPLE_MODE', 'default'),
  // This OpenDesk-owned key is non-secret and safe to show. Do not add
  // application credentials or the complete environment snapshot here.
  consoleMode: System.getEnv('OPENDESK_CONSOLE_MODE', 'unset'),
  platform,
  pathAvailable: System.hasEnv('PATH') && System.getEnv('PATH').length > 0,
  homeAvailable: typeof home === 'string' && home.length > 0,
  snapshotFrozen: Object.isFrozen(Execution.env),
};

console.log(`[ENVIRONMENT-EXAMPLE] ${JSON.stringify(summary)}`);
