const expected = {
  fileOnly: 'file-value',
  precedence: 'shell-value',
  literal: '${SHOULD_NOT_EXPAND}',
  empty: '',
  quoted: 'quoted value',
  systemOnly: 'system=a=b',
};
const actual = {
  fileOnly: Execution.env.OPENDESK_ENV_FILE_ONLY,
  precedence: Execution.env.OPENDESK_ENV_PRECEDENCE,
  literal: Execution.env.OPENDESK_ENV_LITERAL,
  empty: Execution.env.OPENDESK_ENV_EMPTY,
  quoted: Execution.env.OPENDESK_ENV_QUOTED,
  systemOnly: Execution.env.OPENDESK_ENV_SYSTEM_ONLY,
};
if (JSON.stringify(actual) !== JSON.stringify(expected)
    || typeof Execution.env.PATH !== 'string'
    || Execution.env.PATH.length === 0
    || !Object.isFrozen(Execution.env)) {
  throw new Error(`ai run environment mismatch: ${JSON.stringify(actual)}`);
}
File.write(File.join(Execution.artifactDir, 'environment-acceptance.json'), JSON.stringify({
  ok: true,
  executionId: Execution.id,
  values: actual,
}, null, 2));
