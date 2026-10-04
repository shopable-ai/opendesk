import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOCKET, STATE, ORIGIN, LIMITS, loadInstall } from './config.mjs';
import { nativeDiagnostic } from './native-diagnostic.mjs';
import { CoreError, NativeDecoder, LineDecoder, nativeFrame, writeLine, validate } from './protocol.mjs';

// stdout is exclusively the Native Messaging framed protocol. Never log credentials.
// The installed entry supplies the frozen private installation binding; component peers isolate their own state.
export function runNativeHost({socketPath = SOCKET, install, origin = process.argv[2], onStage = () => {}, build = null} = {}) {
  onStage('HOST_STARTED');
  if (origin !== ORIGIN) { onStage('ORIGIN_REJECTED', 'EXTENSION_NOT_ALLOWED'); process.exit(2); }
  install ||= loadInstall();
  onStage('BROKER_CONNECTING');
  const socket = net.createConnection(socketPath);
  const incoming = new NativeDecoder(), outgoing = new LineDecoder();
  const delayedAcks = new Map();
  let authenticated = false, ending = false;
  const authDeadline = setTimeout(() => { onStage('AUTH_TIMEOUT', 'CONNECT_TIMEOUT'); process.exit(3); }, LIMITS.authTimeoutMs);
  function exit(error) {
    if (ending) return; ending = true;
    for (const item of delayedAcks.values()) { clearTimeout(item.timer); clearTimeout(item.expiryTimer); }
    delayedAcks.clear();
    onStage('HOST_EXIT', error?.code);
    if (authenticated && error?.code && ['MESSAGE_TOO_LARGE', 'MALFORMED_MESSAGE', 'PROTOCOL_MISMATCH', 'BACKPRESSURE'].includes(error.code)) {
      try { writeLine(socket, {v: 1, kind: 'bridgeError', errorCode: error.code, actualBytes: error.actualBytes ?? null, limitBytes: LIMITS.maxMessageBytes}); socket.end(); }
      catch { socket.destroy(); }
      setTimeout(() => process.exit(0), 100).unref();
    } else { socket.destroy(); process.exit(0); }
  }
  socket.on('connect', () => writeLine(socket, {v: 1, kind: 'auth', role: 'host',
    origin, credential: install.hostCredential, hostPid: process.pid, parentPid: process.ppid, build}));
  socket.on('data', bytes => {
    try {
      for (const message of outgoing.push(bytes)) {
        validate(message);
        if (message.kind === 'authenticated') {
          authenticated = true; clearTimeout(authDeadline); onStage('BROKER_AUTHENTICATED');
        }
        let forwarded = message;
        if (install.testMode && message.kind === 'request' && message.operation === 'fault.delay') {
          const delayMs = message.params?.delayMs;
          const code = !Number.isInteger(delayMs) || delayMs < 0 || delayMs > LIMITS.maxTimeoutMs ? 'INVALID_DELAY' :
            delayedAcks.size >= LIMITS.maxPending ? 'QUEUE_FULL' : delayedAcks.has(message.requestId) ? 'DUPLICATE_REQUEST_ID' : null;
          if (code) {
            writeLine(socket, {v: 1, kind: 'response', brokerSession: message.brokerSession,
              connectionEpoch: message.connectionEpoch, browserSession: message.browserSession, requestId: message.requestId,
              error: {code, outcome: 'FAILED_CONFIRMED'}});
            continue;
          }
          const expiryTimer = setTimeout(() => delayedAcks.delete(message.requestId), LIMITS.maxTimeoutMs);
          delayedAcks.set(message.requestId, {delayMs, timer: null, expiryTimer});
          // Real Extension executes echo; only its actual returned ACK is delayed at this test boundary.
          forwarded = {...message, operation: 'echo'};
        }
        const frame = nativeFrame(forwarded);
        if (process.stdout.writableLength + frame.length > LIMITS.maxMessageBytes * LIMITS.maxQueue) throw new CoreError('BACKPRESSURE');
        process.stdout.write(frame);
      }
    } catch (error) { exit(error); }
  });
  process.stdin.on('data', bytes => {
    try {
      for (const message of incoming.push(bytes)) {
        if (!authenticated) return exit();
        if (message.kind === 'hello') onStage('EXTENSION_HELLO_RECEIVED');
        if (message.kind === 'host.exit' && install.testMode) return exit();
        const delayed = message.kind === 'response' ? delayedAcks.get(message.requestId) : null;
        if (delayed) {
          if (delayed.timer) throw new CoreError('MALFORMED_MESSAGE');
          clearTimeout(delayed.expiryTimer);
          delayed.timer = setTimeout(() => {
            delayedAcks.delete(message.requestId);
            if (ending) return;
            try { writeLine(socket, message); } catch (error) { exit(error); }
          }, delayed.delayMs);
          continue;
        }
        writeLine(socket, message);
      }
    } catch (error) { exit(error); }
  });
  process.stdin.on('end', exit);
  socket.on('error', exit); socket.on('close', exit);
  process.on('SIGTERM', exit);
  return socket;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const onStage = nativeDiagnostic(path.join(STATE, 'native-host-status.json'), {
    source: 'native-host entry; parent identity must be verified separately',
    hostPid: process.pid, parentPid: process.ppid, originAllowed: process.argv[2] === ORIGIN,
  });
  try { runNativeHost({onStage}); }
  catch (error) { onStage('STARTUP_FAILED', error.code || 'INTERNAL_ERROR'); process.exitCode = 1; }
}
