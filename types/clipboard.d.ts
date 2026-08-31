export {};

declare global {
  interface OpenDeskClipboard {
    copy(text: string): void;
    paste(): string;
    clear(): void;
  }

  var clipboard: OpenDeskClipboard;
}
