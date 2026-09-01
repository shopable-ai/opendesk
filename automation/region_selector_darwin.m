#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#include <math.h>
#include <stdint.h>

typedef struct {
    int32_t status;
    int32_t x;
    int32_t y;
    int32_t width;
    int32_t height;
    uint32_t display_id;
    int32_t display_index;
    double scale_factor;
} opendesk_region_selector_result;

typedef NS_OPTIONS(NSUInteger, ODResizeEdge) {
    ODResizeNone = 0,
    ODResizeLeft = 1 << 0,
    ODResizeRight = 1 << 1,
    ODResizeTop = 1 << 2,
    ODResizeBottom = 1 << 3,
};

typedef NS_ENUM(NSInteger, ODSelectionAction) {
    ODSelectionCreate,
    ODSelectionMove,
    ODSelectionResize,
};

@class ODRegionSelectorController;

@interface ODRegionSelectorWindow : NSWindow
@property(nonatomic, weak) ODRegionSelectorController *selectorController;
@end

@interface ODRegionSelectorView : NSView
@property(nonatomic, weak) ODRegionSelectorController *selectorController;
@end

@interface ODRegionSelectorController : NSObject
@property(nonatomic) BOOL dimOutside;
@property(nonatomic) BOOL movable;
@property(nonatomic) BOOL resizable;
@property(nonatomic) CGFloat minWidth;
@property(nonatomic) CGFloat minHeight;
@property(nonatomic) BOOL hasSelection;
@property(nonatomic) BOOL canceled;
@property(nonatomic) BOOL finished;
@property(nonatomic) CGRect selection;
@property(nonatomic) CGRect displayBounds;
@property(nonatomic) CGPoint dragStart;
@property(nonatomic) CGRect dragStartRect;
@property(nonatomic) ODSelectionAction action;
@property(nonatomic) ODResizeEdge resizeEdges;
@property(nonatomic, strong) NSMutableArray<ODRegionSelectorWindow *> *windows;
- (void)mouseDown:(NSEvent *)event;
- (void)mouseDragged:(NSEvent *)event;
- (void)mouseUp:(NSEvent *)event;
- (void)keyDown:(NSEvent *)event;
- (NSRect)localSelectionForView:(NSView *)view;
- (void)redraw;
- (void)stopApplicationLoop;
@end

static CGFloat ODMainDisplayHeight(void) {
    return CGDisplayBounds(CGMainDisplayID()).size.height;
}

static CGPoint ODCGPointForEvent(NSEvent *event) {
    CGEventRef cgEvent = event.CGEvent;
    if (cgEvent != NULL) return CGEventGetLocation(cgEvent);
    NSPoint point = NSEvent.mouseLocation;
    return CGPointMake(point.x, ODMainDisplayHeight() - point.y);
}

static NSPoint ODAppKitPointForCGPoint(CGPoint point) {
    return NSMakePoint(point.x, ODMainDisplayHeight() - point.y);
}

static CGRect ODNormalizedRect(CGPoint a, CGPoint b) {
    CGFloat x = MIN(a.x, b.x);
    CGFloat y = MIN(a.y, b.y);
    return CGRectMake(x, y, fabs(a.x - b.x), fabs(a.y - b.y));
}

static CGRect ODClampRectToBounds(CGRect rect, CGRect bounds) {
    if (rect.size.width > bounds.size.width) rect.size.width = bounds.size.width;
    if (rect.size.height > bounds.size.height) rect.size.height = bounds.size.height;
    rect.origin.x = MAX(bounds.origin.x, MIN(rect.origin.x, CGRectGetMaxX(bounds) - rect.size.width));
    rect.origin.y = MAX(bounds.origin.y, MIN(rect.origin.y, CGRectGetMaxY(bounds) - rect.size.height));
    return rect;
}

static CGRect ODDisplayBoundsForPoint(CGPoint point) {
    uint32_t count = 0;
    CGGetActiveDisplayList(0, NULL, &count);
    CGDirectDisplayID *displays = calloc(count, sizeof(CGDirectDisplayID));
    if (displays == NULL) return CGRectZero;
    CGGetActiveDisplayList(count, displays, &count);
    CGRect result = CGRectZero;
    for (uint32_t i = 0; i < count; i++) {
        CGRect bounds = CGDisplayBounds(displays[i]);
        if (CGRectContainsPoint(bounds, point)) {
            result = bounds;
            break;
        }
    }
    free(displays);
    return result;
}

@implementation ODRegionSelectorWindow
- (BOOL)canBecomeKeyWindow { return YES; }
- (BOOL)canBecomeMainWindow { return YES; }
- (void)keyDown:(NSEvent *)event { [self.selectorController keyDown:event]; }
@end

