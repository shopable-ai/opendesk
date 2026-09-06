#import <AppKit/AppKit.h>

static NSString *const FixtureBundleIdentifier = @"com.opendesk.accessibility-fixture";

@interface OpenDeskAccessibilityFixtureDelegate : NSObject <NSApplicationDelegate, NSTextFieldDelegate, NSMenuDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) NSTextField *statusLabel;
@property(nonatomic, strong) NSTextField *editableField;
@property(nonatomic, strong) NSButton *checkBox;
@property(nonatomic, strong) NSButton *radioOne;
@property(nonatomic, strong) NSButton *radioTwo;
@property(nonatomic, strong) NSView *dynamicContainer;
@property(nonatomic, strong) NSMenu *delayedMenu;
@property(nonatomic, strong) NSMenuItem *menuCheckItem;
@property(nonatomic, strong) NSMenuItem *menuRadioOneItem;
@property(nonatomic, strong) NSMenuItem *menuRadioTwoItem;
@property(nonatomic, copy) NSString *statePath;
@property(nonatomic, copy) NSString *lastAction;
@property(nonatomic, copy) NSString *lastRecordedEditableValue;
@property(nonatomic) NSInteger invokeCount;
@property(nonatomic) NSInteger setValueCount;
@property(nonatomic) NSInteger checkboxActionCount;
@property(nonatomic) NSInteger radioActionCount;
@property(nonatomic) NSInteger menuInvokeCount;
@property(nonatomic) NSInteger menuCheckCount;
@property(nonatomic) NSInteger menuRadioCount;
@property(nonatomic) NSInteger dynamicRevealCount;
@property(nonatomic) BOOL delayedItemMaterialized;
@end

@implementation OpenDeskAccessibilityFixtureDelegate

static void SetIdentifier(id object, NSString *identifier) {
    if ([object respondsToSelector:@selector(setAccessibilityIdentifier:)]) {
        [object setAccessibilityIdentifier:identifier];
    }
}

static NSButton *PushButton(NSString *title, NSString *identifier, id target, SEL action) {
    NSButton *button = [NSButton buttonWithTitle:title target:target action:action];
    button.bezelStyle = NSBezelStyleRounded;
    SetIdentifier(button, identifier);
    return button;
}

- (NSString *)argumentValue:(NSString *)name {
    NSArray<NSString *> *arguments = NSProcessInfo.processInfo.arguments;
    NSUInteger index = [arguments indexOfObject:name];
    if (index == NSNotFound || index + 1 >= arguments.count) {
        return nil;
    }
    return arguments[index + 1];
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    (void)notification;
    self.statePath = [self argumentValue:@"--state"];
    if (self.statePath.length == 0) {
        self.statePath = @".runtime/tests/accessibility/macos-fixture-state.json";
    }
    self.lastAction = @"launched";

    [self buildMenuBar];
    [self buildWindow];
    self.lastRecordedEditableValue = self.editableField.stringValue;
    [NSTimer scheduledTimerWithTimeInterval:0.1
                                     target:self
                                   selector:@selector(pollEditableValue:)
                                   userInfo:nil
                                    repeats:YES];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
    // Publish readiness only after AppKit has had a chance to order and
    // activate the window.  The launch helper treats this state as the
    // starting point for its exact WindowInfo verification.
    dispatch_async(dispatch_get_main_queue(), ^{
        [self writeState];
    });
}

