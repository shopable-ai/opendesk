#ifndef OPENDESK_WINDOW_APP_WATCH_H
#define OPENDESK_WINDOW_APP_WATCH_H
#include <stdint.h>
typedef struct ODAppWindowWatch ODAppWindowWatch;
// status: 0 success, 1 stale PID, 2 executable mismatch, 3 backend failure.
ODAppWindowWatch *od_app_window_watch_start(int pid, const char *path, int *status);
// Constant-size mailbox. No native callback ever enters Go or JavaScript.
uint32_t od_app_window_watch_take(ODAppWindowWatch *, int *statuses, int *active);
void od_app_window_watch_stop(ODAppWindowWatch *);
#endif
