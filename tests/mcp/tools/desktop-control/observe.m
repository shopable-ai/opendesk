// Read-only test oracle for the existing AppKit fixture. No AX mutation or input.
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>

static id Attribute(AXUIElementRef element, CFStringRef name) {
    CFTypeRef value = NULL;
    if (AXUIElementCopyAttributeValue(element, name, &value) != kAXErrorSuccess) return nil;
    return CFBridgingRelease(value);
}

static AXUIElementRef FindField(AXUIElementRef element, unsigned depth) {
    if (depth > 20) return NULL;
    if ([Attribute(element, kAXIdentifierAttribute) isEqual:@"fixture.text.editable"])
        return (AXUIElementRef)CFRetain(element);
    NSArray *children = Attribute(element, kAXChildrenAttribute);
    if (![children isKindOfClass:NSArray.class]) return NULL;
    for (id child in children) {
        AXUIElementRef found = FindField((__bridge AXUIElementRef)child, depth + 1);
        if (found) return found;
    }
    return NULL;
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 2) return 2;
        NSString *raw = [NSString stringWithUTF8String:argv[1]];
        NSScanner *scanner = [NSScanner scannerWithString:raw];
        int pid = 0;
        if (![scanner scanInt:&pid] || !scanner.isAtEnd || pid <= 0) return 2;
        NSRunningApplication *app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
        if (![app.bundleIdentifier isEqual:@"com.opendesk.accessibility-fixture"]) return 3;
        AXUIElementRef application = AXUIElementCreateApplication(pid);
        NSArray *windows = Attribute(application, kAXWindowsAttribute);
        AXUIElementRef field = NULL;
        AXUIElementRef fixtureWindow = NULL;
        if ([windows isKindOfClass:NSArray.class]) {
            for (id window in windows) {
                if ([Attribute((__bridge AXUIElementRef)window, kAXTitleAttribute)
                        isEqual:@"OpenDesk Accessibility Fixture"]) {
                    field = FindField((__bridge AXUIElementRef)window, 0);
                    fixtureWindow = (AXUIElementRef)CFRetain((__bridge AXUIElementRef)window);
                    break;
                }
            }
        }
        CFRelease(application);
        if (!field || !fixtureWindow) {
            if (fixtureWindow) CFRelease(fixtureWindow);
            return 4;
        }
        pid_t owner = 0;
        CGPoint point = CGPointZero;
        CGSize size = CGSizeZero;
        CGPoint windowPoint = CGPointZero;
        CGSize windowSize = CGSizeZero;
        id position = Attribute(field, kAXPositionAttribute);
        id dimensions = Attribute(field, kAXSizeAttribute);
        id windowPosition = Attribute(fixtureWindow, kAXPositionAttribute);
        id windowDimensions = Attribute(fixtureWindow, kAXSizeAttribute);
        BOOL valid = AXUIElementGetPid(field, &owner) == kAXErrorSuccess && owner == pid &&
            position && dimensions &&
            CFGetTypeID((__bridge CFTypeRef)position) == AXValueGetTypeID() &&
            CFGetTypeID((__bridge CFTypeRef)dimensions) == AXValueGetTypeID() &&
            AXValueGetValue((__bridge AXValueRef)position, kAXValueCGPointType, &point) &&
            AXValueGetValue((__bridge AXValueRef)dimensions, kAXValueCGSizeType, &size) &&
            size.width > 0 && size.height > 0 && windowPosition && windowDimensions &&
            CFGetTypeID((__bridge CFTypeRef)windowPosition) == AXValueGetTypeID() &&
            CFGetTypeID((__bridge CFTypeRef)windowDimensions) == AXValueGetTypeID() &&
            AXValueGetValue((__bridge AXValueRef)windowPosition, kAXValueCGPointType, &windowPoint) &&
            AXValueGetValue((__bridge AXValueRef)windowDimensions, kAXValueCGSizeType, &windowSize) &&
            windowSize.width > 0 && windowSize.height > 0;
        CFRelease(fixtureWindow);
        if (!valid) { CFRelease(field); return 5; }
        NSDictionary *result = @{
            @"pid": @(pid), @"bundleId": app.bundleIdentifier,
            @"executable": app.executableURL.path,
            @"identifier": Attribute(field, kAXIdentifierAttribute) ?: @"",
            @"role": Attribute(field, kAXRoleAttribute) ?: @"",
            @"value": Attribute(field, kAXValueAttribute) ?: @"",
            @"enabled": Attribute(field, kAXEnabledAttribute) ?: @NO,
            @"focused": Attribute(field, kAXFocusedAttribute) ?: @NO,
            @"windowBounds": @{@"x": @(windowPoint.x), @"y": @(windowPoint.y),
                               @"width": @(windowSize.width), @"height": @(windowSize.height)},
            @"bounds": @{@"x": @(point.x), @"y": @(point.y),
                         @"width": @(size.width), @"height": @(size.height)}
        };
        CFRelease(field);
        NSData *data = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
        if (!data) return 6;
        fwrite(data.bytes, 1, data.length, stdout);
        fputc('\n', stdout);
    }
    return 0;
}