- (void)buildWindow {
    NSRect frame = NSMakeRect(0, 0, 720, 340);
    self.window = [[NSWindow alloc]
        initWithContentRect:frame
                  styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                             NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
                    backing:NSBackingStoreBuffered
                      defer:NO];
    self.window.title = @"OpenDesk Accessibility Fixture";
    self.window.minSize = NSMakeSize(680, 320);
    SetIdentifier(self.window, @"fixture.window.main");
    [self.window center];

    NSStackView *root = [NSStackView stackViewWithViews:@[]];
    root.orientation = NSUserInterfaceLayoutOrientationVertical;
    root.alignment = NSLayoutAttributeLeading;
    root.spacing = 14;
    root.edgeInsets = NSEdgeInsetsMake(22, 24, 22, 24);
    root.translatesAutoresizingMaskIntoConstraints = NO;
    [self.window.contentView addSubview:root];
    [NSLayoutConstraint activateConstraints:@[
        [root.leadingAnchor constraintEqualToAnchor:self.window.contentView.leadingAnchor],
        [root.trailingAnchor constraintEqualToAnchor:self.window.contentView.trailingAnchor],
        [root.topAnchor constraintEqualToAnchor:self.window.contentView.topAnchor],
        [root.bottomAnchor constraintLessThanOrEqualToAnchor:self.window.contentView.bottomAnchor],
    ]];

    NSTextField *heading = [NSTextField labelWithString:@"OpenDesk Native Accessibility Fixture"];
    heading.font = [NSFont systemFontOfSize:22 weight:NSFontWeightSemibold];
    SetIdentifier(heading, @"fixture.heading");
    [root addArrangedSubview:heading];

    self.statusLabel = [NSTextField labelWithString:@"Ready"];
    self.statusLabel.font = [NSFont monospacedSystemFontOfSize:12 weight:NSFontWeightRegular];
    self.statusLabel.textColor = NSColor.secondaryLabelColor;
    SetIdentifier(self.statusLabel, @"fixture.status");
    [root addArrangedSubview:self.statusLabel];

    NSStackView *buttons = [NSStackView stackViewWithViews:@[]];
    buttons.orientation = NSUserInterfaceLayoutOrientationHorizontal;
    buttons.spacing = 10;
    NSButton *invoke = PushButton(@"Invoke Once", @"fixture.invoke", self, @selector(invokeButton:));
    NSButton *duplicateOne = PushButton(@"Duplicate", @"fixture.duplicate.first", self, @selector(duplicateButton:));
    NSButton *duplicateTwo = PushButton(@"Duplicate", @"fixture.duplicate.second", self, @selector(duplicateButton:));
    NSButton *disabled = PushButton(@"Disabled", @"fixture.disabled", self, @selector(disabledButton:));
    disabled.enabled = NO;
    [buttons addArrangedSubview:invoke];
    [buttons addArrangedSubview:duplicateOne];
    [buttons addArrangedSubview:duplicateTwo];
    [buttons addArrangedSubview:disabled];
    [root addArrangedSubview:buttons];

    NSStackView *fields = [NSStackView stackViewWithViews:@[]];
    fields.orientation = NSUserInterfaceLayoutOrientationVertical;
    fields.alignment = NSLayoutAttributeLeading;
    fields.spacing = 8;
    [fields addArrangedSubview:[self fieldRow:@"Editable value" field:[self editableTextField]]];
    [fields addArrangedSubview:[self fieldRow:@"Read-only value" field:[self readOnlyTextField]]];
    [fields addArrangedSubview:[self fieldRow:@"Protected value" field:[self protectedTextField]]];
    [root addArrangedSubview:fields];

    NSStackView *toggles = [NSStackView stackViewWithViews:@[]];
    toggles.orientation = NSUserInterfaceLayoutOrientationHorizontal;
    toggles.spacing = 16;
    self.checkBox = [NSButton checkboxWithTitle:@"Fixture Checked" target:self action:@selector(checkBoxChanged:)];
    SetIdentifier(self.checkBox, @"fixture.checkbox");
    self.radioOne = [NSButton radioButtonWithTitle:@"Choice One" target:self action:@selector(radioChanged:)];
    SetIdentifier(self.radioOne, @"fixture.radio.one");
    self.radioTwo = [NSButton radioButtonWithTitle:@"Choice Two" target:self action:@selector(radioChanged:)];
    SetIdentifier(self.radioTwo, @"fixture.radio.two");
    self.radioOne.state = NSControlStateValueOn;
    self.radioTwo.state = NSControlStateValueOff;
    [toggles addArrangedSubview:self.checkBox];
    [toggles addArrangedSubview:self.radioOne];
    [toggles addArrangedSubview:self.radioTwo];
    [root addArrangedSubview:toggles];

    NSStackView *dynamicRow = [NSStackView stackViewWithViews:@[]];
    dynamicRow.orientation = NSUserInterfaceLayoutOrientationHorizontal;
    dynamicRow.alignment = NSLayoutAttributeCenterY;
    dynamicRow.spacing = 12;
    [dynamicRow addArrangedSubview:PushButton(@"Reveal Dynamic Control", @"fixture.dynamic.reveal", self, @selector(revealDynamicControl:))];
    self.dynamicContainer = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 280, 34)];
    SetIdentifier(self.dynamicContainer, @"fixture.dynamic.container");
    [self.dynamicContainer.widthAnchor constraintEqualToConstant:280].active = YES;
    [self.dynamicContainer.heightAnchor constraintEqualToConstant:34].active = YES;
    [dynamicRow addArrangedSubview:self.dynamicContainer];
    [root addArrangedSubview:dynamicRow];
}

