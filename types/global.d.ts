export {};

declare global {
  interface ClawdeskNotifyOptions {
    title?: string;
    message?: string;
    sound?: boolean;
    timeout?: number;
    [key: string]: unknown;
  }

  type ClawdeskTimerId = number;

  function copyToClipboard(text: string): void;
  function getClipboard(): string;
  function notify(options: string | ClawdeskNotifyOptions): void;

  function sleep(ms: number): Promise<void>;
  function sleepSeconds(seconds: number): Promise<void>;

  function setTimeout(callback: () => void, delay?: number): ClawdeskTimerId;
  function clearTimeout(id: ClawdeskTimerId): void;
  function setInterval(callback: () => void, delay?: number): ClawdeskTimerId;
  function clearInterval(id: ClawdeskTimerId): void;
  function requestAnimationFrame(callback: (timestamp: number) => void): ClawdeskTimerId;
  function cancelAnimationFrame(id: ClawdeskTimerId): void;

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
