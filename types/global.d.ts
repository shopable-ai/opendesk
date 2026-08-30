export {};

declare global {
  interface ClawdeskNotifyOptions {
    title?: string;
    message?: string;
    sound?: boolean;
    timeout?: number;
    [key: string]: unknown;
  }

  function copyToClipboard(text: string): void;
  function getClipboard(): string;
  function notify(options: string | ClawdeskNotifyOptions): void;

  function sleep(ms: number): Promise<void>;
  function sleepSeconds(seconds: number): Promise<void>;

  function setTimeout(callback: (...args: any[]) => void, delay?: number, ...args: any[]): unknown;
  function clearTimeout(id: unknown): void;
  function setInterval(callback: (...args: any[]) => void, delay?: number, ...args: any[]): unknown;
  function clearInterval(id: unknown): void;
  function requestAnimationFrame(callback: (timestamp: number) => void): unknown;
  function cancelAnimationFrame(id: unknown): void;

  interface URLSearchParams {
    append(name: string, value: unknown): void;
    delete(name: string): void;
    get(name: string): string | null;
    getAll(name: string): string[];
    has(name: string): boolean;
    set(name: string, value: unknown): void;
    toString(): string;
    entries(): Array<[string, string]>;
    keys(): string[];
    values(): string[];
  }

  var URLSearchParams: {
    new (init?: string | Record<string, unknown>): URLSearchParams;
  };
}
