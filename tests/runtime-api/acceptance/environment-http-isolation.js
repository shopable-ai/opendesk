if (Object.keys(Execution.env).length !== 0) {
  throw new Error(`HTTP execution inherited host environment keys: ${Object.keys(Execution.env).join(',')}`);
}
if (Execution.env.OPENDESK_ENV_HOST_SECRET !== undefined) {
  throw new Error('HTTP execution exposed the host secret fixture');
}
if (System.hasEnv('OPENDESK_ENV_HOST_SECRET')
    || System.getEnv('OPENDESK_ENV_HOST_SECRET') !== undefined
    || System.getEnv('OPENDESK_ENV_HOST_SECRET', 'isolated') !== 'isolated') {
  throw new Error('System environment accessors bypassed HTTP host isolation');
}
console.log('[RUNTIME-API-ENVIRONMENT] HTTP host environment is isolated');
