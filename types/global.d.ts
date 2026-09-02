export {};

declare global {
  /** See ../docs/api/global-apis.md and notify.md for defaults, platform behavior, and visibility limits. */
  interface OpenDeskNotifyOptions {
    /** Notification title; empty uses "OpenDesk Notification". NUL is rejected. */
    title?: string;
    /** Custom notification body. NUL is rejected. */
    message?: string;
    /** Requests the platform default sound; OS settings may still silence it. */
    sound?: boolean;
    /** Accepted for compatibility; current platform backends ignore it. */
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
  function notify(message: string): void;
  function notify(options: OpenDeskNotifyOptions): void;

  /** Promise aliases for the host-owned Dialog API; unlike browser dialogs these do not block or accept option callbacks. */
  function alert(message: string | OpenDeskAlertOptions): Promise<void>;
  function confirm(message: string | OpenDeskConfirmOptions): Promise<boolean>;
  function prompt(message: string | OpenDeskPromptOptions): Promise<string | null>;

  function sleep(ms: number): Promise<void>;
  function sleepSeconds(seconds: number): Promise<void>;
  /** Promise-based, non-blocking workflow delay. Does not suspend the host OS. */
  function delay(milliseconds?: number): Promise<void>;

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
    new (init?: string | Record<string, unknown> | Array<[unknown, unknown]>): URLSearchParams;
  };

  interface URL {
    href: string;
    readonly origin: string;
    protocol: string;
    username: string;
    password: string;
    host: string;
    hostname: string;
    port: string;
    pathname: string;
    search: string;
    readonly searchParams: URLSearchParams;
    hash: string;
    toString(): string;
    toJSON(): string;
  }

  var URL: {
    new (input: string | URL, base?: string | URL): URL;
  };
}
