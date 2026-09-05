const expected = {
  dotenvOnly: 'dotenv-value',
  opendeskOnly: 'opendesk-value',
  precedence: 'system-value',
};
const actual = {
  dotenvOnly: Execution.env.OPENDESK_ENV_DOTENV_ONLY,
  opendeskOnly: Execution.env.OPENDESK_ENV_OPENDESK_ONLY,
  precedence: Execution.env.OPENDESK_ENV_DEFAULT_PRECEDENCE,
};

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`default environment discovery mismatch: ${JSON.stringify(actual)}`);
}
if (System.getEnv('OPENDESK_ENV_DOTENV_ONLY') !== expected.dotenvOnly
    || System.getEnv('OPENDESK_ENV_OPENDESK_ONLY') !== expected.opendeskOnly
    || System.getEnv('OPENDESK_ENV_DEFAULT_PRECEDENCE') !== expected.precedence
    || !System.hasEnv('OPENDESK_ENV_OPENDESK_ONLY')) {
  throw new Error('System environment accessors differ from Execution.env');
}
console.log('[RUNTIME-API-ENVIRONMENT] .env and .opendesk.env discovery passed');
