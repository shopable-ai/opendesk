#import <AppKit/AppKit.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

int32_t opendesk_app_terminate(int32_t pid, int force) {
    @autoreleasepool {
        NSRunningApplication *application =
            [NSRunningApplication runningApplicationWithProcessIdentifier:(pid_t)pid];
        if (application == nil || application.terminated) return 1;
        BOOL requested = force ? [application forceTerminate] : [application terminate];
        return requested ? 0 : 2;
    }
}

char *opendesk_app_bundle_identifier(const char *path) {
    @autoreleasepool {
        if (path == NULL) return NULL;
        NSString *bundlePath = [NSString stringWithUTF8String:path];
        NSBundle *bundle = [NSBundle bundleWithPath:bundlePath];
        NSString *identifier = bundle.bundleIdentifier;
        if (identifier == nil) return NULL;
        const char *utf8 = identifier.UTF8String;
        if (utf8 == NULL) return NULL;
        return strdup(utf8);
    }
}
