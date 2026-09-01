export {};

declare global {
  type ClawdeskFloatingIcon = "play.fill" | "pause.fill" | "stop.fill" |
    "gearshape.fill" | "paperplane.fill" | "timer";

  interface ClawdeskFloatingWindowOptions {
    x?: number;
    y?: number;
    theme?: "dark";
    title?: string;
    alwaysOnTop?: boolean;
    draggable?: boolean;
  }

  interface ClawdeskFloatingButtonPatch {
    icon?: ClawdeskFloatingIcon;
    label?: string;
    active?: boolean;
    disabled?: boolean;
    busy?: boolean;
    /** String sets an error state; null clears it. */
    error?: string | null;
  }

  /** Reviewed native SF Symbol recipe used only by the built-in icon registry. */
  interface ClawdeskFloatingIconPresentation {
    systemSymbol: string;
    scale: number;
    offsetX: number;
    offsetY: number;
  }

  interface ClawdeskFloatingButtonState {
    id: string;
    label: string;
    icon: ClawdeskFloatingIcon;
    active: boolean;
    disabled: boolean;
    busy: boolean;
    error: string;
    /** Monotonic EventLoop-owned state revision confirmed by the native host. */
    revision: number;
    /** Always empty for the native icon-only toolbar; label remains semantic metadata. */
    renderedText: string;
    iconPresentation: ClawdeskFloatingIconPresentation;
    /** Mirrors the tooltip/ARIA/native Accessibility name. */
    accessibilityName: string;
    localBounds: ClawdeskUIBounds;
    screenBounds: ClawdeskUIBounds;
  }

  type ClawdeskFloatingButtonCallback = (event: ClawdeskUIEvent) => unknown | Promise<unknown>;

  interface ClawdeskFloatingWindow {
    readonly id: string;
    /** Adds one of 1-32 ordered icon-only buttons before first show and recomputes automatic bounds. */
    addButton(id: string, label: string, iconName: ClawdeskFloatingIcon, callback?: ClawdeskFloatingButtonCallback): void;
    /** Removes a pre-show button and recomputes automatic bounds. */
    removeButton(id: string): void;
    /** Non-structural state updates are allowed before and after show. */
    updateButton(id: string, patch: ClawdeskFloatingButtonPatch): Promise<ClawdeskFloatingButtonState>;
    getButtonState(id: string): Promise<ClawdeskFloatingButtonState>;
    /** Shows with fixed 40x40 icon boxes; rows wrap at the documented safe width. */
    show(): Promise<ClawdeskUIWindowState>;
    hide(): Promise<ClawdeskUIWindowState | null>;
    close(): Promise<ClawdeskUIWindowState | null>;
    setPosition(x: number, y: number): Promise<ClawdeskUIBounds | ClawdeskUIWindowState>;
    onButtonClick(buttonID: string, callback: ClawdeskFloatingButtonCallback): void;
    onError(callback: (error: ClawdeskUIError) => unknown | Promise<unknown>): void;
    setAlwaysOnTop(alwaysOnTop: boolean): Promise<boolean | ClawdeskUIWindowState>;
    waitUntilClosed(): Promise<ClawdeskUIWindowState>;
    /** @deprecated Use waitUntilClosed(). */
    run(): Promise<ClawdeskUIWindowState>;
  }

  interface ClawdeskFloatingWindowConstructor extends ClawdeskFloatingWindow {
    new(options?: ClawdeskFloatingWindowOptions): ClawdeskFloatingWindow;
  }

  /** @deprecated Brand-migration alias; use ClawdeskFloatingWindow. */
  type OpenDeskFloatingWindow = ClawdeskFloatingWindow;

  var FloatingWindow: ClawdeskFloatingWindowConstructor | undefined;
}
