export type RecorderObservationPolicy = 'minimal' | 'standard' | 'enriched';
export type RecorderVerificationStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export interface RecorderPostcondition {
  kind: string;
  value?: unknown;
}

export interface RecorderActionHint {
  goal?: string;
  subgoal?: string;
  intent?: string;
  targetDescription?: string;
  expectedPostconditions?: RecorderPostcondition[];
  risk?: string;
  variableHints?: Array<{name: string; classification: string; argument?: string}>;
  recoveryReason?: string;
}

export interface RecorderManifest {
  schemaVersion: '0.1.0';
  sessionId: string;
  executionId?: string;
  goal: string;
  source: string;
  observationPolicy: RecorderObservationPolicy;
  state: 'active' | 'stopped';
  startedAt: string;
  stoppedAt?: string;
  eventCount: number;
  actionCount: number;
  internalObservationCount: number;
  internalObservationRecursionCount: number;
  secretPlaintextLeakCount: number;
  paths: Record<string, string>;
}

export interface RecorderFlowStep {
  stepId: string;
  sourceActionIds: string[];
  intent: string;
  target: string;
  locatorCandidates: unknown[] | null;
  preconditions: RecorderPostcondition[] | null;
  action: {name: string; arguments?: Record<string, unknown>};
  expectedPostconditions: RecorderPostcondition[] | null;
  verification: {status: RecorderVerificationStatus; evidenceRefs?: string[]};
  risk: string;
}

export interface RecorderFlow {
  schemaVersion: '0.1.0';
  flowId: string;
  sessionId: string;
  goal: string;
  mode: 'deterministic';
  createdAt: string;
  steps: RecorderFlowStep[];
}
