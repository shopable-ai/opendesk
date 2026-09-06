// exact-window-capture is a test-only macOS receipt generator.
//
// It deliberately has no screen/region fallback.  Before it writes an image,
// it checks one CoreGraphics window row against the caller's reviewed PID,
// CGWindowID, and bounds, then asks CoreGraphics for that single window only.
// It is not part of the OpenDesk Runtime API or a user-facing capture flow.

#import <AppKit/AppKit.h>

#include <CoreFoundation/CoreFoundation.h>
#include <CoreGraphics/CoreGraphics.h>
#include <ImageIO/ImageIO.h>

#include <errno.h>
#include <limits.h>
#include <libproc.h>
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

enum { kBoundsTolerance = 2 };

typedef enum {
	capture_scenario_invalid = 0,
	capture_scenario_fixture,
	capture_scenario_chess_about,
} capture_scenario;

typedef struct {
	capture_scenario scenario;
	uint32_t pid;
	CGWindowID window_id;
	uint64_t launch_time_ms;
	double x;
	double y;
	double width;
	double height;
	char output[PATH_MAX];
} capture_request;

typedef struct {
	const char *name;
	const char *bundle_id;
	char bundle_path[PATH_MAX];
	char executable_path[PATH_MAX];
	char output_root[PATH_MAX];
	const char *output_basename;
} capture_profile;

typedef struct {
	int64_t pid;
	int64_t window_id;
	int64_t layer;
	int64_t sharing_state;
	double alpha;
	CGRect bounds;
} window_receipt;

typedef struct {
	uint8_t max_alpha;
	bool non_black;
	bool color_variation;
} image_receipt;

static int fail(const char *code, const char *message) {
	fprintf(stderr, "exact-window-capture:%s:%s\n", code, message);
	return 2;
}

static bool parse_uint32(const char *raw, uint32_t *out) {
	if (raw == NULL || raw[0] == '\0' || out == NULL) return false;
	errno = 0;
	char *end = NULL;
	unsigned long value = strtoul(raw, &end, 10);
	if (errno != 0 || end == raw || *end != '\0' || value == 0 || value > UINT32_MAX) return false;
	*out = (uint32_t)value;
	return true;
}

static bool parse_uint64(const char *raw, uint64_t *out) {
	if (raw == NULL || raw[0] == '\0' || out == NULL) return false;
	errno = 0;
	char *end = NULL;
	unsigned long long value = strtoull(raw, &end, 10);
	if (errno != 0 || end == raw || *end != '\0' || value == 0) return false;
	*out = (uint64_t)value;
	return true;
}

static bool parse_scenario(const char *raw, capture_scenario *out) {
	if (raw == NULL || out == NULL) return false;
	if (strcmp(raw, "accessibility-native-fixture-capture-v1") == 0) {
		*out = capture_scenario_fixture;
		return true;
	}
	if (strcmp(raw, "accessibility-real-app-chess-about-v1") == 0) {
		*out = capture_scenario_chess_about;
		return true;
	}
	return false;
}

static bool parse_dimension(const char *raw, double *out, bool positive) {
	if (raw == NULL || raw[0] == '\0' || out == NULL) return false;
	errno = 0;
	char *end = NULL;
	double value = strtod(raw, &end);
	if (errno != 0 || end == raw || *end != '\0' || !isfinite(value) || (positive && value <= 0)) return false;
	*out = value;
	return true;
}

static bool set_output_path(const char *raw, capture_request *request) {
	if (raw == NULL || raw[0] != '/' || request == NULL) return false;
	size_t length = strlen(raw);
	if (length == 0 || length >= sizeof(request->output)) return false;
	memcpy(request->output, raw, length + 1);
	return true;
}

