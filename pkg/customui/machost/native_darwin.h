#ifndef OPENDESK_CUSTOM_UI_NATIVE_DARWIN_H
#define OPENDESK_CUSTOM_UI_NATIVE_DARWIN_H

void OpenDeskUIRun(void);
int OpenDeskUIIsMainThread(void);
void OpenDeskUIHandleCommand(const char *json);
void OpenDeskUIShutdown(void);
extern void OpenDeskUIEmitJSON(char *json);

#endif
