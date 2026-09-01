#import <Cocoa/Cocoa.h>

@protocol CDFloatingToolbarDelegate <NSObject>
- (void)floatingToolbarDidActivateButton:(NSString *)targetID;
@end

// Shared by the generic WebKit control bridge only to validate an existing
// icon patch against the same generated registry as the native toolbar.
BOOL CDIsTrustedToolbarSymbol(NSString *symbol);

@interface CDToolbarView : NSView
@property(nonatomic, weak) id<CDFloatingToolbarDelegate> eventDelegate;
+ (NSDictionary *)outerBoundsForSpec:(NSDictionary *)spec position:(NSDictionary *)position;
- (instancetype)initWithFrame:(NSRect)frame spec:(NSDictionary *)spec error:(NSError **)error;
- (NSDictionary *)stateForButtonID:(NSString *)targetID window:(NSWindow *)window;
- (NSDictionary *)applyButtonSpec:(NSDictionary *)spec window:(NSWindow *)window error:(NSError **)error;
- (void)releaseResources;
@end
