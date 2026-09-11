#import <Cocoa/Cocoa.h>
#include <errno.h>
#include <signal.h>
#include <stdlib.h>

@interface OpenDeskStatusController : NSObject <NSMenuDelegate>
@property(nonatomic) pid_t parentPID;
@property(nonatomic, strong) NSStatusItem *statusItem;
@property(nonatomic, strong) NSURL *statusURL;
@property(nonatomic, strong) NSURL *schedulerURL;
@property(nonatomic, strong) NSURL *inspectorURL;
@property(nonatomic, strong) NSURL *inspectorControlURL;
@property(nonatomic, copy) NSString *inspectorControlToken;
@property(nonatomic, strong) NSMenuItem *allowInspectorLANItem;
@property(nonatomic, strong) NSMenuItem *inspectorLANCopyItem;
@property(nonatomic, copy) NSString *inspectorLANURL;
@end

@implementation OpenDeskStatusController

- (void)openURL:(NSMenuItem *)sender {
    NSURL *url = sender.representedObject;
    if (url != nil) {
        [[NSWorkspace sharedWorkspace] openURL:url];
    }
}

- (void)quitOpenDesk:(id)sender {
    if (self.parentPID > 0) {
        kill(self.parentPID, SIGTERM);
    }
    [NSApp terminate:nil];
}

- (NSDictionary *)inspectorControlWithMethod:(NSString *)method allowLAN:(NSNumber *)allowLAN error:(NSError **)error {
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:self.inspectorControlURL
                                                           cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                                       timeoutInterval:2.0];
    request.HTTPMethod = method;
    [request setValue:self.inspectorControlToken forHTTPHeaderField:@"X-OpenDesk-Inspector-Control"];
    if (allowLAN != nil) {
        request.HTTPBody = [NSJSONSerialization dataWithJSONObject:@{ @"allow": allowLAN } options:0 error:error];
        if (request.HTTPBody == nil) return nil;
        [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    }
    NSURLResponse *rawResponse = nil;
    NSData *data = [NSURLConnection sendSynchronousRequest:request returningResponse:&rawResponse error:error];
    NSHTTPURLResponse *response = (NSHTTPURLResponse *)rawResponse;
    if (data == nil || ![response isKindOfClass:[NSHTTPURLResponse class]] || response.statusCode != 200) {
        if (error != NULL && *error == nil) {
            *error = [NSError errorWithDomain:@"OpenDeskInspectorControl" code:response.statusCode
                                     userInfo:@{NSLocalizedDescriptionKey: @"OpenDesk rejected the local Inspector control request."}];
        }
        return nil;
    }
    NSDictionary *envelope = [NSJSONSerialization JSONObjectWithData:data options:0 error:error];
    if (![envelope isKindOfClass:[NSDictionary class]] || [envelope[@"code"] integerValue] != 0 ||
        ![envelope[@"data"] isKindOfClass:[NSDictionary class]]) {
        if (error != NULL && *error == nil) {
            *error = [NSError errorWithDomain:@"OpenDeskInspectorControl" code:-1
                                     userInfo:@{NSLocalizedDescriptionKey: @"OpenDesk returned an invalid Inspector control response."}];
        }
        return nil;
    }
    return envelope[@"data"];
}

