export {};

declare global {
  interface OpenDeskNotificationRecord {
    schemaVersion: 1;
    /** Opaque request identity scoped to OpenDesk's notification center. */
    id: string;
    /** OpenDesk app identity, currently com.opendesk.cli on macOS. */
    appId: string;
    deliveredAt: string;
    /** true unless includeContent was explicitly requested. */
    contentRedacted: boolean;
    title?: string;
    message?: string;
  }

  interface OpenDeskNotificationListOptions {
    /** Explicitly include title and body. Default: false. */
    includeContent?: boolean;
  }

  interface OpenDeskNotificationWaitOptions extends OpenDeskNotificationListOptions {
    id?: string;
    title?: string;
    message?: string;
    /** Include matching notifications that existed before waitFor began. Default: false. */
    includeExisting?: boolean;
    /** Milliseconds; default 30000, maximum 600000. */
    timeout?: number;
    /** Milliseconds; default 200, range 50 to 5000. */
    pollInterval?: number;
  }

  interface OpenDeskNotificationOperationCapability {
    supported: boolean;
    /** Runtime discovery does not promote repository smoke evidence into a per-host attestation. */
    verified: boolean;
    notes?: string;
  }

  interface OpenDeskNotificationCapabilities {
    schemaVersion: 1;
    platform: string;
    backend: string;
    /** "own-app" on the macOS backend; "none" when unsupported. */
    scope: "own-app" | "none";
    list: OpenDeskNotificationOperationCapability;
    waitFor: OpenDeskNotificationOperationCapability;
    dismiss: OpenDeskNotificationOperationCapability;
    activate: OpenDeskNotificationOperationCapability;
    events: OpenDeskNotificationOperationCapability;
  }

  interface OpenDeskNotifications {
    list(options?: OpenDeskNotificationListOptions): Promise<OpenDeskNotificationRecord[]>;
    waitFor(options?: OpenDeskNotificationWaitOptions): Promise<OpenDeskNotificationRecord>;
    dismiss(target: string | { id: string }): Promise<{ id: string; dismissed: true }>;
    getCapabilities(): OpenDeskNotificationCapabilities;
  }

  var Notifications: OpenDeskNotifications;
}
