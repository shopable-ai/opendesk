export {};

declare global {
  type OpenDeskAgentBackend = 'codex' | 'claude-code';

  interface OpenDeskCodexBackendOptions {
    reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  }

  interface OpenDeskClaudeCodeBackendOptions {
    maxBudgetUsd?: number;
  }

  interface OpenDeskAgentBackendOptions {
    codex?: OpenDeskCodexBackendOptions;
    'claude-code'?: OpenDeskClaudeCodeBackendOptions;
  }

  interface OpenDeskAgentRunOptions {
    backend?: OpenDeskAgentBackend | string;
    profile?: string;
    prompt: string;
    /** Selects a model within the already selected backend; it never changes backend. */
    model?: string;
    output?: OpenDeskModelOutput;
    cwd?: string;
    /** Total call deadline, including configuration, preparation, process work, parsing, and validation. */
    timeoutMs?: number;
    signal?: AbortSignal | null;
    backendOptions?: OpenDeskAgentBackendOptions;
  }

  interface OpenDeskAgentCapabilities {
    schemaVersion: 1;
    kind: 'agent';
    enabled: boolean;
    executionScoped: true;
    defaultBackend: 'codex';
    supported: boolean;
    configured: boolean;
    /** True only when the selected absolute path or fixed built-in PATH name resolves to an executable file. */
    executableFound: boolean | null;
    checked: false;
    authenticated: boolean | 'unknown';
    available: null;
    backend: string;
    profile: string | null;
    requestedModel: string | null;
    supportedBackends: OpenDeskAgentBackend[];
    reservedBackends: string[];
    structuredOutput: {native: boolean; local: true};
    selectionError: OpenDeskModelCapabilityError | null;
  }

  interface OpenDeskAgentRuntime {
    /** Side-effect-free profile, backend, and executable discovery query; never launches the CLI or checks login. */
    getCapabilities(options?: {backend?: string; profile?: string}): OpenDeskAgentCapabilities;
    /** Runs one task through the selected execution-owned CLI adapter. */
    run<T = string>(options: OpenDeskAgentRunOptions): Promise<OpenDeskModelCallResult<T>>;
  }

  var Agent: OpenDeskAgentRuntime;
}
