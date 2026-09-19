#import <Cocoa/Cocoa.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "native_darwin.h"

@interface ODAppShellApplicationDelegate : NSObject <NSApplicationDelegate>
@end

@implementation ODAppShellApplicationDelegate

- (void)application:(NSApplication *)application openFiles:(NSArray<NSString *> *)filenames {
    (void)application;
    for (NSString *filename in filenames) {
        if (![filename isKindOfClass:NSString.class] || !filename.length) continue;
        char *rawPath = strdup(filename.fileSystemRepresentation ?: "");
        if (!rawPath) continue;
        opendeskAppShellDarwinOpenDocument(rawPath);
        free(rawPath);
    }
    [NSApp replyToOpenOrPrint:NSApplicationDelegateReplySuccess];
}

- (BOOL)application:(NSApplication *)application openFile:(NSString *)filename {
    [self application:application openFiles:filename.length ? @[filename] : @[]];
    return YES;
}

- (void)application:(NSApplication *)application openURLs:(NSArray<NSURL *> *)urls {
    (void)application;
    for (NSURL *url in urls) {
        if (![url isKindOfClass:NSURL.class] || !url.absoluteString.length) continue;
        char *rawURL = strdup(url.absoluteString.UTF8String ?: "");
        if (!rawURL) continue;
        opendeskAppShellDarwinOpenURL(rawURL);
        free(rawURL);
    }
}

@end

@interface ODFlowTrustDetailsController : NSObject
@property(nonatomic, copy) NSString *flowID;
@property(nonatomic, copy) NSString *publisher;
@property(nonatomic, copy) NSString *keyID;
@property(nonatomic, copy) NSString *fingerprint;
- (void)showSecurityDetails:(id)sender;
@end

@implementation ODFlowTrustDetailsController

- (void)showSecurityDetails:(id)sender {
    (void)sender;
    NSAlert *details = [NSAlert new];
    details.alertStyle = NSAlertStyleInformational;
    details.messageText = @"Security Details";
    details.informativeText = [NSString stringWithFormat:@"Package signature: Valid\nFlow ID: %@\nPublisher: %@\nSigning key: %@\nFingerprint:\n%@", self.flowID ?: @"unknown", self.publisher ?: @"unknown", self.keyID ?: @"unknown", self.fingerprint ?: @"unknown"];
    [details addButtonWithTitle:@"Done"];
    [details runModal];
}

@end

@interface ODAppShellStatusController : NSObject
@property(nonatomic, strong) NSStatusItem *statusItem;
@property(nonatomic, strong) NSMenu *menu;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSMenuItem *> *items;
@property(nonatomic, copy) NSString *primaryAction;
@property(nonatomic, strong) ODAppShellApplicationDelegate *appDelegate;
- (void)statusPressed:(id)sender;
- (void)menuPressed:(id)sender;
@end

static ODAppShellStatusController *ODAppShellController;

static void ODSetError(char **target, NSString *message) {
    if (!target) return;
    const char *value = (message ?: @"unknown AppKit error").UTF8String;
    *target = strdup(value ?: "unknown AppKit error");
}

static BOOL ODOnMainThread(void (^block)(void)) {
    if (!block) return NO;
    if (NSThread.isMainThread) block();
    else dispatch_sync(dispatch_get_main_queue(), block);
    return YES;
}

@implementation ODAppShellStatusController

- (void)emitItemID:(NSString *)itemID source:(NSString *)source {
    if (!itemID.length) return;
    char *rawItem = strdup(itemID.UTF8String ?: "");
    char *rawSource = strdup(source.UTF8String ?: "tray-menu");
    opendeskAppShellDarwinAction(rawItem, rawSource);
    free(rawItem);
    free(rawSource);
}

- (void)statusPressed:(id)sender {
    // A normal click opens the same merged menu as the context gesture. The
    // first menu item remains the explicit Open / Show action, so users do not
    // need to remember a platform-specific primary-click behavior.
    [self.statusItem popUpStatusItemMenu:self.menu];
}

