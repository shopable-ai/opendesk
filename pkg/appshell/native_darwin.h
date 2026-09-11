#ifndef OPENDESK_APPSHELL_NATIVE_DARWIN_H
#define OPENDESK_APPSHELL_NATIVE_DARWIN_H

int ODAppShellStart(const char *iconPath, const char *tooltip, const char *primaryAction, const char *menuJSON, char **errorMessage);
int ODAppShellUpdateMenuItem(const char *itemID, const char *label, int hasLabel, int enabled, int hasEnabled, int visible, int hasVisible, char **errorMessage);
void ODAppShellActivate(void);
void ODAppShellTeardown(void);
void ODAppShellRun(void);
void ODAppShellFree(char *value);

extern void opendeskAppShellDarwinAction(char *itemID, char *source);

#endif
