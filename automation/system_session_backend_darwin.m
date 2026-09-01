//go:build darwin && cgo
// +build darwin,cgo

#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

#include <stdlib.h>
#include <string.h>

static int OpenDeskSessionError(char **error_message, NSString *message) {
	if (error_message != NULL) {
		const char *utf8 = message.UTF8String;
		*error_message = strdup(utf8 ? utf8 : "macOS session backend failed");
	}
	return 1;
}

int OpenDeskDarwinCopySessionState(char **json_output, char **error_message) {
	@autoreleasepool {
		if (json_output != NULL) {
			*json_output = NULL;
		}
		if (error_message != NULL) {
			*error_message = NULL;
		}
		CFDictionaryRef raw = CGSessionCopyCurrentDictionary();
		if (raw == NULL) {
			return OpenDeskSessionError(error_message,
				@"CGSessionCopyCurrentDictionary is unavailable outside a WindowServer GUI session");
		}
		NSDictionary *session = CFBridgingRelease(raw);
		NSNumber *userID = session[(__bridge NSString *)kCGSessionUserIDKey];
		NSNumber *onConsole = session[(__bridge NSString *)kCGSessionOnConsoleKey];
		NSNumber *loginDone = session[(__bridge NSString *)kCGSessionLoginDoneKey];
		BOOL active = onConsole.boolValue && loginDone.boolValue;
		NSString *state = active ? @"active" : (loginDone.boolValue ? @"background" : @"starting");
		NSDictionary *result = @{
			@"schemaVersion": @1,
			@"platform": @"darwin",
			@"backend": @"coregraphics-session",
			@"state": state,
			@"userId": userID ?: [NSNull null],
			@"sessionId": [NSNull null],
			@"active": @(active),
			@"onConsole": onConsole ?: [NSNull null],
			@"loginDone": loginDone ?: [NSNull null],
			@"remote": [NSNull null],
			@"locked": [NSNull null],
			@"observedAt": [[NSISO8601DateFormatter new] stringFromDate:[NSDate date]] ?: @""
		};
		NSError *serializationError = nil;
		NSData *data = [NSJSONSerialization dataWithJSONObject:result options:0 error:&serializationError];
		if (data == nil || serializationError != nil) {
			return OpenDeskSessionError(error_message,
				[NSString stringWithFormat:@"serialize macOS session state failed: %@", serializationError.localizedDescription]);
		}
		if (json_output != NULL) {
			NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
			*json_output = strdup(json.UTF8String ?: "{}");
		}
	}
	return 0;
}
