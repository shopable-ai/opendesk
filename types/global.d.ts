export {};

declare global {
  interface OpenDeskNotifyOptions {
    title?: string;
    message?: string;
    sound?: boolean;
    timeout?: number;
    [key: string]: unknown;
  }

  type OpenDeskTimerId = number;

  interface AbortSignal {
    readonly aborted: boolean;
    readonly reason?: unknown;
    addEventListener(type: "abort", listener: (event: { type: "abort"; target: AbortSignal }) => void): void;
    removeEventListener(type: "abort", listener: (event: { type: "abort"; target: AbortSignal }) => void): void;
  }

  interface AbortController {
    readonly signal: AbortSignal;
    abort(reason?: unknown): void;
  }

  var AbortController: {
    new (): AbortController;
  };

  function copyToClipboard(text: string): void;
  function getClipboard(): string;
  function notify(options: string | OpenDeskNotifyOptions): void;

  function sleep(ms: number): Promise<void>;
  function sleepSeconds(seconds: number): Promise<void>;

  function setTimeout(callback: () => void, delay?: number): OpenDeskTimerId;
  function clearTimeout(id: OpenDeskTimerId): void;
  function setInterval(callback: () => void, delay?: number): OpenDeskTimerId;
  function clearInterval(id: OpenDeskTimerId): void;
  function requestAnimationFrame(callback: (timestamp: number) => void): OpenDeskTimerId;
  function cancelAnimationFrame(id: OpenDeskTimerId): void;

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
