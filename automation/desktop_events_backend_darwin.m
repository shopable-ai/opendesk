#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

char *opendesk_desktop_events_running_applications_json(void) {
    @autoreleasepool {
        NSMutableArray *items = [NSMutableArray array];
        for (NSRunningApplication *application in [[NSWorkspace sharedWorkspace] runningApplications]) {
            if (application.terminated) continue;
            if (application.activationPolicy == NSApplicationActivationPolicyProhibited) continue;
            NSString *name = application.localizedName ?: @"";
            NSString *bundleIdentifier = application.bundleIdentifier ?: @"";
            NSString *path = application.bundleURL.path ?: @"";
            NSString *executablePath = application.executableURL.path ?: @"";
            NSNumber *launchTimeMs = @0;
            NSDate *launchDate = application.launchDate;
            if (launchDate != nil) {
                launchTimeMs = @((int64_t)(launchDate.timeIntervalSince1970 * 1000.0));
            }
            [items addObject:@{
                @"pid": @(application.processIdentifier),
                @"name": name,
                @"bundleIdentifier": bundleIdentifier,
                @"path": path,
                @"executablePath": executablePath,
                @"activationPolicy": @(application.activationPolicy),
                @"active": @(application.active),
                @"hidden": @(application.hidden),
                @"terminated": @(application.terminated),
                @"launchTimeMs": launchTimeMs
            }];
        }
        NSError *error = nil;
        NSData *data = [NSJSONSerialization dataWithJSONObject:items options:0 error:&error];
        if (data == nil || error != nil) return NULL;
        char *result = malloc(data.length + 1);
        if (result == NULL) return NULL;
        memcpy(result, data.bytes, data.length);
        result[data.length] = '\0';
        return result;
    }
}

int64_t opendesk_desktop_events_clipboard_change_count(void) {
    @autoreleasepool {
        NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
        if (pasteboard == nil) return -1;
        return (int64_t)pasteboard.changeCount;
    }
}
