//go:build darwin && cgo

#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <libproc.h>
#import <pthread.h>
#import "window_app_watch_darwin.h"

// One retained NSRunningApplication and AX application per subscription. Never
// touch NSWorkspace, the system-wide AX element, or a desktop window catalog.
struct ODAppWindowWatch {
    pthread_t thread;
    pthread_mutex_t mutex;
    pthread_cond_t readyCondition;
    BOOL ready, closing, refresh;
    int pid, error, active, statuses[13];
    char *path;
    struct proc_bsdinfo identity;
    uint32_t pending;
    CFRunLoopRef loop;
};

static void ODHint(ODAppWindowWatch *watch, uint32_t reason) {
    pthread_mutex_lock(&watch->mutex);
    if (!watch->closing) {
        watch->pending |= reason;
        if (reason == 128u) watch->active = -1;
    }
    pthread_mutex_unlock(&watch->mutex);
}

@interface ODAppWindowKVO : NSObject
@property(nonatomic, assign) ODAppWindowWatch *watch;
@end
@implementation ODAppWindowKVO
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object
                       change:(NSDictionary *)change context:(void *)context {
    (void)object;
    // KVO can deliver on another thread. Serialize the raw context handoff with
    // teardown so no in-flight callback can outlive the native allocation.
    @synchronized(self) {
    if (!self.watch || context != self.watch) return;
    // Hint only: no AX query, JS, or foreground qualification in KVO delivery.
    ODAppWindowWatch *watch = self.watch;
    if ([keyPath isEqualToString:@"active"]) {
        NSNumber *value = change[NSKeyValueChangeNewKey];
        pthread_mutex_lock(&watch->mutex);
        if (!watch->closing) {
            watch->refresh = YES;
            watch->active = [value isKindOfClass:[NSNumber class]] ? (value.boolValue ? 1 : 0) : -1;
            watch->pending |= 2u;
            if (watch->active >= 0) watch->pending |= watch->active ? 512u : 1024u;
        }
        pthread_mutex_unlock(&watch->mutex);
    } else ODHint(watch, 4u);
    }
}
@end

static const CFStringRef ODAppNotifications[] = {
    CFSTR("AXFocusedWindowChanged"), CFSTR("AXWindowCreated"), CFSTR("AXMainWindowChanged"),
    CFSTR("AXFocusedUIElementChanged"), CFSTR("AXLayoutChanged")
};
static const CFStringRef ODActivationNotifications[] = {
    CFSTR("AXApplicationActivated"), CFSTR("AXApplicationDeactivated")
};
static const CFStringRef ODWindowNotifications[] = {
    CFSTR("AXMoved"), CFSTR("AXResized"), CFSTR("AXUIElementDestroyed")
};

static void ODAXHint(AXObserverRef observer, AXUIElementRef element,
                     CFStringRef notification, void *context) {
    (void)observer; (void)element;
    ODAppWindowWatch *watch = context;
    uint32_t reason = 8u;
    if (CFEqual(notification, ODAppNotifications[1])) reason = 8192u;
    else if (CFEqual(notification, ODAppNotifications[2])) reason = 16384u;
    else if (CFEqual(notification, ODAppNotifications[3])) reason = 2048u;
    else if (CFEqual(notification, ODAppNotifications[4])) reason = 4096u;
    if (CFEqual(notification, ODWindowNotifications[0])) reason = 16u;
    else if (CFEqual(notification, ODWindowNotifications[1])) reason = 32u;
    else if (CFEqual(notification, ODWindowNotifications[2])) reason = 64u;
    pthread_mutex_lock(&watch->mutex);
    if (!watch->closing) {
        if (CFEqual(notification, ODActivationNotifications[0]) || CFEqual(notification, ODActivationNotifications[1])) {
            BOOL active = CFEqual(notification, ODActivationNotifications[0]);
            watch->active = active ? 1 : 0;
            reason = 2u | (active ? 512u : 1024u);
            watch->refresh = YES;
        }
        watch->pending |= reason;
        // Rebinding is deferred to the RunLoop timer, never inside AX callback.
        if (reason == 8u || reason == 64u || reason == 8192u || reason == 16384u) watch->refresh = YES;
    }
    pthread_mutex_unlock(&watch->mutex);
}

