#import <ApplicationServices/ApplicationServices.h>
#import <Carbon/Carbon.h>
#import <Foundation/Foundation.h>
#import <IOKit/hid/IOHIDManager.h>
#include <pthread.h>
#include <stdint.h>

extern void opendeskGlobalShortcutDarwinEvent(unsigned short keyCode, unsigned long long modifiers);

static pthread_mutex_t opendeskShortcutTapMutex = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t opendeskShortcutTapCondition = PTHREAD_COND_INITIALIZER;
static pthread_t opendeskShortcutTapThread;
static int opendeskShortcutTapStarted = 0;
static int opendeskShortcutTapStartStatus = 0;
static CFRunLoopRef opendeskShortcutTapRunLoop = NULL;
static CFMachPortRef opendeskShortcutEventTap = NULL;
static IOHIDManagerRef opendeskShortcutHIDManager = NULL;
static uint64_t opendeskShortcutHIDModifiers = 0;

static CGEventRef opendeskShortcutEventTapCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *context) {
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        if (opendeskShortcutEventTap != NULL) CGEventTapEnable(opendeskShortcutEventTap, true);
        return event;
    }
    if (type != kCGEventKeyDown) return event;
    uint64_t modifiers = 0;
    CGEventFlags flags = CGEventGetFlags(event);
    if (flags & kCGEventFlagMaskCommand) modifiers |= 1;
    if (flags & kCGEventFlagMaskControl) modifiers |= 2;
    if (flags & kCGEventFlagMaskShift) modifiers |= 4;
    if (flags & kCGEventFlagMaskAlternate) modifiers |= 8;
    CGKeyCode keyCode = (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
    opendeskGlobalShortcutDarwinEvent((unsigned short)keyCode, (unsigned long long)modifiers);
    return event;
}

static void opendeskShortcutHIDCallback(void *context, IOReturn result, void *sender, IOHIDValueRef value) {
    IOHIDElementRef element = IOHIDValueGetElement(value);
    if (element == NULL || IOHIDElementGetUsagePage(element) != kHIDPage_KeyboardOrKeypad) return;
    uint32_t usage = IOHIDElementGetUsage(element);
    bool pressed = IOHIDValueGetIntegerValue(value) != 0;
    uint64_t modifier = 0;
    switch (usage) {
        case 0xe0: case 0xe4: modifier = 2; break; // left/right control
        case 0xe1: case 0xe5: modifier = 4; break; // left/right shift
        case 0xe2: case 0xe6: modifier = 8; break; // left/right option
        case 0xe3: case 0xe7: modifier = 1; break; // left/right command
        default: break;
    }
    if (modifier != 0) {
        if (pressed) opendeskShortcutHIDModifiers |= modifier;
        else opendeskShortcutHIDModifiers &= ~modifier;
        return;
    }
    // HID usage IDs for F21-F24 are defined even though Carbon's virtual-key
    // constants stop at F20. Dispatch synthetic non-CGKeyCode values so these
    // keys remain distinct from ordinary macOS virtual keys.
    if (pressed && usage >= 0x70 && usage <= 0x73) {
        opendeskGlobalShortcutDarwinEvent((unsigned short)(0xf1 + usage - 0x70), opendeskShortcutHIDModifiers);
    }
}

