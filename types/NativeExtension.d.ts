export {};

declare global {
  /** @experimental Safe per-call overrides; routing is never caller-controlled. */
  interface OpenDeskNativeExtensionCallOptions {
    /** Positive integer deadline in milliseconds, capped by the Host at 60000. */
    timeoutMs?: number;
  }

  interface OpenDeskNativeExtensionMethod<TParams extends Record<string, unknown> = Record<string, unknown>, TResult = unknown> {
    (params: TParams, options?: OpenDeskNativeExtensionCallOptions): TResult;
  }

  interface OpenDeskNativeExtensionNamespace {
    readonly [method: string]: OpenDeskNativeExtensionMethod;
  }

  /** Namespace declarations supplied only by installed plugin type packages. */
  interface OpenDeskNativeExtensionNamespaceMap {}

  /** Plugin ID declarations supplied only by installed plugin type packages. */
  interface OpenDeskNativeExtensionPluginById {}

  interface OpenDeskNativeExtensionDescriptor {
    readonly id: string;
    readonly version: string;
    readonly namespace: string;
    readonly rootKind: "portable" | "app_bundled" | "current_user";
    readonly methods: readonly string[];
    readonly executableSha256: string;
  }

  interface OpenDeskNativeExtensionDiscoveryDiagnostic {
    readonly rootKind: "portable" | "app_bundled" | "current_user" | "test";
    readonly pluginId: string;
    readonly namespace: string;
    readonly schemaVersion: number;
    readonly executable: string;
    readonly executableSha256: string;
    readonly status: "discovered" | "rejected" | "quarantined" | "skipped";
    readonly errorCode: string;
    readonly durationMs: number;
  }

  interface OpenDeskNativeExtensionEvidence {
    readonly pluginId: string;
    readonly namespace: string;
    readonly rootKind: "portable" | "app_bundled" | "current_user" | "test";
    readonly executable: string;
    readonly executableSha256: string;
    readonly method: string;
    readonly protocolVersion: 1;
    readonly requestId?: string;
    readonly startupDurationMs: number;
    readonly durationMs: number;
    readonly exitCode?: number | null;
    readonly status: "succeeded" | "failed" | "timed_out" | "canceled";
    readonly errorCode: string;
    readonly extensionErrorCode?: string;
    readonly extensionMessageBytes?: number;
    readonly extensionMessageSha256?: string;
    readonly stderrCapturedBytes?: number;
    readonly stderrSha256?: string;
    readonly stderrTruncated?: boolean;
  }

  interface OpenDeskNativeExtensionsError extends Error {
    readonly name: "NativeExtensionsError";
    readonly code: string;
    readonly pluginId: string;
    readonly namespace: string;
    readonly method: string;
    readonly extensionCode: string;
    readonly evidence: Partial<OpenDeskNativeExtensionEvidence>;
  }

  interface OpenDeskNativeExtensionsRegistry extends OpenDeskNativeExtensionNamespaceMap {
    list(): readonly OpenDeskNativeExtensionDescriptor[];
    get<K extends keyof OpenDeskNativeExtensionPluginById>(pluginId: K): OpenDeskNativeExtensionPluginById[K];
    get(pluginId: string): OpenDeskNativeExtensionNamespace;
    diagnostics(): readonly OpenDeskNativeExtensionDiscoveryDiagnostic[];
  }

  /**
   * @experimental Absent unless a trusted local CLI execution explicitly uses
   * -experimental-native-extension. The root, namespaces and method properties
   * are frozen, non-writable and non-configurable.
   */
  var NativeExtensions: OpenDeskNativeExtensionsRegistry;

  /** @experimental @unsafe Low-level V0 compatibility options for local diagnostics only. */
  interface OpenDeskUnsafeNativeExtensionCallOptions {
    extension?: string;
    executable?: string;
    method: string;
    params?: Record<string, unknown>;
    timeoutMs?: number;
  }

  interface OpenDeskUnsafeNativeExtension {
    call<TResult = unknown>(options: OpenDeskUnsafeNativeExtensionCallOptions): TResult;
  }

  /**
   * @experimental @unsafe Absent unless local CLI explicitly uses
   * -experimental-unsafe-native-extension-call. HTTP/MCP never expose it.
   */
  var NativeExtension: OpenDeskUnsafeNativeExtension | undefined;
}
