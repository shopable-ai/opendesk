/// <reference path="./FloatingWindowIconKey.generated.d.ts" />

export {};

declare global {
  type ClawdeskFloatingWindowOrientation = "horizontal" | "vertical";
  type ClawdeskFloatingImageRenderingMode = "original" | "template";
  type ClawdeskFloatingLabelAlignment = "leading" | "center" | "trailing";
  type ClawdeskFloatingLabelVerticalAlignment = "top" | "center" | "bottom";
  type ClawdeskFloatingLabelTone = "primary" | "secondary" | "success" | "warning" | "error";

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
   * Declarative wrapping constraints for a horizontal native toolbar.
   * The host derives its own compact outer bounds; callers never set a frame.
   */
  interface ClawdeskFloatingToolbarOptions {
    /**
     * Maximum outer width in points (60–960). Content items wrap automatically
     * before exceeding it, while a shorter last row keeps its compact width.
     */
    maxWidth?: number;
    /** Maximum native content items in one row (1–19). */
    maxColumns?: number;
    /**
     * Maximum rows (1–32). The compact layout chooses only as many columns as
     * needed; adding content beyond the combined row/column capacity fails.
     */
    maxRows?: number;
  }

  interface ClawdeskFloatingWindowBaseOptions {
    theme?: "dark";
    title?: string;
    alwaysOnTop?: boolean;
    draggable?: boolean;
    /** Defaults to horizontal. Vertical toolbars accept at most five native content items. */
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
    /** Compact attached badge. null clears; numbers are integers from 0 through 999; strings contain one to four Unicode characters. */
    badge?: string | number | null;
  }

  interface ClawdeskFloatingLabelOptions {
    /** Fixed width in points. Defaults to 120; accepted range is 48–240. */
    width?: number;
    /** Defaults to leading. */
    alignment?: ClawdeskFloatingLabelAlignment;
    /** Explicit alignment inside the fixed 40pt label height. Defaults to center. */
    verticalAlignment?: ClawdeskFloatingLabelVerticalAlignment;
    /** Semantic native text color. Defaults to primary. */
    tone?: ClawdeskFloatingLabelTone;
  }

  interface ClawdeskFloatingLabelPatch {
    text?: string;
    alignment?: ClawdeskFloatingLabelAlignment;
    verticalAlignment?: ClawdeskFloatingLabelVerticalAlignment;
    tone?: ClawdeskFloatingLabelTone;
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
    | ClawdeskFloatingImageIconPresentation
    | { kind: "windowsGlyph"; systemSymbol: ""; glyph: string; fontFamily: "Segoe UI Symbol"; scale: number; offsetX: number; offsetY: number };

  interface ClawdeskFloatingButtonState {
    id: string;
    label: string;
    icon: ClawdeskFloatingIconSource;
    active: boolean;
    disabled: boolean;
    busy: boolean;
    error: string;
    /** Normalized native badge text; empty when cleared. */
    badge: string;
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
    /** Badge announcement when present; otherwise the native active-state value. */
    accessibilityValue: string | boolean | null;
    localBounds: ClawdeskUIBounds;
    screenBounds: ClawdeskUIBounds;
  }

  interface ClawdeskFloatingLabelState {
    id: string;
    text: string;
    /** Immutable declared width in points. */
    width: number;
    /** Native horizontal alignment readback. */
    alignment: ClawdeskFloatingLabelAlignment;
    /** Native vertical alignment readback. */
    verticalAlignment: ClawdeskFloatingLabelVerticalAlignment;
    tone: ClawdeskFloatingLabelTone;
    /** Monotonic EventLoop-owned state revision confirmed by the native host. */
    revision: number;
    /** Full text held by the native static-text peer. */
    renderedText: string;
    /** Whether the fixed-width native label visually applies tail truncation. */
    truncated: boolean;
    /** Native Accessibility name; always mirrors text. */
    accessibilityName: string;
    /** Always staticText; the label remains one non-focusable Accessibility element. */
    accessibilityRole: "staticText";
    /** Native Accessibility value; always mirrors the complete text. */
    accessibilityValue: string;
    /** Toolbar-local bounds of the text actually laid out by the native peer. */
    renderedTextBounds: ClawdeskUIBounds;
    localBounds: ClawdeskUIBounds;
    screenBounds: ClawdeskUIBounds;
  }

  interface ClawdeskFloatingControlBaseOptions {
    /** Immutable native item width in points (80–360; Switch also accepts 48–79 for tooltip-only compact presentation). */
    width?: number;
    disabled?: boolean;
  }

  interface ClawdeskFloatingToggleOptions extends ClawdeskFloatingControlBaseOptions {
    value?: boolean;
  }

  interface ClawdeskFloatingInputOptions extends ClawdeskFloatingControlBaseOptions {
    value?: string;
    placeholder?: string;
    /** Defaults to 256; accepted range is 1–256 Unicode characters. */
    maxLength?: number;
  }

  interface ClawdeskFloatingChoiceOption {
    value: string;
    label: string;
  }

  interface ClawdeskFloatingChoiceOptions extends ClawdeskFloatingControlBaseOptions {
    /** Two through twelve unique options. */
    options: ClawdeskFloatingChoiceOption[];
    /** Defaults to the first option's value. */
    value?: string;
  }

  interface ClawdeskFloatingSliderOptions extends ClawdeskFloatingControlBaseOptions {
    min?: number;
    max?: number;
    value?: number;
    step?: number;
  }

  interface ClawdeskFloatingProgressOptions {
    min?: number;
    max?: number;
    value?: number;
    indeterminate?: boolean;
    /** Immutable native item width in points (80–360). */
    width?: number;
  }

  interface ClawdeskFloatingControlStateBase {
    id: string;
    type: "switch" | "checkbox" | "input" | "select" | "slider" | "segmentedControl" | "progress";
    label: string;
    width: number;
    disabled: boolean;
    revision: number;
    focused: boolean;
    accessibilityName: string;
    accessibilityRole: string;
    /** Native Accessibility subrole; Switch reports AXSwitch, other controls normally return an empty string. */
    accessibilitySubrole: string;
    accessibilityValue: string | number | boolean;
    localBounds: ClawdeskUIBounds;
    screenBounds: ClawdeskUIBounds;
  }

  interface ClawdeskFloatingToggleState extends ClawdeskFloatingControlStateBase {
    type: "switch" | "checkbox";
    value: boolean;
    renderedValue: boolean;
    accessibilityValue: boolean | number;
  }

  interface ClawdeskFloatingInputState extends ClawdeskFloatingControlStateBase {
    type: "input";
    value: string;
    placeholder: string;
    maxLength: number;
    renderedValue: string;
    accessibilityValue: string;
  }

  interface ClawdeskFloatingChoiceState extends ClawdeskFloatingControlStateBase {
    type: "select" | "segmentedControl";
    value: string;
    options: ClawdeskFloatingChoiceOption[];
    renderedValue: string;
    accessibilityValue: string;
  }

  interface ClawdeskFloatingSliderState extends ClawdeskFloatingControlStateBase {
    type: "slider";
    value: number;
    min: number;
    max: number;
    step: number;
    renderedValue: number;
    accessibilityValue: number;
  }

  interface ClawdeskFloatingProgressState extends ClawdeskFloatingControlStateBase {
    type: "progress";
    value: number;
    min: number;
    max: number;
    indeterminate: boolean;
    renderedValue: number | null;
    accessibilityValue: number | "indeterminate";
  }

  type ClawdeskFloatingControlState = ClawdeskFloatingToggleState | ClawdeskFloatingInputState |
    ClawdeskFloatingChoiceState | ClawdeskFloatingSliderState | ClawdeskFloatingProgressState;

  type ClawdeskFloatingTogglePatch =
    | { checked: boolean; disabled?: boolean }
    | { disabled: boolean; checked?: boolean };
  type ClawdeskFloatingInputPatch =
    | { value: string; placeholder?: string; disabled?: boolean }
    | { placeholder: string; value?: string; disabled?: boolean }
    | { disabled: boolean; value?: string; placeholder?: string };
  type ClawdeskFloatingChoicePatch =
    | { value: string; disabled?: boolean }
    | { disabled: boolean; value?: string };
  type ClawdeskFloatingSliderPatch =
    | { value: number; disabled?: boolean }
    | { disabled: boolean; value?: number };
  type ClawdeskFloatingProgressPatch =
    | { value: number; indeterminate?: boolean }
    | { indeterminate: boolean; value?: number };
  type ClawdeskFloatingControlPatch = ClawdeskFloatingTogglePatch | ClawdeskFloatingInputPatch |
    ClawdeskFloatingChoicePatch | ClawdeskFloatingSliderPatch | ClawdeskFloatingProgressPatch;

  interface ClawdeskFloatingControlEventBase extends ClawdeskUIEvent {
    targetId: string;
  }

  interface ClawdeskFloatingToggleEvent extends ClawdeskFloatingControlEventBase {
    type: "change";
    value: boolean;
    checked: boolean;
  }

  interface ClawdeskFloatingInputEvent extends ClawdeskFloatingControlEventBase {
    type: "input";
    value: string;
  }

  interface ClawdeskFloatingChoiceEvent extends ClawdeskFloatingControlEventBase {
    type: "change";
    value: string;
  }

  interface ClawdeskFloatingSliderEvent extends ClawdeskFloatingControlEventBase {
    type: "change";
    value: number;
  }

  type ClawdeskFloatingControlEvent = ClawdeskFloatingToggleEvent | ClawdeskFloatingInputEvent |
    ClawdeskFloatingChoiceEvent | ClawdeskFloatingSliderEvent;
  type ClawdeskFloatingControlCallback = (event: ClawdeskFloatingControlEvent) => unknown | Promise<unknown>;
  type ClawdeskFloatingToggleCallback = (event: ClawdeskFloatingToggleEvent) => unknown | Promise<unknown>;
  type ClawdeskFloatingInputCallback = (event: ClawdeskFloatingInputEvent) => unknown | Promise<unknown>;
  type ClawdeskFloatingChoiceCallback = (event: ClawdeskFloatingChoiceEvent) => unknown | Promise<unknown>;
  type ClawdeskFloatingSliderCallback = (event: ClawdeskFloatingSliderEvent) => unknown | Promise<unknown>;

  type ClawdeskFloatingButtonCallback = (event: ClawdeskUIEvent) => unknown | Promise<unknown>;

  interface ClawdeskFloatingWindow {
    readonly id: string;
    /** Adds ordered icon-only buttons before first show. label supplies both the native tooltip and Accessibility name. Horizontal accepts 1-32 unless toolbar.maxRows imposes a smaller capacity; vertical accepts 1-5. */
    addButton(id: string, label: string, icon: ClawdeskFloatingIconSource, callback?: ClawdeskFloatingButtonCallback): void;
    /** Adds bounded visible native status text before first show. Width stays fixed across updates. */
    addLabel(id: string, text: string, options?: ClawdeskFloatingLabelOptions): void;
    /** Adds an immediate-effect native on/off switch. Widths below 80 hide the visual label while retaining its tooltip and Accessibility name. */
    addSwitch(id: string, label: string, options?: ClawdeskFloatingToggleOptions, callback?: ClawdeskFloatingToggleCallback): void;
    /** Adds an independent inclusion/selection checkbox. */
    addCheckbox(id: string, label: string, options?: ClawdeskFloatingToggleOptions, callback?: ClawdeskFloatingToggleCallback): void;
    /** Adds bounded single-line native text input. show() stays nonactivating; a direct user gesture into this field activates keyboard focus. */
    addInput(id: string, label: string, options?: ClawdeskFloatingInputOptions, callback?: ClawdeskFloatingInputCallback): void;
    addSelect(id: string, label: string, options: ClawdeskFloatingChoiceOptions, callback?: ClawdeskFloatingChoiceCallback): void;
    addSlider(id: string, label: string, options?: ClawdeskFloatingSliderOptions, callback?: ClawdeskFloatingSliderCallback): void;
    /** Adds one first-class mutually exclusive choice group; use Separator/Spacer for visual button grouping. */
    addSegmentedControl(id: string, label: string, options: ClawdeskFloatingChoiceOptions, callback?: ClawdeskFloatingChoiceCallback): void;
    /** Adds a determinate or indeterminate native progress indicator. */
    addProgress(id: string, label: string, options?: ClawdeskFloatingProgressOptions): void;
    /** Adds a noninteractive native divider between adjacent action groups before first show. */
    addSeparator(id: string): void;
    /** Adds one fixed standard native spacer between adjacent action groups before first show. */
    addSpacer(id: string): void;
    /** Removes a pre-show button, its adjacent structural boundaries, and recomputes automatic bounds. */
    removeButton(id: string): void;
    /** Removes a pre-show label and its adjacent structural boundaries. */
    removeLabel(id: string): void;
    /** Removes any pre-show Switch/Checkbox/Input/Select/Slider/SegmentedControl/Progress item and adjacent structural boundaries. */
    removeControl(id: string): void;
    /** Non-structural state updates are allowed before and after show. */
    updateButton(id: string, patch: ClawdeskFloatingButtonPatch): Promise<ClawdeskFloatingButtonState>;
    /** Updates presentation without changing the label's declared width or window geometry. */
    updateLabel(id: string, patch: ClawdeskFloatingLabelPatch): Promise<ClawdeskFloatingLabelState>;
    /** Updates value/presentation only; width, options, numeric ranges and input maxLength remain immutable. */
    updateControl(id: string, patch: ClawdeskFloatingControlPatch): Promise<ClawdeskFloatingControlState>;
    getButtonState(id: string): Promise<ClawdeskFloatingButtonState>;
    getLabelState(id: string): Promise<ClawdeskFloatingLabelState>;
    getControlState(id: string): Promise<ClawdeskFloatingControlState>;
    /** Shows 40pt-high native content. Horizontal rows use toolbar.maxWidth/maxColumns/maxRows; vertical remains a single column of at most five content items. */
    show(): Promise<ClawdeskUIWindowState>;
    hide(): Promise<ClawdeskUIWindowState | null>;
    close(): Promise<ClawdeskUIWindowState | null>;
    /** Reads the shared Custom UI WindowState; before show this is the complete declared hidden state. */
    getState(): Promise<ClawdeskUIWindowState>;
    setPosition(x: number, y: number): Promise<ClawdeskUIBounds | ClawdeskUIWindowState>;
    setPlacement(placement: ClawdeskUIWindowPlacement): Promise<ClawdeskUIWindowPlacement | ClawdeskUIWindowState>;
    onButtonClick(buttonID: string, callback: ClawdeskFloatingButtonCallback): void;
    /** Replaces the callback for a native control. Input dispatches input; the other interactive controls dispatch change. */
    onControlChange(controlID: string, callback: ClawdeskFloatingControlCallback): void;
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
