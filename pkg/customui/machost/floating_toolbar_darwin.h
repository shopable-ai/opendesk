#import <Cocoa/Cocoa.h>

@protocol CDFloatingToolbarDelegate <NSObject>
- (void)floatingToolbarDidActivateButton:(NSString *)targetID;
- (void)floatingToolbarDidChangeControl:(NSString *)targetID type:(NSString *)type value:(id)value checked:(NSNumber *)checked;
@end

// Shared by the generic WebKit control bridge only to validate an existing
// icon patch against the same generated registry as the native toolbar.
BOOL CDIsTrustedToolbarSymbol(NSString *symbol);

@interface CDToolbarView : NSView
@property(nonatomic, weak) id<CDFloatingToolbarDelegate> eventDelegate;
+ (NSDictionary *)outerBoundsForSpec:(NSDictionary *)spec position:(NSDictionary *)position;
+ (BOOL)requiresKeyboardActivationForSpec:(NSDictionary *)spec;
- (instancetype)initWithFrame:(NSRect)frame spec:(NSDictionary *)spec error:(NSError **)error;
- (NSDictionary *)stateForButtonID:(NSString *)targetID window:(NSWindow *)window;
- (NSDictionary *)applyButtonSpec:(NSDictionary *)spec window:(NSWindow *)window error:(NSError **)error;
- (NSDictionary *)stateForLabelID:(NSString *)targetID window:(NSWindow *)window;
- (NSDictionary *)applyLabelSpec:(NSDictionary *)spec window:(NSWindow *)window error:(NSError **)error;
- (NSDictionary *)stateForControlID:(NSString *)targetID window:(NSWindow *)window;
- (NSDictionary *)applyControlSpec:(NSDictionary *)spec window:(NSWindow *)window error:(NSError **)error;
- (void)setAnimationsActive:(BOOL)active;
- (void)invalidateTooltips;
- (void)releaseResources;
@end