static bool parse_request(int argc, char *argv[], capture_request *request) {
	if (request == NULL) return false;
	memset(request, 0, sizeof(*request));
	bool seen_pid = false;
	bool seen_scenario = false;
	bool seen_window = false;
	bool seen_launch_time = false;
	bool seen_x = false;
	bool seen_y = false;
	bool seen_width = false;
	bool seen_height = false;
	bool seen_output = false;
	for (int index = 1; index < argc; index += 2) {
		if (index + 1 >= argc) return false;
		const char *flag = argv[index];
		const char *value = argv[index + 1];
		if (strcmp(flag, "--scenario") == 0) {
			if (seen_scenario || !parse_scenario(value, &request->scenario)) return false;
			seen_scenario = true;
		} else if (strcmp(flag, "--pid") == 0) {
			if (seen_pid || !parse_uint32(value, &request->pid)) return false;
			seen_pid = true;
		} else if (strcmp(flag, "--window-id") == 0) {
			uint32_t parsed = 0;
			if (seen_window || !parse_uint32(value, &parsed)) return false;
			request->window_id = (CGWindowID)parsed;
			seen_window = true;
		} else if (strcmp(flag, "--launch-time-ms") == 0) {
			if (seen_launch_time || !parse_uint64(value, &request->launch_time_ms)) return false;
			seen_launch_time = true;
		} else if (strcmp(flag, "--x") == 0) {
			if (seen_x || !parse_dimension(value, &request->x, false)) return false;
			seen_x = true;
		} else if (strcmp(flag, "--y") == 0) {
			if (seen_y || !parse_dimension(value, &request->y, false)) return false;
			seen_y = true;
		} else if (strcmp(flag, "--width") == 0) {
			if (seen_width || !parse_dimension(value, &request->width, true)) return false;
			seen_width = true;
		} else if (strcmp(flag, "--height") == 0) {
			if (seen_height || !parse_dimension(value, &request->height, true)) return false;
			seen_height = true;
		} else if (strcmp(flag, "--output") == 0) {
			if (seen_output || !set_output_path(value, request)) return false;
			seen_output = true;
		} else {
			return false;
		}
	}
	return seen_scenario && seen_pid && seen_window && seen_launch_time &&
		seen_x && seen_y && seen_width && seen_height && seen_output;
}

static bool build_profile(const capture_request *request, capture_profile *profile) {
	if (request == NULL || profile == NULL) return false;
	char working_directory[PATH_MAX];
	if (getcwd(working_directory, sizeof(working_directory)) == NULL) return false;
	memset(profile, 0, sizeof(*profile));
	if (request->scenario == capture_scenario_fixture) {
		profile->name = "accessibility-native-fixture-capture-v1";
		profile->bundle_id = "com.opendesk.accessibility-fixture";
		profile->output_basename = "fixture-window.png";
		if (snprintf(profile->bundle_path, sizeof(profile->bundle_path),
			"%s/.runtime/tests/accessibility/macos/OpenDeskAccessibilityFixture.app", working_directory) < 0 ||
			snprintf(profile->executable_path, sizeof(profile->executable_path),
			"%s/Contents/MacOS/OpenDeskAccessibilityFixture", profile->bundle_path) < 0 ||
			snprintf(profile->output_root, sizeof(profile->output_root),
			"%s/.runtime/tests/accessibility/macos/exact-window-capture", working_directory) < 0) return false;
		return strlen(profile->bundle_path) < sizeof(profile->bundle_path) &&
			strlen(profile->executable_path) < sizeof(profile->executable_path) &&
			strlen(profile->output_root) < sizeof(profile->output_root);
	}
	if (request->scenario == capture_scenario_chess_about) {
		profile->name = "accessibility-real-app-chess-about-v1";
		profile->bundle_id = "com.apple.Chess";
		profile->output_basename = "about.png";
		if (snprintf(profile->bundle_path, sizeof(profile->bundle_path), "/System/Applications/Chess.app") < 0 ||
			snprintf(profile->executable_path, sizeof(profile->executable_path),
			"%s/Contents/MacOS/Chess", profile->bundle_path) < 0 ||
			snprintf(profile->output_root, sizeof(profile->output_root),
			"%s/.runtime/tests/accessibility/real-app-about", working_directory) < 0) return false;
		return strlen(profile->bundle_path) < sizeof(profile->bundle_path) &&
			strlen(profile->executable_path) < sizeof(profile->executable_path) &&
			strlen(profile->output_root) < sizeof(profile->output_root);
	}
	return false;
}

