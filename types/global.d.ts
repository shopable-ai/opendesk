export {};

declare global {
  interface SymbolConstructor {
    readonly asyncIterator: symbol;
    readonly asyncDispose: symbol;
  }

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
    throwIfAborted(): void;
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
  function queueMicrotask(callback: () => void): void;

  type OpenDeskIntegerTypedArray =
    | Int8Array | Uint8Array | Uint8ClampedArray
    | Int16Array | Uint16Array | Int32Array | Uint32Array
    | BigInt64Array | BigUint64Array;

  interface Crypto {
    getRandomValues<T extends OpenDeskIntegerTypedArray>(array: T): T;
    randomUUID(): string;
  }

  var crypto: Crypto;

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

  interface TextEncoderEncodeIntoResult {
    read: number;
    written: number;
  }

  interface TextEncoder {
    readonly encoding: "utf-8";
    encode(input?: string): Uint8Array;
    encodeInto(input: string, destination: Uint8Array): TextEncoderEncodeIntoResult;
  }

  var TextEncoder: {
    new (): TextEncoder;
  };

  interface TextDecoderOptions {
    fatal?: boolean;
    ignoreBOM?: boolean;
  }

  interface TextDecodeOptions {
    stream?: boolean;
  }

  interface TextDecoder {
    readonly encoding: "utf-8";
    readonly fatal: boolean;
    readonly ignoreBOM: boolean;
    decode(input?: ArrayBuffer | ArrayBufferView, options?: TextDecodeOptions): string;
  }

  var TextDecoder: {
    new (label?: string, options?: TextDecoderOptions): TextDecoder;
  };

  interface OpenDeskReadableStreamReadResult<T> {
    value: T | undefined;
    done: boolean;
  }

  interface ReadableStreamDefaultController<T> {
    readonly desiredSize: number | null;
    enqueue(chunk: T): void;
    close(): void;
    error(reason?: unknown): void;
  }

  interface ReadableStreamDefaultReader<T> {
    readonly closed: Promise<void>;
    read(): Promise<OpenDeskReadableStreamReadResult<T>>;
    cancel(reason?: unknown): Promise<void>;
    releaseLock(): void;
  }

  interface ReadableStream<T = unknown> {
    readonly locked: boolean;
    getReader(): ReadableStreamDefaultReader<T>;
    cancel(reason?: unknown): Promise<void>;
  }

  var ReadableStream: {
    new <T = unknown>(underlyingSource?: {
      start?(controller: ReadableStreamDefaultController<T>): void | PromiseLike<void>;
      pull?(controller: ReadableStreamDefaultController<T>): void | PromiseLike<void>;
      cancel?(reason?: unknown): void | PromiseLike<void>;
    }, strategy?: { highWaterMark?: number }): ReadableStream<T>;
  };

  interface WritableStreamDefaultWriter<T> {
    readonly closed: Promise<void>;
    readonly ready: Promise<void>;
    readonly desiredSize: number | null;
    write(chunk: T): Promise<void>;
    close(): Promise<void>;
    abort(reason?: unknown): Promise<void>;
    releaseLock(): void;
  }

  interface WritableStream<T = unknown> {
    readonly locked: boolean;
    getWriter(): WritableStreamDefaultWriter<T>;
    abort(reason?: unknown): Promise<void>;
    close(): Promise<void>;
  }

  var WritableStream: {
    new <T = unknown>(underlyingSink?: {
      start?(controller: { error(reason?: unknown): void }): void | PromiseLike<void>;
      write?(chunk: T): void | PromiseLike<void>;
      close?(): void | PromiseLike<void>;
      abort?(reason?: unknown): void | PromiseLike<void>;
    }): WritableStream<T>;
  };

  interface TransformStream<I = unknown, O = unknown> {
    readonly readable: ReadableStream<O>;
    readonly writable: WritableStream<I>;
  }

  var TransformStream: {
    new <I = unknown, O = unknown>(transformer?: {
      start?(controller: ReadableStreamDefaultController<O> & { terminate(): void }): void | PromiseLike<void>;
      transform?(chunk: I, controller: ReadableStreamDefaultController<O> & { terminate(): void }): void | PromiseLike<void>;
      flush?(controller: ReadableStreamDefaultController<O> & { terminate(): void }): void | PromiseLike<void>;
    }): TransformStream<I, O>;
  };
}
