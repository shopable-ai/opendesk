export {};

declare global {
  type OpenDeskLLMProtocol = 'openai-responses' | 'openai-chat-completions';

  interface OpenDeskLLMMessage {
    role: 'user' | 'assistant';
    content: string;
  }

  interface OpenDeskLLMGenerationOptions {
    maxOutputTokens?: number;
    reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  }

  interface OpenDeskLLMGenerateOptions {
    /** Exactly one of prompt and messages is required. */
    prompt?: string;
    /** Exactly one of prompt and messages is required. System messages use the separate system option. */
    messages?: OpenDeskLLMMessage[];
    system?: string;
    profile?: string;
    output?: OpenDeskModelOutput;
    generation?: OpenDeskLLMGenerationOptions;
    /** Total call deadline, including configuration, retries, parsing, and validation. */
    timeoutMs?: number;
    signal?: AbortSignal | null;
  }

  interface OpenDeskLLMCapabilities {
    schemaVersion: 1;
    kind: 'llm';
    enabled: boolean;
    executionScoped: true;
    supported: boolean;
    configured: boolean;
    executableFound: null;
    checked: false;
    authenticated: false | 'unknown';
    available: null;
    profile: string | null;
    protocol: string;
    supportedProtocols: OpenDeskLLMProtocol[];
    reservedProtocols: string[];
    structuredOutput: {native: boolean; local: true};
    selectionError: OpenDeskModelCapabilityError | null;
  }

  interface OpenDeskLLMRuntime {
    /** Side-effect-free configuration and adapter capability query. */
    getCapabilities(options?: {profile?: string}): OpenDeskLLMCapabilities;
    /** Runs one execution-owned HTTP model call and returns validated business data. */
    generate<T = string>(options: OpenDeskLLMGenerateOptions): Promise<OpenDeskModelCallResult<T>>;
  }

  var LLM: OpenDeskLLMRuntime;
}
