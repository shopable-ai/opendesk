import fs from 'node:fs';
import { LIMITS } from './config.mjs';

// A bounded last-process diagnostic. Never store protocol bodies, origins, argv or credentials.
export function nativeDiagnostic(file, identity) {
  const events = [];
  return (stage, errorCode = null) => {
    events.push({timestamp: new Date().toISOString(), stage,
      errorCode: typeof errorCode === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(errorCode) ? errorCode : null});
    if (events.length > LIMITS.maxNativeDiagnostics) events.shift();
    try {
      const temporary = `${file}.${identity.hostPid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify({...identity, events}, null, 2), {mode: 0o600});
      fs.chmodSync(temporary, 0o600); fs.renameSync(temporary, file);
    } catch { /* Diagnostics must not corrupt Native Messaging stdio or change protocol behavior. */ }
  };
}
