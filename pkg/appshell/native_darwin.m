#import <Cocoa/Cocoa.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "native_darwin.h"

@interface ODAppShellStatusController : NSObject
@property(nonatomic, strong) NSStatusItem *statusItem;
@property(nonatomic, strong) NSMenu *menu;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSMenuItem *> *items;
@property(nonatomic, copy) NSString *primaryAction;
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

void ODAppShellTeardown(void) {
    ODOnMainThread(^{
        if (ODAppShellController) {
            ODAppShellController.statusItem.button.target = nil;
            ODClearMenuTargets(ODAppShellController.menu);
            [NSStatusBar.systemStatusBar removeStatusItem:ODAppShellController.statusItem];
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
    [NSApp run];
}

void ODAppShellFree(char *value) { free(value); }
