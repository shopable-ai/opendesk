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
console.log('[RUNTIME-API-ENVIRONMENT] .env and .opendesk.env discovery passed');
