export {};

declare global {
  type OpenDeskClipboardFormat = 'text/plain' | 'text/html' | 'text/rtf' | 'image/png' | 'files';

  interface OpenDeskClipboardPayload {
    text?: string;
    html?: string;
    /** Canonical base64 for RTF bytes. */
    rtfBase64?: string;
    /** Canonical base64 for a complete PNG file. */
    pngBase64?: string;
    /** Clean absolute paths to existing local files. */
    files?: string[];
  }

  interface OpenDeskClipboardReadOptions {
    formats?: OpenDeskClipboardFormat[];
    /** Aggregate returned payload limit. Range: 1..16777216 bytes. */
    maxBytes?: number;
  }

  interface OpenDeskClipboardReadResult {
    formats: OpenDeskClipboardFormat[];
    nativeFormats: string[];
    /** Known compatibility sidecars which are regenerated, not byte-preserved. */
    derivedNativeFormats: string[];
    unsupportedNativeFormats: string[];
    changeCount: number;
    text?: string;
    html?: string;
    rtfBase64?: string;
    pngBase64?: string;
    files?: string[];
  }

  interface OpenDeskClipboardWriteResult {
    formats: OpenDeskClipboardFormat[];
    changeCount: number;
  }

  interface OpenDeskClipboardCapabilities {
    schemaVersion: 1;
    platform: string;
    backend: string;
    rich: boolean;
    formats: Record<OpenDeskClipboardFormat, boolean>;
    maxPayloadBytes: 16777216;
    watcher: {
      api: 'Events.on';
      event: 'clipboard.changed';
      contentIncluded: false;
    };
  }

  interface OpenDeskClipboard {
    copy(text: string): void;
    paste(): string;
    clear(): void;
    read(options?: OpenDeskClipboardReadOptions): OpenDeskClipboardReadResult;
    write(payload: OpenDeskClipboardPayload): OpenDeskClipboardWriteResult;
    getFormats(): OpenDeskClipboardFormat[];
    getCapabilities(): OpenDeskClipboardCapabilities;
  }

  var clipboard: OpenDeskClipboard;
}
