//go:build darwin && cgo

#import <Cocoa/Cocoa.h>
#import "edit_menu_darwin.h"

static const NSInteger CDEditMenuTag = 0x4f444544;

static NSString *CDEditTitle(NSString *english, NSString *chinese) {
    NSString *language = NSLocale.preferredLanguages.firstObject.lowercaseString;
    return [language hasPrefix:@"zh"] ? chinese : english;
}

static BOOL CDMenuHasAction(NSMenu *menu, SEL action) {
    for (NSMenuItem *item in menu.itemArray) {
        if (item.action == action) return YES;
    }
    return NO;
}

static void CDAddEditCommand(NSMenu *menu, NSString *title, SEL action,
                             NSString *key, NSEventModifierFlags modifiers) {
    // Preserve any existing command and its user/application key equivalent.
    if (CDMenuHasAction(menu, action)) return;
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title action:action keyEquivalent:key];
    // AppKit resolves the focused WKWebView/text editor through the responder
    // chain and validates selection, editability and the native undo manager.
    // Do not point these commands at the Runtime, a cached window or the AI.
    item.target = nil;
    item.keyEquivalentModifierMask = modifiers;
    [menu addItem:item];
}

void OpenDeskUIInstallEditMenu(void) {
    @autoreleasepool {
        NSCAssert(NSThread.isMainThread, @"Edit menu must be installed on the main thread");
        NSApplication *application = NSApplication.sharedApplication;
        NSMenu *mainMenu = application.mainMenu;
        if (!mainMenu) {
            mainMenu = [[NSMenu alloc] initWithTitle:@""];
            application.mainMenu = mainMenu;
        }
        if (mainMenu.numberOfItems == 0) {
            // macOS reserves the first submenu for the application menu. Do
            // not put Edit there, and do not add a host-only Quit command:
            // product shutdown belongs to the parent App Mode lifecycle.
            NSMenuItem *applicationItem = [[NSMenuItem alloc] initWithTitle:@"OpenDesk" action:NULL keyEquivalent:@""];
            applicationItem.submenu = [[NSMenu alloc] initWithTitle:@"OpenDesk"];
            [mainMenu addItem:applicationItem];
        }

        NSMenu *editMenu = nil;
        for (NSMenuItem *item in mainMenu.itemArray) {
            NSMenu *candidate = item.submenu;
            if (candidate && (item.tag == CDEditMenuTag ||
                (CDMenuHasAction(candidate, @selector(cut:)) &&
                 CDMenuHasAction(candidate, @selector(copy:)) &&
                 CDMenuHasAction(candidate, @selector(paste:))))) {
                editMenu = candidate;
                break;
            }
        }
        BOOL created = editMenu == nil;
        if (created) {
            NSString *title = CDEditTitle(@"Edit", @"编辑");
            NSMenuItem *editItem = [[NSMenuItem alloc] initWithTitle:title action:NULL keyEquivalent:@""];
            editItem.tag = CDEditMenuTag;
            editMenu = [[NSMenu alloc] initWithTitle:title];
            editItem.submenu = editMenu;
            [mainMenu addItem:editItem];
        }
        editMenu.autoenablesItems = YES;
        CDAddEditCommand(editMenu, CDEditTitle(@"Undo", @"撤销"), @selector(undo:), @"z", NSEventModifierFlagCommand);
        CDAddEditCommand(editMenu, CDEditTitle(@"Redo", @"重做"), @selector(redo:), @"z", NSEventModifierFlagCommand | NSEventModifierFlagShift);
        if (created) [editMenu addItem:NSMenuItem.separatorItem];
        CDAddEditCommand(editMenu, CDEditTitle(@"Cut", @"剪切"), @selector(cut:), @"x", NSEventModifierFlagCommand);
        CDAddEditCommand(editMenu, CDEditTitle(@"Copy", @"复制"), @selector(copy:), @"c", NSEventModifierFlagCommand);
        CDAddEditCommand(editMenu, CDEditTitle(@"Paste", @"粘贴"), @selector(paste:), @"v", NSEventModifierFlagCommand);
        if (created) [editMenu addItem:NSMenuItem.separatorItem];
        CDAddEditCommand(editMenu, CDEditTitle(@"Select All", @"全选"), @selector(selectAll:), @"a", NSEventModifierFlagCommand);
    }
}
