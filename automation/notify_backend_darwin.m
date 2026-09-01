//go:build darwin && cgo
// +build darwin,cgo

#import <CoreServices/CoreServices.h>
#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>

#include <stdlib.h>
#include <string.h>

#pragma clang diagnostic ignored "-Wdeprecated-declarations"

static int OpenDeskNotificationError(char **error_message, NSString *message) {
	if (error_message != NULL) {
		const char *utf8 = message.UTF8String;
		*error_message = strdup(utf8 ? utf8 : "macOS notification backend failed");
	}
	return 2;
}

static BOOL OpenDeskWaitForSemaphore(dispatch_semaphore_t semaphore, NSTimeInterval seconds) {
	dispatch_time_t deadline = dispatch_time(DISPATCH_TIME_NOW, (int64_t)(seconds * NSEC_PER_SEC));
	return dispatch_semaphore_wait(semaphore, deadline) == 0;
}

// UserNotifications is the native macOS 12-compatible notification path. It
// reports authorization and request-submission failures instead of treating an
// XPC send as success. A real .app identity is required; plain CLI/Scheduler
// processes re-enter the sibling OpenDesk.app through the private helper mode.
int OpenDeskDarwinDeliverNotification(const char *title, const char *message, int sound, char **error_message) {
	@autoreleasepool {
		if (error_message != NULL) {
			*error_message = NULL;
		}
		NSBundle *bundle = [NSBundle mainBundle];
		if (bundle.bundleIdentifier.length == 0 ||
			!bundle.bundleURL.isFileURL ||
			![bundle.bundleURL.pathExtension isEqualToString:@"app"]) {
			return 1;
		}

		OSStatus registrationStatus = LSRegisterURL((__bridge CFURLRef)bundle.bundleURL, true);
		if (registrationStatus != noErr) {
			return OpenDeskNotificationError(error_message,
				[NSString stringWithFormat:@"register OpenDesk.app with LaunchServices failed: %d", (int)registrationStatus]);
		}

		NSString *titleString = title ? [NSString stringWithUTF8String:title] : @"OpenDesk Notification";
		NSString *messageString = message ? [NSString stringWithUTF8String:message] : @"";
		if (!titleString || !messageString) {
			return OpenDeskNotificationError(error_message, @"notification title and message must be valid UTF-8");
		}

		UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
		dispatch_semaphore_t authorizationDone = dispatch_semaphore_create(0);
		__block BOOL granted = NO;
		__block NSError *authorizationError = nil;
		UNAuthorizationOptions authorizationOptions = UNAuthorizationOptionAlert;
		if (sound) {
			authorizationOptions |= UNAuthorizationOptionSound;
		}
		[center requestAuthorizationWithOptions:authorizationOptions completionHandler:^(BOOL value, NSError *error) {
			granted = value;
			authorizationError = error;
			dispatch_semaphore_signal(authorizationDone);
		}];
		if (!OpenDeskWaitForSemaphore(authorizationDone, 30.0)) {
			return OpenDeskNotificationError(error_message, @"macOS notification authorization timed out");
		}
		if (authorizationError != nil) {
			return OpenDeskNotificationError(error_message,
				[NSString stringWithFormat:@"macOS notification authorization failed: %@", authorizationError.localizedDescription]);
		}
		if (!granted) {
			return OpenDeskNotificationError(error_message,
				[NSString stringWithFormat:@"macOS notifications are denied for %@; enable OpenDesk in System Preferences > Notifications & Focus", bundle.bundleIdentifier]);
		}

		dispatch_semaphore_t settingsDone = dispatch_semaphore_create(0);
		__block UNNotificationSettings *settings = nil;
		[center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *value) {
			settings = value;
			dispatch_semaphore_signal(settingsDone);
		}];
		if (!OpenDeskWaitForSemaphore(settingsDone, 5.0)) {
			return OpenDeskNotificationError(error_message, @"reading macOS notification settings timed out");
		}
		if (settings.authorizationStatus == UNAuthorizationStatusDenied ||
			settings.authorizationStatus == UNAuthorizationStatusNotDetermined ||
			settings.alertSetting == UNNotificationSettingDisabled) {
			return OpenDeskNotificationError(error_message,
				[NSString stringWithFormat:@"macOS notification alerts are disabled for %@", bundle.bundleIdentifier]);
		}

		UNMutableNotificationContent *content = [UNMutableNotificationContent new];
		content.title = titleString;
		content.body = messageString;
		content.sound = sound ? [UNNotificationSound defaultSound] : nil;
		UNNotificationRequest *request = [UNNotificationRequest
			requestWithIdentifier:[[NSUUID UUID] UUIDString]
			content:content
			trigger:nil];
		dispatch_semaphore_t submissionDone = dispatch_semaphore_create(0);
		__block NSError *submissionError = nil;
		[center addNotificationRequest:request withCompletionHandler:^(NSError *error) {
			submissionError = error;
			dispatch_semaphore_signal(submissionDone);
		}];
		if (!OpenDeskWaitForSemaphore(submissionDone, 5.0)) {
			return OpenDeskNotificationError(error_message, @"submitting macOS notification timed out");
		}
		if (submissionError != nil) {
			return OpenDeskNotificationError(error_message,
				[NSString stringWithFormat:@"submitting macOS notification failed: %@", submissionError.localizedDescription]);
		}
	}
	return 0;
}