static bool permitted_output_path(const capture_request *request, const capture_profile *profile) {
	if (request == NULL || profile == NULL || request->output[0] != '/') return false;
	char path_copy[PATH_MAX];
	if (strlen(request->output) >= sizeof(path_copy)) return false;
	memcpy(path_copy, request->output, strlen(request->output) + 1);
	char *separator = strrchr(path_copy, '/');
	if (separator == NULL || separator == path_copy || strcmp(separator + 1, profile->output_basename) != 0) return false;
	*separator = '\0';
	char canonical_root[PATH_MAX];
	char canonical_parent[PATH_MAX];
	if (realpath(profile->output_root, canonical_root) == NULL || realpath(path_copy, canonical_parent) == NULL) return false;
	size_t root_length = strlen(canonical_root);
	return strncmp(canonical_parent, canonical_root, root_length) == 0 &&
		(canonical_parent[root_length] == '\0' || canonical_parent[root_length] == '/');
}

static bool checked_profile_application(const capture_request *request, const capture_profile *profile) {
	if (request == NULL || profile == NULL) return false;
	if (request->pid > INT_MAX) return false;
	char process_path[PROC_PIDPATHINFO_MAXSIZE];
	int process_path_length = proc_pidpath((int)request->pid, process_path, sizeof(process_path));
	if (process_path_length <= 0 || strcmp(process_path, profile->executable_path) != 0) return false;
	// The repository fixture is launched by its checked-in executable rather
	// than LaunchServices, so NSRunningApplication is not a reliable authority
	// for it.  Its Runtime gate verifies the fixed bundle, PID and
	// launch fingerprint immediately before and after this helper.  The exact
	// CoreGraphics PID/window/bounds checks and the fixed process executable
	// path above remain mandatory for both
	// scenarios.  Chess, the only non-fixture target, must pass the stricter
	// NSRunningApplication bundle/path/executable/launch check here as well.
	if (request->scenario == capture_scenario_fixture) return true;
	bool valid = false;
	@autoreleasepool {
		NSRunningApplication *application = [NSRunningApplication runningApplicationWithProcessIdentifier:(pid_t)request->pid];
		if (application == nil || application.terminated ||
			![application.bundleIdentifier isEqualToString:[NSString stringWithUTF8String:profile->bundle_id]]) {
			valid = false;
		} else {
			NSString *bundle_path = application.bundleURL.path.stringByStandardizingPath;
			NSString *executable_path = application.executableURL.path.stringByStandardizingPath;
			NSDate *launch_date = application.launchDate;
			double launch_ms = launch_date == nil ? NAN : launch_date.timeIntervalSince1970 * 1000.0;
			valid = isfinite(launch_ms) && fabs(launch_ms - (double)request->launch_time_ms) <= 1000.0 &&
				bundle_path != nil && executable_path != nil &&
				strcmp(bundle_path.fileSystemRepresentation, profile->bundle_path) == 0 &&
				strcmp(executable_path.fileSystemRepresentation, profile->executable_path) == 0;
		}
	}
	return valid;
}

static bool copy_number(CFDictionaryRef row, const void *key, int64_t *out) {
	if (row == NULL || out == NULL) return false;
	CFNumberRef number = (CFNumberRef)CFDictionaryGetValue(row, key);
	return number != NULL && CFNumberGetValue(number, kCFNumberSInt64Type, out);
}

static bool copy_boolean(CFDictionaryRef row, const void *key, bool *out) {
	if (row == NULL || out == NULL) return false;
	CFBooleanRef value = (CFBooleanRef)CFDictionaryGetValue(row, key);
	if (value == NULL) return false;
	*out = CFBooleanGetValue(value);
	return true;
}

static bool copy_double(CFDictionaryRef row, const void *key, double *out) {
	if (row == NULL || out == NULL) return false;
	CFNumberRef number = (CFNumberRef)CFDictionaryGetValue(row, key);
	return number != NULL && CFNumberGetValue(number, kCFNumberDoubleType, out);
}

static bool copy_bounds(CFDictionaryRef row, CGRect *out) {
	if (row == NULL || out == NULL) return false;
	CFDictionaryRef value = (CFDictionaryRef)CFDictionaryGetValue(row, kCGWindowBounds);
	return value != NULL && CGRectMakeWithDictionaryRepresentation(value, out);
}

static bool bounds_match(const CGRect *actual, const capture_request *request) {
	return actual != NULL && request != NULL &&
		fabs(actual->origin.x - request->x) <= kBoundsTolerance &&
		fabs(actual->origin.y - request->y) <= kBoundsTolerance &&
		fabs(actual->size.width - request->width) <= kBoundsTolerance &&
		fabs(actual->size.height - request->height) <= kBoundsTolerance;
}

