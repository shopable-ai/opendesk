export {};

declare global {
  type ClawdeskUIActivationSource = "disabled" | "cli" | "projectConfig" | "httpRequest";
  type ClawdeskUIWindowKind = "normal" | "floating";
  type ClawdeskUIWindowStatus = "creating" | "hidden" | "visible" | "closing" | "closed" | "failed";
  type ClawdeskUITheme = "system" | "dark";
  type ClawdeskUIEventType = "click" | "change" | "input" | "move" | "resize" | "close";
  type ClawdeskUIControlType = "button" | "text" | "img" | "switch" | "input" | "select" | "container";

  interface ClawdeskUIBounds {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface ClawdeskUIContentSpec {
    /**
     * Explicit local HTML file. Exactly one of file or html is required.
     * Paths are confined to the script directory.
     */
    file?: string;
    /**
     * Restricted inline HTML, or a relative .html/.htm file path resolved from
     * the script directory. Use markup (for example, <p>panel.html</p>) for
     * literal inline text ending in .html or .htm.
     */
    html?: string;
    cssFile?: string;
    css?: string;
    basePath?: string;
  }

  interface ClawdeskUIWindowSpec {
    id: string;
    kind?: ClawdeskUIWindowKind;
    title?: string;
    bounds: ClawdeskUIBounds;
    alwaysOnTop?: boolean;
    draggable?: boolean;
    theme?: ClawdeskUITheme;
    content: ClawdeskUIContentSpec;
  }

  interface ClawdeskUIControlDescriptor {
    id: string;
    type: ClawdeskUIControlType;
    order: number;
  }

  interface ClawdeskUIWindowState {
    id: string;
    sessionId: string;
    status: ClawdeskUIWindowStatus;
    visible: boolean;
    bounds: ClawdeskUIBounds;
    alwaysOnTop: boolean;
    draggable: boolean;
    hostPid?: number;
    nativeWindowId?: number;
    onScreen: boolean;
    layer: number;
    alpha: number;
    revision: number;
    lastSequence: number;
  }

  interface ClawdeskUIControlState {
    id: string;
    type: ClawdeskUIControlType;
    text?: string;
    icon?: ClawdeskFloatingIcon;
    value?: unknown;
    checked?: boolean;
    active: boolean;
    disabled: boolean;
    busy: boolean;
    error?: string;
    visible: boolean;
    classes?: string[];
    localBounds: ClawdeskUIBounds;
    screenBounds: ClawdeskUIBounds;
    extra?: Record<string, unknown>;
  }

  interface ClawdeskUISelectOption {
    value: string;
    label: string;
  }

  interface ClawdeskUIControlPatch {
    text?: string;
    /** button controls only; restricted to the built-in toolbar icon registry. */
    icon?: ClawdeskFloatingIcon;
    value?: unknown;
    checked?: boolean;
    /** button controls only. */
    active?: boolean;
    disabled?: boolean;
    /** button controls only. */
    busy?: boolean;
    /** button controls only; use an empty string to clear. */
    error?: string;
    visible?: boolean;
    classes?: string[];
    /** img controls only; validated against content.basePath. */
    source?: string;
    /** select controls only. */
    options?: ClawdeskUISelectOption[];
  }

  interface ClawdeskUIEvent {
    sessionId: string;
    windowId: string;
    targetId?: string;
    type: ClawdeskUIEventType;
    sequence: number;
    timestamp: string;
    value?: unknown;
    checked?: boolean;
    bounds?: ClawdeskUIBounds;
    reason?: string;
    fields?: Record<string, unknown>;
  }

  interface ClawdeskUICapabilities {
    protocolVersion: string;
    enabled: boolean;
    available: boolean;
    activationSource: ClawdeskUIActivationSource;
    platform: string;
    driver: string;
    maxSessions: number;
    window: Record<"position" | "size" | "alwaysOnTop" | "draggable" | "nativeIdentity", boolean>;
    controls: ClawdeskUIControlType[];
    reason?: string;
  }

  interface ClawdeskUIError extends Error {
    code: "UI_DISABLED" | "UNSUPPORTED_PLATFORM" | "UNSUPPORTED_CAPABILITY" |
      "INVALID_SPEC" | "DUPLICATE_ID" | "NOT_FOUND" | "INVALID_STATE" |
      "UI_EVENT_QUEUE_OVERFLOW" | "UI_DRIVER_FAILURE" | "UI_HOST_NOT_FOUND" |
      "UI_BUSY" | "UI_CANCELED" | "UI_CALLBACK_FAILED";
    operation?: string;
    windowId?: string;
    targetId?: string;
    capability?: string;
  }

  type ClawdeskUIUnsubscribe = () => void;
  type ClawdeskUIEventListener = (event: ClawdeskUIEvent) => void | Promise<void>;

  interface ClawdeskUIControlHandle {
    readonly id: string;
    getState(): Promise<ClawdeskUIControlState>;
    update(patch: ClawdeskUIControlPatch): Promise<ClawdeskUIControlState>;
    on(type: ClawdeskUIEventType | "*", listener: ClawdeskUIEventListener): ClawdeskUIUnsubscribe;
  }

  interface ClawdeskUIWindowHandle {
    readonly id: string;
    controls(): ClawdeskUIControlDescriptor[];
    show(): Promise<ClawdeskUIWindowState>;
    hide(): Promise<ClawdeskUIWindowState>;
    close(): Promise<ClawdeskUIWindowState>;
    getState(): Promise<ClawdeskUIWindowState>;
    setBounds(bounds: ClawdeskUIBounds): Promise<ClawdeskUIWindowState>;
    setPosition(x: number, y: number): Promise<ClawdeskUIWindowState>;
    setSize(width: number, height: number): Promise<ClawdeskUIWindowState>;
    setAlwaysOnTop(enabled: boolean): Promise<ClawdeskUIWindowState>;
    setDraggable(enabled: boolean): Promise<ClawdeskUIWindowState>;
    waitUntilClosed(): Promise<ClawdeskUIWindowState>;
    control(id: string): ClawdeskUIControlHandle;
    on(type: ClawdeskUIEventType | "*", listener: ClawdeskUIEventListener): ClawdeskUIUnsubscribe;
  }

  interface ClawdeskUI {
    getCapabilities(): ClawdeskUICapabilities;
    createWindow(spec: ClawdeskUIWindowSpec): Promise<ClawdeskUIWindowHandle>;
    closeAll(): Promise<void>;
    on(type: ClawdeskUIEventType | "*", listener: ClawdeskUIEventListener): ClawdeskUIUnsubscribe;
  }

  /** Always injected; dormant calls reject with UI_DISABLED until explicitly authorized. */
  var ui: ClawdeskUI;

  interface ClawdeskExecutionMetadata {
    /** Stable short alias for executionId. */
    id: string;
    executionId: string;
    /** JSON-compatible input supplied by `opendesk ai run`. */
    input: unknown;
    /** Working directory selected by the execution caller. */
    workdir: string;
    stack: string;
    artifactDir: string;
    source: string;
    ext: string;
    scriptHash: string;
    /** Custom UI activation source for this execution. */
    activationSource: ClawdeskUIActivationSource;
  }

  var Execution: ClawdeskExecutionMetadata;
}
