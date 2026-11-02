// Shared AppKit presentation policy. Included after CDWindowController's
// implementation so it can use the execution-owned window registry directly.
static BOOL CDIsRecoverableWindow(CDWindowController *controller) {
	if (!controller || controller.closed || controller.notificationView ||
		[controller.window isKindOfClass:CDDialogWindow.class]) return NO;
	return ([controller.kind isEqualToString:@"normal"] || [controller.kind isEqualToString:@"floating"]) &&
		(controller.window.styleMask & NSWindowStyleMaskTitled) != 0;
}

static BOOL CDSetDockPolicy(NSApplicationActivationPolicy policy) {
	if (NSApp.activationPolicy == policy) return YES;
	BOOL changed = [NSApp setActivationPolicy:policy];
	if (!changed) fprintf(stderr, "opendesk-ui-host: cannot change Dock activation policy to %ld\n", (long)policy);
	return changed;
}

static BOOL CDSyncDockPresentation(void) {
	BOOL needsDock = NO;
	for (CDWindowController *controller in CDWindows.allValues) {
		if (!CDIsRecoverableWindow(controller) || controller.hiddenByOwner) continue;
		if (controller.miniaturizing || controller.window.isMiniaturized ||
			([controller.kind isEqualToString:@"normal"] && controller.window.visible)) {
			needsDock = YES;
			break;
		}
	}
	return CDSetDockPolicy(needsDock ? NSApplicationActivationPolicyRegular : NSApplicationActivationPolicyAccessory);
}

static NSArray<CDWindowController *> *CDRecoverableWindows(void) {
	NSMutableArray *windows = [NSMutableArray array];
	for (CDWindowController *controller in CDWindows.allValues) {
		if (!CDIsRecoverableWindow(controller) || controller.presentationOrder == 0) continue;
		// Hidden popovers/selectors are implementation state, not user
		// recovery targets. Main pages with hide-on-close remain recoverable.
		if (controller.hiddenByOwner && ![controller.appCloseBehavior isEqualToString:@"hide"]) continue;
		[windows addObject:controller];
	}
	return [windows sortedArrayUsingComparator:^NSComparisonResult(CDWindowController *a, CDWindowController *b) {
		if (a.presentationOrder != b.presentationOrder) return a.presentationOrder > b.presentationOrder ? NSOrderedAscending : NSOrderedDescending;
		return [CDWindowKey(a.sessionID, a.windowID) compare:CDWindowKey(b.sessionID, b.windowID)];
	}];
}

static void CDRestoreWindow(CDWindowController *controller) {
	if (!CDIsRecoverableWindow(controller)) return;
	controller.hiddenByOwner = NO;
	if (controller.window.isMiniaturized) [controller.window deminiaturize:nil];
	controller.presentationOrder = ++CDPresentationSequence;
	if ([controller.kind isEqualToString:@"floating"]) {
		[controller.window orderFrontRegardless];
		[controller.floatingToolbarView setAnimationsActive:YES];
	} else {
		[controller.window makeKeyAndOrderFront:nil];
		CDSyncDockPresentation();
		[NSApp activateIgnoringOtherApps:YES];
	}
	controller.revision += 1;
	CDSyncDockPresentation();
}

@interface CDApplicationDelegate : NSObject <NSApplicationDelegate, NSMenuDelegate, NSMenuItemValidation>
@end

static BOOL CDShutdownRequested = NO;

