export {};

declare global {
  interface OpenDeskAudioControlCapability {
    read: boolean;
    write: boolean;
  }

  interface OpenDeskAudioVolumeCapability extends OpenDeskAudioControlCapability {
    unit: "scalar";
    minimum: 0;
    maximum: 1;
  }

  interface OpenDeskAudioDevice {
    id: number;
    /** Persistent platform identifier. Do not write user-named device metadata to public evidence. */
    uid: string;
    name: string;
    manufacturer: string;
    /** Platform transport identifier; CoreAudio currently reports a four-character code. */
    transport: string;
    inputChannels: number;
    outputChannels: number;
    alive: boolean;
    defaultInput: boolean;
    defaultOutput: boolean;
    volume: OpenDeskAudioControlCapability;
    mute: OpenDeskAudioControlCapability;
  }

  interface OpenDeskAudioCaptureCapability {
    supported: false;
    status: "notImplemented";
    permission: "microphone" | "screenRecording";
    reason: string;
  }

  type OpenDeskAudioPatternSource =
    | { type: "system" }
    | { type: "process"; /** Positive operating-system process ID. */ pid: number };

  interface OpenDeskAudioPatternReference {
    /** Unique non-empty identifier returned in a match; it is not a business event name. */
    id: string;
    /** Local .wav or .mp3 file used as the reference pattern. */
    path: string;
  }

  interface OpenDeskAudioPatternWatchOptions {
    /** Required. A backend must never silently widen process capture to the system mix. */
    source: OpenDeskAudioPatternSource;
    /** Non-empty references with unique ids. Runtime limits are reported by patternWatch capability. */
    references: OpenDeskAudioPatternReference[];
    /** Finite matcher confidence threshold in (0, 1]; default 0.88. */
    threshold?: number;
    /** Per-reference duplicate suppression interval in 0..600000; default 3000ms. */
    cooldownMs?: number;
    /** Cooperative setup deadline in 1..60000; settlement follows bounded cleanup and blocking OS I/O can delay observation. */
    startupTimeoutMs?: number;
  }

  interface OpenDeskAudioPatternWaitOptions extends OpenDeskAudioPatternWatchOptions {
    /**
     * One-shot listening timeout in 1..600000, counted after setup succeeds; default 30000ms. A timeout rejects with code TIMEOUT.
     * Match, backend error, and timeout use a producer-observed first-signal arbitration.
     */
    timeoutMs?: number;
  }

  type OpenDeskAudioPatternPermission = "screenRecording" | "none";

  interface OpenDeskAudioPatternSourceCapability {
    supported: boolean;
    permission: OpenDeskAudioPatternPermission;
  }

  interface OpenDeskAudioProcessPatternSourceCapability extends OpenDeskAudioPatternSourceCapability {
    selector: "pid";
  }

  interface OpenDeskAudioPatternWatchCapability {
    supported: boolean;
    status: "experimental" | "unsupported";
    platform: string;
    backend: string;
    /** Runtime backend/source probe result. False keeps every source fail-closed. */
    verified: boolean;
    permission: OpenDeskAudioPatternPermission;
    sources: {
      system: OpenDeskAudioPatternSourceCapability;
      process: OpenDeskAudioProcessPatternSourceCapability;
    };
    formats: Array<"wav" | "mp3">;
    matcherVersion: "spectral-template-v1";
    sampleRate: number;
    maxReferences: number;
    maxReferenceBytes: number;
    minReferenceDurationMs: number;
    maxReferenceDurationMs: number;
    maxConcurrentWatchers: number;
    selfPlaybackExclusion: "native" | "runtime-guard" | "unavailable";
    /** Pattern matching never exposes captured PCM to JavaScript. */
    rawAudioExposed: false;
    /** Pattern matching does not create a recording artifact. */
    rawAudioPersisted: false;
    notes: string;
  }

  type OpenDeskAudioSoundWatcherStatus = "listening" | "stopping" | "stopped" | "failed";
  type OpenDeskAudioPatternSourceScope = "system-mix" | "process";

  interface OpenDeskAudioSoundWatcherResult {
    id: string;
    /** "stopped" confirms session release; "failed" records callback/backend/cleanup failure and may leave final cleanup to execution teardown. */
    status: "stopped" | "failed";
    stoppedAt: string;
    matches?: number;
    error?: string;
  }

  interface OpenDeskAudioSoundWatcher {
    readonly id: string;
    readonly backend: string;
    readonly startedAt: string;
    readonly sourceScope: OpenDeskAudioPatternSourceScope;
    /** Confirms the requested stream scope, not application attribution for a system mix. */
    readonly sourceVerified: true;
    status(): OpenDeskAudioSoundWatcherStatus;
    /** True only when this call accepts the transition to stopping. */
    stop(): boolean;
    /**
     * Resolves after the bounded stop/join attempt completes and no new callback can start.
     * Only status "stopped" confirms session release; status "failed" can leave final cleanup to execution teardown.
     * It does not await or cancel a callback Promise that was already invoked before stop was accepted.
     * While the execution is still active, a later rejection is reported through its async-error path, but
     * does not change the watcher's stopped terminal state or delay this Promise.
     */
    wait(): Promise<OpenDeskAudioSoundWatcherResult>;
  }

  interface OpenDeskAudioPatternMatchData {
    watchId: string;
    patternId: string;
    /** Matcher similarity, not a business probability. */
    confidence: number;
    startOffsetMs: number;
    endOffsetMs: number;
    /** Digest identifies the validated reference without exposing its path or contents. */
    referenceDigest: string;
    sourceScope: OpenDeskAudioPatternSourceScope;
    /** Confirms the requested stream scope, not application attribution for a system mix. */
    sourceVerified: true;
    contentIncluded: false;
  }

  interface OpenDeskAudioPatternMatch {
    schemaVersion: 1;
    type: "audio.pattern.matched";
    backend: string;
    timestamp: string;
    sequence: number;
    /** Number of earlier undispatched matches superseded or folded into this callback delivery. */
    coalesced: number;
    data: OpenDeskAudioPatternMatchData;
  }

  interface OpenDeskAudioCapabilities {
    schemaVersion: 1;
    platform: string;
    backend: "coreaudio" | "unavailable" | string;
    controls: {
      volume: OpenDeskAudioVolumeCapability;
      mute: OpenDeskAudioControlCapability;
    };
    devices: {
      input: boolean;
      output: boolean;
      defaultInput: boolean;
      defaultOutput: boolean;
      setDefaultOutput: false;
    };
    capture: {
      microphone: OpenDeskAudioCaptureCapability;
      systemAudio: OpenDeskAudioCaptureCapability;
    };
    /** In-memory known-sound matching; independent from recording capture APIs. */
    patternWatch: OpenDeskAudioPatternWatchCapability;
    playback: {
      namespace: "Sound";
      /** Legacy play* / playSound / play methods block until completion. */
      blocking: true;
      /** start() and playAsync() return without blocking the Runtime event loop. */
      nonBlocking: true;
      controllable: true;
      formats: string[];
    };
    notes: string;
  }

  interface OpenDeskAudio {
    /** Default output scalar in the inclusive 0..1 range. */
    getVolume(): number;
    /** Sets the default output scalar and returns the hardware readback. */
    setVolume(value: number): number;
    isMuted(): boolean;
    /** Returns the hardware mute readback. */
    mute(): boolean;
    /** Returns the hardware mute readback. */
    unmute(): boolean;
    /** Returns the new hardware mute state. */
    toggleMute(): boolean;
    getOutputDevices(): OpenDeskAudioDevice[];
    getInputDevices(): OpenDeskAudioDevice[];
    getDefaultOutput(): OpenDeskAudioDevice | null;
    getDefaultInput(): OpenDeskAudioDevice | null;
    /**
     * Starts an execution-owned in-memory known-sound watcher.
     * Callback rejection while listening fails the watcher. If the execution is still active, a rejection that
     * settles after stop was accepted is still an async error, but does not replace the stopped terminal state.
     */
    watchSound(
      options: OpenDeskAudioPatternWatchOptions,
      callback: (event: OpenDeskAudioPatternMatch) => void | Promise<void>,
    ): Promise<OpenDeskAudioSoundWatcher>;
    /**
     * Resolves only after the first match and successful capture release.
     * A native cleanup failure rejects instead of returning the saved match.
     */
    waitForSound(options: OpenDeskAudioPatternWaitOptions): Promise<OpenDeskAudioPatternMatch>;
    getCapabilities(): OpenDeskAudioCapabilities;
  }

  var Audio: OpenDeskAudio;
}
