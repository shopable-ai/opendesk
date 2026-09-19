export {};

declare global {
  type ClawdeskUIActivationSource = "disabled" | "cli" | "projectConfig" | "httpRequest";
  type ClawdeskUIWindowStatus = "creating" | "hidden" | "visible" | "closing" | "closed" | "failed";
  type ClawdeskUIEventType = "click" | "change" | "input" | "move" | "resize" | "key" | "interactionOutside" | "close";
  type ClawdeskUIEventSelector = ClawdeskUIEventType | "*";
  type ClawdeskUIUnsubscribe = () => void;

  interface ClawdeskUIBounds {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  interface ClawdeskUISize {
    width: number;
    height: number;
  }

  interface ClawdeskUIWindowPlacement {
    horizontal: string;
    vertical: string;
    margin?: number;
    display?: string;
  }

  interface ClawdeskUIRelativePlacement {
    preferredSides: string[];
    align?: string;
    gap?: number;
  }

  interface ClawdeskUIContentSpec {
    file?: string;
    html?: string;
    cssFile?: string;
    css?: string;
    basePath?: string;
  }

  interface ClawdeskUIAbsolutePosition {
    mode: "absolute";
    bounds: ClawdeskUIBounds;
  }

  interface ClawdeskUIAnchorPosition {
    mode: "anchor";
    size: ClawdeskUISize;
    horizontal: string;
    vertical: string;
    margin?: number;
    display?: string;
  }

  type ClawdeskUIInitialPosition = ClawdeskUIAbsolutePosition | ClawdeskUIAnchorPosition;

  interface ClawdeskUIWindowSpec {
    id: string;
    kind?: "normal" | "floating";
    title?: string;
    position?: ClawdeskUIInitialPosition;
    /** Compatibility spelling for an absolute initial position. Do not combine with position. */
    bounds?: ClawdeskUIBounds;
    alwaysOnTop?: boolean;
    draggable?: boolean;
    keyEvents?: boolean;
    interactionGroup?: string;
    theme?: "system" | "dark";
    content: ClawdeskUIContentSpec;
  }

  interface ClawdeskUIControlDescriptor {
    id: string;
    type: string;
    order: number;
  }

  interface ClawdeskUICapabilities {
    protocolVersion: string;
    enabled: boolean;
    available: boolean;
    activationSource: ClawdeskUIActivationSource;
    platform: string;
    driver: string;
    maxSessions: number;
    window: Record<string, boolean>;
    controls: string[];
    reason?: string;
  }

  interface ClawdeskUIToastProgressRange {
    min?: number;
    max?: number;
    value?: number;
    indeterminate?: false;
  }

  interface ClawdeskUIToastProgressIndeterminate {
    indeterminate: true;
    min?: never;
    max?: never;
    value?: never;
  }

  type ClawdeskUIToastProgress = ClawdeskUIToastProgressRange | ClawdeskUIToastProgressIndeterminate;

  type ClawdeskUIToastPosition =
    | { mode: "auto" }
    | { mode: "absolute"; x: number; y: number }
    | {
        mode: "anchor";
        horizontal: string;
        vertical: string;
        margin?: number;
        display?: string;
      }
    | {
        mode: "relative";
        target: string | ClawdeskFloatingWindow;
        side?: string;
        align?: string;
        gap?: number;
        follow?: boolean;
      };

  interface ClawdeskUIToastOptions {
    message: string;
    caption?: string;
    level?: "info" | "success" | "warning" | "error";
    timeoutMs?: number;
    timeoutProgress?: boolean;
    closable?: boolean;
    progress?: ClawdeskUIToastProgress | null;
    position?: ClawdeskUIToastPosition;
  }

  interface ClawdeskUIToastState extends ClawdeskUIToastOptions {
    remainingMs?: number;
    positionAdjustment?: string;
    closeReason?: string;
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
    /** Preferred toast state alias added by the Runtime facade. */
    toast?: ClawdeskUIToastState;
    /** Compatibility state name retained by the native protocol. */
    notification?: ClawdeskUIToastState;
  }

  interface ClawdeskUIControlState {
    id: string;
    type: string;
    source?: string;
    imageComplete?: boolean;
    imageNaturalWidth?: number;
    imageNaturalHeight?: number;
    text: string;
    icon?: string;
    accessibilityName?: string;
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

  interface ClawdeskUIControlPatch {
    text?: string;
    icon?: string;
    value?: unknown;
    checked?: boolean;
    active?: boolean;
    disabled?: boolean;
    busy?: boolean;
    error?: string;
    visible?: boolean;
    classes?: string[];
    source?: string;
    options?: Array<{ value: string; label: string }>;
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

  type ClawdeskUIEventListener = (event: ClawdeskUIEvent) => void | Promise<void>;

  interface ClawdeskUIControlHandle {
    readonly id: string;
    getState(): Promise<ClawdeskUIControlState>;
    update(patch: ClawdeskUIControlPatch): Promise<ClawdeskUIControlState>;
    on(type: EventType | "*", listener: (event: UIEvent) => void | Promise<void>): () => void;
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
    setPlacement(placement: ClawdeskUIWindowPlacement): Promise<ClawdeskUIWindowState>;
    setRelativeTo(anchor: ClawdeskUIBounds, options: ClawdeskUIRelativePlacement): Promise<ClawdeskUIWindowState>;
    setSize(width: number, height: number): Promise<ClawdeskUIWindowState>;
    setAlwaysOnTop(alwaysOnTop: boolean): Promise<ClawdeskUIWindowState>;
    setDraggable(enabled: boolean): Promise<ClawdeskUIWindowState>;
    waitUntilClosed(): Promise<ClawdeskUIWindowState>;
    control(id: string): ClawdeskUIControlHandle;
    on(type: ClawdeskUIEventSelector, listener: ClawdeskUIEventListener): ClawdeskUIUnsubscribe;
  }

  interface ClawdeskUIToastHandle {
    readonly id: string;
    update(patch: Partial<ClawdeskUIToastOptions>): Promise<{
      applied: boolean;
      reason?: "closed";
      state: ClawdeskUIWindowState;
    }>;
    close(): Promise<ClawdeskUIWindowState>;
    getState(): Promise<ClawdeskUIWindowState>;
    waitUntilClosed(): Promise<ClawdeskUIWindowState>;
  }

  interface ClawdeskUI {
    /** Preferred OpenDesk-owned transient feedback API. */
    toast(messageOrOptions: string | ToastOptions): Promise<ToastHandle>;
    /** @deprecated Use toast(). */
    notify(messageOrOptions: string | NotificationOptions): Promise<NotificationHandle>;
    getCapabilities(): Capabilities;
    createWindow(spec: WindowSpec): Promise<WindowHandle>;
    closeAll(): Promise<void>;
    on(type: ClawdeskUIEventSelector, listener: ClawdeskUIEventListener): ClawdeskUIUnsubscribe;
  }

  /** Lowercase ui owns OpenDesk Custom UI. It is distinct from uppercase UI desktop automation. */
  var ui: ClawdeskUI;

  // Canonical documentation uses these concise public names.
  type ToastOptions = ClawdeskUIToastOptions;
  type ToastHandle = ClawdeskUIToastHandle;
  type NotificationOptions = ClawdeskUIToastOptions;
  type NotificationHandle = ClawdeskUIToastHandle;
  type WindowSpec = ClawdeskUIWindowSpec;
  type WindowHandle = ClawdeskUIWindowHandle;
  type ControlHandle = ClawdeskUIControlHandle;
  type Capabilities = ClawdeskUICapabilities;
  type EventType = ClawdeskUIEventType;
  type UIEvent = ClawdeskUIEvent;
}
