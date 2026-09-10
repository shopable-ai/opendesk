#ifndef OPENDESK_RECORDER_UIOHOOK_BRIDGE_H
#define OPENDESK_RECORDER_UIOHOOK_BRIDGE_H

#include <stdbool.h>
#include <stdint.h>

int opendesk_recorder_uiohook_run(bool capture_keyboard);
int opendesk_recorder_uiohook_stop(void);
int opendesk_recorder_uiohook_permission(void);
int opendesk_recorder_uiohook_key_state(uint16_t rawcode);

/* Implemented by recorder_uiohook.go. The callback receives copied scalar
 * values only; no libuiohook pointer crosses into Go. */
extern void opendeskRecorderDispatch(
    uint16_t event_type,
    uint64_t native_time,
    uint16_t mask,
    uint16_t keycode,
    uint16_t rawcode,
    uint16_t keychar,
    uint16_t button,
    uint16_t clicks,
    int16_t x,
    int16_t y,
    uint16_t amount,
    int16_t rotation,
    uint8_t direction,
    uint8_t physical_point_available,
    int32_t physical_x,
    int32_t physical_y,
    uint8_t text_input_source);

#endif
