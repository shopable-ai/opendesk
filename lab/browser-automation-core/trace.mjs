import fs from 'node:fs';
import path from 'node:path';
import { LIMITS } from './config.mjs';
import { CoreError } from './protocol.mjs';

export function traceRecord(request, context = {}) {
  return {
    executionId: request.executionId, requestId: request.requestId,
    timestamp: new Date().toISOString(), brokerSession: context.brokerSession ?? null, browserSession: context.browserSession ?? null,
    tab: request.params?.target?.tab ?? request.params?.scope?.tab ?? request.params?.tab ?? null,
    frame: request.params?.target?.frame ?? request.params?.scope?.frame ?? request.params?.frame ?? null,
    document: request.params?.target?.document ?? request.params?.scope?.document ?? null,
    connectionEpoch: context.connectionEpoch ?? null, operation: request.operation,
    targetRequest: request.params?.query ?? null, resolvedTarget: request.params?.target ?? null,
    beforeObservation: null, action: null, afterObservation: null, verification: null,
    status: 'PENDING', errorCode: null, duration: 0, outcome: 'NOT_DISPATCHED',
    dispatchedAt: null, cancelledAt: null, cancelBoundary: null, sourceReadRequestId: request.params?.sourceReadRequestId ?? null,
  };
}
export function redact(value, secrets = []) {
  if (typeof value === 'string') {
    let result = value;
    for (const secret of secrets) if (secret) result = result.split(secret).join('[REDACTED]');
    return result;
  }
  if (Array.isArray(value)) return value.map(item => redact(item, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) =>
    [key, /credential|password|secret|authorization/i.test(key) ? '[REDACTED]' : redact(val, secrets)]));
  return value;
}
export function mergeBrowserTrace(record, observation) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) return record;
  // Identity, correlation, dispatch, status and outcome remain Broker-owned.
  for (const key of ['beforeObservation', 'resolvedTarget', 'action', 'afterObservation', 'verification']) {
    if (Object.hasOwn(observation, key)) record[key] = observation[key];
  }
  return record;
}
export class Trace {
  constructor(directory, secrets = []) {
    fs.mkdirSync(directory, {recursive: true, mode: 0o700});
    this.file = path.join(directory, 'trace.ndjson'); this.secrets = secrets; this.bytes = 0;
    this.fd = fs.openSync(this.file, 'ax', 0o600);
  }
  append(record) {
    const bytes = Buffer.from(JSON.stringify(redact(record, this.secrets)) + '\n');
    if (this.bytes + bytes.length > LIMITS.maxTraceBytes) throw new CoreError('TRACE_LIMIT');
    fs.writeSync(this.fd, bytes); this.bytes += bytes.length;
  }
  reserve() {
    if (this.bytes > LIMITS.maxTraceBytes - LIMITS.maxMessageBytes * LIMITS.maxPending * 2) {
      throw new CoreError('TRACE_LIMIT');
    }
  }
  close() { fs.closeSync(this.fd); }
}
