//go:build darwin && cgo

#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>

// CDMeasurementPanel is defined by native_darwin.m. Re-declaring the public
// Objective-C class name here lets the Measurement keyboard extension remain
// isolated from the large native host implementation and keeps the bridge
// contract testable as a separate compilation unit.
@interface CDMeasurementPanel : NSPanel
@end

@protocol CDMeasurementKeyEventSink <NSObject>
- (void)emitType:(NSString *)type target:(NSString *)target body:(NSDictionary *)body reason:(NSString *)reason;
@end

static const void *CDMeasurementOptionStateKey = &CDMeasurementOptionStateKey;
static NSString *const CDMeasurementTargetID = @"measurementPreview";

static NSDictionary *CDMeasurementKeyFields(NSEvent *event, NSString *key, NSString *phase) {
    NSEventModifierFlags flags = event.modifierFlags;
    return @{
        @"key": key ?: @"",
        @"phase": phase ?: @"down",
        @"shift": @((flags & NSEventModifierFlagShift) != 0),
        @"alt": @((flags & NSEventModifierFlagOption) != 0),
        @"ctrl": @((flags & NSEventModifierFlagControl) != 0),
        @"meta": @((flags & NSEventModifierFlagCommand) != 0),
    };
}

static void CDEmitMeasurementKey(CDMeasurementPanel *panel, NSEvent *event, NSString *key, NSString *phase) {
    id delegate = panel.delegate;
    if (![delegate respondsToSelector:@selector(emitType:target:body:reason:)]) return;
    [(id<CDMeasurementKeyEventSink>)delegate emitType:@"measurement.key"
                                               target:CDMeasurementTargetID
                                                 body:CDMeasurementKeyFields(event, key, phase)
                                               reason:nil];
}

@implementation CDMeasurementPanel (MeasurementKeys)

- (void)sendEvent:(NSEvent *)event {
    if (event.type == NSEventTypeFlagsChanged) {
        BOOL optionDown = (event.modifierFlags & NSEventModifierFlagOption) != 0;
        NSNumber *previous = objc_getAssociatedObject(self, CDMeasurementOptionStateKey);
        BOOL previousDown = previous ? previous.boolValue : NO;
        if (optionDown != previousDown) {
            objc_setAssociatedObject(self, CDMeasurementOptionStateKey, @(optionDown), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
            CDEmitMeasurementKey(self, event, @"Alt", optionDown ? @"down" : @"up");
        }
        [super sendEvent:event];
        return;
    }

    if (event.type == NSEventTypeKeyDown) {
        NSString *raw = event.charactersIgnoringModifiers ?: @"";
        NSString *lower = raw.lowercaseString;
        NSString *key = nil;
        if ([raw isEqualToString:@"\t"]) key = @"Tab";
        else if ([lower isEqualToString:@"r"]) key = @"r";
        else if ([lower isEqualToString:@"i"]) key = @"i";
        else if ([raw isEqualToString:@"1"] || [raw isEqualToString:@"2"] || [raw isEqualToString:@"3"] || [raw isEqualToString:@"4"]) key = raw;
        if (key.length) {
            CDEmitMeasurementKey(self, event, key, @"down");
            // These are Measurement commands, not document text/navigation.
            // Do not forward them into WKWebView, which would otherwise move
            // focus on Tab or type into a focused control.
            return;
        }
    }
    [super sendEvent:event];
}

@end