@implementation ODRegionSelectorView
- (BOOL)acceptsFirstResponder { return YES; }
- (void)resetCursorRects { [self addCursorRect:self.bounds cursor:NSCursor.crosshairCursor]; }
- (void)mouseDown:(NSEvent *)event { [self.selectorController mouseDown:event]; }
- (void)mouseDragged:(NSEvent *)event { [self.selectorController mouseDragged:event]; }
- (void)mouseUp:(NSEvent *)event { [self.selectorController mouseUp:event]; }
- (void)keyDown:(NSEvent *)event { [self.selectorController keyDown:event]; }

- (void)drawRect:(NSRect)dirtyRect {
    [super drawRect:dirtyRect];
    ODRegionSelectorController *controller = self.selectorController;
    if (controller == nil) return;
    if (controller.dimOutside) {
        [[NSColor colorWithWhite:0 alpha:0.48] setFill];
        NSBezierPath *shade = [NSBezierPath bezierPathWithRect:self.bounds];
        if (controller.hasSelection) {
            [shade appendBezierPathWithRect:[controller localSelectionForView:self]];
            shade.windingRule = NSWindingRuleEvenOdd;
        }
        [shade fill];
    }
    if (!controller.hasSelection) return;
    NSRect rect = [controller localSelectionForView:self];
    if (!NSIntersectsRect(rect, self.bounds)) return;
    // Keep the visually clear selection hit-testable. A fully transparent hole
    // in a borderless window is click-through at the WindowServer level, which
    // would make moving the region and dragging its handles impossible.
    [[NSColor colorWithWhite:1 alpha:0.01] setFill];
    NSRectFill(rect);
    [[NSColor colorWithCalibratedRed:0.18 green:0.62 blue:1 alpha:1] setStroke];
    NSBezierPath *border = [NSBezierPath bezierPathWithRect:NSInsetRect(rect, 0.5, 0.5)];
    border.lineWidth = 2;
    [border stroke];

    if (controller.resizable) {
        NSArray<NSValue *> *points = @[
            [NSValue valueWithPoint:NSMakePoint(NSMinX(rect), NSMinY(rect))],
            [NSValue valueWithPoint:NSMakePoint(NSMidX(rect), NSMinY(rect))],
            [NSValue valueWithPoint:NSMakePoint(NSMaxX(rect), NSMinY(rect))],
            [NSValue valueWithPoint:NSMakePoint(NSMinX(rect), NSMidY(rect))],
            [NSValue valueWithPoint:NSMakePoint(NSMaxX(rect), NSMidY(rect))],
            [NSValue valueWithPoint:NSMakePoint(NSMinX(rect), NSMaxY(rect))],
            [NSValue valueWithPoint:NSMakePoint(NSMidX(rect), NSMaxY(rect))],
            [NSValue valueWithPoint:NSMakePoint(NSMaxX(rect), NSMaxY(rect))],
        ];
        for (NSValue *value in points) {
            NSPoint point = value.pointValue;
            NSRect handle = NSMakeRect(point.x - 4, point.y - 4, 8, 8);
            [[NSColor whiteColor] setFill];
            [[NSColor colorWithCalibratedRed:0.18 green:0.62 blue:1 alpha:1] setStroke];
            NSBezierPath *path = [NSBezierPath bezierPathWithOvalInRect:handle];
            [path fill];
            [path stroke];
        }
    }

    NSString *label = [NSString stringWithFormat:@"%.0f × %.0f", controller.selection.size.width, controller.selection.size.height];
    NSDictionary *attributes = @{
        NSFontAttributeName: [NSFont monospacedDigitSystemFontOfSize:12 weight:NSFontWeightSemibold],
        NSForegroundColorAttributeName: NSColor.whiteColor,
        NSBackgroundColorAttributeName: [NSColor colorWithWhite:0 alpha:0.72],
    };
    NSSize labelSize = [label sizeWithAttributes:attributes];
    NSPoint labelPoint = NSMakePoint(NSMidX(rect) - labelSize.width / 2, MAX(4, NSMinY(rect) - labelSize.height - 8));
    [label drawAtPoint:labelPoint withAttributes:attributes];
}
@end

@implementation ODRegionSelectorController

- (NSRect)localSelectionForView:(NSView *)view {
    NSPoint topLeft = ODAppKitPointForCGPoint(self.selection.origin);
    NSPoint bottomRight = ODAppKitPointForCGPoint(CGPointMake(CGRectGetMaxX(self.selection), CGRectGetMaxY(self.selection)));
    topLeft = [view.window convertPointFromScreen:topLeft];
    bottomRight = [view.window convertPointFromScreen:bottomRight];
    topLeft = [view convertPoint:topLeft fromView:nil];
    bottomRight = [view convertPoint:bottomRight fromView:nil];
    return NSMakeRect(MIN(topLeft.x, bottomRight.x), MIN(topLeft.y, bottomRight.y),
                      fabs(topLeft.x - bottomRight.x), fabs(topLeft.y - bottomRight.y));
}

