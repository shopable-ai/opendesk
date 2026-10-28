#import <AppKit/AppKit.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <libproc.h>
#include <math.h>

char *opendesk_app_by_pid_json(int32_t pid) {
    @autoreleasepool {
        if (pid <= 0) return NULL;
        struct proc_bsdinfo before = {0}, after = {0};
        char executableBefore[PROC_PIDPATHINFO_MAXSIZE] = {0};
        char executableAfter[PROC_PIDPATHINFO_MAXSIZE] = {0};
        if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &before, sizeof(before)) != sizeof(before) ||
            before.pbi_pid != (uint32_t)pid || before.pbi_start_tvsec == 0 ||
            proc_pidpath(pid, executableBefore, sizeof(executableBefore)) <= 0) return NULL;

        NSRunningApplication *application =
            [NSRunningApplication runningApplicationWithProcessIdentifier:(pid_t)pid];
        if (application == nil || application.terminated || application.processIdentifier != pid) return NULL;
        NSString *executablePath = application.executableURL.path;
        NSString *liveExecutable = [NSString stringWithUTF8String:executableBefore];
        NSTimeInterval processStart = (NSTimeInterval)before.pbi_start_tvsec +
            (NSTimeInterval)before.pbi_start_tvusec / 1000000.0;
        // Kernel start time is the process-instance authority. AppKit's launch
        // metadata is not required to equal it to microsecond precision.
        if (!isfinite(processStart) || executablePath.length == 0 || liveExecutable == nil ||
            ![executablePath isEqualToString:liveExecutable]) return NULL;

        NSDictionary *item = @{
            @"pid": @(application.processIdentifier),
            @"name": application.localizedName ?: @"",
            @"bundleIdentifier": application.bundleIdentifier ?: @"",
            @"path": application.bundleURL.path ?: @"",
            @"executablePath": executablePath,
            @"activationPolicy": @(application.activationPolicy),
            @"active": @(application.active),
            @"hidden": @(application.hidden),
            @"terminated": @(application.terminated),
            @"launchTimeMs": @((int64_t)before.pbi_start_tvsec * 1000 + before.pbi_start_tvusec / 1000)
        };

        // Detect termination, PID reuse, or exec while the native metadata was read.
        if (proc_pidpath(pid, executableAfter, sizeof(executableAfter)) <= 0 ||
            strcmp(executableBefore, executableAfter) != 0 ||
            proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &after, sizeof(after)) != sizeof(after) ||
            after.pbi_pid != before.pbi_pid ||
            after.pbi_start_tvsec != before.pbi_start_tvsec ||
            after.pbi_start_tvusec != before.pbi_start_tvusec || application.terminated) return NULL;

        NSError *error = nil;
        NSData *data = [NSJSONSerialization dataWithJSONObject:item options:0 error:&error];
        if (data == nil || error != nil) return NULL;
        char *result = malloc(data.length + 1);
        if (result == NULL) return NULL;
        memcpy(result, data.bytes, data.length);
        result[data.length] = '\0';
        return result;
    }
}

int32_t opendesk_app_terminate(int32_t pid, int force) {
    @autoreleasepool {
        NSRunningApplication *application =
            [NSRunningApplication runningApplicationWithProcessIdentifier:(pid_t)pid];
        if (application == nil || application.terminated) return 1;
        BOOL requested = force ? [application forceTerminate] : [application terminate];
        return requested ? 0 : 2;
    }
}

char *opendesk_app_bundle_identifier(const char *path) {
    @autoreleasepool {
        if (path == NULL) return NULL;
        NSString *bundlePath = [NSString stringWithUTF8String:path];
        NSBundle *bundle = [NSBundle bundleWithPath:bundlePath];
        NSString *identifier = bundle.bundleIdentifier;
        if (identifier == nil) return NULL;
        const char *utf8 = identifier.UTF8String;
        if (utf8 == NULL) return NULL;
        return strdup(utf8);
    }
}