- (void)menuPressed:(NSMenuItem *)sender {
    NSString *itemID = [sender.representedObject isKindOfClass:NSString.class] ? sender.representedObject : @"";
    fprintf(stderr, "[APP_SHELL] action-id=%s stage=native-received\n", itemID.UTF8String ?: "");
    fflush(stderr);
    [self emitItemID:itemID source:@"tray-menu"];
}

@end

static NSMenuItem *ODAddActionItem(ODAppShellStatusController *controller, NSMenu *menu, NSString *itemID, NSString *label, BOOL enabled, BOOL hidden) {
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:(label ?: @"") action:@selector(menuPressed:) keyEquivalent:@""];
    item.target = controller;
    item.representedObject = itemID;
    item.enabled = enabled;
    item.hidden = hidden;
    [menu addItem:item];
    if (itemID.length) controller.items[itemID] = item;
    return item;
}

static BOOL ODAddMenuEntries(ODAppShellStatusController *controller, NSMenu *menu, NSArray *entries, char **errorMessage) {
    for (id rawEntry in entries) {
        if (![rawEntry isKindOfClass:NSDictionary.class]) {
            ODSetError(errorMessage, @"tray menu entry is invalid");
            return NO;
        }
        NSDictionary *entry = (NSDictionary *)rawEntry;
        if ([entry[@"type"] isEqualToString:@"separator"]) {
            [menu addItem:NSMenuItem.separatorItem];
            continue;
        }
        NSString *label = [entry[@"label"] isKindOfClass:NSString.class] ? entry[@"label"] : @"";
        NSString *itemID = [entry[@"id"] isKindOfClass:NSString.class] ? entry[@"id"] : @"";
        BOOL enabled = entry[@"enabled"] ? [entry[@"enabled"] boolValue] : YES;
        BOOL hidden = entry[@"visible"] ? ![entry[@"visible"] boolValue] : NO;
        NSArray *children = [entry[@"children"] isKindOfClass:NSArray.class] ? entry[@"children"] : nil;
        if (children != nil) {
            NSMenuItem *parent = [[NSMenuItem alloc] initWithTitle:label action:nil keyEquivalent:@""];
            NSMenu *submenu = [NSMenu new];
            submenu.autoenablesItems = NO;
            parent.enabled = enabled;
            parent.hidden = hidden;
            parent.submenu = submenu;
            [menu addItem:parent];
            if (itemID.length) controller.items[itemID] = parent;
            if (!ODAddMenuEntries(controller, submenu, children, errorMessage)) return NO;
            continue;
        }
        ODAddActionItem(controller, menu, itemID, label, enabled, hidden);
    }
    return YES;
}

static void ODClearMenuTargets(NSMenu *menu) {
    for (NSMenuItem *item in menu.itemArray) {
        item.target = nil;
        if (item.submenu != nil) ODClearMenuTargets(item.submenu);
    }
}

