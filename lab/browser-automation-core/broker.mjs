import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { LIMITS, STATE, SOCKET, EVIDENCE, SOURCE, ORIGIN, EXTENSION_ID, loadInstall } from './config.mjs';
import { CoreError, LineDecoder, validate, validateResponse, browserResponse, writeLine, failure, object } from './protocol.mjs';
import { Trace, traceRecord, mergeBrowserTrace } from './trace.mjs';
import { NativeMessagingBridge } from './transport.mjs';

const communicationOps = new Set(['echo', 'browserInfo', 'emitEvent', 'fault.delay', 'fault.disconnect',
  'fault.hostExit', 'fault.duplicateAck', 'fault.reload', 'fault.identity', 'fault.protocol', 'fault.malformed', 'fault.oversized',
  'tabs', 'frames', 'observe', 'locate', 'read', 'fill', 'click', 'wait', 'verify', 'test.openTab', 'test.reloadTab', 'test.closeTab', 'test.adoptTab', 'test.releaseExecution', 'test.releaseDispatch']);
const actions = new Set(['fill', 'click']);
const identityFields = ['brokerSession', 'browserSession', 'connectionEpoch', 'tab', 'frame', 'document', 'elementIdentity', 'semanticRevision'];
export class Broker {
  constructor(install = loadInstall(), options = {}) {
    this.install = install; this.session = crypto.randomUUID(); this.epoch = null;
    this.host = null; this.browser = null; this.clients = new Set(); this.sockets = new Set();
    this.socketPath = options.socketPath || SOCKET;
    this.stateDirectory = options.stateDirectory || STATE;
    this.pending = new Map(); this.events = []; this.eventCursor = 0;
    this.seenRequests = new Set();
    this.targets = new Map(); this.documents = new Map(); this.readSources = new Map(); this.ownedTabs = new Map(); this.closedTabs = new Set();
    this.evidenceDirectory = path.join(EVIDENCE, `broker-${Date.now()}-${this.session.slice(0, 8)}`);
    this.trace = new Trace(this.evidenceDirectory, [install.clientCredential, install.hostCredential]);
  }
  event(type, data = {}) {
    const event = {v: 1, kind: 'event', cursor: ++this.eventCursor, type,
      timestamp: new Date().toISOString(), brokerSession: this.session, browserSession: this.browser?.browserSession ?? null,
      connectionEpoch: this.epoch, ...data};
    this.events.push(event);
    if (this.events.length > LIMITS.maxEvents) this.events.shift();
    for (const client of this.clients) if (client.subscribed) {
      try { writeLine(client, event); } catch { client.destroy(); }
    }
  }
  status() {
    return {connected: !!this.browser, brokerPid: process.pid, brokerSession: this.session,
      connectionStage: this.browser ? 'READY' : this.host ? 'AWAITING_EXTENSION_HANDSHAKE' : 'DISCONNECTED',
      browserSession: this.browser?.browserSession ?? null, connectionEpoch: this.epoch,
      browser: this.browser, pendingCount: this.pending.size,
      evidenceDirectory: this.evidenceDirectory, limits: LIMITS, resourceCounts: {connections: this.sockets.size, targets: this.targets.size, documents: this.documents.size, readSources: this.readSources.size, ownedTabs: this.ownedTabs.size, events: this.events.length, requestMemory: this.seenRequests.size, traceBytes: this.trace.bytes}};
  }
  authenticate(socket, message) {
    validate(message);
    if (message.kind !== 'auth') throw new CoreError('AUTH_REQUIRED');
    if (!['host', 'client'].includes(message.role)) throw new CoreError('UNAUTHORIZED');
    const expected = message.role === 'host' ? this.install.hostCredential : this.install.clientCredential;
    const providedBytes = typeof message.credential === 'string' ? Buffer.from(message.credential) : null;
    const expectedBytes = expected ? Buffer.from(expected) : null;
    if (!providedBytes || !expectedBytes || providedBytes.length !== expectedBytes.length ||
        !crypto.timingSafeEqual(providedBytes, expectedBytes)) throw new CoreError('UNAUTHORIZED');
    if (message.role === 'host') {
      if (message.origin !== ORIGIN || this.host) throw new CoreError('EXTENSION_NOT_ALLOWED');
      socket.nativeHost = {hostPid: message.hostPid, parentPid: message.parentPid, origin: message.origin,
        build: message.build ?? null};
      this.host = socket; this.transport = new NativeMessagingBridge(socket); this.epoch = crypto.randomUUID(); this.browser = null;
      socket.handshakeTimer = setTimeout(() => {
        if (this.host === socket && !this.browser) {
          this.disconnected(socket, 'HANDSHAKE_TIMEOUT'); socket.destroy();
        }
      }, LIMITS.handshakeTimeoutMs);
    } else this.clients.add(socket);
    socket.role = message.role;
    writeLine(socket, {v: 1, kind: 'authenticated', brokerSession: this.session, connectionEpoch: this.epoch});
  }
  fromHost(socket, message) {
    validate(message);
    if (socket !== this.host) throw new CoreError('EXTENSION_NOT_ALLOWED');
    if (message.kind === 'bridgeError') {
      if (!['MESSAGE_TOO_LARGE', 'MALFORMED_MESSAGE', 'PROTOCOL_MISMATCH', 'BACKPRESSURE'].includes(message.errorCode)) throw new CoreError('MALFORMED_MESSAGE');
      this.event('protocol-rejected', {role: 'host', errorCode: message.errorCode, actualBytes: message.actualBytes ?? null, limitBytes: message.limitBytes ?? null});
      this.disconnected(socket, message.errorCode); socket.end(); return;
    }
    if (message.kind === 'hello') {
      if (this.browser) throw new CoreError('DUPLICATE_HANDSHAKE');
      if (message.extensionId !== EXTENSION_ID || typeof message.browserSession !== 'string' ||
          !message.browserSession || message.browserSession.length > 100) throw new CoreError('EXTENSION_NOT_ALLOWED');
      this.browser = {browserSession: message.browserSession, extensionId: message.extensionId,
        extensionVersion: message.extensionVersion, userAgent: message.userAgent, loadedResources: message.loadedResources ?? null, nativeHost: socket.nativeHost};
      clearTimeout(socket.handshakeTimer);
      writeLine(socket, {v: 1, kind: 'welcome', brokerSession: this.session,
        browserSession: this.browser.browserSession, connectionEpoch: this.epoch, limits: LIMITS, testMode: this.install.testMode});
      this.event('connected', {extensionId: message.extensionId});
      return;
    }
    if (!this.browser) throw new CoreError('HANDSHAKE_REQUIRED');
    if (message.connectionEpoch !== this.epoch || message.brokerSession !== this.session ||
        message.browserSession !== this.browser.browserSession) throw new CoreError('STALE_CONNECTION');
    if (message.kind === 'event') {
      if (typeof message.eventId !== 'string') throw new CoreError('MALFORMED_MESSAGE');
      const data = object(message.data) ? message.data : {};
      if (['document-changed', 'semantic-navigation'].includes(message.eventType) && Number.isInteger(data.tab) && Number.isInteger(data.frame)) {
        const key = `${data.tab}:${data.frame}`;
        this.documents.set(key, data.document);
        for (const [id, target] of this.targets) if (target.tab === data.tab && target.frame === data.frame) this.targets.delete(id);
        for (const [id, read] of this.readSources) if (read.target.tab === data.tab && read.target.frame === data.frame) this.readSources.delete(id);
        if (this.documents.size > LIMITS.maxTrackedTabs * LIMITS.maxFramesPerTab) this.documents.delete(this.documents.keys().next().value);
      }
      if (message.eventType === 'tab-closed' && Number.isInteger(data.tab)) {
        this.closedTabs.add(data.tab); this.ownedTabs.delete(data.tab);
        if (this.closedTabs.size > LIMITS.maxTrackedTabs) this.closedTabs.delete(this.closedTabs.values().next().value);
        for (const [id, target] of this.targets) if (target.tab === data.tab) this.targets.delete(id);
        for (const [id, read] of this.readSources) if (read.target.tab === data.tab) this.readSources.delete(id);
        for (const key of this.documents.keys()) if (key.startsWith(`${data.tab}:`)) this.documents.delete(key);
      }
      if (message.eventType === 'ack-dropped') {
        const pending = this.pending.get(data.requestId);
        if (pending && data.identity?.document === pending.request.params.target?.document) mergeBrowserTrace(pending.trace, data.trace);
      }
      this.event('browser-event', {eventId: message.eventId, eventType: message.eventType, data}); return;
    }
    validateResponse(message);
    const pending = this.pending.get(message.requestId);
    if (!pending) { this.event('late-response', {requestId: message.requestId}); return; }
    if (message.browserSession !== pending.trace.browserSession) throw new CoreError('STALE_CONNECTION');
    const normalized = browserResponse(message, pending.request.operation);
    this.finish(pending, normalized.response, normalized.outcome);
  }
  finish(pending, response, outcome) {
    if (!this.pending.delete(pending.request.requestId)) return;
    clearTimeout(pending.timer);
    clearImmediate(pending.dispatchJob);
    if (response.error) response.error.outcome = outcome;
    const trace = pending.trace;
    Object.assign(trace, {status: response.error ? 'ERROR' : 'SUCCESS', errorCode: response.error?.code ?? null,
      duration: Date.now() - pending.started, outcome});
    const identity = response.result?.identity || response.identity;
    if (identity && identity.brokerSession === this.session && identity.browserSession === this.browser?.browserSession && identity.connectionEpoch === this.epoch &&
        Number.isInteger(identity.tab) && Number.isInteger(identity.frame) && typeof identity.document === 'string') {
      Object.assign(trace, {tab: identity.tab, frame: identity.frame, document: identity.document});
      this.documents.set(`${identity.tab}:${identity.frame}`, identity.document);
      if (this.documents.size > LIMITS.maxTrackedTabs * LIMITS.maxFramesPerTab) this.documents.delete(this.documents.keys().next().value);
      const target = response.result?.target;
      if (target && identityFields.every(key => key === 'elementIdentity' || key === 'semanticRevision' || target[key] === identity[key])) {
        if (this.targets.size < LIMITS.maxTargets || this.targets.has(target.elementIdentity)) this.targets.set(target.elementIdentity, target);
        else { response = {error: {code: 'TARGET_STORE_LIMIT', outcome: 'FAILED_CONFIRMED'}}; outcome = 'FAILED_CONFIRMED'; trace.status = 'ERROR'; trace.errorCode = 'TARGET_STORE_LIMIT'; trace.outcome = outcome; }
      }
    }
    if (['test.openTab', 'test.adoptTab'].includes(pending.request.operation) && Number.isInteger(response.result?.tab)) this.ownedTabs.set(response.result.tab, new URL(pending.request.params.url || pending.request.params.expectedUrl).origin);
    if (pending.request.operation === 'read' && response.result && !response.result.redacted && typeof response.result.value === 'string') {
      if (this.readSources.size >= LIMITS.maxTargets) this.readSources.delete(this.readSources.keys().next().value);
      this.readSources.set(pending.request.requestId, {value: response.result.value, target: pending.request.params.target, executionId: pending.request.executionId});
    }
    mergeBrowserTrace(trace, response.result?.trace || response.browserTrace);
    this.trace.append(trace);
    try { writeLine(pending.client, {v: 1, kind: 'response', requestId: pending.request.requestId, brokerSession: trace.brokerSession, browserSession: trace.browserSession, connectionEpoch: trace.connectionEpoch, ...response, outcome}); }
    catch { pending.client.destroy(); }
  }
  request(client, request) {
    validate(request);
    if (request.kind === 'subscribe') { client.subscribed = true; writeLine(client, {v: 1, kind: 'subscribed'}); return; }
    if (request.kind === 'cancel') {
      const pending = this.pending.get(request.requestId);
      if (pending && pending.client === client) {
        pending.trace.cancelledAt = new Date().toISOString(); pending.trace.cancelBoundary = pending.trace.dispatchedAt ? 'after-dispatch' : 'before-dispatch';
        const outcome = actions.has(pending.request.operation) ? pending.trace.dispatchedAt ? 'OUTCOME_UNKNOWN' : 'CANCELLED_BEFORE_DISPATCH' : 'FAILED_CONFIRMED';
        if (pending.trace.dispatchedAt) { try { this.transport?.send({v: 1, kind: 'cancel', requestId: request.requestId,
          brokerSession: this.session, browserSession: this.browser?.browserSession, connectionEpoch: this.epoch}); } catch {} }
        this.finish(pending, {error: failure(new CoreError('CANCELLED'))}, outcome);
      }
      return;
    }
    if (request.kind !== 'request' || typeof request.requestId !== 'string' || request.requestId.length > 100 ||
        typeof request.executionId !== 'string' || request.executionId.length > 100 ||
        typeof request.operation !== 'string' || request.operation.length > 64 ||
        !object(request.params)) throw new CoreError('MALFORMED_MESSAGE');
    if (this.seenRequests.has(request.requestId)) throw new CoreError('DUPLICATE_REQUEST_ID');
    if (this.seenRequests.size >= LIMITS.maxRequestsPerSession) throw new CoreError('SESSION_REQUEST_LIMIT');
    this.seenRequests.add(request.requestId);
    if (request.operation === 'test.releaseDispatch') {
      if (!this.install.testMode) throw new CoreError('TEST_MODE_REQUIRED');
      const held = this.pending.get(request.params.requestId);
      if (!held?.heldDispatch || held.client !== client) throw new CoreError('BARRIER_NOT_FOUND');
      const dispatch = held.heldDispatch; held.heldDispatch = null; dispatch();
      return this.localResult(client, request, {released: true});
    }
    if (request.operation === 'status') return this.localResult(client, request, this.status());
    if (request.operation === 'events') {
      const after = request.params.after ?? 0;
      if (this.events.length && after && after < this.events[0].cursor - 1) throw new CoreError('EVENTS_EXPIRED');
      return this.localResult(client, request, this.events.filter(event => event.cursor > after));
    }
    if (!communicationOps.has(request.operation)) throw new CoreError('UNSUPPORTED_OPERATION');
    if ((request.operation.startsWith('fault.') || request.operation.startsWith('test.')) && !this.install.testMode) throw new CoreError('TEST_MODE_REQUIRED');
    this.trace.reserve();
    if (!this.browser || !this.host) throw new CoreError('EXTENSION_DISCONNECTED');
    if (['read', 'fill', 'click', 'wait', 'verify'].includes(request.operation)) {
      const target = request.params.target;
      if (!object(target) || identityFields.some(field => !Object.hasOwn(target, field))) throw new CoreError('INSUFFICIENT_TARGET_IDENTITY');
      const known = this.targets.get(target.elementIdentity);
      if (!known || identityFields.some(field => known[field] !== target[field]) || target.brokerSession !== this.session ||
          target.browserSession !== this.browser.browserSession || target.connectionEpoch !== this.epoch || this.closedTabs.has(target.tab) ||
          (this.documents.has(`${target.tab}:${target.frame}`) && this.documents.get(`${target.tab}:${target.frame}`) !== target.document)) throw new CoreError('STALE_TARGET');
    }
    if ((request.params.dropAckAfterCompleted || request.params.testExecutionBarrier || request.params.testDispatchBarrier) && !this.install.testMode) throw new CoreError('TEST_MODE_REQUIRED');
    if (request.operation === 'fill' && request.params.sourceReadRequestId) {
      const read = this.readSources.get(request.params.sourceReadRequestId);
      if (!read || read.value !== request.params.value || read.executionId !== request.executionId || ['brokerSession', 'browserSession', 'connectionEpoch', 'tab', 'frame', 'document'].some(key => read.target[key] !== request.params.target[key])) throw new CoreError('READ_SOURCE_MISMATCH');
    }
    if (['test.reloadTab', 'test.closeTab'].includes(request.operation) && !this.ownedTabs.has(request.params.tab)) throw new CoreError('TAB_NOT_OWNED');
    if (['test.reloadTab', 'test.closeTab'].includes(request.operation)) request = {...request, params: {...request.params, expectedOrigin: this.ownedTabs.get(request.params.tab)}};
    if (request.operation === 'test.openTab' && this.ownedTabs.size >= LIMITS.maxTrackedTabs) throw new CoreError('TAB_LIMIT');
    if (this.pending.size >= LIMITS.maxPending) throw new CoreError('QUEUE_FULL');
    const timeout = request.timeoutMs ?? LIMITS.defaultTimeoutMs;
    if (!Number.isInteger(timeout) || timeout < LIMITS.minTimeoutMs || timeout > LIMITS.maxTimeoutMs) throw new CoreError('INVALID_TIMEOUT');
    const trace = traceRecord(request, {brokerSession: this.session, browserSession: this.browser.browserSession, connectionEpoch: this.epoch});
    const pending = {request, client, trace, started: Date.now()};
    this.pending.set(request.requestId, pending);
    pending.timer = setTimeout(() => {
      const outcome = actions.has(request.operation) ? pending.trace.dispatchedAt ? 'OUTCOME_UNKNOWN' : 'NOT_DISPATCHED' : 'FAILED_CONFIRMED';
      this.finish(pending, {error: failure(new CoreError('TIMEOUT'), outcome)}, outcome);
    }, timeout);
    const dispatch = () => { if (!this.pending.has(request.requestId)) return; try {
      // Persist intent before sending. A process exit can never turn a sent action into a safe retry.
      this.trace.append({...trace, status: 'DISPATCH_INTENT',
        outcome: actions.has(request.operation) ? 'OUTCOME_UNKNOWN' : 'NOT_DISPATCHED'});
      this.transport.send({...request, brokerSession: this.session,
        browserSession: this.browser.browserSession, connectionEpoch: this.epoch});
      trace.dispatchedAt = new Date().toISOString();
      this.event('dispatched', {requestId: request.requestId, operation: request.operation});
    } catch (error) { this.finish(pending, {error: failure(error)}, 'NOT_DISPATCHED'); } };
    if (actions.has(request.operation) && request.params.testDispatchBarrier) { pending.heldDispatch = dispatch; this.event('dispatch-held', {requestId: request.requestId}); }
    else if (actions.has(request.operation)) pending.dispatchJob = setImmediate(dispatch); else dispatch();
  }
  localResult(client, request, result) {
    this.trace.reserve();
    const trace = traceRecord(request, {brokerSession: this.session, browserSession: this.browser?.browserSession, connectionEpoch: this.epoch});
    Object.assign(trace, {status: 'SUCCESS', outcome: 'SUCCEEDED'}); this.trace.append(trace);
    writeLine(client, {v: 1, kind: 'response', requestId: request.requestId, brokerSession: trace.brokerSession, browserSession: trace.browserSession, connectionEpoch: trace.connectionEpoch, result, outcome: 'SUCCEEDED'});
  }
  disconnected(socket, reason = 'DISCONNECTED') {
    clearTimeout(socket.handshakeTimer);
    this.clients.delete(socket); this.sockets.delete(socket);
    if (this.host === socket) {
      this.host = null; this.transport = null; this.browser = null;
      this.targets.clear(); this.documents.clear(); this.readSources.clear();
      for (const pending of [...this.pending.values()]) {
        const outcome = actions.has(pending.request.operation) ? pending.trace.dispatchedAt ? 'OUTCOME_UNKNOWN' : 'NOT_DISPATCHED' : 'FAILED_CONFIRMED';
        this.finish(pending, {error: failure(new CoreError(reason), outcome)}, outcome);
      }
      this.event('disconnected', {reason});
    }
  }
  async start() {
    fs.mkdirSync(this.stateDirectory, {recursive: true, mode: 0o700});
    fs.mkdirSync(path.dirname(this.socketPath), {recursive: true, mode: 0o700});
    this.server = net.createServer(socket => {
      if (this.sockets.size >= LIMITS.maxConnections) { socket.destroy(); return; }
      this.sockets.add(socket); const decoder = new LineDecoder();
      const authTimer = setTimeout(() => socket.destroy(), LIMITS.authTimeoutMs);
      socket.on('data', bytes => {
        let active;
        try {
          for (const message of decoder.push(bytes)) {
            active = message;
            if (!socket.role) { this.authenticate(socket, message); clearTimeout(authTimer); }
            else if (socket.role === 'host') this.fromHost(socket, message);
            else this.request(socket, message);
          }
        } catch (error) {
          this.event('input-rejected', {role: socket.role ?? null, errorCode: error.code || 'INTERNAL_ERROR',
            actualBytes: error.actualBytes ?? null, version: typeof active?.v === 'number' ? active.v : null});
          if (socket.role === 'client' && active?.kind === 'request' && typeof active.operation === 'string' &&
              !this.pending.has(active.requestId)) {
            const record = traceRecord(active, {brokerSession: this.session, browserSession: this.browser?.browserSession, connectionEpoch: this.epoch});
            Object.assign(record, {status: 'ERROR', errorCode: error.code || 'INTERNAL_ERROR', outcome: 'NOT_DISPATCHED'});
            try { this.trace.reserve(); this.trace.append(record); } catch {}
          }
          try { writeLine(socket, {v: 1, kind: 'response', requestId: active?.requestId ?? null, error: failure(error)}); } catch {}
          if (socket.role === 'host' || !socket.role || !active) {
            this.disconnected(socket, error.code); socket.end();
          }
        }
      });
      socket.on('error', () => {});
      socket.on('close', () => { clearTimeout(authTimer); this.disconnected(socket); });
    });
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.socketPath, resolve); });
    fs.chmodSync(this.socketPath, 0o600);
    fs.writeFileSync(path.join(this.stateDirectory, 'broker.json'), JSON.stringify({pid: process.pid, session: this.session,
      evidenceDirectory: this.evidenceDirectory, source: SOURCE}), {mode: 0o600});
    return this;
  }
  async stop() {
    for (const socket of this.sockets) { this.disconnected(socket, 'BROKER_STOPPED'); socket.destroy(); }
    await new Promise(resolve => this.server.close(resolve));
    this.trace.close();
    if (fs.existsSync(path.join(this.stateDirectory, 'broker.json'))) fs.unlinkSync(path.join(this.stateDirectory, 'broker.json'));
  }
}
