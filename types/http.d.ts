export {};

declare global {
  interface OpenDeskHttpRequestOptions {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    data?: unknown;
    /** Request deadline in milliseconds. 0 disables the request-local deadline. */
    timeout?: number;
    /** Optional standard AbortSignal-compatible cancellation signal. */
    signal?: AbortSignal;
    /** Buffered response decoding. Defaults to historic JSON-or-text parsing. */
    responseType?: "json" | "text" | "arraybuffer";
    [key: string]: unknown;
  }

  interface OpenDeskHttpResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, unknown>;
  }

  interface OpenDeskHttpDownloadOptions {
    /** Final destination file. Relative paths resolve from Execution.workdir. */
    path: string;
    headers?: Record<string, string>;
    /** Request deadline in milliseconds. 0 only removes the request-local deadline. */
    timeout?: number;
    signal?: AbortSignal;
    /** Actual written-byte limit: 1 byte through 1 GiB; default 64 MiB. */
    maxBytes?: number;
    /** Default false. A safe replacement is used only on supported platforms. */
    overwrite?: boolean;
    /** Default false. Create missing parent directories when true. */
    createDirs?: boolean;
    /** Expected lowercase or uppercase SHA-256 hex digest. */
    sha256?: string;
    /** Default false. Cross-origin redirects drop all caller headers. */
    allowCrossOriginRedirects?: boolean;
  }

  interface OpenDeskHttpDownloadResult {
    path: string;
    bytesWritten: number;
    status: number;
    sha256: string;
    committed: true;
  }

  interface OpenDeskHttpDownloadError extends Error {
    code: string;
    operation: "http.download";
    status: number;
    committed: boolean;
  }

  interface OpenDeskHttpClient {
    request<T = unknown>(options: OpenDeskHttpRequestOptions): Promise<OpenDeskHttpResponse<T>>;
    get<T = unknown>(url: string, options?: Omit<OpenDeskHttpRequestOptions, "url" | "method">): Promise<OpenDeskHttpResponse<T>>;
    post<T = unknown>(url: string, data?: unknown, options?: Omit<OpenDeskHttpRequestOptions, "url" | "method" | "data">): Promise<OpenDeskHttpResponse<T>>;
    download(url: string, options: OpenDeskHttpDownloadOptions): Promise<OpenDeskHttpDownloadResult>;
  }

  var http: OpenDeskHttpClient;
}