int ODAppShellStart(const char *iconPath, int iconTemplate, const char *tooltip, const char *primaryAction, const char *menuJSON, char **errorMessage) {
    __block BOOL success = NO;
    ODOnMainThread(^{
        @autoreleasepool {
            if (ODAppShellController) {
                ODSetError(errorMessage, @"an App Shell status item is already active");
                return;
            }
            // NSStatusBar touches WindowServer state and requires NSApplication to
            // have established the process connection first. This must happen on
            // the primordial main thread before creating the status item.
            [NSApplication sharedApplication];
            [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
            NSString *path = iconPath ? [NSString stringWithUTF8String:iconPath] : @"";
            NSImage *image = [[NSImage alloc] initWithContentsOfFile:path];
            if (!image) {
                ODSetError(errorMessage, [NSString stringWithFormat:@"cannot load menu bar icon at %@", path]);
                return;
            }
            image.template = iconTemplate != 0;
            // Package icons may contain Retina-sized pixels. NSStatusItem uses
            // the image's point size for accessibility geometry, so normalize
            // it instead of allowing (for example) a 1024 px source to create
            // a 1024-point menu extra extending off-screen.
            image.size = NSMakeSize(18.0, 18.0);
            ODAppShellStatusController *controller = [ODAppShellStatusController new];
            controller.appDelegate = [ODAppShellApplicationDelegate new];
            [NSApp setDelegate:controller.appDelegate];
            controller.items = [NSMutableDictionary dictionary];
            controller.primaryAction = primaryAction ? [NSString stringWithUTF8String:primaryAction] : @"";
            controller.statusItem = [NSStatusBar.systemStatusBar statusItemWithLength:NSSquareStatusItemLength];
            controller.statusItem.button.image = image;
            controller.statusItem.button.imageScaling = NSImageScaleProportionallyDown;
            controller.statusItem.button.toolTip = tooltip ? [NSString stringWithUTF8String:tooltip] : @"";
            controller.statusItem.button.target = controller;
            controller.statusItem.button.action = @selector(statusPressed:);
            // Left-click is the primary menu gesture. Right-click remains a
            // compatible context gesture and Control-click is handled by
            // AppKit as the equivalent macOS context action.
            [controller.statusItem.button sendActionOn:(NSEventMaskLeftMouseDown | NSEventMaskRightMouseUp)];
            controller.menu = [NSMenu new];
            controller.menu.autoenablesItems = NO;

            NSData *data = menuJSON ? [[NSString stringWithUTF8String:menuJSON] dataUsingEncoding:NSUTF8StringEncoding] : nil;
            NSError *jsonError = nil;
            id decoded = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:&jsonError] : @[];
            if (![decoded isKindOfClass:NSArray.class]) {
                [NSStatusBar.systemStatusBar removeStatusItem:controller.statusItem];
                ODSetError(errorMessage, jsonError.localizedDescription ?: @"tray menu JSON is invalid");
                return;
            }
            if (!ODAddMenuEntries(controller, controller.menu, (NSArray *)decoded, errorMessage)) {
                [NSStatusBar.systemStatusBar removeStatusItem:controller.statusItem];
                return;
            }
            ODAppShellController = controller;
            success = YES;
        }
    });
    return success ? 1 : 0;
}

int ODAppShellUpdateMenuItem(const char *itemID, const char *label, int hasLabel, int enabled, int hasEnabled, int visible, int hasVisible, char **errorMessage) {
    __block BOOL success = NO;
    ODOnMainThread(^{
        NSString *identifier = itemID ? [NSString stringWithUTF8String:itemID] : @"";
        NSMenuItem *item = ODAppShellController.items[identifier];
        if (!item) {
            ODSetError(errorMessage, [NSString stringWithFormat:@"menu item %@ is not active", identifier]);
            return;
        }
        if (hasLabel) item.title = label ? [NSString stringWithUTF8String:label] : @"";
        if (hasEnabled) item.enabled = enabled != 0;
        if (hasVisible) item.hidden = visible == 0;
        success = YES;
    });
    return success ? 1 : 0;
}

void ODAppShellActivate(void) {
    void (^activate)(void) = ^{ [NSApp activateIgnoringOtherApps:YES]; };
    if (NSThread.isMainThread) activate();
    else dispatch_async(dispatch_get_main_queue(), activate);
}

