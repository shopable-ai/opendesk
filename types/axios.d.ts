export {};

declare global {
  interface OpenDeskAxiosConfig {
    method?: string;
    url?: string;
    headers?: Record<string, unknown>;
    timeout?: number;
    signal?: AbortSignal;
    params?: Record<string, unknown>;
    data?: unknown;
    responseType?: "json" | "text" | "arraybuffer";
    validateStatus?: (status: number) => boolean;
    [key: string]: unknown;
  }

  interface OpenDeskAxiosResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, unknown>;
  }

  interface OpenDeskAxiosInterceptorManager<T> {
    use(fulfilled: (value: T) => T | Promise<T>): number;
  }

  interface OpenDeskAxiosInstance {
    /** Mutate fields on this shared object; replacing it does not replace request()'s captured defaults. */
    defaults: OpenDeskAxiosConfig;
    interceptors: {
      request: OpenDeskAxiosInterceptorManager<OpenDeskAxiosConfig>;
      response: OpenDeskAxiosInterceptorManager<OpenDeskAxiosResponse>;
    };
    /** Merges captured defaults, awaits interceptors, then validates status. T does not validate response data. */
    request<T = unknown>(config: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>;
    get<T = unknown>(url: string, config?: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>;
    post<T = unknown>(url: string, data?: unknown, config?: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>;
    put<T = unknown>(url: string, data?: unknown, config?: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>;
    delete<T = unknown>(url: string, config?: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>;
    patch<T = unknown>(url: string, data?: unknown, config?: OpenDeskAxiosConfig): Promise<OpenDeskAxiosResponse<T>>;
  }

  var axios: OpenDeskAxiosInstance;
}
