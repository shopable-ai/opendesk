export {};

declare global {
  type OpenDeskModelCallKind = 'llm' | 'agent';
  type OpenDeskOutputValidation = 'native' | 'local';
  type OpenDeskJSONSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

  interface OpenDeskJSONSchema {
    type: OpenDeskJSONSchemaType;
    properties?: Record<string, OpenDeskJSONSchema>;
    required?: string[];
    additionalProperties?: boolean;
    items?: OpenDeskJSONSchema;
    enum?: unknown[];
    const?: unknown;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    minLength?: number;
    maxLength?: number;
    minItems?: number;
    maxItems?: number;
  }

  interface OpenDeskTextOutput {
    type?: 'text';
  }

  interface OpenDeskJSONOutput {
    type: 'json';
    name?: string;
    /** Native schema-constrained generation is the default. Local must be explicit. */
    validation?: OpenDeskOutputValidation;
    schema: OpenDeskJSONSchema;
  }

  type OpenDeskModelOutput = OpenDeskTextOutput | OpenDeskJSONOutput;

  interface OpenDeskModelCallMeta {
    callId: string;
    profile: string | null;
    kind: OpenDeskModelCallKind;
    backend: string;
    adapter: string;
    /** Model requested by the call or selected profile. */
    requestedModel: string | null;
    /** Model reported by the backend, or null when the backend did not report one. */
    model: string | null;
    durationMs: number;
    /** Backend-reported usage only; null when not reported. */
    usage: Record<string, unknown> | null;
  }

  interface OpenDeskModelCallResult<T = unknown> {
    data: T;
    meta: OpenDeskModelCallMeta;
  }

  interface OpenDeskModelCallError extends Error {
    name: 'ModelCallError';
    code: string;
    operation: 'LLM.generate' | 'LLM.getCapabilities' | 'Agent.run' | 'Agent.getCapabilities';
    phase: 'validation' | 'configuration' | 'preparation' | 'transport' | 'process' | 'protocol' | 'output-validation' | 'timeout' | 'cancel';
    backend?: string;
    profile?: string;
    protocol?: string;
    causeCode?: string;
    status?: number;
  }

  interface OpenDeskModelCapabilityError {
    code: string;
    message: string;
    backend?: string | null;
    protocol?: string | null;
    profile?: string | null;
  }
}