- (void)redraw {
    for (ODRegionSelectorWindow *window in self.windows) {
        [window.contentView setNeedsDisplay:YES];
    }
}

- (ODResizeEdge)edgesAtPoint:(CGPoint)point {
    if (!self.hasSelection || !self.resizable) return ODResizeNone;
    CGFloat tolerance = 10;
    ODResizeEdge edges = ODResizeNone;
    if (fabs(point.x - CGRectGetMinX(self.selection)) <= tolerance) edges |= ODResizeLeft;
    if (fabs(point.x - CGRectGetMaxX(self.selection)) <= tolerance) edges |= ODResizeRight;
    if (fabs(point.y - CGRectGetMinY(self.selection)) <= tolerance) edges |= ODResizeTop;
    if (fabs(point.y - CGRectGetMaxY(self.selection)) <= tolerance) edges |= ODResizeBottom;
    BOOL withinX = point.x >= CGRectGetMinX(self.selection) - tolerance && point.x <= CGRectGetMaxX(self.selection) + tolerance;
    BOOL withinY = point.y >= CGRectGetMinY(self.selection) - tolerance && point.y <= CGRectGetMaxY(self.selection) + tolerance;
    if (!withinX || !withinY) return ODResizeNone;
    return edges;
}

- (void)mouseDown:(NSEvent *)event {
    CGPoint point = ODCGPointForEvent(event);
    self.dragStart = point;
    self.dragStartRect = self.selection;
    self.resizeEdges = [self edgesAtPoint:point];
    if (self.resizeEdges != ODResizeNone) {
        self.action = ODSelectionResize;
        return;
    }
    if (self.hasSelection && self.movable && CGRectContainsPoint(self.selection, point)) {
        self.action = ODSelectionMove;
        return;
    }
    CGRect display = ODDisplayBoundsForPoint(point);
    if (CGRectIsEmpty(display)) return;
    self.displayBounds = display;
    self.action = ODSelectionCreate;
    self.hasSelection = YES;
    self.selection = CGRectMake(point.x, point.y, 0, 0);
    [self redraw];
}

- (void)mouseDragged:(NSEvent *)event {
    if (!self.hasSelection) return;
    CGPoint point = ODCGPointForEvent(event);
    point.x = MAX(CGRectGetMinX(self.displayBounds), MIN(point.x, CGRectGetMaxX(self.displayBounds)));
    point.y = MAX(CGRectGetMinY(self.displayBounds), MIN(point.y, CGRectGetMaxY(self.displayBounds)));
    if (self.action == ODSelectionCreate) {
        self.selection = ODNormalizedRect(self.dragStart, point);
    } else if (self.action == ODSelectionMove) {
        CGRect moved = self.dragStartRect;
        moved.origin.x += point.x - self.dragStart.x;
        moved.origin.y += point.y - self.dragStart.y;
        self.selection = ODClampRectToBounds(moved, self.displayBounds);
    } else {
        CGFloat left = CGRectGetMinX(self.dragStartRect);
        CGFloat right = CGRectGetMaxX(self.dragStartRect);
        CGFloat top = CGRectGetMinY(self.dragStartRect);
        CGFloat bottom = CGRectGetMaxY(self.dragStartRect);
        if (self.resizeEdges & ODResizeLeft) left = MIN(point.x, right - self.minWidth);
        if (self.resizeEdges & ODResizeRight) right = MAX(point.x, left + self.minWidth);
        if (self.resizeEdges & ODResizeTop) top = MIN(point.y, bottom - self.minHeight);
        if (self.resizeEdges & ODResizeBottom) bottom = MAX(point.y, top + self.minHeight);
        self.selection = CGRectMake(left, top, right - left, bottom - top);
        self.selection = ODClampRectToBounds(self.selection, self.displayBounds);
    }
    [self redraw];
}

- (void)mouseUp:(NSEvent *)event {
    [self mouseDragged:event];
    if (!self.hasSelection) return;
    CGRect rect = self.selection;
    if (rect.size.width < self.minWidth) rect.size.width = self.minWidth;
    if (rect.size.height < self.minHeight) rect.size.height = self.minHeight;
    self.selection = ODClampRectToBounds(rect, self.displayBounds);
    [self redraw];
}

- (void)keyDown:(NSEvent *)event {
    if (event.keyCode == 53) {
        self.canceled = YES;
        self.finished = YES;
        [self stopApplicationLoop];
        return;
    }
    if ((event.keyCode == 36 || event.keyCode == 76) && self.hasSelection &&
        self.selection.size.width >= self.minWidth && self.selection.size.height >= self.minHeight) {
        self.canceled = NO;
        self.finished = YES;
        [self stopApplicationLoop];
        return;
    }
}

