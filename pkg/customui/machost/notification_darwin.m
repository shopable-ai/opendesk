//go:build darwin && cgo
#import "notification_darwin.h"
#import <math.h>
#import <QuartzCore/QuartzCore.h>

static const CGFloat CDNotificationMinimumWidth = 280;
static const CGFloat CDNotificationMaximumWidth = 480;
static const CGFloat CDNotificationMinimumHeight = 52;
static const CGFloat CDNotificationMaximumHeight = 124;
static const NSInteger CDNotificationMessageLines = 3;
static const NSInteger CDNotificationCaptionLines = 2;

static CGFloat CDNotificationTextHeight(NSString *text, NSFont *font, CGFloat width, NSInteger maximumLines) {
    CGFloat lineHeight = ceil(font.ascender - font.descender + font.leading);
    if (!text.length) return lineHeight;
    NSRect measured = [text boundingRectWithSize:NSMakeSize(width, CGFLOAT_MAX)
        options:NSStringDrawingUsesLineFragmentOrigin|NSStringDrawingUsesFontLeading
        attributes:@{NSFontAttributeName:font}];
    CGFloat lines = MAX(1, ceil(NSHeight(measured) / MAX(1, lineHeight)));
    return lineHeight * MIN(maximumLines, lines);
}

static CGFloat CDNotificationTextWidth(NSString *text, NSFont *font) {
    CGFloat width = 0;
    for (NSString *line in [text componentsSeparatedByCharactersInSet:NSCharacterSet.newlineCharacterSet]) {
        NSRect measured = [line boundingRectWithSize:NSMakeSize(1000000, CGFLOAT_MAX)
            options:NSStringDrawingUsesLineFragmentOrigin|NSStringDrawingUsesFontLeading
            attributes:@{NSFontAttributeName:font}];
        width = MAX(width, NSWidth(measured));
    }
    return ceil(width);
}

@interface CDNotificationView ()
@property(nonatomic, copy) NSDictionary *spec;
@property(nonatomic, strong) NSTextField *messageLabel;
@property(nonatomic, strong) NSTextField *captionLabel;
@property(nonatomic, strong) NSButton *closeButton;
@property(nonatomic, strong) NSTimer *timer;
@property(nonatomic) NSTimeInterval deadline;
@property(nonatomic) BOOL started;
@end

