//go:build darwin && cgo
#import <Cocoa/Cocoa.h>

// A bounded, non-HTML notification. The controller supplies actual desktop
// placement; this view owns monotonic timeout/progress rendering on AppKit.
@interface CDNotificationView : NSView
@property(nonatomic, copy) void (^didClose)(NSString *reason);
@property(nonatomic, copy) void (^followPosition)(void);
@property(nonatomic, copy) NSString *positionAdjustment;
@property(nonatomic, copy) NSString *closeReason;
+ (NSSize)preferredSizeForSpec:(NSDictionary *)spec;
- (instancetype)initWithSpec:(NSDictionary *)spec;
- (void)applySpec:(NSDictionary *)spec resetTimeout:(BOOL)reset;
- (NSDictionary *)state;
- (void)start;
- (void)dispose;
@end
