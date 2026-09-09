#import <AppKit/AppKit.h>

static NSString *const FixtureBundleIdentifier = @"com.opendesk.ui-taptexts-fixture";

@interface OpenDeskUITapTextsFixtureDelegate : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) NSWindow *secondaryWindow;
@property(nonatomic, strong) NSStackView *root;
@property(nonatomic, strong) NSTextField *statusLabel;
@property(nonatomic, strong) NSButton *nextButton;
@property(nonatomic, strong) NSButton *confirmButton;
@property(nonatomic, copy) NSString *statePath;
@property(nonatomic, copy) NSString *stopPath;
@property(nonatomic, copy) NSString *mode;
@property(nonatomic, copy) NSString *phase;
@property(nonatomic) NSInteger delayMs;
@property(nonatomic) NSInteger nextClicks;
@property(nonatomic) NSInteger confirmClicks;
@property(nonatomic) NSInteger ambiguousClicks;
@property(nonatomic) long long launchedAtMs;
@property(nonatomic) long long nextClickedAtMs;
@property(nonatomic) long long movedAtMs;
@property(nonatomic) long long confirmShownAtMs;
@property(nonatomic) long long confirmClickedAtMs;
@end

@implementation OpenDeskUITapTextsFixtureDelegate

static long long NowMs(void) {
    return (long long)(NSDate.date.timeIntervalSince1970 * 1000.0);
}

static void SetIdentifier(id object, NSString *identifier) {
    if ([object respondsToSelector:@selector(setAccessibilityIdentifier:)]) {
        [object setAccessibilityIdentifier:identifier];
    }
}

- (NSString *)argumentValue:(NSString *)name {
    NSArray<NSString *> *arguments = NSProcessInfo.processInfo.arguments;
    NSUInteger index = [arguments indexOfObject:name];
    if (index == NSNotFound || index + 1 >= arguments.count) return nil;
    return arguments[index + 1];
}

- (NSInteger)integerArgument:(NSString *)name fallback:(NSInteger)fallback {
    NSString *raw = [self argumentValue:name];
    if (raw.length == 0) return fallback;
    NSInteger value = raw.integerValue;
    return value >= 0 ? value : fallback;
}

- (NSButton *)buttonWithTitle:(NSString *)title identifier:(NSString *)identifier action:(SEL)action {
    NSButton *button = [NSButton buttonWithTitle:title target:self action:action];
    button.bezelStyle = NSBezelStyleRounded;
    button.font = [NSFont systemFontOfSize:24 weight:NSFontWeightSemibold];
    SetIdentifier(button, identifier);
    [button.widthAnchor constraintEqualToConstant:220].active = YES;
    [button.heightAnchor constraintEqualToConstant:58].active = YES;
    return button;
}

- (NSTextField *)labelWithText:(NSString *)text size:(CGFloat)size weight:(NSFontWeight)weight {
    NSTextField *label = [NSTextField labelWithString:text];
    label.font = [NSFont systemFontOfSize:size weight:weight];
    label.alignment = NSTextAlignmentCenter;
    return label;
}

- (NSStackView *)contentStackForWindow:(NSWindow *)target {
    NSStackView *stack = [NSStackView stackViewWithViews:@[]];
    stack.orientation = NSUserInterfaceLayoutOrientationVertical;
    stack.alignment = NSLayoutAttributeCenterX;
    stack.spacing = 28;
    stack.edgeInsets = NSEdgeInsetsMake(42, 48, 42, 48);
    stack.translatesAutoresizingMaskIntoConstraints = NO;
    [target.contentView addSubview:stack];
    [NSLayoutConstraint activateConstraints:@[
        [stack.leadingAnchor constraintEqualToAnchor:target.contentView.leadingAnchor],
        [stack.trailingAnchor constraintEqualToAnchor:target.contentView.trailingAnchor],
        [stack.topAnchor constraintEqualToAnchor:target.contentView.topAnchor],
        [stack.bottomAnchor constraintEqualToAnchor:target.contentView.bottomAnchor],
    ]];
    return stack;
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    (void)notification;
    self.statePath = [self argumentValue:@"--state"];
    self.stopPath = [self argumentValue:@"--stop"];
    self.mode = [self argumentValue:@"--mode"] ?: @"flow";
    self.delayMs = [self integerArgument:@"--delay-ms" fallback:900];
    if (self.statePath.length == 0 || self.stopPath.length == 0) {
        NSLog(@"--state and --stop are required");
        [NSApp terminate:nil];
        return;
    }
    self.phase = @"ready";
    self.launchedAtMs = NowMs();
    [self buildMainWindow];
    [NSTimer scheduledTimerWithTimeInterval:0.05
                                     target:self
                                   selector:@selector(pollStop:)
                                   userInfo:nil
                                    repeats:YES];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
    dispatch_async(dispatch_get_main_queue(), ^{ [self writeState]; });
}

