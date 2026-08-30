export {};

declare global {
  interface ClawdeskClipboard {
    copy(text: string): void;
    paste(): string;
    clear(): void;
  }

  var clipboard: ClawdeskClipboard;
}