- (NSStackView *)fieldRow:(NSString *)title field:(NSTextField *)field {
    NSTextField *label = [NSTextField labelWithString:title];
    [label.widthAnchor constraintEqualToConstant:120].active = YES;
    [field.widthAnchor constraintEqualToConstant:360].active = YES;
    NSStackView *row = [NSStackView stackViewWithViews:@[label, field]];
    row.orientation = NSUserInterfaceLayoutOrientationHorizontal;
    row.alignment = NSLayoutAttributeCenterY;
    row.spacing = 12;
    return row;
}

- (NSTextField *)editableTextField {
    self.editableField = [NSTextField textFieldWithString:@"initial value"];
    self.editableField.delegate = self;
    SetIdentifier(self.editableField, @"fixture.text.editable");
    return self.editableField;
}

- (NSTextField *)readOnlyTextField {
    NSTextField *field = [NSTextField textFieldWithString:@"read only"];
    field.editable = NO;
    field.selectable = YES;
    field.bezeled = YES;
    SetIdentifier(field, @"fixture.text.readonly");
    return field;
}

- (NSSecureTextField *)protectedTextField {
    NSSecureTextField *field = [NSSecureTextField textFieldWithString:@"fixture secret"];
    SetIdentifier(field, @"fixture.text.protected");
    return field;
}

- (NSMenuItem *)menuItem:(NSString *)title identifier:(NSString *)identifier action:(SEL)action {
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title action:action keyEquivalent:@""];
    item.target = self;
    SetIdentifier(item, identifier);
    return item;
}

- (void)buildMenuBar {
    NSMenu *mainMenu = [[NSMenu alloc] initWithTitle:@"Main"];

    NSMenuItem *applicationRoot = [[NSMenuItem alloc] initWithTitle:@"Fixture" action:nil keyEquivalent:@""];
    SetIdentifier(applicationRoot, @"fixture.menu.application-root");
    NSMenu *applicationMenu = [[NSMenu alloc] initWithTitle:@"Fixture"];
    NSMenuItem *quitItem = [self menuItem:@"Quit Fixture" identifier:@"fixture.menu.quit" action:@selector(quitFixture:)];
    quitItem.keyEquivalent = @"q";
    [applicationMenu addItem:quitItem];
    applicationRoot.submenu = applicationMenu;
    [mainMenu addItem:applicationRoot];

    NSMenuItem *fixtureRoot = [[NSMenuItem alloc] initWithTitle:@"Fixture Commands" action:nil keyEquivalent:@""];
    SetIdentifier(fixtureRoot, @"fixture.menu.root");
    NSMenu *fixtureMenu = [[NSMenu alloc] initWithTitle:@"Fixture Commands"];
    [fixtureMenu addItem:[self menuItem:@"Invoke Command" identifier:@"fixture.menu.invoke" action:@selector(menuInvoke:)]];

    self.menuCheckItem = [self menuItem:@"Checked Command" identifier:@"fixture.menu.checked" action:@selector(menuChecked:)];
    self.menuCheckItem.state = NSControlStateValueOff;
    [fixtureMenu addItem:self.menuCheckItem];

    self.menuRadioOneItem = [self menuItem:@"Menu Choice One" identifier:@"fixture.menu.radio.one" action:@selector(menuRadio:)];
    self.menuRadioOneItem.tag = 1;
    self.menuRadioOneItem.state = NSControlStateValueOn;
    [fixtureMenu addItem:self.menuRadioOneItem];
    self.menuRadioTwoItem = [self menuItem:@"Menu Choice Two" identifier:@"fixture.menu.radio.two" action:@selector(menuRadio:)];
    self.menuRadioTwoItem.tag = 2;
    [fixtureMenu addItem:self.menuRadioTwoItem];

    NSMenuItem *nestedItem = [[NSMenuItem alloc] initWithTitle:@"Nested" action:nil keyEquivalent:@""];
    SetIdentifier(nestedItem, @"fixture.menu.nested");
    NSMenu *nestedMenu = [[NSMenu alloc] initWithTitle:@"Nested"];
    [nestedMenu addItem:[self menuItem:@"Deep Command" identifier:@"fixture.menu.deep" action:@selector(menuInvoke:)]];
    [nestedMenu addItem:[self menuItem:@"Duplicate Command" identifier:@"fixture.menu.duplicate.first" action:@selector(menuInvoke:)]];
    [nestedMenu addItem:[self menuItem:@"Duplicate Command" identifier:@"fixture.menu.duplicate.second" action:@selector(menuInvoke:)]];

    NSMenuItem *delayedItem = [[NSMenuItem alloc] initWithTitle:@"Delayed Submenu" action:nil keyEquivalent:@""];
    SetIdentifier(delayedItem, @"fixture.menu.delayed");
    self.delayedMenu = [[NSMenu alloc] initWithTitle:@"Delayed Submenu"];
    self.delayedMenu.delegate = self;
    delayedItem.submenu = self.delayedMenu;
    [nestedMenu addItem:delayedItem];
    nestedItem.submenu = nestedMenu;
    [fixtureMenu addItem:nestedItem];

    fixtureRoot.submenu = fixtureMenu;
    [mainMenu addItem:fixtureRoot];
    NSApp.mainMenu = mainMenu;
}