static void *opendeskShortcutTapMain(void *unused) {
    @autoreleasepool {
        pthread_mutex_lock(&opendeskShortcutTapMutex);
        CFRunLoopRef runLoop = CFRunLoopGetCurrent();
        CFRetain(runLoop);
        CGEventMask eventMask = CGEventMaskBit(kCGEventKeyDown);
        CFMachPortRef eventTap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionListenOnly, eventMask, opendeskShortcutEventTapCallback, NULL);
        if (eventTap == NULL) {
            CFRelease(runLoop);
            opendeskShortcutTapStartStatus = -1;
            opendeskShortcutTapStarted = 0;
            pthread_cond_broadcast(&opendeskShortcutTapCondition);
            pthread_mutex_unlock(&opendeskShortcutTapMutex);
            return NULL;
        }
        IOHIDManagerRef hid = IOHIDManagerCreate(kCFAllocatorDefault, kIOHIDOptionsTypeNone);
        if (hid == NULL) {
            CFRelease(eventTap);
            CFRelease(runLoop);
            opendeskShortcutTapStartStatus = -4;
            opendeskShortcutTapStarted = 0;
            pthread_cond_broadcast(&opendeskShortcutTapCondition);
            pthread_mutex_unlock(&opendeskShortcutTapMutex);
            return NULL;
        }
        IOHIDManagerSetDeviceMatching(hid, NULL);
        IOHIDManagerRegisterInputValueCallback(hid, opendeskShortcutHIDCallback, NULL);
        IOHIDManagerScheduleWithRunLoop(hid, runLoop, kCFRunLoopCommonModes);
        IOReturn hidStatus = IOHIDManagerOpen(hid, kIOHIDOptionsTypeNone);
        if (hidStatus != kIOReturnSuccess) {
            IOHIDManagerUnscheduleFromRunLoop(hid, runLoop, kCFRunLoopCommonModes);
            CFRelease(hid);
            CFRelease(eventTap);
            CFRelease(runLoop);
            opendeskShortcutTapStartStatus = (int)hidStatus;
            opendeskShortcutTapStarted = 0;
            pthread_cond_broadcast(&opendeskShortcutTapCondition);
            pthread_mutex_unlock(&opendeskShortcutTapMutex);
            return NULL;
        }
        opendeskShortcutTapRunLoop = runLoop;
        opendeskShortcutEventTap = eventTap;
        opendeskShortcutHIDManager = hid;
        opendeskShortcutHIDModifiers = 0;
        opendeskShortcutTapStarted = 1;
        opendeskShortcutTapStartStatus = 0;
        pthread_cond_broadcast(&opendeskShortcutTapCondition);
        pthread_mutex_unlock(&opendeskShortcutTapMutex);

        CFRunLoopSourceRef eventSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0);
        CFRunLoopAddSource(runLoop, eventSource, kCFRunLoopCommonModes);
        CGEventTapEnable(eventTap, true);
        CFRunLoopRun();
        CFRunLoopRemoveSource(runLoop, eventSource, kCFRunLoopCommonModes);
        CFRelease(eventSource);
        IOHIDManagerUnscheduleFromRunLoop(hid, runLoop, kCFRunLoopCommonModes);
        IOHIDManagerClose(hid, kIOHIDOptionsTypeNone);
        CFRelease(hid);
        CFRelease(eventTap);

        pthread_mutex_lock(&opendeskShortcutTapMutex);
        if (opendeskShortcutTapRunLoop != NULL) {
            CFRelease(opendeskShortcutTapRunLoop);
            opendeskShortcutTapRunLoop = NULL;
        }
        opendeskShortcutHIDManager = NULL;
        opendeskShortcutEventTap = NULL;
        opendeskShortcutHIDModifiers = 0;
        opendeskShortcutTapStarted = 0;
        pthread_mutex_unlock(&opendeskShortcutTapMutex);
    }
    return NULL;
}

int opendesk_global_shortcut_tap_start(void) {
    pthread_mutex_lock(&opendeskShortcutTapMutex);
    if (opendeskShortcutTapStarted) {
        pthread_mutex_unlock(&opendeskShortcutTapMutex);
        return 0;
    }
    opendeskShortcutTapStartStatus = -2;
    if (pthread_create(&opendeskShortcutTapThread, NULL, opendeskShortcutTapMain, NULL) != 0) {
        opendeskShortcutTapStartStatus = -3;
        pthread_mutex_unlock(&opendeskShortcutTapMutex);
        return -3;
    }
    while (opendeskShortcutTapStartStatus == -2) {
        pthread_cond_wait(&opendeskShortcutTapCondition, &opendeskShortcutTapMutex);
    }
    int status = opendeskShortcutTapStartStatus;
    pthread_mutex_unlock(&opendeskShortcutTapMutex);
    if (status != 0) pthread_join(opendeskShortcutTapThread, NULL);
    return status;
}

void opendesk_global_shortcut_tap_stop(void) {
    pthread_mutex_lock(&opendeskShortcutTapMutex);
    CFRunLoopRef runLoop = opendeskShortcutTapRunLoop;
    int started = opendeskShortcutTapStarted;
    if (runLoop != NULL) CFRetain(runLoop);
    pthread_mutex_unlock(&opendeskShortcutTapMutex);
    if (!started || runLoop == NULL) return;
    CFRunLoopStop(runLoop);
    CFRunLoopWakeUp(runLoop);
    CFRelease(runLoop);
    pthread_join(opendeskShortcutTapThread, NULL);
}

int opendesk_global_shortcut_register(uint32_t id, uint32_t keyCode, uint32_t modifiers, uintptr_t *outHandle) {
    EventHotKeyID hotKeyID;
    hotKeyID.signature = 'ODSK';
    hotKeyID.id = id;
    EventHotKeyRef ref = NULL;
    OSStatus status = RegisterEventHotKey(keyCode, modifiers, hotKeyID, GetApplicationEventTarget(), kEventHotKeyExclusive, &ref);
    if (status == noErr && outHandle != NULL) *outHandle = (uintptr_t)ref;
    return (int)status;
}

int opendesk_global_shortcut_unregister(uintptr_t handle) {
    if (handle == 0) return 0;
    return (int)UnregisterEventHotKey((EventHotKeyRef)handle);
}