- (void)buildMainWindow {
    self.window = [[NSWindow alloc]
        initWithContentRect:NSMakeRect(0, 0, 680, 380)
                  styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                             NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
                    backing:NSBackingStoreBuffered
                      defer:NO];
    self.window.title = @"OpenDesk UI Sequence Fixture";
    self.window.minSize = NSMakeSize(620, 340);
    SetIdentifier(self.window, @"fixture.ui-sequence.main");
    [self.window center];
    self.root = [self contentStackForWindow:self.window];
    NSTextField *heading = [self labelWithText:@"OpenDesk 可见序列验证" size:26 weight:NSFontWeightSemibold];
    SetIdentifier(heading, @"fixture.heading");
    [self.root addArrangedSubview:heading];
    self.statusLabel = [self labelWithText:@"准备" size:18 weight:NSFontWeightRegular];
    self.statusLabel.textColor = NSColor.secondaryLabelColor;
    SetIdentifier(self.statusLabel, @"fixture.status");
    [self.root addArrangedSubview:self.statusLabel];

    if ([self.mode isEqualToString:@"ambiguous"]) {
        NSButton *first = [self buttonWithTitle:@"重复目标" identifier:@"fixture.ambiguous.first" action:@selector(ambiguousPressed:)];
        NSButton *second = [self buttonWithTitle:@"重复目标" identifier:@"fixture.ambiguous.second" action:@selector(ambiguousPressed:)];
        [self.root addArrangedSubview:first];
        [self.root addArrangedSubview:second];
    } else if (![self.mode isEqualToString:@"missing"] && ![self.mode isEqualToString:@"observation-cancel"]) {
        self.nextButton = [self buttonWithTitle:@"下一步" identifier:@"fixture.next" action:@selector(nextPressed:)];
        [self.root addArrangedSubview:self.nextButton];
    } else {
        self.statusLabel.stringValue = @"等待";
    }
}

- (void)removeArrangedView:(NSView *)view from:(NSStackView *)stack {
    if (view == nil) return;
    [stack removeArrangedSubview:view];
    [view removeFromSuperview];
}

- (void)nextPressed:(id)sender {
    (void)sender;
    self.nextClicks += 1;
    self.nextClickedAtMs = NowMs();
    self.phase = @"waiting";
    self.statusLabel.stringValue = @"等待";
    [self removeArrangedView:self.nextButton from:self.root];
    self.nextButton = nil;
    if ([self.mode isEqualToString:@"move"]) {
        NSPoint origin = self.window.frame.origin;
        [self.window setFrameOrigin:NSMakePoint(origin.x + 120, origin.y + 55)];
        self.movedAtMs = NowMs();
    }
    [self writeState];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(self.delayMs * NSEC_PER_MSEC)),
                   dispatch_get_main_queue(), ^{ [self revealConfirmation]; });
}

- (void)revealConfirmation {
    if (self.confirmShownAtMs != 0) return;
    self.confirmShownAtMs = NowMs();
    self.phase = @"confirm-visible";
    if ([self.mode isEqualToString:@"switch"]) {
        self.secondaryWindow = [[NSWindow alloc]
            initWithContentRect:NSMakeRect(0, 0, 560, 300)
                      styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable)
                        backing:NSBackingStoreBuffered
                          defer:NO];
        self.secondaryWindow.title = @"OpenDesk UI Sequence Fixture Secondary";
        SetIdentifier(self.secondaryWindow, @"fixture.ui-sequence.secondary");
        [self.secondaryWindow center];
        NSStackView *secondaryRoot = [self contentStackForWindow:self.secondaryWindow];
        [secondaryRoot addArrangedSubview:[self labelWithText:@"另一个窗口" size:24 weight:NSFontWeightSemibold]];
        self.confirmButton = [self buttonWithTitle:@"确认" identifier:@"fixture.confirm.secondary" action:@selector(confirmPressed:)];
        [secondaryRoot addArrangedSubview:self.confirmButton];
        [self.secondaryWindow makeKeyAndOrderFront:nil];
        [NSApp activateIgnoringOtherApps:YES];
    } else {
        self.statusLabel.stringValue = @"请继续";
        self.confirmButton = [self buttonWithTitle:@"确认" identifier:@"fixture.confirm" action:@selector(confirmPressed:)];
        [self.root addArrangedSubview:self.confirmButton];
        [self.window makeKeyAndOrderFront:nil];
    }
    [self writeState];
}