- (void)applyInspectorStatus:(NSDictionary *)status {
    self.allowInspectorLANItem.state = [status[@"allowLAN"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff;
    NSString *lanURL = [status[@"lanUrl"] isKindOfClass:[NSString class]] ? status[@"lanUrl"] : @"";
    self.inspectorLANURL = lanURL;
    self.inspectorLANCopyItem.enabled = lanURL.length > 0;
}

- (void)refreshInspectorStatus {
    if (self.inspectorControlToken.length == 0 || self.inspectorControlURL == nil) return;
    NSError *error = nil;
    NSDictionary *status = [self inspectorControlWithMethod:@"GET" allowLAN:nil error:&error];
    if (status != nil) [self applyInspectorStatus:status];
}

- (void)menuWillOpen:(NSMenu *)menu {
    [self refreshInspectorStatus];
}

- (void)toggleInspectorLAN:(NSMenuItem *)sender {
    BOOL allow = sender.state != NSControlStateValueOn;
    NSError *error = nil;
    NSDictionary *status = [self inspectorControlWithMethod:@"POST" allowLAN:@(allow) error:&error];
    if (status != nil) {
        [self applyInspectorStatus:status];
        return;
    }
    NSAlert *alert = [NSAlert new];
    alert.alertStyle = NSAlertStyleWarning;
    alert.messageText = @"Inspector LAN setting was not changed";
    alert.informativeText = error.localizedDescription ?: @"The local OpenDesk control request failed.";
    [alert runModal];
}

- (void)copyInspectorLANURL:(id)sender {
    [self refreshInspectorStatus];
    if (self.inspectorLANURL.length == 0) return;
    NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
    [pasteboard clearContents];
    [pasteboard setString:self.inspectorLANURL forType:NSPasteboardTypeString];
}

- (void)checkParent:(NSTimer *)timer {
    if (self.parentPID <= 0 || (kill(self.parentPID, 0) != 0 && errno == ESRCH)) {
        [NSApp terminate:nil];
    }
}

@end

static NSString *OpenDeskString(const char *value, NSString *fallback) {
    if (value == NULL) return fallback;
    NSString *result = [NSString stringWithUTF8String:value];
    return result ?: fallback;
}

void OpenDeskRunStatusItem(int parent_pid, const char *status_url, const char *scheduler_url, const char *icon_path,
                           const char *inspector_url, const char *inspector_control_url, const char *inspector_control_token) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];

        OpenDeskStatusController *controller = [OpenDeskStatusController new];
        controller.parentPID = (pid_t)parent_pid;
        // Endpoint URLs are runtime state supplied by the parent. The helper
        // deliberately has no fixed-port fallback and never scans localhost.
        controller.statusURL = [NSURL URLWithString:OpenDeskString(status_url, @"")];
        controller.schedulerURL = [NSURL URLWithString:OpenDeskString(scheduler_url, @"")];
        controller.inspectorURL = [NSURL URLWithString:OpenDeskString(inspector_url, @"")];
        controller.inspectorControlURL = [NSURL URLWithString:OpenDeskString(inspector_control_url, @"")];
        controller.inspectorControlToken = OpenDeskString(inspector_control_token, @"");

        controller.statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
        NSStatusBarButton *button = controller.statusItem.button;
        // Keep the menu bar compact: the app icon is the sole visible status
        // item. Keep a text alternative for hover and VoiceOver.
        button.title = @"";
        button.toolTip = @"OpenDesk is running. Click for Status, Scheduler, Developer tools, or Quit.";
        button.accessibilityLabel = @"OpenDesk";
        NSString *iconPath = OpenDeskString(icon_path, @"");
        NSImage *icon = [[NSImage alloc] initWithContentsOfFile:iconPath];
        if (icon != nil) {
            icon.size = NSMakeSize(18, 18);
            icon.template = NO;
            button.image = icon;
            button.imagePosition = NSImageOnly;
        }

        NSMenu *menu = [NSMenu new];
        menu.delegate = controller;
        NSMenuItem *ready = [[NSMenuItem alloc] initWithTitle:@"OpenDesk is running" action:nil keyEquivalent:@""];
        ready.enabled = NO;
        [menu addItem:ready];
        [menu addItem:[NSMenuItem separatorItem]];
        NSMenuItem *status = [[NSMenuItem alloc] initWithTitle:@"Open Status" action:@selector(openURL:) keyEquivalent:@""];
        status.target = controller;
        status.representedObject = controller.statusURL;
        [menu addItem:status];
        NSMenuItem *scheduler = [[NSMenuItem alloc] initWithTitle:@"Open Scheduler" action:@selector(openURL:) keyEquivalent:@""];
        scheduler.target = controller;
        scheduler.representedObject = controller.schedulerURL;
        [menu addItem:scheduler];

        // The local Inspector follows the actual Runtime endpoint and remains
        // available on loopback-only auto allocation. LAN controls are only
        // shown when the parent explicitly provisioned the per-session token.
        NSMenu *developerMenu = [NSMenu new];
        NSMenuItem *openInspector = [[NSMenuItem alloc] initWithTitle:@"Open Inspector" action:@selector(openURL:) keyEquivalent:@""];
        openInspector.target = controller;
        openInspector.representedObject = controller.inspectorURL;
        [developerMenu addItem:openInspector];
        if (controller.inspectorControlToken.length > 0) {
            controller.allowInspectorLANItem = [[NSMenuItem alloc] initWithTitle:@"Allow Inspector from LAN" action:@selector(toggleInspectorLAN:) keyEquivalent:@""];
            controller.allowInspectorLANItem.target = controller;
            controller.allowInspectorLANItem.state = NSControlStateValueOff;
            [developerMenu addItem:controller.allowInspectorLANItem];
            controller.inspectorLANCopyItem = [[NSMenuItem alloc] initWithTitle:@"Copy Inspector LAN URL" action:@selector(copyInspectorLANURL:) keyEquivalent:@""];
            controller.inspectorLANCopyItem.target = controller;
            controller.inspectorLANCopyItem.enabled = NO;
            [developerMenu addItem:controller.inspectorLANCopyItem];
        }
        NSMenuItem *developer = [[NSMenuItem alloc] initWithTitle:@"Developer" action:nil keyEquivalent:@""];
        developer.submenu = developerMenu;
        [menu addItem:developer];

        [menu addItem:[NSMenuItem separatorItem]];
        NSMenuItem *quit = [[NSMenuItem alloc] initWithTitle:@"Quit OpenDesk" action:@selector(quitOpenDesk:) keyEquivalent:@"q"];
        quit.target = controller;
        [menu addItem:quit];
        controller.statusItem.menu = menu;

        [controller refreshInspectorStatus];

        [NSTimer scheduledTimerWithTimeInterval:1.0 target:controller selector:@selector(checkParent:) userInfo:nil repeats:YES];
        [NSApp run];
    }
}

void OpenDeskShowStartupError(const char *message) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        NSAlert *alert = [NSAlert new];
        alert.alertStyle = NSAlertStyleCritical;
        alert.messageText = @"OpenDesk did not start";
        alert.informativeText = OpenDeskString(message, @"The service could not start. Check the OpenDesk startup error for details.");
        [alert addButtonWithTitle:@"OK"];
        [alert runModal];
    }
}