- (void)menuWillOpen:(NSMenu *)menu {
    if (menu != self.delayedMenu || self.delayedItemMaterialized) {
        return;
    }
    self.delayedItemMaterialized = YES;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(200 * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{
        [self.delayedMenu addItem:[self menuItem:@"Delayed Command"
                                      identifier:@"fixture.menu.delayed.command"
                                          action:@selector(menuInvoke:)]];
        self.lastAction = @"delayed-menu-materialized";
        [self writeState];
    });
}

- (void)updateStatus:(NSString *)action {
    self.lastAction = action;
    self.statusLabel.stringValue = [NSString stringWithFormat:
        @"%@ | invoke=%ld checkbox=%ld menu=%ld",
        action, (long)self.invokeCount, (long)self.checkboxActionCount, (long)self.menuInvokeCount];
    [self writeState];
}

- (void)invokeButton:(id)sender {
    (void)sender;
    self.invokeCount += 1;
    [self updateStatus:@"invoke-button"];
}

- (void)duplicateButton:(NSButton *)sender {
    [self updateStatus:sender.accessibilityIdentifier ?: @"duplicate-button"];
}

- (void)disabledButton:(id)sender {
    (void)sender;
    [self updateStatus:@"disabled-button-unexpected"];
}

- (void)checkBoxChanged:(id)sender {
    (void)sender;
    self.checkboxActionCount += 1;
    [self updateStatus:@"checkbox"];
}

- (void)radioChanged:(NSButton *)sender {
    self.radioOne.state = (sender == self.radioOne) ? NSControlStateValueOn : NSControlStateValueOff;
    self.radioTwo.state = (sender == self.radioTwo) ? NSControlStateValueOn : NSControlStateValueOff;
    self.radioActionCount += 1;
    [self updateStatus:(sender == self.radioOne) ? @"radio-one" : @"radio-two"];
}

- (void)controlTextDidChange:(NSNotification *)notification {
    if (notification.object == self.editableField) {
        [self recordEditableChangeIfNeeded];
    }
}

- (void)pollEditableValue:(NSTimer *)timer {
    (void)timer;
    [self recordEditableChangeIfNeeded];
}

- (void)recordEditableChangeIfNeeded {
    NSString *current = self.editableField.stringValue ?: @"";
    if ([current isEqualToString:self.lastRecordedEditableValue ?: @""]) {
        return;
    }
    self.lastRecordedEditableValue = current;
    self.setValueCount += 1;
    [self updateStatus:@"text-changed"];
}

