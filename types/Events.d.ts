export {};

declare global {
  type OpenDeskDesktopEventType =
    | "window.focused"
    | "window.created"
    | "window.closed"
    | "window.moved"
    | "window.resized"
    | "app.launched"
    | "app.terminated"
    | "clipboard.changed"
    | "display.changed";

  interface OpenDeskDesktopEventCapability {
    supported: boolean;
    /** "polling" in the current implementation; never silently reported as native. */
    backend: string;
    platform: string;
    intervalMs?: number;
    /** Runtime capability discovery does not promote repository smoke evidence into a per-host attestation. */
    verified: boolean;
    notes?: string;
  }

  interface OpenDeskDesktopEventCapabilities {
    schemaVersion: 1;
    platform: string;
    events: Record<OpenDeskDesktopEventType, OpenDeskDesktopEventCapability>;
  }

  interface OpenDeskDesktopEvent<TData = Record<string, unknown>> {
    schemaVersion: 1;
    type: OpenDeskDesktopEventType;
    backend: string;
    timestamp: string;
    sequence: number;
    /** Number of newer same-type backend events folded into this delivery. */
    coalesced: number;
    data: TData;
  }

  interface OpenDeskDesktopEventSubscription {
    readonly id: number;
    readonly event: OpenDeskDesktopEventType;
    readonly backend: string;
    unsubscribe(): void;
  }

  interface OpenDeskDesktopEventOnceOptions {
    /** Timeout in milliseconds; default 30000, maximum 600000. */
    timeout?: number;
  }

  interface OpenDeskDesktopEvents {
    on(
      event: OpenDeskDesktopEventType,
      callback: (event: OpenDeskDesktopEvent) => void | Promise<void>,
    ): OpenDeskDesktopEventSubscription;
    once(event: OpenDeskDesktopEventType, options?: OpenDeskDesktopEventOnceOptions): Promise<OpenDeskDesktopEvent>;
    getCapabilities(): OpenDeskDesktopEventCapabilities;
  }

  var Events: OpenDeskDesktopEvents;
}
