//go:build darwin && cgo
// +build darwin,cgo

#import <Cocoa/Cocoa.h>
#import <CoreServices/CoreServices.h>

#pragma clang diagnostic ignored "-Wdeprecated-declarations"

// This legacy AppKit API is still the macOS 12-compatible local notification
// path. Unlike beeep's Darwin implementation, it submits as the containing
// OpenDesk.app when one exists, instead of always identifying as ScriptEditor2.
int OpenDeskDarwinDeliverNotification(const char *title, const char *message, int sound) {
	@autoreleasepool {
		NSBundle *bundle = [NSBundle mainBundle];
		if (bundle.bundleIdentifier.length == 0) {
			return 1;
		}
		if (bundle.bundleURL.isFileURL && [bundle.bundleURL.pathExtension isEqualToString:@"app"]) {
			LSRegisterURL((__bridge CFURLRef)bundle.bundleURL, true);
		}

		if (!NSApplicationLoad()) {
			return 2;
		}
		NSApplication *application = [NSApplication sharedApplication];
		[application setActivationPolicy:NSApplicationActivationPolicyAccessory];
		[application finishLaunching];

		NSString *titleString = title ? [NSString stringWithUTF8String:title] : @"OpenDesk Notification";
		NSString *messageString = message ? [NSString stringWithUTF8String:message] : @"";
		if (!titleString || !messageString) {
			return 2;
		}

		NSUserNotification *notification = [NSUserNotification new];
		notification.title = titleString;
		notification.informativeText = messageString;
		notification.soundName = sound ? NSUserNotificationDefaultSoundName : nil;
		[[NSUserNotificationCenter defaultUserNotificationCenter] deliverNotification:notification];
	}
	return 0;
}