int ODAppShellPickFlowFiles(char **pathsJSON, char **errorMessage) {
    __block BOOL success = NO;
    ODOnMainThread(^{
        @autoreleasepool {
            NSOpenPanel *panel = [NSOpenPanel openPanel];
            panel.canChooseFiles = YES;
            panel.canChooseDirectories = NO;
            panel.allowsMultipleSelection = YES;
            panel.allowedFileTypes = @[@"odflow", @"js", @"mjs"];
            NSInteger response = [panel runModal];
            if (response != NSModalResponseOK) {
                if (pathsJSON) *pathsJSON = strdup("[]");
                success = pathsJSON != NULL;
                return;
            }
            NSMutableArray *paths = [NSMutableArray arrayWithCapacity:panel.URLs.count];
            for (NSURL *url in panel.URLs) {
                if (url.isFileURL && url.path.length) [paths addObject:url.path];
            }
            NSError *jsonError = nil;
            NSData *data = [NSJSONSerialization dataWithJSONObject:paths options:0 error:&jsonError];
            if (!data) {
                ODSetError(errorMessage, jsonError.localizedDescription ?: @"cannot encode selected Flow paths");
                return;
            }
            NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
            if (pathsJSON) *pathsJSON = strdup(json.UTF8String ?: "[]");
            success = pathsJSON != NULL && *pathsJSON != NULL;
        }
    });
    return success ? 1 : 0;
}

int ODAppShellConfirmFlowTrust(const char *flowID, const char *name, const char *publisherID, const char *keyID, const char *fingerprint, int *decision, char **errorMessage) {
    __block BOOL success = NO;
    ODOnMainThread(^{
        @autoreleasepool {
            NSString *flowName = name ? [NSString stringWithUTF8String:name] : @"Flow";
            NSString *publisher = publisherID ? [NSString stringWithUTF8String:publisherID] : @"unknown";
            NSString *key = keyID ? [NSString stringWithUTF8String:keyID] : @"unknown";
            NSString *finger = fingerprint ? [NSString stringWithUTF8String:fingerprint] : @"unknown";
            NSString *identifier = flowID ? [NSString stringWithUTF8String:flowID] : @"unknown";

            NSAlert *alert = [NSAlert new];
            alert.alertStyle = NSAlertStyleWarning;
            alert.messageText = [NSString stringWithFormat:@"Install “%@”?", flowName];
            alert.informativeText = [NSString stringWithFormat:@"Publisher: %@\n\n✓ Package signature is valid.\nPublisher identity is not verified by OpenDesk.\n\nBy default, trust is limited to this Flow. Installing does not run the Flow.", publisher];

            NSButton *trustPublisher = [NSButton checkboxWithTitle:@"Trust this publisher for future Flows" target:nil action:nil];
            trustPublisher.state = NSControlStateValueOff;
            trustPublisher.toolTip = @"Optional. Expands trust to other Flows signed by this exact publisher key.";

            NSTextField *scopeHelp = [NSTextField labelWithString:@"Optional. Other Flows signed by this exact publisher key can use publisher-level trust without another publisher trust prompt. Flow permissions and licensing remain separate."];
            scopeHelp.font = [NSFont systemFontOfSize:NSFont.smallSystemFontSize];
            scopeHelp.textColor = NSColor.secondaryLabelColor;
            scopeHelp.maximumNumberOfLines = 0;
            scopeHelp.lineBreakMode = NSLineBreakByWordWrapping;
            scopeHelp.preferredMaxLayoutWidth = 380.0;

            ODFlowTrustDetailsController *detailsController = [ODFlowTrustDetailsController new];
            detailsController.flowID = identifier;
            detailsController.publisher = publisher;
            detailsController.keyID = key;
            detailsController.fingerprint = finger;
            NSButton *detailsButton = [NSButton buttonWithTitle:@"Security Details…" target:detailsController action:@selector(showSecurityDetails:)];
            detailsButton.bezelStyle = NSBezelStyleInline;
            detailsButton.controlSize = NSControlSizeSmall;
            detailsButton.toolTip = @"Show the Flow ID, signing key, and publisher key fingerprint.";

            NSStackView *accessory = [NSStackView stackViewWithViews:@[trustPublisher, scopeHelp, detailsButton]];
            accessory.orientation = NSUserInterfaceLayoutOrientationVertical;
            accessory.alignment = NSLayoutAttributeLeading;
            accessory.spacing = 6.0;
            [accessory.widthAnchor constraintGreaterThanOrEqualToConstant:380.0].active = YES;
            alert.accessoryView = accessory;

            [alert addButtonWithTitle:@"Install"];
            [alert addButtonWithTitle:@"Cancel"];
            alert.buttons.firstObject.keyEquivalent = @"\r";
            alert.buttons.lastObject.keyEquivalent = @"\e";

            NSModalResponse response = [alert runModal];
            if (decision) {
                if (response == NSAlertFirstButtonReturn) {
                    *decision = trustPublisher.state == NSControlStateValueOn ? 2 : 1;
                } else {
                    *decision = 0;
                }
            }
            success = YES;
        }
    });
    if (!success && errorMessage && !*errorMessage) ODSetError(errorMessage, @"Flow trust prompt failed");
    return success ? 1 : 0;
}

