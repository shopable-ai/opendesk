export {};

declare global {
  type OpenDeskDialogLevel = "info" | "success" | "warning" | "error";
  type OpenDeskDialogDefaultAction = "confirm" | "cancel";

  interface OpenDeskDialogBaseOptions {
    title?: string;
    message: string;
    level?: OpenDeskDialogLevel;
  }

  interface OpenDeskAlertOptions extends OpenDeskDialogBaseOptions {
    okText?: string;
  }

  interface OpenDeskConfirmOptions extends OpenDeskDialogBaseOptions {
    confirmText?: string;
    cancelText?: string;
    defaultAction?: OpenDeskDialogDefaultAction;
  }

  interface OpenDeskPromptOptions extends OpenDeskConfirmOptions {
    defaultValue?: string;
    placeholder?: string;
    secure?: boolean;
    maxLength?: number;
  }

  interface OpenDeskDialogCapabilities {
    enabled: boolean;
    available: boolean;
    activationSource: "disabled" | "cli" | "projectConfig" | "httpRequest";
    platform: string;
    driver: string;
    maxConcurrent: 1;
    alert: boolean;
    confirm: boolean;
    prompt: boolean;
    securePrompt: boolean;
    reason?: string;
  }

  interface OpenDeskDialogError extends Error {
    code: "DIALOG_DISABLED" | "DIALOG_INVALID_OPTIONS" | "DIALOG_BUSY" |
      "DIALOG_CANCELED" | "DIALOG_TIMEOUT" | "DIALOG_HOST_NOT_FOUND" |
      "DIALOG_HOST_FAILURE" | "DIALOG_UNSUPPORTED_PLATFORM";
    operation: "Dialog.alert" | "Dialog.confirm" | "Dialog.prompt";
    dialogId?: string;
    capability: "ui";
  }

  interface OpenDeskDialog {
    alert(message: string | OpenDeskAlertOptions): Promise<void>;
    confirm(message: string | OpenDeskConfirmOptions): Promise<boolean>;
    prompt(message: string | OpenDeskPromptOptions): Promise<string | null>;
    getCapabilities(): OpenDeskDialogCapabilities;
  }

  /**
   * Host-owned asynchronous native modal Dialog API. Methods return real
   * Promises only: use await or then/catch/finally; options never accept
   * onConfirm/onCancel callbacks and calls never synchronously block Runtime.
   */
  var Dialog: OpenDeskDialog;

  /** Promise alias for Dialog.alert(); this is not the browser blocking API. */
  function alert(message: string | OpenDeskAlertOptions): Promise<void>;
  /** Promise alias for Dialog.confirm(); this is not the browser blocking API. */
  function confirm(message: string | OpenDeskConfirmOptions): Promise<boolean>;
  /** Promise alias for Dialog.prompt(); this is not the browser blocking API. */
  function prompt(message: string | OpenDeskPromptOptions): Promise<string | null>;
}
