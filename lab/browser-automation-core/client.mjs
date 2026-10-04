import net from 'node:net';
import crypto from 'node:crypto';
import { SOCKET, LIMITS, loadInstall } from './config.mjs';
import { CoreError, LineDecoder, writeLine } from './protocol.mjs';

export class Client {
  constructor() { this.pending = new Map(); this.events = []; this.executionId = crypto.randomUUID(); }
  async connect(credential = loadInstall().clientCredential, socketPath = SOCKET) {
    this.socket = net.createConnection(socketPath); const decoder = new LineDecoder();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.socket.destroy(); reject(new CoreError('CONNECT_TIMEOUT')); }, LIMITS.authTimeoutMs);
      this.socket.on('connect', () => writeLine(this.socket, {v: 1, kind: 'auth', role: 'client', credential}));
      this.socket.on('data', bytes => {
        try {
          for (const message of decoder.push(bytes)) {
            if (message.kind === 'authenticated') { clearTimeout(timer); resolve(); }
            else if (message.kind === 'event') { this.events.push(message); if (this.events.length > LIMITS.maxEvents) this.events.shift(); }
            else if (message.kind === 'response') {
              const pending = this.pending.get(message.requestId);
              if (!pending) {
                if (message.error) { clearTimeout(timer); reject(new CoreError(message.error.code)); }
                continue;
              }
              clearTimeout(pending.timer); this.pending.delete(message.requestId);
              pending.resolve(message);
            }
          }
        } catch (error) { reject(error); this.socket.destroy(); }
      });
      this.socket.on('error', error => { clearTimeout(timer); reject(new CoreError(error.code || 'CONNECT_ERROR')); });
      this.socket.on('close', () => {
        clearTimeout(timer); reject(new CoreError('DISCONNECTED'));
        for (const [requestId, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.resolve({requestId, error: {code: 'CLIENT_DISCONNECTED'},
            outcome: pending.sideEffect ? 'OUTCOME_UNKNOWN' : 'FAILED_CONFIRMED'});
        }
        this.pending.clear();
      });
    });
    return this;
  }
  request(operation, params = {}, options = {}) {
    if (this.pending.size >= LIMITS.maxClientPending) return Promise.reject(new CoreError('CLIENT_QUEUE_FULL'));
    const requestId = options.requestId || crypto.randomUUID();
    if (this.pending.has(requestId)) return Promise.reject(new CoreError('DUPLICATE_REQUEST_ID'));
    return new Promise((resolve, reject) => {
      const pending = {resolve, sideEffect: ['click', 'fill'].includes(operation)};
      pending.timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({requestId, error: {code: 'CLIENT_TIMEOUT'}, outcome: pending.sideEffect ? 'OUTCOME_UNKNOWN' : 'FAILED_CONFIRMED'});
      }, (options.timeoutMs ?? LIMITS.defaultTimeoutMs) + LIMITS.clientResponseGraceMs);
      this.pending.set(requestId, pending);
      try { writeLine(this.socket, {v: 1, kind: 'request', requestId,
        executionId: this.executionId, operation, params, ...options}); }
      catch (error) { clearTimeout(pending.timer); this.pending.delete(requestId); reject(error); }
    });
  }
  cancel(requestId) { writeLine(this.socket, {v: 1, kind: 'cancel', requestId}); }
  subscribe() { writeLine(this.socket, {v: 1, kind: 'subscribe'}); }
  close() { this.socket?.destroy(); }
}
export async function connectedClient() { return new Client().connect(); }
export async function untilConnected(client, predicate = () => true) {
  const deadline = Date.now() + LIMITS.reconnectDeadlineMs;
  while (Date.now() < deadline) {
    const response = await client.request('status');
    if (response.result?.connected && predicate(response.result)) return response.result;
    await new Promise(resolve => setTimeout(resolve, LIMITS.reconnectPollMs));
  }
  throw new CoreError('RECONNECT_TIMEOUT');
}