int ODAppShellConfirmMarketplaceInstall(const char *flowID, const char *releaseID, const char *name, const char *version, const char *publisherID, const char *keyID, const char *fingerprint, int verifiedPublisher, int signatureVerified, int trustRequired, int *decision, char **errorMessage) {
    __block BOOL success = NO;
    ODOnMainThread(^{
        @autoreleasepool {
            if (!signatureVerified) {
                ODSetError(errorMessage, @"Marketplace install confirmation requires a verified package signature");
                return;
            }
            NSString *flowName = name ? [NSString stringWithUTF8String:name] : @"Flow";
            NSString *flow = flowID ? [NSString stringWithUTF8String:flowID] : @"unknown";
            NSString *release = releaseID ? [NSString stringWithUTF8String:releaseID] : @"unknown";
            NSString *releaseVersion = version ? [NSString stringWithUTF8String:version] : @"unknown";
            NSString *publisher = publisherID ? [NSString stringWithUTF8String:publisherID] : @"unknown";
            NSString *key = keyID ? [NSString stringWithUTF8String:keyID] : @"unknown";
            NSString *finger = fingerprint ? [NSString stringWithUTF8String:fingerprint] : @"unknown";
            NSString *publisherVerification = verifiedPublisher ? @"✓ Marketplace has verified this publisher identity. This is not local publisher trust." : @"Marketplace has not verified this publisher identity. This does not change local trust.";
            NSString *trustSummary = trustRequired ? @"A new local trust record will be created for this Flow only. Installing does not run the Flow." : @"This Flow already has local trust. No new trust permission will be created. Installing does not run the Flow.";

            NSAlert *alert = [NSAlert new];
            alert.alertStyle = NSAlertStyleInformational;
            alert.messageText = [NSString stringWithFormat:@"Install “%@” from Marketplace?", flowName];
            alert.informativeText = [NSString stringWithFormat:@"Release: %@ (%@)\nFlow: %@\nPublisher: %@\n\n✓ Marketplace release attestation is valid.\n✓ Package signature is valid.\n%@\n\n%@", releaseVersion, release, flow, publisher, publisherVerification, trustSummary];

            ODFlowTrustDetailsController *detailsController = [ODFlowTrustDetailsController new];
            detailsController.flowID = flow;
            detailsController.publisher = publisher;
            detailsController.keyID = key;
            detailsController.fingerprint = finger;
            NSButton *detailsButton = [NSButton buttonWithTitle:@"Security Details…" target:detailsController action:@selector(showSecurityDetails:)];
            detailsButton.bezelStyle = NSBezelStyleInline;
            detailsButton.controlSize = NSControlSizeSmall;
            detailsButton.toolTip = @"Show the Flow ID, signing key, and publisher key fingerprint.";

            NSMutableArray<NSView *> *accessoryViews = [NSMutableArray array];
            NSButton *trustPublisher = nil;
            if (trustRequired) {
                trustPublisher = [NSButton checkboxWithTitle:@"Trust this publisher for future Flows" target:nil action:nil];
                trustPublisher.state = NSControlStateValueOff;
                trustPublisher.toolTip = @"Optional. Expands trust to other Flows signed by this exact publisher key.";

                NSTextField *scopeHelp = [NSTextField labelWithString:@"By default, only this Flow is trusted. Publisher-wide trust is optional; Flow permissions and licensing remain separate."];
                scopeHelp.font = [NSFont systemFontOfSize:NSFont.smallSystemFontSize];
                scopeHelp.textColor = NSColor.secondaryLabelColor;
                scopeHelp.maximumNumberOfLines = 0;
                scopeHelp.lineBreakMode = NSLineBreakByWordWrapping;
                scopeHelp.preferredMaxLayoutWidth = 500.0;
                [accessoryViews addObject:trustPublisher];
                [accessoryViews addObject:scopeHelp];
            }
            [accessoryViews addObject:detailsButton];
            NSStackView *accessory = [NSStackView stackViewWithViews:accessoryViews];
            accessory.orientation = NSUserInterfaceLayoutOrientationVertical;
            accessory.alignment = NSLayoutAttributeLeading;
            accessory.spacing = 6.0;
            accessory.frame = NSMakeRect(0.0, 0.0, 500.0, trustRequired ? 94.0 : 24.0);
            [accessory.widthAnchor constraintEqualToConstant:500.0].active = YES;
            alert.accessoryView = accessory;

            [alert addButtonWithTitle:@"Install"];
            [alert addButtonWithTitle:@"Cancel"];
            alert.buttons.firstObject.keyEquivalent = @"\r";
            alert.buttons.lastObject.keyEquivalent = @"\e";
            [alert.window setContentMinSize:NSMakeSize(620.0, trustRequired ? 430.0 : 360.0)];
            [alert.window setContentSize:NSMakeSize(620.0, trustRequired ? 470.0 : 400.0)];
            NSModalResponse response = [alert runModal];
            if (decision) {
                if (response == NSAlertFirstButtonReturn) {
                    *decision = trustRequired && trustPublisher.state == NSControlStateValueOn ? 2 : 1;
                } else {
                    *decision = 0;
                }
            }
            success = YES;
        }
    });
    if (!success && errorMessage && !*errorMessage) ODSetError(errorMessage, @"Marketplace install confirmation could not be displayed");
    return success ? 1 : 0;
}

