export {};

declare global {
  interface ClawdeskHttpRequestOptions {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    data?: unknown;
    /** Request deadline in milliseconds. 0 disables the request-local deadline. */
    timeout?: number;
    /** Optional standard AbortSignal-compatible cancellation signal. */
    signal?: AbortSignal;
    [key: string]: unknown;
  }

  interface ClawdeskHttpResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, unknown>;
  }

  interface ClawdeskHttpClient {
    request<T = unknown>(options: ClawdeskHttpRequestOptions): Promise<ClawdeskHttpResponse<T>>;
    get<T = unknown>(url: string, options?: Omit<ClawdeskHttpRequestOptions, "url" | "method">): Promise<ClawdeskHttpResponse<T>>;
    post<T = unknown>(url: string, data?: unknown, options?: Omit<ClawdeskHttpRequestOptions, "url" | "method" | "data">): Promise<ClawdeskHttpResponse<T>>;
  }

  var http: ClawdeskHttpClient;
}
