export {};

declare global {
  interface ClawdeskConsole {
    log(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    debug(...args: unknown[]): void;
    table(data: unknown): void;
    group(label: string): void;
    groupEnd(label: string): void;
    time(label: string): void;
    timeEnd(label: string): void;
    clear(): void;
  }

  var console: ClawdeskConsole;
}