- (void)stopApplicationLoop {
    [NSApp stop:nil];
    NSEvent *wake = [NSEvent otherEventWithType:NSEventTypeApplicationDefined
                                        location:NSZeroPoint
                                   modifierFlags:0
                                       timestamp:0
                                    windowNumber:0
                                         context:nil
                                         subtype:0
                                           data1:0
                                           data2:0];
    [NSApp postEvent:wake atStart:NO];
}
@end

static BOOL ODDisplayMetadataForRect(CGRect rect, uint32_t *displayID, int32_t *displayIndex, double *scale) {
    uint32_t count = 0;
    if (CGGetActiveDisplayList(0, NULL, &count) != kCGErrorSuccess || count == 0) return NO;
    CGDirectDisplayID *displays = calloc(count, sizeof(CGDirectDisplayID));
    if (displays == NULL) return NO;
    if (CGGetActiveDisplayList(count, displays, &count) != kCGErrorSuccess) {
        free(displays);
        return NO;
    }
    BOOL found = NO;
    CGPoint center = CGPointMake(CGRectGetMidX(rect), CGRectGetMidY(rect));
    for (uint32_t index = 0; index < count; index++) {
        CGRect bounds = CGDisplayBounds(displays[index]);
        if (CGRectContainsPoint(bounds, center)) {
            *displayID = displays[index];
            *displayIndex = (int32_t)index + 1;
            CGFloat logicalWidth = bounds.size.width;
            *scale = logicalWidth > 0 ? (double)CGDisplayPixelsWide(displays[index]) / logicalWidth : 1.0;
            found = YES;
            break;
        }
    }
    free(displays);
    return found;
}

opendesk_region_selector_result opendesk_region_selector_run(
    int dim_outside, int movable, int resizable, int min_width, int min_height) {
    opendesk_region_selector_result result = {0};
    result.status = -1;
    @autoreleasepool {
        if (![NSThread isMainThread]) return result;
        NSApplication *application = NSApplication.sharedApplication;
        [application setActivationPolicy:NSApplicationActivationPolicyAccessory];
        [application finishLaunching];

        ODRegionSelectorController *controller = [[ODRegionSelectorController alloc] init];
        controller.dimOutside = dim_outside != 0;
        controller.movable = movable != 0;
        controller.resizable = resizable != 0;
        controller.minWidth = min_width;
        controller.minHeight = min_height;
        controller.windows = [NSMutableArray array];

        for (NSScreen *screen in NSScreen.screens) {
            ODRegionSelectorWindow *window = [[ODRegionSelectorWindow alloc]
                initWithContentRect:screen.frame
                          styleMask:NSWindowStyleMaskBorderless
                            backing:NSBackingStoreBuffered
                              defer:NO];
            window.selectorController = controller;
            window.title = @"OpenDesk Region Selector";
            window.opaque = NO;
            window.backgroundColor = NSColor.clearColor;
            window.alphaValue = 1;
            window.hasShadow = NO;
            window.level = NSScreenSaverWindowLevel;
            window.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary;
            window.acceptsMouseMovedEvents = YES;
            window.ignoresMouseEvents = NO;
            window.releasedWhenClosed = NO;
            ODRegionSelectorView *view = [[ODRegionSelectorView alloc] initWithFrame:NSMakeRect(0, 0, screen.frame.size.width, screen.frame.size.height)];
            view.selectorController = controller;
            window.contentView = view;
            [controller.windows addObject:window];
        }
        if (controller.windows.count == 0) return result;
        ODRegionSelectorWindow *keyWindow = controller.windows.firstObject;
        dispatch_async(dispatch_get_main_queue(), ^{
            [application activateIgnoringOtherApps:YES];
            for (ODRegionSelectorWindow *window in controller.windows) {
                [window orderFrontRegardless];
                [window displayIfNeeded];
            }
            [keyWindow makeKeyAndOrderFront:nil];
            [keyWindow makeFirstResponder:keyWindow.contentView];
        });
        [application run];
        for (ODRegionSelectorWindow *window in controller.windows) {
            [window orderOut:nil];
            [window close];
        }
        if (controller.canceled || !controller.finished) {
            result.status = 1;
            return result;
        }
        uint32_t displayID = 0;
        int32_t displayIndex = 0;
        double scale = 1;
        if (!ODDisplayMetadataForRect(controller.selection, &displayID, &displayIndex, &scale)) return result;
        result.status = 0;
        result.x = (int32_t)llround(controller.selection.origin.x);
        result.y = (int32_t)llround(controller.selection.origin.y);
        result.width = (int32_t)llround(controller.selection.size.width);
        result.height = (int32_t)llround(controller.selection.size.height);
        result.display_id = displayID;
        result.display_index = displayIndex;
        result.scale_factor = scale;
    }
    return result;
}
