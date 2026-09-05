if (Object.keys(Execution.env).length !== 0) {
  throw new Error(`HTTP execution inherited host environment keys: ${Object.keys(Execution.env).join(',')}`);
}
if (Execution.env.OPENDESK_ENV_HOST_SECRET !== undefined) {
  throw new Error('HTTP execution exposed the host secret fixture');
}
console.log('[RUNTIME-API-ENVIRONMENT] HTTP host environment is isolated');
