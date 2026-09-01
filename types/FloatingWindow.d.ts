/// <reference path="./FloatingWindow-icons.generated.d.ts" />

export {};

declare global {
  type ClawdeskFloatingWindowOrientation = "horizontal" | "vertical";

  /**
   * Declarative wrapping constraints for a horizontal native icon toolbar.
   * The host derives its own compact outer bounds; callers never set a frame.
   */
  interface ClawdeskFloatingToolbarOptions {
    /**
     * Maximum outer width in points (60–960). Buttons wrap automatically
     * before exceeding it, while a shorter last row keeps its compact width.
     */
    maxWidth?: number;
    /** Maximum buttons in one row (1–19). The narrower of this and maxWidth wins. */
    maxColumns?: number;
    /**
     * Maximum rows (1–32). The compact layout chooses only as many columns as
     * needed; adding a button beyond the combined row/column capacity fails.
     */
    maxRows?: number;
  }

  interface ClawdeskFloatingWindowOptions {
    x?: number;
    y?: number;
    theme?: "dark";
    title?: string;
    alwaysOnTop?: boolean;
    draggable?: boolean;
    /** Defaults to horizontal. Vertical toolbars accept at most five buttons. */
    orientation?: ClawdeskFloatingWindowOrientation;
    /**
     * Horizontal automatic-wrap constraints. Not supported with orientation:
     * "vertical", which remains a one-column toolbar for compatibility.
     */
    toolbar?: ClawdeskFloatingToolbarOptions;
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
    /** Adds ordered icon-only buttons before first show and recomputes automatic bounds. Horizontal accepts 1-32 unless toolbar.maxRows imposes a smaller capacity; vertical accepts 1-5. */
    addButton(id: string, label: string, iconName: ClawdeskFloatingIcon, callback?: ClawdeskFloatingButtonCallback): void;
    /** Removes a pre-show button and recomputes automatic bounds. */
    removeButton(id: string): void;
    /** Non-structural state updates are allowed before and after show. */
    updateButton(id: string, patch: ClawdeskFloatingButtonPatch): Promise<ClawdeskFloatingButtonState>;
    getButtonState(id: string): Promise<ClawdeskFloatingButtonState>;
    /** Shows fixed 40x40 icon boxes. Horizontal rows use toolbar.maxWidth/maxColumns/maxRows when present; vertical stays a single top-to-bottom column of at most five buttons. */
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
