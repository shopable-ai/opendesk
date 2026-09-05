// Run from the repository root:
// ./opendesk -script examples/environment.js

// Read only the keys the automation needs. Avoid logging the complete snapshot:
// local executions may inherit credentials from the OpenDesk process.
const platform = System.getPlatformInfo().os;
const home = platform === 'windows'
  ? Execution.env.USERPROFILE
  : Execution.env.HOME;

const summary = {
  mode: Execution.env.OPENDESK_EXAMPLE_MODE || 'default',
  platform,
  pathAvailable: typeof Execution.env.PATH === 'string' && Execution.env.PATH.length > 0,
  homeAvailable: typeof home === 'string' && home.length > 0,
  snapshotFrozen: Object.isFrozen(Execution.env),
};

console.log(`[ENVIRONMENT-EXAMPLE] ${JSON.stringify(summary)}`);
