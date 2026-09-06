export {};

declare global {
  type OpenDeskAccessibilityActionState =
    | "not_started"
    | "not_needed"
    | "acknowledged"
    | "unknown";

  type OpenDeskAccessibilityErrorCode =
    | "INVALID_ARGUMENT"
    | "CAPABILITY_DISABLED"
    | "NOT_SUPPORTED"
    | "PERMISSION_DENIED"
    | "TARGET_NOT_FOUND"
    | "AMBIGUOUS_TARGET"
    | "SEARCH_INCOMPLETE"
    | "STALE_TARGET"
    | "ELEMENT_DISABLED"
    | "ACTION_NOT_SUPPORTED"
    | "STATE_UNKNOWN"
    | "TIMEOUT"
    | "CANCELED"
    | "QUEUE_FULL"
    | "RESOURCE_LIMIT"
    | "BACKEND_FAILED";

  /** Stable cross-platform roles accepted by V1 selectors. */
  type OpenDeskAccessibilityRole =
    | "application"
    | "window"
    | "button"
    | "checkbox"
    | "radioButton"
    | "textField"
    | "staticText"
    | "menuBar"
    | "menu"
    | "menuItem"
    | "group"
    | "list"
    | "listItem"
    | "table"
    | "row"
    | "cell"
    | "unknown";

  /**
   * An execution-owned native reference. The object identity is part of its
   * authority: serializing these fields and constructing a look-alike object
   * does not create a valid reference.
   */
  interface OpenDeskAccessibilityElementRef {
    readonly kind: "AccessibilityElementRef";
    readonly id: string;
    readonly role: OpenDeskAccessibilityRole;
    readonly nativeRole: string;
  }

  interface OpenDeskAccessibilityAppScope {
    app: OpenDeskAppTarget;
    root: "application" | "menuBar";
  }

  type OpenDeskAccessibilityScope =
    | OpenDeskWindowInfo
    | OpenDeskAccessibilityElementRef
    | OpenDeskAccessibilityAppScope;

  /** At least one field is required; every supplied field is an exact AND predicate. */
  type OpenDeskAccessibilitySelector =
    | { role: OpenDeskAccessibilityRole; name?: string; identifier?: string }
    | { role?: OpenDeskAccessibilityRole; name: string; identifier?: string }
    | { role?: OpenDeskAccessibilityRole; name?: string; identifier: string };

  interface OpenDeskAccessibilityTraversalOptions {
    /** One total deadline including queue time. Default 3000; maximum 30000. */
    timeout?: number;
    /** Default 8; maximum 32. */
    maxDepth?: number;
    /** Default 1000; maximum 5000. */
    maxNodes?: number;
  }

  interface OpenDeskAccessibilitySnapshotOptions extends OpenDeskAccessibilityTraversalOptions {
    /** Required: Accessibility never defaults to a whole-desktop traversal. */
    within: OpenDeskAccessibilityScope;
    /** A strict allowlist. Value is omitted unless "value" is explicitly included. */
    properties?: OpenDeskAccessibilityProperty[];
  }

  interface OpenDeskAccessibilityFindOptions extends OpenDeskAccessibilityTraversalOptions {
    /** Required: Accessibility never defaults to a whole-desktop traversal. */
    within: OpenDeskAccessibilityScope;
  }

  type OpenDeskAccessibilityProperty =
    | "role"
    | "nativeRole"
    | "name"
    | "identifier"
    | "enabled"
    | "focused"
    | "selected"
    | "checked"
    | "expanded"
    | "actions"
    | "nativeBounds"
    | "bounds"
    | "value";

  interface OpenDeskAccessibilityReadOptions {
    /** One total deadline including queue time. Default 3000; maximum 30000. */
    timeout?: number;
    /** A strict allowlist. Include "value" explicitly to read it. */
    properties?: OpenDeskAccessibilityProperty[];
  }

  interface OpenDeskAccessibilityPerformOptions {
    /** One total deadline including queue time. Default 3000; maximum 30000. */
    timeout?: number;
  }

  type OpenDeskAccessibilityAction =
    | { action: "invoke" }
    | { action: "setValue"; value: string }
    | { action: "expand" }
    | { action: "collapse" }
    | { action: "select" }
    | { action: "setChecked"; checked: boolean };

  /** Bounds in the backend's named native coordinate system, not mouse coordinates. */
  interface OpenDeskAccessibilityNativeBounds {
    x: number;
    y: number;
    width: number;
    height: number;
    coordinateSpace: string;
  }

  type OpenDeskAccessibilityCheckedState = boolean | null;

  interface OpenDeskAccessibilityNode {
    role: OpenDeskAccessibilityRole;
    nativeRole: string;
    name: string | null;
    identifier: string | null;
    enabled: boolean | null;
    focused: boolean | null;
    selected: boolean | null;
    checked: OpenDeskAccessibilityCheckedState;
    expanded: boolean | null;
    actions: string[];
    nativeBounds: OpenDeskAccessibilityNativeBounds | null;
    /** Present only after a verified conversion to OpenDesk screen coordinates. */
    bounds: OpenDeskScreenRegion | null;
    children: OpenDeskAccessibilityNode[];
    /** Omitted unless the caller explicitly requested value. */
    value?: string | number | boolean | null;
  }

  interface OpenDeskAccessibilityStats {
    nodes: number;
    maxDepth: number;
  }

  interface OpenDeskAccessibilitySnapshotResult {
    requestId: string;
    operation: "Accessibility.snapshot";
    backend: string;
    root: OpenDeskAccessibilityNode | null;
    complete: boolean;
    truncated: boolean;
    reason: string | null;
    stats: OpenDeskAccessibilityStats;
  }

  interface OpenDeskAccessibilityReadProperties {
    role?: OpenDeskAccessibilityRole;
    nativeRole?: string;
    name?: string | null;
    identifier?: string | null;
    enabled?: boolean | null;
    focused?: boolean | null;
    selected?: boolean | null;
    checked?: OpenDeskAccessibilityCheckedState;
    expanded?: boolean | null;
    actions?: string[];
    nativeBounds?: OpenDeskAccessibilityNativeBounds | null;
    bounds?: OpenDeskScreenRegion | null;
    value?: string | number | boolean | null;
  }

  interface OpenDeskAccessibilityReadResult {
    requestId: string;
    operation: "Accessibility.read";
    backend: string;
    ref: OpenDeskAccessibilityElementRef;
    properties: OpenDeskAccessibilityReadProperties;
  }

  interface OpenDeskAccessibilityPerformResult {
    requestId: string;
    operation: "Accessibility.perform";
    action: OpenDeskAccessibilityAction["action"];
    backend: string;
    actionState: OpenDeskAccessibilityActionState;
  }

  interface OpenDeskAccessibilityCapabilities {
    schemaVersion: 1;
    platform: string;
    backend: string;
    hostAuthorization: { enabled: boolean };
    implementation: {
      available: boolean;
      status: string;
      menus: boolean;
      /** Backend-level implementation summary; each element is checked again before action. */
      actions: Record<string, boolean>;
      /** True only when native bounds can be reliably converted to OpenDesk screen coordinates. */
      coordinateMapping: boolean;
      notes: string;
    };
    permission: {
      required: boolean;
      state: string;
      granted: boolean;
      /** Capability status may be cached; operations recheck required permission. */
      cached: boolean;
    };
    /** True only when this execution is enabled, the backend is implemented, and permission is granted. */
    available: boolean;
    limits: {
      defaultTimeoutMs: number;
      maxTimeoutMs: number;
      defaultMaxDepth: number;
      maxMaxDepth: number;
      defaultMaxNodes: number;
      maxMaxNodes: number;
      maxActiveRefs: number;
      maxQueuedRequests: number;
    };
    cancellation: { hardCancel: false };
  }

  interface OpenDeskAccessibilityError extends Error {
    code: OpenDeskAccessibilityErrorCode;
    operation: string;
    backend: string;
    phase: string;
    requestId: string;
    actionState: OpenDeskAccessibilityActionState;
    /** Menu-only failure metadata. */
    failedLevel?: number;
    /** Menu-only count of levels completed before failure. */
    completedLevels?: number;
    /** Whether this request expanded any owned menu before failure. */
    expansionOccurred?: boolean;
  }

  interface OpenDeskAccessibility {
    /** Synchronous summary only; does not prompt or crawl the desktop. */
    getCapabilities(): OpenDeskAccessibilityCapabilities;
    snapshot(options: OpenDeskAccessibilitySnapshotOptions): Promise<OpenDeskAccessibilitySnapshotResult>;
    find(selector: OpenDeskAccessibilitySelector, options: OpenDeskAccessibilityFindOptions): Promise<OpenDeskAccessibilityElementRef | null>;
    read(ref: OpenDeskAccessibilityElementRef, options?: OpenDeskAccessibilityReadOptions): Promise<OpenDeskAccessibilityReadResult>;
    perform(ref: OpenDeskAccessibilityElementRef, action: OpenDeskAccessibilityAction, options?: OpenDeskAccessibilityPerformOptions): Promise<OpenDeskAccessibilityPerformResult>;
    release(ref: OpenDeskAccessibilityElementRef): Promise<boolean>;
  }

  var Accessibility: OpenDeskAccessibility;
}