- (void)revealDynamicControl:(id)sender {
    (void)sender;
    self.dynamicRevealCount += 1;
    [self updateStatus:@"dynamic-requested"];
    if ([self.dynamicContainer viewWithTag:8842] != nil) {
        return;
    }
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(200 * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{
        NSButton *child = PushButton(@"Dynamic Child", @"fixture.dynamic.child", self, @selector(invokeButton:));
        child.tag = 8842;
        child.frame = NSMakeRect(0, 2, 140, 30);
        [self.dynamicContainer addSubview:child];
        self.lastAction = @"dynamic-materialized";
        [self writeState];
    });
}

- (void)menuInvoke:(id)sender {
    (void)sender;
    self.menuInvokeCount += 1;
    [self updateStatus:@"menu-invoke"];
}

- (void)menuChecked:(NSMenuItem *)sender {
    sender.state = sender.state == NSControlStateValueOn ? NSControlStateValueOff : NSControlStateValueOn;
    self.menuCheckCount += 1;
    [self updateStatus:@"menu-checked"];
}

- (void)menuRadio:(NSMenuItem *)sender {
    NSMenu *menu = sender.menu;
    for (NSMenuItem *item in menu.itemArray) {
        if (item.tag == 1 || item.tag == 2) {
            item.state = item == sender ? NSControlStateValueOn : NSControlStateValueOff;
        }
    }
    self.menuRadioCount += 1;
    [self updateStatus:sender.tag == 1 ? @"menu-radio-one" : @"menu-radio-two"];
}

- (void)quitFixture:(id)sender {
    (void)sender;
    [NSApp terminate:nil];
}

- (void)writeState {
    if (self.statePath.length == 0) {
        return;
    }
    NSDictionary *state = @{
        @"schemaVersion": @1,
        @"bundleIdentifier": FixtureBundleIdentifier,
        @"pid": @(NSProcessInfo.processInfo.processIdentifier),
        @"windowNumber": @(self.window.windowNumber),
        @"lastAction": self.lastAction ?: @"",
        @"invokeCount": @(self.invokeCount),
        @"checkboxActionCount": @(self.checkboxActionCount),
        @"checkboxChecked": @((BOOL)(self.checkBox.state == NSControlStateValueOn)),
        @"radioActionCount": @(self.radioActionCount),
        @"selectedRadio": self.radioTwo.state == NSControlStateValueOn ? @"two" : @"one",
        @"editableValue": self.editableField.stringValue ?: @"",
        @"setValueCount": @(self.setValueCount),
        @"menuInvokeCount": @(self.menuInvokeCount),
        @"menuCheckCount": @(self.menuCheckCount),
        @"menuChecked": @((BOOL)(self.menuCheckItem.state == NSControlStateValueOn)),
        @"menuRadioCount": @(self.menuRadioCount),
        @"selectedMenuRadio": self.menuRadioTwoItem.state == NSControlStateValueOn ? @"two" : @"one",
        @"dynamicRevealCount": @(self.dynamicRevealCount),
        @"delayedItemMaterialized": @(self.delayedItemMaterialized),
    };
    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:state options:NSJSONWritingPrettyPrinted error:&error];
    if (data == nil) {
        NSLog(@"fixture state serialization failed: %@", error);
        return;
    }
    NSString *directory = self.statePath.stringByDeletingLastPathComponent;
    if (directory.length > 0) {
        [[NSFileManager defaultManager] createDirectoryAtPath:directory
                                  withIntermediateDirectories:YES
                                                   attributes:nil
                                                        error:&error];
    }
    if (![data writeToFile:self.statePath options:NSDataWritingAtomic error:&error]) {
        NSLog(@"fixture state write failed: %@", error);
    }
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    (void)sender;
    return YES;
}

- (void)applicationWillTerminate:(NSNotification *)notification {
    (void)notification;
    self.lastAction = @"terminated";
    [self writeState];
}

@end

int main(int argc, const char *argv[]) {
    (void)argc;
    (void)argv;
    @autoreleasepool {
        NSApplication *application = [NSApplication sharedApplication];
        OpenDeskAccessibilityFixtureDelegate *delegate = [OpenDeskAccessibilityFixtureDelegate new];
        application.delegate = delegate;
        [application setActivationPolicy:NSApplicationActivationPolicyRegular];
        [application run];
    }
    return 0;
}