@implementation CDApplicationDelegate
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
	if (CDShutdownRequested) return NSTerminateNow;
	// The parent owns executions, tray and shutdown. Never orphan it by
	// terminating only this shared UI process from Dock or Command-Q.
	NSMutableSet<NSString *> *requestedSessions = [NSMutableSet set];
	for (CDWindowController *controller in CDWindows.allValues.copy) {
		if (!controller.closed && controller.appOwned && ![requestedSessions containsObject:controller.sessionID]) {
			[requestedSessions addObject:controller.sessionID];
			[controller emitType:@"appQuit" target:nil body:@{} reason:@"user"];
		}
	}
	if (requestedSessions.count == 0) {
		// Script-mode windows still use their normal close events; the
		// execution decides when it is safe to release the host.
		for (CDWindowController *controller in CDWindows.allValues.copy) {
			if (!controller.closed) [controller.window close];
		}
	}
	return NSTerminateCancel;
}
- (void)restoreWindow:(NSMenuItem *)sender {
	CDRestoreWindow(CDWindows[sender.representedObject]);
}
- (NSMenu *)applicationDockMenu:(NSApplication *)sender {
	NSMenu *menu = [NSMenu new];
	for (CDWindowController *controller in CDRecoverableWindows()) {
		NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:controller.window.title.length ? controller.window.title : @"OpenDesk" action:@selector(restoreWindow:) keyEquivalent:@""];
		item.target = self;
		item.representedObject = CDWindowKey(controller.sessionID, controller.windowID);
		item.state = !controller.window.isMiniaturized && controller.window.visible ? NSControlStateValueOn : NSControlStateValueOff;
		[menu addItem:item];
	}
	return menu;
}
- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)flag {
	// AppKit's default excludes NSPanel and counts minimized windows as visible.
	for (CDWindowController *controller in CDRecoverableWindows()) {
		if (controller.window.isMiniaturized) { CDRestoreWindow(controller); return NO; }
	}
	CDRestoreWindow(CDRecoverableWindows().firstObject);
	return NO;
}
- (CDWindowController *)minimizeCandidate {
	NSArray *windows = CDRecoverableWindows();
	for (CDWindowController *controller in windows) {
		if (controller.window == NSApp.keyWindow && controller.window.miniaturizable && !controller.window.isMiniaturized) return controller;
	}
	if (NSApp.keyWindow) return nil;
	for (CDWindowController *controller in windows) {
		if (controller.window.visible && !controller.window.isMiniaturized && controller.window.miniaturizable) return controller;
	}
	return nil;
}
- (void)minimizeWindow:(id)sender { [[self minimizeCandidate].window performMiniaturize:sender]; }
- (BOOL)validateMenuItem:(NSMenuItem *)item {
	if (item.action == @selector(minimizeWindow:)) return [self minimizeCandidate] != nil;
	return YES;
}
- (void)menuNeedsUpdate:(NSMenu *)menu {
	while (menu.numberOfItems > 2) [menu removeItemAtIndex:2];
	for (NSMenuItem *item in [self applicationDockMenu:NSApp].itemArray.copy) {
		[item.menu removeItem:item];
		[menu addItem:item];
	}
}
@end

static CDApplicationDelegate *CDAppDelegate;

static void CDInstallWindowMenu(void) {
	BOOL chinese = [NSLocale.preferredLanguages.firstObject.lowercaseString hasPrefix:@"zh"];
	NSMenu *applicationMenu = NSApp.mainMenu.itemArray.firstObject.submenu;
	NSString *name = NSBundle.mainBundle.infoDictionary[@"CFBundleDisplayName"] ?: @"OpenDesk";
	NSMenuItem *quit = [[NSMenuItem alloc] initWithTitle:[NSString stringWithFormat:chinese ? @"退出 %@" : @"Quit %@", name] action:@selector(terminate:) keyEquivalent:@"q"];
	quit.target = NSApp;
	[applicationMenu addItem:quit];
	NSMenu *menu = [[NSMenu alloc] initWithTitle:chinese ? @"窗口" : @"Window"];
	menu.delegate = CDAppDelegate;
	NSMenuItem *minimize = [[NSMenuItem alloc] initWithTitle:chinese ? @"最小化" : @"Minimize" action:@selector(minimizeWindow:) keyEquivalent:@"m"];
	minimize.target = CDAppDelegate;
	[menu addItem:minimize];
	[menu addItem:NSMenuItem.separatorItem];
	NSMenuItem *root = [[NSMenuItem alloc] initWithTitle:menu.title action:nil keyEquivalent:@""];
	root.submenu = menu;
	[NSApp.mainMenu addItem:root];
}
