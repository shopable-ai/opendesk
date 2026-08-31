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
    [key: string]: unknown;
  }

  interface OpenDeskHttpResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, unknown>;
  }

  interface OpenDeskHttpClient {
    request<T = unknown>(options: OpenDeskHttpRequestOptions): Promise<OpenDeskHttpResponse<T>>;
    get<T = unknown>(url: string, options?: Omit<OpenDeskHttpRequestOptions, "url" | "method">): Promise<OpenDeskHttpResponse<T>>;
    post<T = unknown>(url: string, data?: unknown, options?: Omit<OpenDeskHttpRequestOptions, "url" | "method" | "data">): Promise<OpenDeskHttpResponse<T>>;
  }

  var http: OpenDeskHttpClient;
}
