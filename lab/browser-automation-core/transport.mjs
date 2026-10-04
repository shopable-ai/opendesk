import { writeLine } from './protocol.mjs';

// The Broker dispatches protocol envelopes, independent of Native Messaging framing.
// A replacement transport needs send/close; DOM/target/trace contracts remain unchanged.
export class NativeMessagingBridge {
  constructor(socket) { this.socket = socket; }
  send(envelope) { writeLine(this.socket, envelope); }
  close() { this.socket.end(); }
}