void ODAppShellTeardown(void) {
    ODOnMainThread(^{
        if (ODAppShellController) {
            ODAppShellController.statusItem.button.target = nil;
            ODClearMenuTargets(ODAppShellController.menu);
            [NSStatusBar.systemStatusBar removeStatusItem:ODAppShellController.statusItem];
            if (NSApp.delegate == ODAppShellController.appDelegate) [NSApp setDelegate:nil];
            ODAppShellController = nil;
        }
        if (NSApp.running) [NSApp stop:nil];
        NSEvent *wake = [NSEvent otherEventWithType:NSEventTypeApplicationDefined location:NSZeroPoint
            modifierFlags:0 timestamp:0 windowNumber:0 context:nil subtype:0 data1:0 data2:0];
        [NSApp postEvent:wake atStart:NO];
    });
}

void ODAppShellRun(void) {
    if (!NSThread.isMainThread || !ODAppShellController) return;
    // AppKit may return from -run after a stop request even though the status
    // item is still live. The App Shell owns the process lifetime, so resume
    // the loop until its one teardown path has removed that ownership. During
    // normal teardown ODAppShellTeardown clears the controller before stopping
    // NSApp, which makes this loop exit immediately after -run returns.
    while (ODAppShellController) {
        @autoreleasepool {
            [NSApp run];
        }
        // A foreign stop request must not turn into a tight main-thread spin
        // while the Shell still owns the status item. Re-enter promptly, but
        // yield a bounded slice first so an abnormal repeated return remains
        // observable and does not consume a CPU core.
        if (ODAppShellController) {
            [NSThread sleepForTimeInterval:0.01];
        }
    }
}

void ODAppShellFree(char *value) { free(value); }