@implementation CDNotificationView
- (BOOL)isFlipped { return YES; }
+ (NSSize)preferredSizeForSpec:(NSDictionary *)spec {
    BOOL closable = [spec[@"closable"] boolValue];
    NSFont *messageFont = [NSFont systemFontOfSize:14 weight:NSFontWeightMedium];
    NSFont *captionFont = [NSFont systemFontOfSize:11];
    CGFloat chromeWidth = closable ? 60 : 32;
    CGFloat width = MAX(CDNotificationTextWidth(spec[@"message"] ?: @"", messageFont),
        CDNotificationTextWidth(spec[@"caption"] ?: @"", captionFont)) + chromeWidth;
    width = MIN(CDNotificationMaximumWidth, MAX(CDNotificationMinimumWidth, ceil(width)));
    CGFloat textWidth = width - chromeWidth;
    CGFloat height = 10 + CDNotificationTextHeight(spec[@"message"] ?: @"", messageFont, textWidth, CDNotificationMessageLines) + 10;
    NSString *caption = spec[@"caption"] ?: @"";
    if (caption.length) height += 3 + CDNotificationTextHeight(caption, captionFont, textWidth, CDNotificationCaptionLines);
    if ([spec[@"progress"] isKindOfClass:NSDictionary.class]) height += 10;
    height = MIN(CDNotificationMaximumHeight, MAX(CDNotificationMinimumHeight, ceil(height)));
    return NSMakeSize(width, height);
}
- (instancetype)initWithSpec:(NSDictionary *)spec {
    NSSize size = [CDNotificationView preferredSizeForSpec:spec];
    self = [super initWithFrame:NSMakeRect(0, 0, size.width, size.height)];
    if (!self) return nil;
    self.wantsLayer = YES;
    self.layer.backgroundColor = [NSColor colorWithWhite:0.10 alpha:0.97].CGColor;
    self.layer.cornerRadius = 10;
    self.layer.masksToBounds = YES;
    self.messageLabel = [NSTextField wrappingLabelWithString:spec[@"message"] ?: @""];
    self.messageLabel.font = [NSFont systemFontOfSize:14 weight:NSFontWeightMedium];
    self.messageLabel.textColor = NSColor.whiteColor;
    self.messageLabel.maximumNumberOfLines = CDNotificationMessageLines;
    self.messageLabel.lineBreakMode = NSLineBreakByWordWrapping;
    NSTextFieldCell *messageCell = (NSTextFieldCell *)self.messageLabel.cell;
    messageCell.wraps = YES;
    messageCell.usesSingleLineMode = NO;
    messageCell.truncatesLastVisibleLine = YES;
    self.messageLabel.selectable = NO;
    self.captionLabel = [NSTextField wrappingLabelWithString:@""];
    self.captionLabel.font = [NSFont systemFontOfSize:11];
    self.captionLabel.textColor = [NSColor colorWithWhite:0.8 alpha:1];
    self.captionLabel.maximumNumberOfLines = CDNotificationCaptionLines;
    self.captionLabel.lineBreakMode = NSLineBreakByWordWrapping;
    NSTextFieldCell *captionCell = (NSTextFieldCell *)self.captionLabel.cell;
    captionCell.wraps = YES;
    captionCell.usesSingleLineMode = NO;
    captionCell.truncatesLastVisibleLine = YES;
    self.closeButton = [NSButton buttonWithTitle:@"×" target:self action:@selector(closeClicked:)];
    self.closeButton.bezelStyle = NSBezelStyleInline;
    self.closeButton.font = [NSFont systemFontOfSize:19];
    self.closeButton.accessibilityLabel = @"Close notification";
    [self addSubview:self.messageLabel];
    [self addSubview:self.captionLabel];
    [self addSubview:self.closeButton];
    [self applySpec:spec resetTimeout:YES];
    return self;
}
- (void)closeClicked:(id)sender {
    self.closeReason = @"user";
    if (self.didClose) self.didClose(@"user");
}
- (void)applySpec:(NSDictionary *)spec resetTimeout:(BOOL)reset {
    self.spec = [spec copy];
    BOOL closable = [spec[@"closable"] boolValue];
    BOOL hasProgress = [spec[@"progress"] isKindOfClass:NSDictionary.class];
    self.messageLabel.stringValue = spec[@"message"] ?: @"";
    self.messageLabel.accessibilityLabel = self.messageLabel.stringValue;
    CGFloat textWidth = NSWidth(self.bounds) - (closable ? 60 : 32);
    CGFloat messageHeight = CDNotificationTextHeight(self.messageLabel.stringValue, self.messageLabel.font, textWidth, CDNotificationMessageLines);
    self.captionLabel.stringValue = spec[@"caption"] ?: @"";
    self.captionLabel.accessibilityLabel = self.captionLabel.stringValue;
    CGFloat captionHeight = self.captionLabel.stringValue.length
        ? CDNotificationTextHeight(self.captionLabel.stringValue, self.captionLabel.font, textWidth, CDNotificationCaptionLines) : 0;
    CGFloat contentHeight = messageHeight + (captionHeight > 0 ? 3 + captionHeight : 0);
    CGFloat contentAreaHeight = NSHeight(self.bounds) - (hasProgress ? 10 : 0);
    CGFloat contentTop = MAX(10, floor((contentAreaHeight - contentHeight) / 2));
    self.messageLabel.frame = NSMakeRect(16, contentTop, textWidth, messageHeight);
    self.captionLabel.frame = NSMakeRect(16, NSMaxY(self.messageLabel.frame) + 3, textWidth, captionHeight);
    self.captionLabel.hidden = !self.captionLabel.stringValue.length;
    BOOL compactSingleLine = captionHeight == 0 && !hasProgress && contentTop > 10;
    CGFloat closeTop = compactSingleLine ? floor((NSHeight(self.bounds) - 26) / 2) : 8;
    self.closeButton.frame = NSMakeRect(NSWidth(self.bounds) - 36, closeTop, 26, 26);
    self.closeButton.hidden = !closable;
    self.toolTip = self.messageLabel.stringValue;
    if (reset) self.deadline = self.started && [spec[@"timeoutMs"] doubleValue] > 0
        ? NSProcessInfo.processInfo.systemUptime + [spec[@"timeoutMs"] doubleValue] / 1000.0 : 0;
    self.needsDisplay = YES;
}
- (void)start {
    if (self.started) return;
    self.started = YES;
    [self applySpec:self.spec resetTimeout:YES];
    [self displayIfNeeded];
    [self.window displayIfNeeded];
    __weak CDNotificationView *weakSelf = self;
    self.timer = [NSTimer timerWithTimeInterval:0.1 repeats:YES block:^(NSTimer *timer) {
        CDNotificationView *view = weakSelf;
        if (!view) { [timer invalidate]; return; }
        if (view.deadline > 0 && NSProcessInfo.processInfo.systemUptime >= view.deadline) {
            view.closeReason = @"timeout";
            [view.timer invalidate];
            if (view.didClose) view.didClose(@"timeout");
            return;
        }
        if (view.followPosition) view.followPosition();
        view.needsDisplay = YES;
    }];
    [NSRunLoop.mainRunLoop addTimer:self.timer forMode:NSRunLoopCommonModes];
}
- (NSDictionary *)state {
    NSMutableDictionary *state = [self.spec mutableCopy];
    state[@"remainingMs"] = self.deadline > 0 ? @(MAX(0, ceil((self.deadline - NSProcessInfo.processInfo.systemUptime) * 1000))) : @0;
    if (self.positionAdjustment.length) state[@"positionAdjustment"] = self.positionAdjustment;
    if (self.closeReason.length) state[@"closeReason"] = self.closeReason;
    return state;
}
- (void)drawRect:(NSRect)dirtyRect {
    [[NSColor colorWithWhite:0.10 alpha:0.97] setFill];
    NSRectFill(self.bounds);
    NSString *level = self.spec[@"level"];
    NSColor *tone = [level isEqualToString:@"error"] ? NSColor.systemRedColor :
        [level isEqualToString:@"warning"] ? NSColor.systemOrangeColor :
        [level isEqualToString:@"success"] ? NSColor.systemGreenColor : NSColor.systemBlueColor;
    [tone setFill];
    NSRectFill(NSMakeRect(0, 0, 4, NSHeight(self.bounds)));
    NSDictionary *p = [self.spec[@"progress"] isKindOfClass:NSDictionary.class] ? self.spec[@"progress"] : nil;
    if (p) {
        double ratio = ([p[@"value"] doubleValue]-[p[@"min"] doubleValue]) / MAX(0.000001, [p[@"max"] doubleValue]-[p[@"min"] doubleValue]);
        BOOL busy = [p[@"indeterminate"] boolValue];
        CGFloat progressWidth = MAX(0, NSWidth(self.bounds) - 32);
        CGFloat busyWidth = MIN(128, progressWidth);
        CGFloat travel = MAX(1, progressWidth - busyWidth);
        CGFloat left = busy ? 16 + fmod(NSProcessInfo.processInfo.systemUptime * 140, travel) : 16;
        NSRectFill(NSMakeRect(left, NSHeight(self.bounds) - 10, busy ? busyWidth : progressWidth * MIN(1, MAX(0, ratio)), 4));
    }
    if ([self.spec[@"timeoutProgress"] boolValue] && self.deadline > 0) {
        double ratio = (self.deadline - NSProcessInfo.processInfo.systemUptime) * 1000 / MAX(1, [self.spec[@"timeoutMs"] doubleValue]);
        [[NSColor colorWithWhite:0.7 alpha:0.7] setFill];
        NSRectFill(NSMakeRect(0, NSHeight(self.bounds) - 2, NSWidth(self.bounds) * MIN(1, MAX(0, ratio)), 2));
    }
}
- (void)dispose {
    [self.timer invalidate]; self.timer = nil;
    self.followPosition = nil; self.didClose = nil;
}
- (void)dealloc { [self.timer invalidate]; }
@end