static BOOL ODIdentityMatches(ODAppWindowWatch *watch) {
    char path[PROC_PIDPATHINFO_MAXSIZE];
    struct proc_bsdinfo current = {0};
    return proc_pidpath(watch->pid, path, sizeof(path)) > 0 &&
        strcmp(path, watch->path) == 0 &&
        proc_pidinfo(watch->pid, PROC_PIDTBSDINFO, 0, &current, sizeof(current)) == sizeof(current) &&
        current.pbi_start_tvsec == watch->identity.pbi_start_tvsec &&
        current.pbi_start_tvusec == watch->identity.pbi_start_tvusec;
}

static BOOL ODCanObserveAX(ODAppWindowWatch *watch) {
    pthread_mutex_lock(&watch->mutex);
    BOOL allowed = !watch->closing && watch->active == 1;
    pthread_mutex_unlock(&watch->mutex);
    return allowed;
}

// Leave activation-only subscriptions intact when the target becomes inactive.
static void ODDetachAXDetails(AXObserverRef observer, AXUIElementRef application, AXUIElementRef *focused) {
    if (observer) {
        if (*focused) for (int i = 0; i < 3; i++)
            AXObserverRemoveNotification(observer, *focused, ODWindowNotifications[i]);
        if (application) for (int i = 0; i < 5; i++)
            AXObserverRemoveNotification(observer, application, ODAppNotifications[i]);
    }
    if (*focused) { CFRelease(*focused); *focused = NULL; }
}

static void ODDetachAX(AXObserverRef *observer, AXUIElementRef *application, AXUIElementRef *focused) {
    ODDetachAXDetails(*observer, *application, focused);
    if (*observer) {
        CFRunLoopRemoveSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(*observer), kCFRunLoopDefaultMode);
        if (*application) for (int i = 0; i < 2; i++)
            AXObserverRemoveNotification(*observer, *application, ODActivationNotifications[i]);
        CFRelease(*observer); *observer = NULL;
    }
    if (*application) { CFRelease(*application); *application = NULL; }
}

static void ODPublishAXStatuses(ODAppWindowWatch *watch, const int *statuses) {
    pthread_mutex_lock(&watch->mutex);
    if (memcmp(&watch->statuses[2], statuses, 11 * sizeof(int)) != 0) {
        memcpy(&watch->statuses[2], statuses, 11 * sizeof(int));
        if (!watch->closing) watch->pending |= 256u;
    }
    pthread_mutex_unlock(&watch->mutex);
}

