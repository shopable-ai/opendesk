/// <reference path="./FloatingWindowIconKey.generated.d.ts" />

export {};

declare global {
  type ClawdeskFloatingWindowOrientation = "horizontal" | "vertical";
  type ClawdeskFloatingImageRenderingMode = "original" | "template";

  /**
   * A local PNG/JPEG resolved inside the executing script's directory.
   * "original" preserves image colors; "template" applies native state tint.
   * Use this object form instead of passing a path as a bare string; strings
   * are always interpreted as built-in icon names.
   */
  interface ClawdeskFloatingImageIcon {
    path: string;
    renderingMode?: ClawdeskFloatingImageRenderingMode;
  }

  /** Built-in registry key or a validated script-local raster image. */
  type ClawdeskFloatingIconSource = ClawdeskFloatingIconKey | ClawdeskFloatingImageIcon;
  /** Native toolbar lifecycle notifications; button activation stays on addButton/onButtonClick. */
  type ClawdeskFloatingLifecycleEventType = "move" | "close";

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

  interface ClawdeskFloatingWindowBaseOptions {
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

  interface ClawdeskFloatingAbsolutePosition {
    mode: "absolute";
    x: number;
    y: number;
    horizontal?: never;
    vertical?: never;
    margin?: never;
    display?: never;
  }

  interface ClawdeskFloatingAnchorPosition {
    mode: "anchor";
    horizontal: ClawdeskUIHorizontalPlacement;
    vertical: ClawdeskUIVerticalPlacement;
    margin?: number;
    display?: ClawdeskUIInitialPlacementDisplay;
    x?: never;
    y?: never;
  }

  type ClawdeskFloatingInitialPosition =
    | ClawdeskFloatingAbsolutePosition
    | ClawdeskFloatingAnchorPosition;

  type ClawdeskFloatingWindowOptions = ClawdeskFloatingWindowBaseOptions & (
    | {
        /** Preferred explicit initial-position union. */
        position: ClawdeskFloatingInitialPosition;
        x?: never;
        y?: never;
        placement?: never;
      }
    | {
        /** Compatibility form for the established absolute toolbar API. */
        position?: never;
        x: number;
        y: number;
        placement?: never;
      }
    | {
        /** Default absolute position (100, 100) for legacy no-position code. */
        position?: never;
        x?: never;
        y?: never;
        placement?: never;
      }
  );

  interface ClawdeskFloatingButtonPatch {
    icon?: ClawdeskFloatingIconSource;
    label?: string;
    /** Opt-in durable business state; ordinary action buttons should leave this false. */
    active?: boolean;
    disabled?: boolean;
    busy?: boolean;
    /** String sets an error state; null clears it. */
    error?: string | null;
  }

  /** Reviewed native SF Symbol recipe used by the built-in icon registry. */
  interface ClawdeskFloatingBuiltInIconPresentation {
    kind: "builtIn";
    systemSymbol: string;
    scale: number;
    offsetX: number;
    offsetY: number;
  }

  /** Path-free metadata for a raster image accepted by both Runtime and host. */
  interface ClawdeskFloatingImageIconPresentation {
    kind: "image";
    mediaType: "image/png" | "image/jpeg";
    pixelWidth: number;
    pixelHeight: number;
    renderingMode: ClawdeskFloatingImageRenderingMode;
  }

  type ClawdeskFloatingIconPresentation =
    | ClawdeskFloatingBuiltInIconPresentation
    | ClawdeskFloatingImageIconPresentation;

  interface ClawdeskFloatingButtonState {
    id: string;
    label: string;
    icon: ClawdeskFloatingIconSource;
    active: boolean;
    disabled: boolean;
    busy: boolean;
    error: string;
    /** Monotonic EventLoop-owned state revision confirmed by the native host. */
    revision: number;
    /** Always empty for the native icon-only toolbar; label remains semantic metadata. */
    renderedText: string;
    /** Native tooltip readback. For icon-only buttons this always mirrors label. */
    tooltip: string;
    /** Whether the native tooltip panel is currently visible. */
    tooltipVisible: boolean;
    iconPresentation: ClawdeskFloatingIconPresentation;
    /** Native Accessibility name. For icon-only buttons this always mirrors label. */
    accessibilityName: string;
    localBounds: ClawdeskUIBounds;
    screenBounds: ClawdeskUIBounds;
  }

  type ClawdeskFloatingButtonCallback = (event: ClawdeskUIEvent) => unknown | Promise<unknown>;

  interface ClawdeskFloatingWindow {
    readonly id: string;
    /** Adds ordered icon-only buttons before first show. label supplies both the native tooltip and Accessibility name. Horizontal accepts 1-32 unless toolbar.maxRows imposes a smaller capacity; vertical accepts 1-5. */
    addButton(id: string, label: string, icon: ClawdeskFloatingIconSource, callback?: ClawdeskFloatingButtonCallback): void;
    /** Adds a noninteractive native divider between adjacent action groups before first show. */
    addSeparator(id: string): void;
    /** Adds one fixed standard native spacer between adjacent action groups before first show. */
    addSpacer(id: string): void;
    /** Removes a pre-show button, its adjacent structural boundaries, and recomputes automatic bounds. */
    removeButton(id: string): void;
    /** Non-structural state updates are allowed before and after show. */
    updateButton(id: string, patch: ClawdeskFloatingButtonPatch): Promise<ClawdeskFloatingButtonState>;
    getButtonState(id: string): Promise<ClawdeskFloatingButtonState>;
    /** Shows fixed 40x40 icon boxes. Horizontal rows use toolbar.maxWidth/maxColumns/maxRows when present; vertical stays a single top-to-bottom column of at most five buttons. */
    show(): Promise<ClawdeskUIWindowState>;
    hide(): Promise<ClawdeskUIWindowState | null>;
    close(): Promise<ClawdeskUIWindowState | null>;
    /** Reads the shared Custom UI WindowState; before show this is the complete declared hidden state. */
    getState(): Promise<ClawdeskUIWindowState>;
    setPosition(x: number, y: number): Promise<ClawdeskUIBounds | ClawdeskUIWindowState>;
    setPlacement(placement: ClawdeskUIWindowPlacement): Promise<ClawdeskUIWindowPlacement | ClawdeskUIWindowState>;
    onButtonClick(buttonID: string, callback: ClawdeskFloatingButtonCallback): void;
    onError(callback: (error: ClawdeskUIError) => unknown | Promise<unknown>): void;
    setAlwaysOnTop(alwaysOnTop: boolean): Promise<boolean | ClawdeskUIWindowState>;
    /** Dynamically changes native dragging and returns the host-readback WindowState. */
    setDraggable(enabled: boolean): Promise<ClawdeskUIWindowState>;
    /** Observes toolbar move/close lifecycle events. Returns an unsubscribe function. */
    on(type: ClawdeskFloatingLifecycleEventType, listener: ClawdeskUIEventListener): ClawdeskUIUnsubscribe;
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