static bool read_checked_window(const capture_request *request, window_receipt *receipt) {
	if (request == NULL || receipt == NULL) return false;
	CFArrayRef rows = CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow, request->window_id);
	if (rows == NULL || CFArrayGetCount(rows) != 1) {
		if (rows != NULL) CFRelease(rows);
		return false;
	}
	CFDictionaryRef row = (CFDictionaryRef)CFArrayGetValueAtIndex(rows, 0);
	int64_t observed_window_id = 0;
	int64_t observed_pid = 0;
	int64_t observed_layer = -1;
	int64_t sharing_state = -1;
	double alpha = 0;
	bool on_screen = false;
	CGRect bounds = CGRectZero;
	bool valid = copy_number(row, kCGWindowNumber, &observed_window_id) &&
		copy_number(row, kCGWindowOwnerPID, &observed_pid) &&
		copy_number(row, kCGWindowLayer, &observed_layer) &&
		copy_number(row, kCGWindowSharingState, &sharing_state) &&
		copy_double(row, kCGWindowAlpha, &alpha) &&
		copy_boolean(row, kCGWindowIsOnscreen, &on_screen) &&
		copy_bounds(row, &bounds) &&
		observed_window_id == (int64_t)request->window_id &&
		observed_pid == (int64_t)request->pid &&
		observed_layer == 0 && on_screen &&
		sharing_state != kCGWindowSharingNone &&
		isfinite(alpha) && alpha > 0 &&
		bounds.size.width > 0 && bounds.size.height > 0 &&
		bounds_match(&bounds, request);
	CFRelease(rows);
	if (!valid) return false;
	receipt->pid = observed_pid;
	receipt->window_id = observed_window_id;
	receipt->layer = observed_layer;
	receipt->sharing_state = sharing_state;
	receipt->alpha = alpha;
	receipt->bounds = bounds;
	return true;
}

static bool readable_image(CGImageRef image, image_receipt *receipt) {
	if (image == NULL || receipt == NULL) return false;
	size_t width = CGImageGetWidth(image);
	size_t height = CGImageGetHeight(image);
	if (width == 0 || height == 0 || width > SIZE_MAX / 4 || height > SIZE_MAX / (width * 4)) return false;
	size_t bytes_per_row = width * 4;
	uint8_t *pixels = calloc(height, bytes_per_row);
	if (pixels == NULL) return false;
	CGColorSpaceRef color_space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
	if (color_space == NULL) {
		free(pixels);
		return false;
	}
	CGContextRef context = CGBitmapContextCreate(
		pixels, width, height, 8, bytes_per_row, color_space,
		kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big
	);
	CGColorSpaceRelease(color_space);
	if (context == NULL) {
		free(pixels);
		return false;
	}
	CGContextSetBlendMode(context, kCGBlendModeCopy);
	CGContextDrawImage(context, CGRectMake(0, 0, width, height), image);
	uint8_t observed_alpha = 0;
	uint8_t first_red = 0;
	uint8_t first_green = 0;
	uint8_t first_blue = 0;
	bool saw_pixel = false;
	bool non_black = false;
	bool color_variation = false;
	for (size_t offset = 3; offset < height * bytes_per_row; offset += 4) {
		uint8_t red = pixels[offset - 3];
		uint8_t green = pixels[offset - 2];
		uint8_t blue = pixels[offset - 1];
		if (pixels[offset] > observed_alpha) observed_alpha = pixels[offset];
		if (red != 0 || green != 0 || blue != 0) non_black = true;
		if (!saw_pixel) {
			first_red = red;
			first_green = green;
			first_blue = blue;
			saw_pixel = true;
		} else if (red != first_red || green != first_green || blue != first_blue) {
			color_variation = true;
		}
	}
	CGContextRelease(context);
	free(pixels);
	receipt->max_alpha = observed_alpha;
	receipt->non_black = non_black;
	receipt->color_variation = color_variation;
	// An opaque capture option would make alpha unsuitable as the sole
	// readability signal. The reviewed fixture and About panel must
	// contain non-black, non-uniform pixels; a blank/black capture is rejected.
	return observed_alpha != 0 && non_black && color_variation;
}