- (void)confirmPressed:(id)sender {
    (void)sender;
    self.confirmClicks += 1;
    self.confirmClickedAtMs = NowMs();
    self.phase = @"complete";
    if (self.secondaryWindow != nil) {
        NSStackView *stack = (NSStackView *)self.secondaryWindow.contentView.subviews.firstObject;
        [self removeArrangedView:self.confirmButton from:stack];
        [stack addArrangedSubview:[self labelWithText:@"完成" size:34 weight:NSFontWeightBold]];
    } else {
        [self removeArrangedView:self.confirmButton from:self.root];
        self.statusLabel.stringValue = @"完成";
        self.statusLabel.font = [NSFont systemFontOfSize:34 weight:NSFontWeightBold];
        self.statusLabel.textColor = NSColor.labelColor;
    }
    self.confirmButton = nil;
    [self writeState];
}

- (void)ambiguousPressed:(id)sender {
    (void)sender;
    self.ambiguousClicks += 1;
    self.phase = @"ambiguous-clicked";
    [self writeState];
}

- (void)pollStop:(NSTimer *)timer {
    (void)timer;
    if ([[NSFileManager defaultManager] fileExistsAtPath:self.stopPath]) {
        [NSApp terminate:nil];
    }
}

- (void)writeState {
    if (self.statePath.length == 0 || self.window == nil) return;
    NSRect frame = self.window.frame;
    NSDictionary *state = @{
        @"schemaVersion": @1,
        @"bundleIdentifier": FixtureBundleIdentifier,
        @"pid": @(NSProcessInfo.processInfo.processIdentifier),
        @"windowNumber": @(self.window.windowNumber),
        @"secondaryWindowNumber": @(self.secondaryWindow ? self.secondaryWindow.windowNumber : 0),
        @"mode": self.mode ?: @"",
        @"phase": self.phase ?: @"",
        @"nextClicks": @(self.nextClicks),
        @"confirmClicks": @(self.confirmClicks),
        @"ambiguousClicks": @(self.ambiguousClicks),
        @"launchedAtMs": @(self.launchedAtMs),
        @"nextClickedAtMs": @(self.nextClickedAtMs),
        @"movedAtMs": @(self.movedAtMs),
        @"confirmShownAtMs": @(self.confirmShownAtMs),
        @"confirmClickedAtMs": @(self.confirmClickedAtMs),
        @"frame": @{
            @"x": @(frame.origin.x), @"y": @(frame.origin.y),
            @"width": @(frame.size.width), @"height": @(frame.size.height),
        },
    };
    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:state options:NSJSONWritingPrettyPrinted error:&error];
    if (data == nil) {
        NSLog(@"fixture state serialization failed: %@", error);
        return;
    }
    NSString *directory = self.statePath.stringByDeletingLastPathComponent;
    [[NSFileManager defaultManager] createDirectoryAtPath:directory
                              withIntermediateDirectories:YES
                                               attributes:nil
                                                    error:&error];
    if (![data writeToFile:self.statePath options:NSDataWritingAtomic error:&error]) {
        NSLog(@"fixture state write failed: %@", error);
    }
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    (void)sender;
    return YES;
}

@end

int main(int argc, const char *argv[]) {
    (void)argc;
    (void)argv;
    @autoreleasepool {
        NSApplication *application = [NSApplication sharedApplication];
        OpenDeskUITapTextsFixtureDelegate *delegate = [OpenDeskUITapTextsFixtureDelegate new];
        application.delegate = delegate;
        [application setActivationPolicy:NSApplicationActivationPolicyRegular];
        [application run];
    }
    return 0;
}