static void *ODWatchThread(void *context) {
    ODAppWindowWatch *watch = context;
    @autoreleasepool {
        NSRunningApplication *app = [NSRunningApplication runningApplicationWithProcessIdentifier:watch->pid];
        ODAppWindowKVO *kvo = [ODAppWindowKVO new];
        kvo.watch = watch;
        BOOL activeObserved = NO, terminatedObserved = NO;
        __block AXObserverRef observer = NULL;
        __block AXUIElementRef application = NULL;
        __block AXUIElementRef focused = NULL;
        __block BOOL observerAttempted = NO, detailsAttached = NO;
        if (!app || !ODIdentityMatches(watch) || app.terminated) watch->error = 1;
        if (!watch->error) {
            @try {
                [app addObserver:kvo forKeyPath:@"active" options:NSKeyValueObservingOptionInitial | NSKeyValueObservingOptionNew context:watch];
                activeObserved = YES;
            } @catch (NSException *exception) { (void)exception; }
            @try {
                [app addObserver:kvo forKeyPath:@"terminated" options:0 context:watch];
                terminatedObserved = YES;
            } @catch (NSException *exception) { (void)exception; }
        }
        pthread_mutex_lock(&watch->mutex);
        watch->statuses[0] = activeObserved ? 0 : -1;
        watch->statuses[1] = terminatedObserved ? 0 : -1;
        watch->loop = CFRunLoopGetCurrent();
        CFRetain(watch->loop);
        watch->refresh = YES;
        watch->pending |= 1u;
        watch->ready = YES;
        pthread_cond_signal(&watch->readyCondition);
        pthread_mutex_unlock(&watch->mutex);

        // Startup never waits for AX. Inactive targets retain only per-PID
        // activation notifications; focused/tree reads and detail registrations
        // stay behind the active hint, which is never an input authorization.
        CFRunLoopTimerRef timer = CFRunLoopTimerCreateWithHandler(kCFAllocatorDefault,
            CFAbsoluteTimeGetCurrent(), 0.1, 0, 0, ^(CFRunLoopTimerRef timerRef) {
                (void)timerRef;
                pthread_mutex_lock(&watch->mutex);
                BOOL closing = watch->closing;
                BOOL refresh = watch->refresh;
                watch->refresh = NO;
                pthread_mutex_unlock(&watch->mutex);
                if (closing) { CFRunLoopStop(CFRunLoopGetCurrent()); return; }
                if (!ODIdentityMatches(watch)) {
                    ODHint(watch, 128u);
                    CFRunLoopStop(CFRunLoopGetCurrent());
                    return;
                }
                int statuses[11];
                pthread_mutex_lock(&watch->mutex);
                memcpy(statuses, &watch->statuses[2], sizeof(statuses));
                pthread_mutex_unlock(&watch->mutex);
                if (!observerAttempted) {
                    observerAttempted = YES;
                    statuses[0] = AXObserverCreate(watch->pid, ODAXHint, &observer);
                    if (observer) {
                        application = AXUIElementCreateApplication(watch->pid);
                        AXUIElementSetMessagingTimeout(application, 0.2f);
                        for (int i = 0; i < 2; i++)
                            statuses[9+i] = AXObserverAddNotification(observer, application, ODActivationNotifications[i], watch);
                        CFRunLoopAddSource(CFRunLoopGetCurrent(), AXObserverGetRunLoopSource(observer), kCFRunLoopDefaultMode);
                    }
                    refresh = YES;
                }
                if (!ODCanObserveAX(watch)) {
                    if (detailsAttached || focused) ODDetachAXDetails(observer, application, &focused);
                    detailsAttached = NO;
                    for (int i = 1; i < 9; i++) statuses[i] = -1;
                    ODPublishAXStatuses(watch, statuses);
                    return;
                }
                if (!refresh) return;
                if (observer && application && !detailsAttached) {
                    detailsAttached = YES;
                    for (int i = 0; i < 5 && ODCanObserveAX(watch); i++)
                        statuses[1+i] = AXObserverAddNotification(observer, application, ODAppNotifications[i], watch);
                }
                if (focused) {
                    for (int i = 0; i < 3; i++) AXObserverRemoveNotification(observer, focused, ODWindowNotifications[i]);
                    CFRelease(focused); focused = NULL;
                }
                for (int i = 6; i < 9; i++) statuses[i] = -1;
                if (observer && application && ODCanObserveAX(watch)) {
                    CFTypeRef value = NULL;
                    AXError err = AXUIElementCopyAttributeValue(application, kAXFocusedWindowAttribute, &value);
                    if (err == kAXErrorSuccess && value && CFGetTypeID(value) == AXUIElementGetTypeID() && ODCanObserveAX(watch)) {
                        pid_t owner = 0;
                        if (AXUIElementGetPid((AXUIElementRef)value, &owner) == kAXErrorSuccess && owner == watch->pid) {
                            focused = (AXUIElementRef)CFRetain(value);
                            AXUIElementSetMessagingTimeout(focused, 0.2f);
                            for (int i = 0; i < 3 && ODCanObserveAX(watch); i++)
                                statuses[6+i] = AXObserverAddNotification(observer, focused, ODWindowNotifications[i], watch);
                        }
                    } else if (err != kAXErrorSuccess) {
                        for (int i = 6; i < 9; i++) statuses[i] = err;
                    }
                    if (value) CFRelease(value);
                }
                if (!ODCanObserveAX(watch)) {
                    ODDetachAXDetails(observer, application, &focused);
                    detailsAttached = NO;
                    for (int i = 1; i < 9; i++) statuses[i] = -1;
                }
                ODPublishAXStatuses(watch, statuses);
            });
        CFRunLoopAddTimer(CFRunLoopGetCurrent(), timer, kCFRunLoopDefaultMode);
        if (!watch->error) CFRunLoopRun();
        CFRunLoopTimerInvalidate(timer);
        CFRelease(timer);
        if (activeObserved) [app removeObserver:kvo forKeyPath:@"active" context:watch];
        if (terminatedObserved) [app removeObserver:kvo forKeyPath:@"terminated" context:watch];
        @synchronized(kvo) { kvo.watch = NULL; }
        ODDetachAX(&observer, &application, &focused);
        // Keep watch/loop alive until stop joins, including after target exit.
    }
    return NULL;
}