static CGImageRef opaque_white_image(CGImageRef source) {
	if (source == NULL) return NULL;
	size_t width = CGImageGetWidth(source);
	size_t height = CGImageGetHeight(source);
	if (width == 0 || height == 0 || width > SIZE_MAX / 4 || height > SIZE_MAX / (width * 4)) return NULL;
	size_t bytes_per_row = width * 4;
	CGColorSpaceRef color_space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
	if (color_space == NULL) return NULL;
	CGContextRef context = CGBitmapContextCreate(
		NULL, width, height, 8, bytes_per_row, color_space,
		kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big
	);
	CGColorSpaceRelease(color_space);
	if (context == NULL) return NULL;
	// The raw exact-window image is first verified above. Compositing it over
	// white makes its transparent pixels deterministic without sampling pixels
	// from the desktop or any other window.
	CGContextSetRGBFillColor(context, 1.0, 1.0, 1.0, 1.0);
	CGContextFillRect(context, CGRectMake(0, 0, width, height));
	CGContextDrawImage(context, CGRectMake(0, 0, width, height), source);
	CGImageRef result = CGBitmapContextCreateImage(context);
	CGContextRelease(context);
	return result;
}

static bool write_png_atomically(CGImageRef image, const char *path) {
	if (image == NULL || path == NULL || path[0] != '/') return false;
	char temporary[PATH_MAX];
	int template_length = snprintf(temporary, sizeof(temporary), "%s.tmp.XXXXXX", path);
	if (template_length < 0 || (size_t)template_length >= sizeof(temporary)) return false;
	int descriptor = mkstemp(temporary);
	if (descriptor < 0) return false;
	if (close(descriptor) != 0) {
		unlink(temporary);
		return false;
	}
	CFURLRef url = CFURLCreateFromFileSystemRepresentation(
		kCFAllocatorDefault, (const UInt8 *)temporary, (CFIndex)strlen(temporary), false
	);
	if (url == NULL) {
		unlink(temporary);
		return false;
	}
	CGImageDestinationRef destination = CGImageDestinationCreateWithURL(url, CFSTR("public.png"), 1, NULL);
	CFRelease(url);
	if (destination == NULL) {
		unlink(temporary);
		return false;
	}
	CGImageDestinationAddImage(destination, image, NULL);
	bool finalized = CGImageDestinationFinalize(destination);
	CFRelease(destination);
	if (!finalized) {
		unlink(temporary);
		return false;
	}
	struct stat metadata;
	if (stat(temporary, &metadata) != 0 || !S_ISREG(metadata.st_mode) || metadata.st_size <= 0) {
		unlink(temporary);
		return false;
	}
	// link(2) publishes only when path does not exist. Unlike replacement-based publishing, it
	// cannot overwrite a concurrently-created evidence file.
	if (link(temporary, path) != 0) {
		unlink(temporary);
		return false;
	}
	(void)unlink(temporary);
	return true;
}

static int self_test(void) {
	capture_request request = { .pid = 7, .window_id = 9, .x = 10, .y = 20, .width = 30, .height = 40 };
	CGRect matching = CGRectMake(11.5, 18.5, 31.5, 38.5);
	CGRect mismatched = CGRectMake(13, 20, 30, 40);
	if (!bounds_match(&matching, &request) || bounds_match(&mismatched, &request)) {
		return fail("SELF_TEST_FAILED", "bounds comparison invariant failed");
	}
	printf("{\"schemaVersion\":1,\"status\":\"passed\",\"selfTest\":true}\n");
	return 0;
}

