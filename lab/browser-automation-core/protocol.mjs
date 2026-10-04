import { LIMITS } from './config.mjs';

export class CoreError extends Error {
  constructor(code, message = code, outcome = 'NOT_DISPATCHED', details = {}) {
    super(message); this.code = code; this.outcome = outcome; Object.assign(this, details);
  }
}
export function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validate(message) {
  if (!object(message) || typeof message.kind !== 'string') throw new CoreError('MALFORMED_MESSAGE');
  if (message.v !== LIMITS.version) throw new CoreError('PROTOCOL_MISMATCH');
  return message;
}
export function validateResponse(message) {
  validate(message);
  const hasResult = Object.hasOwn(message, 'result'), hasError = Object.hasOwn(message, 'error');
  if (message.kind !== 'response' || typeof message.requestId !== 'string' ||
      !message.requestId || message.requestId.length > 100 || hasResult === hasError ||
      (hasResult && message.result === undefined)) throw new CoreError('MALFORMED_MESSAGE');
  if (hasError && (!object(message.error) || typeof message.error.code !== 'string' ||
      !/^[A-Z][A-Z0-9_]{0,63}$/.test(message.error.code) ||
      (message.error.outcome !== undefined && !['FAILED_CONFIRMED', 'OUTCOME_UNKNOWN'].includes(message.error.outcome)))) {
    throw new CoreError('MALFORMED_MESSAGE');
  }
  return message;
}
export function browserResponse(message, operation) {
  validateResponse(message);
  if (!message.error) return {response: {result: message.result}, outcome: 'SUCCEEDED'};
  const outcome = message.error.outcome || (['fill', 'click'].includes(operation) ? 'OUTCOME_UNKNOWN' : 'FAILED_CONFIRMED');
  return {response: {error: {code: message.error.code, message: message.error.code, outcome,
    candidateCount: message.error.candidateCount ?? null}, browserTrace: message.trace ?? null, identity: message.identity ?? null}, outcome};
}
export function encoded(message) {
  const bytes = Buffer.from(JSON.stringify(message));
  if (bytes.length > LIMITS.maxMessageBytes) throw new CoreError('MESSAGE_TOO_LARGE', undefined, undefined, {actualBytes: bytes.length});
  return bytes;
}
export class LineDecoder {
  constructor() { this.buffer = Buffer.alloc(0); }
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = [];
    let end;
    while ((end = this.buffer.indexOf(10)) !== -1) {
      if (end > LIMITS.maxMessageBytes) throw new CoreError('MESSAGE_TOO_LARGE', undefined, undefined, {actualBytes: end});
      try { messages.push(JSON.parse(this.buffer.subarray(0, end).toString('utf8'))); }
      catch { throw new CoreError('MALFORMED_MESSAGE'); }
      this.buffer = this.buffer.subarray(end + 1);
    }
    if (this.buffer.length > LIMITS.maxMessageBytes) throw new CoreError('MESSAGE_TOO_LARGE', undefined, undefined, {actualBytes: this.buffer.length});
    return messages;
  }
}
export class NativeDecoder {
  constructor() { this.buffer = Buffer.alloc(0); }
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > LIMITS.maxMessageBytes) throw new CoreError('MESSAGE_TOO_LARGE', undefined, undefined, {actualBytes: length});
      if (this.buffer.length < length + 4) break;
      try { messages.push(JSON.parse(this.buffer.subarray(4, 4 + length).toString('utf8'))); }
      catch { throw new CoreError('MALFORMED_MESSAGE'); }
      this.buffer = this.buffer.subarray(4 + length);
    }
    return messages;
  }
}
export function nativeFrame(message) {
  const body = encoded(message), header = Buffer.alloc(4);
  header.writeUInt32LE(body.length); return Buffer.concat([header, body]);
}
export function writeLine(socket, message) {
  const body = Buffer.concat([encoded(message), Buffer.from('\n')]);
  if (socket.destroyed) throw new CoreError('DISCONNECTED');
  if (socket.writableLength + body.length > LIMITS.maxMessageBytes * LIMITS.maxQueue) {
    throw new CoreError('BACKPRESSURE');
  }
  socket.write(body);
}
export function failure(error, outcome) {
  return {code: error.code || 'INTERNAL_ERROR', message: error.code || 'INTERNAL_ERROR',
    outcome: outcome || error.outcome || 'NOT_DISPATCHED'};
}
