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

declare global {
  /** ready is complete; needs-review remains generatable with explicit warnings/omissions; blocked means package integrity is insufficient. */
  type OpenDeskRecorderReadiness = 'ready' | 'needs-review' | 'blocked';

  interface OpenDeskRecorderIssue {
    code: string;
    severity: 'warning' | 'error' | string;
    message: string;
    eventId?: string;
  }

  interface OpenDeskRecorderCapabilities {
    capture: {
      available: boolean;
      supported: boolean;
      hostAuthorized: boolean;
      permission: 'authorized' | 'denied' | 'not-required' | 'unsupported' | 'unknown';
      platform: string;
      backend: string;
      library: {name: 'libuiohook'; version: '1.2.2'; commit: string; linkage: 'source-static'};
      coordinateSpace: 'screen-logical' | 'unavailable' | string;
      keyboardDefault: false;
      evidenceModes: Array<'none' | 'target-semantics'>;
      limitations: string[];
    };
    actions: {available: true; version: string; actionSubset: string[]};
    basicGeneration: {available: true; mode: 'basic'; version: string};
  }

  interface OpenDeskRecorderStartOptions {
    /** Initial foreground-window provenance; it does not filter desktop input or prevent window/application switches. */
    within: {processId: number; title: string};
    /** Saves physical key evidence; committed text capture is additionally gated by keyboardContent. */
    captureKeyboard?: boolean;
    /** Required only for keyboard capture; permits non-secure focused final-value diffs but does not grant host capture authority. */
    keyboardContent?: 'non-sensitive-test';
    /** Defaults to label-only AX evidence for pointer press/release endpoints; pointer values, selections, and secure fields are never persisted. */
    evidence?: 'none' | 'target-semantics';
    /** Must remain below Execution.workdir/.runtime/recordings. */
    outputDir?: string;
    maxDurationMs?: number;
    /** libuiohook keycodes used by an explicit out-of-band control surface. */
    controlKeycodes?: number[];
  }

  interface OpenDeskRecorderStatus {
    captureState: 'starting' | 'recording' | 'paused' | 'stopping' | 'stopped' | 'failed';
    storageState: 'open' | 'saved' | 'partial' | 'failed';
    recordingId: string;
    recordingDir: string;
    counts: {observed: number; accepted: number; persisted: number; filtered: number; paused: number; dropped: number; late: number};
    cutoffSequence: string | null;
    maxDurationMs: number;
    startedAt: string;
    pausedAt: string | null;
    elapsedDurationMs: number;
    activeDurationMs: number;
    pausedDurationMs: number;
    pauseCount: number;
    issues: OpenDeskRecorderIssue[];
  }

  interface OpenDeskRecorderControlResult {
    changed: boolean;
    captureState: 'recording' | 'paused';
    transitionSequence: string | null;
    transitionedAt: string;
  }

  interface OpenDeskRecorderControlClickEvent {
    sessionId: string;
    windowId: string;
    targetId: string;
    type: 'click';
    sequence: number;
    timestamp: string;
    /** Original screen-logical bounds emitted by the Custom UI host for the clicked control. */
    bounds: ClawdeskUIBounds;
  }

  interface OpenDeskRecorderControlClickResult {
    changed: boolean;
    transitionSequence: string | null;
    /** Native raw event IDs excluded by the auditable control boundary. */
    eventIds: string[];
    /** Whether native input was matched, absent, or present but ambiguous inside the control bounds. */
    matchStatus: 'matched' | 'not-observed' | 'unmatched';
  }

  interface OpenDeskRecorderStopResult {
    recordingId: string;
    recordingDir: string;
    rawFile: string | null;
    manifestFile: string | null;
    captureState: 'stopped' | 'failed';
    storageState: 'saved' | 'partial' | 'failed';
    counts: OpenDeskRecorderStatus['counts'];
    issues: OpenDeskRecorderIssue[];
  }

  interface OpenDeskRecorderSession {
    status(): OpenDeskRecorderStatus;
    pause(): Promise<OpenDeskRecorderControlResult>;
    resume(): Promise<OpenDeskRecorderControlResult>;
    excludeControlClick(event: OpenDeskRecorderControlClickEvent): Promise<OpenDeskRecorderControlClickResult>;
    stop(): Promise<OpenDeskRecorderStopResult>;
  }

  interface OpenDeskRecorderActionsResult {
    actionsFile: string;
    revision: number;
    actionCount: number;
    readiness: OpenDeskRecorderReadiness;
    issues: OpenDeskRecorderIssue[];
  }

  interface OpenDeskRecorderGenerationTiming {
    /** Lower bound for every non-pause inter-action delay. Defaults to 500. */
    minimumDelayMs: number;
    /** Upper bound for every non-pause inter-action delay. Defaults to 30000. */
    maximumDelayMs: number;
    /** Recorded gaps are divided by this value before clamping. Defaults to 1. */
    speedMultiplier: number;
  }

  /** Controls synthetic pointer transit before click, wheel, and drag-start input. */
  type OpenDeskRecorderPointerMotion = 'instant' | 'smooth';

  interface OpenDeskRecorderGenerateOptions {
    mode?: 'basic';
    outputFile?: string;
    timing?: Partial<OpenDeskRecorderGenerationTiming>;
    /** Defaults to instant for API compatibility; the recording toolbar explicitly defaults this to smooth. */
    pointerMotion?: OpenDeskRecorderPointerMotion;
  }

  interface OpenDeskRecorderScriptResult {
    scriptFile: string;
    candidateFile: string;
    actionsSha256: string;
    scriptSha256: string;
    constraints: string[];
    verification: 'not-run';
    /** Fully resolved timing policy used to emit sleep calls. */
    timing: OpenDeskRecorderGenerationTiming;
    /** Fully resolved pointer transit policy embedded in the generated source and candidate. */
    pointerMotion: OpenDeskRecorderPointerMotion;
  }

  interface OpenDeskRecorderRuntime {
    getCapabilities(): OpenDeskRecorderCapabilities;
    start(options: OpenDeskRecorderStartOptions): Promise<OpenDeskRecorderSession>;
    buildActions(recordingDir: string): Promise<OpenDeskRecorderActionsResult>;
    /** Generates from ready or needs-review actions; blocked packages are rejected. */
    generateScript(actionsFile: string, options?: OpenDeskRecorderGenerateOptions): Promise<OpenDeskRecorderScriptResult>;
  }

  var Recorder: OpenDeskRecorderRuntime;
}
