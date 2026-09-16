#ifndef OPENDESK_CUSTOMUI_EDIT_MENU_DARWIN_H
#define OPENDESK_CUSTOMUI_EDIT_MENU_DARWIN_H

// Call on the AppKit main thread before starting the UI host event loop.
// This installs local responder-chain commands, never global shortcuts.
void OpenDeskUIInstallEditMenu(void);

#endif
