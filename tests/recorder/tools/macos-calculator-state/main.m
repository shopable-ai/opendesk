#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>
#include <signal.h>
#include <unistd.h>

static volatile sig_atomic_t keepRunning = 1;
static volatile sig_atomic_t receivedSignal = 0;

static void handleSignal(int number) {
    receivedSignal = number;
    keepRunning = 0;
}

static NSString *attributeString(AXUIElementRef element, CFStringRef attribute) {
    CFTypeRef value = NULL;
    AXError error = AXUIElementCopyAttributeValue(element, attribute, &value);
    if (error != kAXErrorSuccess || value == NULL) {
        if (value != NULL) CFRelease(value);
        return nil;
    }
    NSString *result = nil;
    if (CFGetTypeID(value) == CFStringGetTypeID()) result = [(__bridge NSString *)value copy];
    else if (CFGetTypeID(value) == CFNumberGetTypeID() || CFGetTypeID(value) == CFBooleanGetTypeID()) result = [[(__bridge id)value description] copy];
    CFRelease(value);
    return result;
}

static NSString *findDisplay(AXUIElementRef element, NSUInteger depth) {
    if (element == NULL || depth > 9) return nil;
    NSString *role = attributeString(element, kAXRoleAttribute);
    NSString *description = attributeString(element, kAXDescriptionAttribute);
    if ([role isEqualToString:(__bridge NSString *)kAXStaticTextRole] &&
        ([description isEqualToString:@"主显示器"] || [description isEqualToString:@"main display"])) {
        return attributeString(element, kAXValueAttribute);
    }
    CFTypeRef childrenValue = NULL;
    AXError error = AXUIElementCopyAttributeValue(element, kAXChildrenAttribute, &childrenValue);
    if (error != kAXErrorSuccess || childrenValue == NULL || CFGetTypeID(childrenValue) != CFArrayGetTypeID()) {
        if (childrenValue != NULL) CFRelease(childrenValue);
        return nil;
    }
    NSString *result = nil;
    CFArrayRef children = (CFArrayRef)childrenValue;
    for (CFIndex index = 0; index < CFArrayGetCount(children) && result == nil; index++) {
        result = findDisplay((AXUIElementRef)CFArrayGetValueAtIndex(children, index), depth + 1);
    }
    CFRelease(childrenValue);
    return result;
}

static NSString *mainDisplayValue(AXUIElementRef application) {
    CFTypeRef windowsValue = NULL;
    AXError error = AXUIElementCopyAttributeValue(application, kAXWindowsAttribute, &windowsValue);
    if (error != kAXErrorSuccess || windowsValue == NULL || CFGetTypeID(windowsValue) != CFArrayGetTypeID()) {
        if (windowsValue != NULL) CFRelease(windowsValue);
        return nil;
    }
    NSString *result = nil;
    CFArrayRef windows = (CFArrayRef)windowsValue;
    for (CFIndex index = 0; index < CFArrayGetCount(windows) && result == nil; index++) {
        result = findDisplay((AXUIElementRef)CFArrayGetValueAtIndex(windows, index), 0);
    }
    CFRelease(windowsValue);
    return result;
}

static NSDictionary *rectDictionary(CGRect rect) {
    return @{ @"x": @(rect.origin.x), @"y": @(rect.origin.y), @"width": @(rect.size.width), @"height": @(rect.size.height) };
}

static NSArray *visibleWindowsForPID(pid_t pid) {
    NSMutableArray *windows = [NSMutableArray array];
    CFArrayRef raw = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
    if (raw == NULL) return windows;
    NSArray *entries = CFBridgingRelease(raw);
    for (NSDictionary *entry in entries) {
        NSNumber *ownerPID = entry[(id)kCGWindowOwnerPID];
        NSNumber *layer = entry[(id)kCGWindowLayer];
        CGRect bounds = CGRectZero;
        if (ownerPID.intValue != pid || layer.intValue != 0 ||
            !CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)entry[(id)kCGWindowBounds], &bounds) ||
            bounds.size.width <= 0 || bounds.size.height <= 0) continue;
        [windows addObject:@{
            @"windowID": entry[(id)kCGWindowNumber] ?: @0,
            @"ownerPID": ownerPID,
            @"ownerName": entry[(id)kCGWindowOwnerName] ?: @"",
            @"title": entry[(id)kCGWindowName] ?: @"",
            @"alpha": entry[(id)kCGWindowAlpha] ?: @0,
            @"bounds": rectDictionary(bounds),
        }];
    }
    return windows;
}