int main(int argc, char *argv[]) {
	if (argc == 2 && strcmp(argv[1], "--preflight") == 0) {
		printf("{\"schemaVersion\":1,\"mode\":\"preflight\",\"screenCaptureAccess\":%s}\n",
			CGPreflightScreenCaptureAccess() ? "true" : "false");
		return 0;
	}
	if (argc == 2 && strcmp(argv[1], "--self-test") == 0) return self_test();
	capture_request request;
	if (!parse_request(argc, argv, &request)) {
		return fail("INVALID_ARGUMENT", "expected one value for each exact window flag");
	}
	capture_profile profile;
	if (!build_profile(&request, &profile) || !permitted_output_path(&request, &profile)) {
		return fail("INVALID_OUTPUT_SCOPE", "scenario output must stay in its reviewed runtime evidence directory");
	}
	if (access(request.output, F_OK) == 0 || errno != ENOENT) {
		return fail("OUTPUT_EXISTS", "refusing to overwrite an existing artifact");
	}
	if (!checked_profile_application(&request, &profile)) {
		return fail("APPLICATION_IDENTITY_MISMATCH", "reviewed scenario application fingerprint is no longer current");
	}
	if (!CGPreflightScreenCaptureAccess()) {
		return fail("SCREEN_CAPTURE_PERMISSION_DENIED", "screen capture preflight is not granted");
	}
	window_receipt pre_capture;
	if (!read_checked_window(&request, &pre_capture)) {
		return fail("WINDOW_IDENTITY_MISMATCH", "PID, ID, layer, visibility, sharing state, or bounds changed");
	}

	// CGWindow.h documents IncludingWindow as using only this window ID; there is
	// intentionally no screen crop, window-list expansion, or fallback path.
	CGImageRef image = CGWindowListCreateImage(
		CGRectNull,
		kCGWindowListOptionIncludingWindow,
		request.window_id,
		kCGWindowImageBoundsIgnoreFraming | kCGWindowImageBestResolution
	);
	if (image == NULL) {
		return fail("CAPTURE_UNAVAILABLE", "CoreGraphics did not return the exact window image");
	}
	image_receipt image_info = {0};
	bool readable = readable_image(image, &image_info);
	if (!readable) {
		CGImageRelease(image);
		return fail("CAPTURE_UNREADABLE", "exact window image is blank or unreadable");
	}
	window_receipt post_capture;
	if (!checked_profile_application(&request, &profile) || !read_checked_window(&request, &post_capture)) {
		CGImageRelease(image);
		return fail("WINDOW_IDENTITY_CHANGED", "exact CoreGraphics window changed during capture");
	}
	size_t image_width = CGImageGetWidth(image);
	size_t image_height = CGImageGetHeight(image);
	CGImageRef opaque_image = opaque_white_image(image);
	CGImageRelease(image);
	if (opaque_image == NULL) {
		return fail("OUTPUT_COMPOSITE_FAILED", "exact window image could not be safely composited");
	}
	bool saved = write_png_atomically(opaque_image, request.output);
	CGImageRelease(opaque_image);
	if (!saved) {
		return fail("OUTPUT_WRITE_FAILED", "PNG receipt could not be written");
	}

	printf(
		"{\"schemaVersion\":1,\"scenario\":\"%s\",\"screenCapturePreflight\":true,\"captureMethod\":\"CGWindowListCreateImage(kCGWindowListOptionIncludingWindow)+opaqueWhiteComposite\","
		"\"expected\":{\"pid\":%u,\"windowId\":%u,\"x\":%.3f,\"y\":%.3f,\"width\":%.3f,\"height\":%.3f},"
		"\"preCapture\":{\"pid\":%lld,\"windowId\":%lld,\"layer\":%lld,\"onScreen\":true,\"sharingState\":%lld,\"alpha\":%.3f,"
		"\"x\":%.3f,\"y\":%.3f,\"width\":%.3f,\"height\":%.3f},"
		"\"postCapture\":{\"pid\":%lld,\"windowId\":%lld,\"layer\":%lld,\"onScreen\":true,\"sharingState\":%lld,\"alpha\":%.3f,"
		"\"x\":%.3f,\"y\":%.3f,\"width\":%.3f,\"height\":%.3f},"
		"\"image\":{\"width\":%zu,\"height\":%zu,\"maxAlpha\":%u,\"nonBlack\":%s,\"colorVariation\":%s}}\n",
		profile.name, request.pid, (uint32_t)request.window_id, request.x, request.y, request.width, request.height,
		(long long)pre_capture.pid, (long long)pre_capture.window_id, (long long)pre_capture.layer, (long long)pre_capture.sharing_state, pre_capture.alpha,
		pre_capture.bounds.origin.x, pre_capture.bounds.origin.y, pre_capture.bounds.size.width, pre_capture.bounds.size.height,
		(long long)post_capture.pid, (long long)post_capture.window_id, (long long)post_capture.layer, (long long)post_capture.sharing_state, post_capture.alpha,
		post_capture.bounds.origin.x, post_capture.bounds.origin.y, post_capture.bounds.size.width, post_capture.bounds.size.height,
		image_width, image_height, image_info.max_alpha,
		image_info.non_black ? "true" : "false", image_info.color_variation ? "true" : "false"
	);
	return 0;
}