ODAppWindowWatch *od_app_window_watch_start(int pid, const char *path, int *status) {
    *status = 3;
    ODAppWindowWatch *watch = calloc(1, sizeof(*watch));
    if (!watch) return NULL;
    watch->pid = pid;
    watch->path = strdup(path);
    if (!watch->path) { free(watch); return NULL; }
    char actual[PROC_PIDPATHINFO_MAXSIZE];
    if (proc_pidpath(pid, actual, sizeof(actual)) <= 0 ||
        proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &watch->identity, sizeof(watch->identity)) != sizeof(watch->identity)) {
        *status = 1; free(watch->path); free(watch); return NULL;
    }
    if (strcmp(actual, path) != 0) { *status = 2; free(watch->path); free(watch); return NULL; }
    watch->active = -1;
    for (int i = 0; i < 13; i++) watch->statuses[i] = -1;
    pthread_mutex_init(&watch->mutex, NULL);
    pthread_cond_init(&watch->readyCondition, NULL);
    if (pthread_create(&watch->thread, NULL, ODWatchThread, watch) != 0) {
        pthread_cond_destroy(&watch->readyCondition); pthread_mutex_destroy(&watch->mutex);
        free(watch->path); free(watch); return NULL;
    }
    pthread_mutex_lock(&watch->mutex);
    while (!watch->ready) pthread_cond_wait(&watch->readyCondition, &watch->mutex);
    *status = watch->error;
    pthread_mutex_unlock(&watch->mutex);
    if (*status) { od_app_window_watch_stop(watch); return NULL; }
    return watch;
}

uint32_t od_app_window_watch_take(ODAppWindowWatch *watch, int *statuses, int *active) {
    pthread_mutex_lock(&watch->mutex);
    uint32_t pending = watch->pending;
    watch->pending = 0;
    *active = watch->active;
    memcpy(statuses, watch->statuses, sizeof(watch->statuses));
    pthread_mutex_unlock(&watch->mutex);
    return pending;
}

void od_app_window_watch_stop(ODAppWindowWatch *watch) {
    pthread_mutex_lock(&watch->mutex);
    watch->closing = YES;
    CFRunLoopRef loop = watch->loop;
    pthread_mutex_unlock(&watch->mutex);
    if (loop) { CFRunLoopStop(loop); CFRunLoopWakeUp(loop); }
    pthread_join(watch->thread, NULL);
    if (loop) CFRelease(loop);
    pthread_cond_destroy(&watch->readyCondition);
    pthread_mutex_destroy(&watch->mutex);
    free(watch->path);
    free(watch);
}