static NSDictionary *hitInformation(AXUIElementRef application, pid_t pid, double x, double y) {
    AXUIElementRef hit = NULL;
    AXError hitError = AXUIElementCopyElementAtPosition(application, (float)x, (float)y, &hit);
    NSMutableDictionary *result = [@{ @"x": @(x), @"y": @(y), @"error": @(hitError), @"supportsAXPress": @NO } mutableCopy];
    if (hitError != kAXErrorSuccess || hit == NULL) {
        if (hit != NULL) CFRelease(hit);
        return result;
    }
    pid_t hitPID = 0;
    result[@"pidError"] = @(AXUIElementGetPid(hit, &hitPID));
    result[@"pid"] = @(hitPID);
    NSArray *attributes = @[
        @[(__bridge NSString *)kAXRoleAttribute, @"role"],
        @[(__bridge NSString *)kAXTitleAttribute, @"title"],
        @[(__bridge NSString *)kAXValueAttribute, @"value"],
        @[(__bridge NSString *)kAXDescriptionAttribute, @"description"],
    ];
    for (NSArray *pair in attributes) {
        NSString *value = attributeString(hit, (__bridge CFStringRef)pair[0]);
        if (value.length > 0) result[pair[1]] = value;
    }
    CFArrayRef actions = NULL;
    AXError actionsError = AXUIElementCopyActionNames(hit, &actions);
    result[@"actionsError"] = @(actionsError);
    if (actionsError == kAXErrorSuccess && actions != NULL) {
        NSArray *names = [(__bridge NSArray *)actions copy];
        result[@"actions"] = names;
        result[@"supportsAXPress"] = ([names containsObject:(__bridge NSString *)kAXPressAction] && hitPID == pid) ? @YES : @NO;
    }
    if (actions != NULL) CFRelease(actions);
    CFRelease(hit);
    return result;
}

static NSArray *activeDisplays(void) {
    uint32_t count = 0;
    if (CGGetActiveDisplayList(0, NULL, &count) != kCGErrorSuccess || count == 0) return @[];
    CGDirectDisplayID *ids = calloc(count, sizeof(CGDirectDisplayID));
    NSMutableArray *result = [NSMutableArray array];
    if (ids != NULL && CGGetActiveDisplayList(count, ids, &count) == kCGErrorSuccess) {
        for (uint32_t index = 0; index < count; index++) [result addObject:@{ @"displayID": @(ids[index]), @"bounds": rectDictionary(CGDisplayBounds(ids[index])) }];
    }
    free(ids);
    return result;
}

static NSDictionary *applicationInformation(pid_t pid) {
    NSRunningApplication *application = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
    if (application == nil) return @{ @"pid": @(pid), @"available": @NO };
    return @{
        @"pid": @(pid), @"available": @YES, @"bundleID": application.bundleIdentifier ?: @"",
        @"bundlePath": application.bundleURL.path ?: @"", @"name": application.localizedName ?: @"",
        @"active": @(application.active), @"terminated": @(application.terminated),
    };
}

static NSDictionary *frontmostInformation(void) {
    NSRunningApplication *front = NSWorkspace.sharedWorkspace.frontmostApplication;
    if (front == nil) return @{ @"available": @NO };
    return @{
        @"available": @YES, @"pid": @(front.processIdentifier), @"bundleID": front.bundleIdentifier ?: @"",
        @"bundlePath": front.bundleURL.path ?: @"", @"name": front.localizedName ?: @"",
        @"active": @(front.active), @"terminated": @(front.terminated),
    };
}

