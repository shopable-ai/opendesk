//go:build cgo && (darwin || windows || linux)

#include "recorder_uiohook_bridge.h"
#include "../third_party/libuiohook/include/uiohook.h"

#if defined(_WIN32)
#include <windows.h>
#endif

#if defined(__APPLE__)
#include <ApplicationServices/ApplicationServices.h>

/* OpenDesk's vendored Darwin backend uses this before hook_run() so a
 * keyboard-disabled Recorder never enters libuiohook's synchronous Unicode
 * translation path on the CLI process main queue. */
extern void opendesk_uiohook_set_capture_keyboard(bool enabled);
#endif

static bool opendesk_recorder_uiohook_log(unsigned int level, const char *format, ...) {
    (void) level;
    (void) format;
    return true;
}

static void opendesk_recorder_uiohook_dispatch(uiohook_event *const event) {
    uint16_t keycode = 0;
    uint16_t rawcode = 0;
    uint16_t keychar = 0;
    uint16_t button = 0;
    uint16_t clicks = 0;
    int16_t x = 0;
    int16_t y = 0;
    uint16_t amount = 0;
    int16_t rotation = 0;
    uint8_t direction = 0;
    uint8_t physical_point_available = 0;
    int32_t physical_x = 0;
    int32_t physical_y = 0;
    uint8_t text_input_source = 0;

    if (event == NULL) {
        return;
    }
    switch (event->type) {
        case EVENT_KEY_TYPED:
        case EVENT_KEY_PRESSED:
        case EVENT_KEY_RELEASED:
            keycode = event->data.keyboard.keycode;
            rawcode = event->data.keyboard.rawcode;
            keychar = event->data.keyboard.keychar;
            /* A TIS query here describes the Recorder process, which can
             * disagree with the front application's per-app input source.
             * Keep Darwin KEY_TYPED fail-closed as unknown; the asynchronous
             * focused AX value tracker is the authoritative text outcome. */
            break;
        case EVENT_MOUSE_CLICKED:
        case EVENT_MOUSE_PRESSED:
        case EVENT_MOUSE_RELEASED:
        case EVENT_MOUSE_MOVED:
        case EVENT_MOUSE_DRAGGED:
            button = event->data.mouse.button;
            clicks = event->data.mouse.clicks;
            x = event->data.mouse.x;
            y = event->data.mouse.y;
            break;
        case EVENT_MOUSE_WHEEL:
            clicks = event->data.wheel.clicks;
            x = event->data.wheel.x;
            y = event->data.wheel.y;
            amount = event->data.wheel.amount;
            rotation = event->data.wheel.rotation;
            direction = event->data.wheel.direction;
            break;
        default:
            break;
    }

#if defined(_WIN32)
    switch (event->type) {
        case EVENT_MOUSE_CLICKED:
        case EVENT_MOUSE_PRESSED:
        case EVENT_MOUSE_RELEASED:
        case EVENT_MOUSE_MOVED:
        case EVENT_MOUSE_DRAGGED:
        case EVENT_MOUSE_WHEEL: {
            POINT point;
            if (GetPhysicalCursorPos(&point)) {
                physical_point_available = 1;
                physical_x = (int32_t) point.x;
                physical_y = (int32_t) point.y;
            }
            break;
        }
        default:
            break;
    }
#endif

    opendeskRecorderDispatch(
        (uint16_t) event->type,
        event->time,
        event->mask,
        keycode,
        rawcode,
        keychar,
        button,
        clicks,
        x,
        y,
        amount,
        rotation,
        direction,
        physical_point_available,
        physical_x,
        physical_y,
        text_input_source);
}

int opendesk_recorder_uiohook_run(bool capture_keyboard) {
#if defined(__APPLE__)
    opendesk_uiohook_set_capture_keyboard(capture_keyboard);
#else
    (void) capture_keyboard;
#endif
    hook_set_logger_proc(&opendesk_recorder_uiohook_log);
    hook_set_dispatch_proc(&opendesk_recorder_uiohook_dispatch);
    return hook_run();
}

int opendesk_recorder_uiohook_stop(void) {
    return hook_stop();
}

int opendesk_recorder_uiohook_permission(void) {
#if defined(__APPLE__)
    return CGPreflightListenEventAccess() ? 1 : 0;
#elif defined(_WIN32) || defined(__linux__)
    return 1;
#else
    return -1;
#endif
}

int opendesk_recorder_uiohook_key_state(uint16_t rawcode) {
#if defined(__APPLE__)
    return CGEventSourceKeyState(
            kCGEventSourceStateCombinedSessionState,
            (CGKeyCode) rawcode) ? 1 : 0;
#else
    (void) rawcode;
    return -1;
#endif
}
