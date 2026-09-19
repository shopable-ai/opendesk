#ifndef OPENDESK_APPSHELL_NATIVE_DARWIN_H
#define OPENDESK_APPSHELL_NATIVE_DARWIN_H

int ODAppShellStart(const char *iconPath, int iconTemplate, const char *tooltip, const char *primaryAction, const char *menuJSON, char **errorMessage);
int ODAppShellUpdateMenuItem(const char *itemID, const char *label, int hasLabel, int enabled, int hasEnabled, int visible, int hasVisible, char **errorMessage);
void ODAppShellActivate(void);
int ODAppShellPickFlowFiles(char **pathsJSON, char **errorMessage);
int ODAppShellConfirmFlowTrust(const char *flowID, const char *name, const char *publisherID, const char *keyID, const char *fingerprint, int *decision, char **errorMessage);
int ODAppShellConfirmMarketplaceInstall(const char *flowID, const char *releaseID, const char *name, const char *version, const char *publisherID, const char *keyID, const char *fingerprint, int verifiedPublisher, int signatureVerified, int trustRequired, int *decision, char **errorMessage);
void ODAppShellTeardown(void);
void ODAppShellRun(void);
void ODAppShellFree(char *value);

extern void opendeskAppShellDarwinAction(char *itemID, char *source);
extern void opendeskAppShellDarwinOpenDocument(char *path);
extern void opendeskAppShellDarwinOpenURL(char *rawURL);

#endif