static NSDictionary *makeState(pid_t pid, AXUIElementRef application, NSUInteger sequence) {
    NSArray *windows = visibleWindowsForPID(pid);
    CGRect bounds = CGRectZero;
    if (windows.count == 1) {
        NSDictionary *raw = windows[0][@"bounds"];
        bounds = CGRectMake([raw[@"x"] doubleValue], [raw[@"y"] doubleValue], [raw[@"width"] doubleValue], [raw[@"height"] doubleValue]);
    }
    double column[4] = { bounds.origin.x + 28, bounds.origin.x + 86, bounds.origin.x + 145, bounds.origin.x + 203 };
    double row[5] = { bounds.origin.y + 105, bounds.origin.y + 153, bounds.origin.y + 201, bounds.origin.y + 249, bounds.origin.y + 297 };
    NSDictionary *points = @{
        @"clear": @[@(column[0]), @(row[0])], @"multiply": @[@(column[3]), @(row[1])],
        @"one": @[@(column[0]), @(row[3])], @"two": @[@(column[1]), @(row[3])], @"three": @[@(column[2]), @(row[3])],
        @"four": @[@(column[0]), @(row[2])], @"five": @[@(column[1]), @(row[2])], @"six": @[@(column[2]), @(row[2])],
        @"seven": @[@(column[0]), @(row[1])], @"equals": @[@(column[3]), @(row[4])],
    };
    NSMutableDictionary *hits = [NSMutableDictionary dictionary];
    for (NSString *key in points) {
        NSArray *point = points[key];
        hits[key] = hitInformation(application, pid, [point[0] doubleValue], [point[1] doubleValue]);
    }
    long long epochMilliseconds = llround(NSDate.date.timeIntervalSince1970 * 1000.0);
    return @{
        @"schemaVersion": @1, @"sequence": @(sequence), @"timestampEpochMs": @(epochMilliseconds),
        @"timestamp": [NSISO8601DateFormatter.new stringFromDate:NSDate.date] ?: @"",
        @"permissions": @{
            @"screenCapture": @(CGPreflightScreenCaptureAccess()),
            @"accessibility": @((BOOL)(AXIsProcessTrusted() && CGPreflightPostEventAccess())),
            @"axTrusted": @(AXIsProcessTrusted()), @"postEventAccess": @(CGPreflightPostEventAccess()),
        },
        @"application": applicationInformation(pid), @"frontmost": frontmostInformation(),
        @"windows": windows, @"displays": activeDisplays(), @"mainDisplayValue": mainDisplayValue(application) ?: [NSNull null], @"hits": hits,
    };
}

static BOOL writeJSONAtomically(NSDictionary *value, NSString *path, NSError **error) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:value options:NSJSONWritingSortedKeys error:error];
    return data != nil && [data writeToFile:path options:NSDataWritingAtomic error:error];
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 3) {
            fprintf(stderr, "usage: macos-calculator-state PID OUT_DIR\n");
            return 2;
        }
        long long parsedPID = strtoll(argv[1], NULL, 10);
        if (parsedPID <= 0 || parsedPID > INT32_MAX || !AXIsProcessTrusted()) return 3;
        NSString *outputDirectory = [NSString stringWithUTF8String:argv[2]];
        [[NSFileManager defaultManager] createDirectoryAtPath:outputDirectory withIntermediateDirectories:YES attributes:nil error:nil];
        signal(SIGTERM, handleSignal);
        signal(SIGINT, handleSignal);
        NSString *currentPath = [outputDirectory stringByAppendingPathComponent:@"current-state.json"];
        NSString *tracePath = [outputDirectory stringByAppendingPathComponent:@"trace.ndjson"];
        NSString *exitPath = [outputDirectory stringByAppendingPathComponent:@"watcher-exit.json"];
        [[NSFileManager defaultManager] createFileAtPath:tracePath contents:nil attributes:nil];
        NSFileHandle *trace = [NSFileHandle fileHandleForWritingAtPath:tracePath];
        AXUIElementRef application = AXUIElementCreateApplication((pid_t)parsedPID);
        if (trace == nil || application == NULL) return 4;
        NSUInteger samples = 0;
        int exitCode = 0;
        while (keepRunning) {
            @autoreleasepool {
                NSDictionary *state = makeState((pid_t)parsedPID, application, samples + 1);
                NSError *error = nil;
                if (!writeJSONAtomically(state, currentPath, &error)) { exitCode = 5; break; }
                NSData *line = [NSJSONSerialization dataWithJSONObject:state options:NSJSONWritingSortedKeys error:&error];
                if (line == nil) { exitCode = 6; break; }
                [trace writeData:line];
                [trace writeData:[@"\n" dataUsingEncoding:NSUTF8StringEncoding]];
                [trace synchronizeFile];
                samples++;
            }
            [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
        }
        CFRelease(application);
        [trace synchronizeFile];
        [trace closeFile];
        NSDictionary *exitReport = @{ @"ok": @(exitCode == 0), @"exitCode": @(exitCode), @"receivedSignal": @(receivedSignal), @"samples": @(samples), @"timestamp": [NSISO8601DateFormatter.new stringFromDate:NSDate.date] ?: @"" };
        NSError *error = nil;
        if (!writeJSONAtomically(exitReport, exitPath, &error) && exitCode == 0) exitCode = 7;
        fprintf(stdout, "watcher_exit code=%d signal=%d samples=%lu\n", exitCode, (int)receivedSignal, (unsigned long)samples);
        return exitCode;
    }
}
