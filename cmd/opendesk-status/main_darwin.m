#import <Cocoa/Cocoa.h>
#include <errno.h>
#include <signal.h>
#include <stdlib.h>

@interface OpenDeskStatusController : NSObject
@property(nonatomic) pid_t parentPID;
@property(nonatomic, strong) NSStatusItem *statusItem;
@property(nonatomic, strong) NSURL *statusURL;
@property(nonatomic, strong) NSURL *schedulerURL;
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

void OpenDeskRunStatusItem(int parent_pid, const char *status_url, const char *scheduler_url, const char *icon_path) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];

        OpenDeskStatusController *controller = [OpenDeskStatusController new];
        controller.parentPID = (pid_t)parent_pid;
        controller.statusURL = [NSURL URLWithString:OpenDeskString(status_url, @"http://127.0.0.1:60844/status")];
        controller.schedulerURL = [NSURL URLWithString:OpenDeskString(scheduler_url, @"http://127.0.0.1:60844/scheduler")];

        controller.statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
        NSStatusBarButton *button = controller.statusItem.button;
        button.title = @"OpenDesk";
        button.toolTip = @"OpenDesk is running. Click for status, Scheduler, or Quit.";
        NSString *iconPath = OpenDeskString(icon_path, @"");
        NSImage *icon = [[NSImage alloc] initWithContentsOfFile:iconPath];
        if (icon != nil) {
            icon.size = NSMakeSize(18, 18);
            icon.template = NO;
            button.image = icon;
            button.imagePosition = NSImageLeft;
        }

        NSMenu *menu = [NSMenu new];
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
        [menu addItem:[NSMenuItem separatorItem]];
        NSMenuItem *quit = [[NSMenuItem alloc] initWithTitle:@"Quit OpenDesk" action:@selector(quitOpenDesk:) keyEquivalent:@"q"];
        quit.target = controller;
        [menu addItem:quit];
        controller.statusItem.menu = menu;

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
        alert.informativeText = OpenDeskString(message, @"The service could not start. Check whether port 60844 is already in use.");
        [alert addButtonWithTitle:@"OK"];
        [alert runModal];
    }
}
