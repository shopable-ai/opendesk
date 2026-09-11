export {};

declare global {
  interface OpenDeskAppShellCapabilities {
    enabled: boolean;
    available: boolean;
    reason?: string;
    packageId?: string;
    mainWindowId?: string;
    closeBehavior?: "hide" | "quit";
  }

  interface OpenDeskAppActionEvent {
    id: string;
    source: "tray-primary" | "tray-menu" | "second-instance" | "app-activation" | string;
  }

  interface OpenDeskAppMenuItemPatch {
    label?: string;
    enabled?: boolean;
    visible?: boolean;
  }

  interface OpenDeskAutomationApp {
    getCapabilities(): OpenDeskAppShellCapabilities;
    onAction(handler: (event: OpenDeskAppActionEvent) => void | Promise<void>): () => void;
    updateMenuItem(id: string, patch: OpenDeskAppMenuItemPatch): Promise<void>;
    quit(): Promise<void>;
  }

  var automation: {
    readonly app: OpenDeskAutomationApp;
  };
}
