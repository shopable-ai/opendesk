#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

static NSString *attributeString(AXUIElementRef element, CFStringRef attribute) {
    CFTypeRef value = NULL;
    AXError error = AXUIElementCopyAttributeValue(element, attribute, &value);
    if (error != kAXErrorSuccess || value == NULL) {
        if (value != NULL) CFRelease(value);
        return nil;
    }
    NSString *result = nil;
    if (CFGetTypeID(value) == CFStringGetTypeID()) result = [(__bridge NSString *)value copy];
    CFRelease(value);
    return result;
}

static NSString *findTextAreaValue(AXUIElementRef element, NSUInteger depth) {
    if (element == NULL || depth > 10) return nil;
    NSString *role = attributeString(element, kAXRoleAttribute);
    if ([role isEqualToString:(__bridge NSString *)kAXTextAreaRole]) return attributeString(element, kAXValueAttribute);
    CFTypeRef raw = NULL;
    AXError error = AXUIElementCopyAttributeValue(element, kAXChildrenAttribute, &raw);
    if (error != kAXErrorSuccess || raw == NULL || CFGetTypeID(raw) != CFArrayGetTypeID()) {
        if (raw != NULL) CFRelease(raw);
        return nil;
    }
    NSString *result = nil;
    CFArrayRef children = (CFArrayRef)raw;
    for (CFIndex index = 0; index < CFArrayGetCount(children) && result == nil; index++) {
        result = findTextAreaValue((AXUIElementRef)CFArrayGetValueAtIndex(children, index), depth + 1);
    }
    CFRelease(raw);
    return result;
}

static NSArray *visibleWindows(pid_t pid) {
    NSMutableArray *result = [NSMutableArray array];
    CFArrayRef raw = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
    if (raw == NULL) return result;
    for (NSDictionary *entry in CFBridgingRelease(raw)) {
        NSNumber *ownerPID = entry[(id)kCGWindowOwnerPID];
        NSNumber *layer = entry[(id)kCGWindowLayer];
        CGRect bounds = CGRectZero;
        if (ownerPID.intValue != pid || layer.intValue != 0 ||
            !CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)entry[(id)kCGWindowBounds], &bounds) ||
            bounds.size.width <= 0 || bounds.size.height <= 0) continue;
        [result addObject:@{
            @"windowID": entry[(id)kCGWindowNumber] ?: @0, @"ownerPID": ownerPID,
            @"title": entry[(id)kCGWindowName] ?: @"",
            @"bounds": @{ @"x": @(bounds.origin.x), @"y": @(bounds.origin.y), @"width": @(bounds.size.width), @"height": @(bounds.size.height) },
        }];
    }
    return result;
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 2) return 2;
        pid_t pid = (pid_t)strtol(argv[1], NULL, 10);
        if (pid <= 0 || !AXIsProcessTrusted()) return 3;
        NSRunningApplication *application = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
        AXUIElementRef axApplication = AXUIElementCreateApplication(pid);
        NSString *text = axApplication == NULL ? nil : findTextAreaValue(axApplication, 0);
        if (axApplication != NULL) CFRelease(axApplication);
        NSRunningApplication *front = NSWorkspace.sharedWorkspace.frontmostApplication;
        NSDictionary *result = @{
            @"ok": @YES,
            @"timestampEpochMs": @(llround(NSDate.date.timeIntervalSince1970 * 1000.0)),
            @"permissions": @{ @"screenCapture": @(CGPreflightScreenCaptureAccess()), @"accessibility": @((BOOL)(AXIsProcessTrusted() && CGPreflightPostEventAccess())) },
            @"application": @{
                @"pid": @(pid), @"available": @(application != nil), @"active": @(application.active), @"terminated": @(application.terminated),
                @"bundleID": application.bundleIdentifier ?: @"", @"bundlePath": application.bundleURL.path ?: @"",
            },
            @"frontmostPID": front == nil ? @0 : @(front.processIdentifier),
            @"windows": visibleWindows(pid),
            @"textAreaValue": text ?: [NSNull null],
        };
        NSData *data = [NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingSortedKeys error:nil];
        fwrite(data.bytes, 1, data.length, stdout);
        fputc('\n', stdout);
        return 0;
    }
}
