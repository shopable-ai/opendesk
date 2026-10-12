#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CGWindowLevel.h>
#import <UserNotifications/UserNotifications.h>
#include <math.h>

extern void RCGoAction(char *name, char *value);

static const CGFloat RCScreenCardWidth = 386;
static const CGFloat RCScreenCardHeight = 260;
static const CGFloat RCSettingsWidth = 520;
static const CGFloat RCSettingsBaseHeight = 534;
static const CGFloat RCSettingsExpandedHeight = 660;
static const CGFloat RCDetailsHeight = 588;

static NSColor *RCColor(CGFloat red, CGFloat green, CGFloat blue) {
    return [NSColor colorWithCalibratedRed:red green:green blue:blue alpha:1.0];
}
static NSRect RCTopRect(CGFloat contentHeight, CGFloat x, CGFloat top, CGFloat width, CGFloat height) {
    return NSMakeRect(x, contentHeight - top - height, width, height);
}
static NSString *RCString(NSDictionary *data, NSString *key) {
    id value = data[key];
    return [value isKindOfClass:[NSString class]] ? value : @"";
}
static BOOL RCBool(NSDictionary *data, NSString *key) { return [data[key] boolValue]; }
static void RCSetString(NSTextField *field, NSString *value) {
    NSString *safe = value ?: @"";
    if (![field.stringValue isEqualToString:safe]) field.stringValue = safe;
}
static NSTextField *RCText(NSView *parent, NSRect frame, CGFloat fontSize, NSFontWeight weight,
                           NSColor *color, BOOL wraps, NSTextAlignment align) {
    NSTextField *field = [[NSTextField alloc] initWithFrame:frame];
    field.editable = NO;
    field.bezeled = NO;
    field.drawsBackground = NO;
    field.selectable = NO;
    field.font = [NSFont systemFontOfSize:fontSize weight:weight];
    field.textColor = color;
    field.alignment = align;
    field.lineBreakMode = wraps ? NSLineBreakByWordWrapping : NSLineBreakByTruncatingTail;
    field.maximumNumberOfLines = wraps ? 2 : 1;
    [parent addSubview:field];
    return field;
}
static NSTextField *RCSettingsText(NSView *parent, CGFloat top, CGFloat x, CGFloat width,
                                  NSString *value, CGFloat font, BOOL strong) {
    NSTextField *field = RCText(parent, RCTopRect(RCSettingsBaseHeight, x, top, width, 20),
                                font, strong ? NSFontWeightSemibold : NSFontWeightRegular,
                                NSColor.labelColor, NO, NSTextAlignmentLeft);
    field.stringValue = value;
    return field;
}
static NSButton *RCSettingsButton(NSView *parent, CGFloat top, CGFloat x, CGFloat width,
                                  NSString *text, SEL selector, id target) {
    NSButton *button = [[NSButton alloc] initWithFrame:RCTopRect(RCSettingsBaseHeight,x,top,width,29)];
    button.title = text;
    button.bezelStyle = NSBezelStyleRounded;
    button.target = target;
    button.action = selector;
    [parent addSubview:button];
    return button;
}
static NSButton *RCSettingsCheckbox(NSView *parent, CGFloat top, CGFloat x, CGFloat width,
                                    NSString *text, NSString *command, id target) {
    NSButton *button = [[NSButton alloc] initWithFrame:RCTopRect(RCSettingsBaseHeight,x,top,width,22)];
    button.buttonType = NSButtonTypeSwitch;
    button.title = text;
    button.font = [NSFont systemFontOfSize:12];
    button.identifier = command;
    button.target = target;
    button.action = @selector(toggleSetting:);
    [parent addSubview:button];
    return button;
}

@interface RCCardView : NSView
@end
@implementation RCCardView
- (BOOL)mouseDownCanMoveWindow { return YES; }
@end

@interface RCController : NSObject <NSApplicationDelegate, NSWindowDelegate>
@property (strong) NSPanel *card;
@property (strong) NSWindow *settings;
@property (strong) NSWindow *details;
@property (strong) NSTextField *detailsHistory;
@property (strong) NSTextField *detailsNews;
@property (strong) NSTextField *detailsResources;
@property (strong) NSTextField *detailsMembership;
@property (strong) NSButton *detailsSourceButton;
@property (strong) NSArray<NSButton *> *newsButtons;
@property (strong) NSArray<NSButton *> *resourceButtons;
@property (strong) NSButton *mockPayButton;
@property (strong) NSButton *mockRefundButton;
@property (copy) NSDictionary *lastPayload;
@property (strong) NSStatusItem *tray;
@property (strong) NSView *badgeBackground;
@property (strong) NSTextField *badgeLabel;
@property (strong) NSTextField *clockLabel;
@property (strong) NSTextField *dateLabel;
@property (strong) NSTextField *hintLabel;
@property (strong) NSTextField *valueLabel;
@property (strong) NSTextField *summaryLabel;
@property (strong) NSTextField *metaLabel;
@property (strong) NSTextField *footLabel;
@property (strong) NSTextField *feedField;
@property (strong) NSTextField *requestValue;
@property (strong) NSTextField *sourceValue;
@property (strong) NSTextField *changedValue;
@property (strong) NSTextField *sourceStatus;
@property (strong) NSTextField *diagnostics;
@property (strong) NSButton *sourceButton;
@property (strong) NSButton *quietSwitch;
@property (strong) NSButton *advanceSwitch;
@property (strong) NSButton *showSwitch;
@property (strong) NSButton *lockSwitch;
@property (strong) NSButton *clockSwitch;
@property (strong) NSButton *advancedButton;
@property (copy) NSString *sourceURL;
@property BOOL shown;
@property BOOL locked;
@property BOOL demo;
@property BOOL advancedShown;
@end

static RCController *controller;

@implementation RCController
- (void)applicationDidFinishLaunching:(NSNotification *)note {
    self.card = [[NSPanel alloc] initWithContentRect:NSMakeRect(70,70,RCScreenCardWidth,RCScreenCardHeight)
          styleMask:NSWindowStyleMaskNonactivatingPanel | NSWindowStyleMaskBorderless
          backing:NSBackingStoreBuffered defer:NO];
    self.card.level = CGWindowLevelForKey(kCGDesktopIconWindowLevelKey) + 1;
    self.card.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces |
        NSWindowCollectionBehaviorStationary | NSWindowCollectionBehaviorIgnoresCycle;
    self.card.opaque = NO;
    self.card.backgroundColor = [NSColor clearColor];
    self.card.hasShadow = NO;
    self.card.hidesOnDeactivate = NO;
    self.card.delegate = self;
    RCCardView *background = [[RCCardView alloc] initWithFrame:NSMakeRect(0,0,RCScreenCardWidth,RCScreenCardHeight)];
    background.wantsLayer = YES;
    background.layer.backgroundColor = [NSColor colorWithCalibratedRed:.105 green:.151 blue:.213 alpha:.965].CGColor;
    background.layer.cornerRadius = 17;
    self.card.contentView = background;

    NSTextField *brand = RCText(background, RCTopRect(RCScreenCardHeight,18,16,185,22),13,
                                NSFontWeightSemibold,NSColor.whiteColor,NO,NSTextAlignmentLeft);
    brand.stringValue = @"◷  Reset Clock";
    self.clockLabel = RCText(background, RCTopRect(RCScreenCardHeight,215,13,153,27),19,
                             NSFontWeightSemibold,NSColor.whiteColor,NO,NSTextAlignmentRight);
    self.dateLabel = RCText(background, RCTopRect(RCScreenCardHeight,182,41,186,15),10,
                            NSFontWeightRegular,RCColor(.69,.77,.86),NO,NSTextAlignmentRight);
    self.badgeBackground = [[NSView alloc] initWithFrame:RCTopRect(RCScreenCardHeight,18,63,210,23)];
    self.badgeBackground.wantsLayer = YES;
    self.badgeBackground.layer.cornerRadius = 7;
    [background addSubview:self.badgeBackground];
    self.badgeLabel = RCText(self.badgeBackground,NSMakeRect(8,3,196,17),11,
                             NSFontWeightMedium,NSColor.whiteColor,NO,NSTextAlignmentLeft);
    self.hintLabel = RCText(background,RCTopRect(RCScreenCardHeight,18,98,350,17),11,
                            NSFontWeightRegular,RCColor(.69,.77,.86),NO,NSTextAlignmentLeft);
    self.valueLabel = RCText(background,RCTopRect(RCScreenCardHeight,18,119,350,43),36,
                             NSFontWeightBold,NSColor.whiteColor,NO,NSTextAlignmentLeft);
    self.summaryLabel = RCText(background,RCTopRect(RCScreenCardHeight,18,173,350,31),12,
                               NSFontWeightMedium,RCColor(.94,.96,.98),YES,NSTextAlignmentLeft);
    self.metaLabel = RCText(background,RCTopRect(RCScreenCardHeight,18,210,350,16),10,
                            NSFontWeightRegular,RCColor(.71,.77,.84),NO,NSTextAlignmentLeft);
    NSView *divider = [[NSView alloc] initWithFrame:RCTopRect(RCScreenCardHeight,18,232,350,1)];
    divider.wantsLayer = YES;
    divider.layer.backgroundColor = [NSColor colorWithCalibratedWhite:1 alpha:.16].CGColor;
    [background addSubview:divider];
    self.footLabel = RCText(background,RCTopRect(RCScreenCardHeight,18,238,350,16),10,
                            NSFontWeightRegular,RCColor(.60,.85,.77),NO,NSTextAlignmentLeft);

    self.tray = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
    self.tray.button.title = @"◷";
    self.tray.button.toolTip = @"OpenDesk Reset Clock";
    self.shown = YES;
    self.locked = YES;
    self.card.ignoresMouseEvents = YES;
    [self makeMenu];
    [self.card orderFrontRegardless];
}

- (void)emit:(NSString *)name value:(NSString *)value {
    RCGoAction((char *)name.UTF8String,(char *)(value ?: @"").UTF8String);
}
- (NSMenuItem *)menuItem:(NSString *)label action:(NSString *)action {
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:label action:@selector(menuAction:) keyEquivalent:@""];
    item.representedObject = action;
    item.target = self;
    return item;
}
- (void)makeMenu {
    NSMenu *menu = [[NSMenu alloc] initWithTitle:@"Reset Clock"];
    [menu addItem:[self menuItem:@"查看公告与设置" action:@"settings"]];
    [menu addItem:[self menuItem:@"历史统计与三条动态" action:@"details"]];
    [menu addItem:[self menuItem:@"立即检查来源" action:@"refresh"]];
    [menu addItem:[self menuItem:@"打开原始公告" action:@"source"]];
    [menu addItem:[NSMenuItem separatorItem]];
    [menu addItem:[self menuItem:@"显示桌面卡片" action:@"show"]];
    [menu addItem:[self menuItem:@"锁定位置（点击穿透）" action:@"lock"]];
    [menu addItem:[self menuItem:@"免打扰" action:@"quiet"]];
    [menu addItem:[self menuItem:@"提前 10 分钟提醒" action:@"advance"]];
    [menu addItem:[self menuItem:@"24 小时制" action:@"clock"]];
    [menu addItem:[self menuItem:@"10 分钟后手动提醒" action:@"manual"]];
    [menu addItem:[NSMenuItem separatorItem]];
    if (self.demo) {
        for (int revision = 1; revision <= 3; revision++) {
            [menu addItem:[self menuItem:[NSString stringWithFormat:@"模拟公告 V%d",revision]
                                   action:[NSString stringWithFormat:@"demo_v%d",revision]]];
        }
        [menu addItem:[NSMenuItem separatorItem]];
    }
    [menu addItem:[self menuItem:@"启用系统通知权限" action:@"permission"]];
    [menu addItem:[NSMenuItem separatorItem]];
    [menu addItem:[self menuItem:@"退出" action:@"quit"]];
    self.tray.menu = menu;
}
- (void)syncMenu:(NSDictionary *)data {
    for (NSMenuItem *item in self.tray.menu.itemArray) {
        NSString *command = [item.representedObject isKindOfClass:NSString.class] ? item.representedObject : @"";
        if ([command isEqualToString:@"show"] || [command isEqualToString:@"lock"] ||
            [command isEqualToString:@"quiet"] || [command isEqualToString:@"advance"] ||
            [command isEqualToString:@"clock"]) {
            NSString *key = @{ @"show":@"show", @"lock":@"locked", @"quiet":@"quiet",
                                @"advance":@"advance_10", @"clock":@"clock_24" }[command];
            item.state = RCBool(data,key) ? NSControlStateValueOn : NSControlStateValueOff;
        }
        if ([command isEqualToString:@"source"]) item.enabled = self.sourceURL.length > 0;
    }
}
- (void)openSource {
    NSURL *url = [NSURL URLWithString:self.sourceURL];
    if ([[url.scheme lowercaseString] isEqualToString:@"https"] && url.host.length > 0 && !url.user)
        [[NSWorkspace sharedWorkspace] openURL:url];
}
- (void)menuAction:(NSMenuItem *)sender {
    NSString *command = sender.representedObject;
    if ([command isEqualToString:@"settings"]) { [self showSettings]; return; }
    if ([command isEqualToString:@"details"]) { [self showDetails]; return; }
    if ([command isEqualToString:@"source"]) { [self openSource]; return; }
    if ([command isEqualToString:@"permission"]) {
        [[UNUserNotificationCenter currentNotificationCenter]
          requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound)
                         completionHandler:^(BOOL granted, NSError *error) {}];
        return;
    }
    if ([command isEqualToString:@"quit"]) {
        [self emit:@"quit" value:@""];
        [NSApp terminate:nil];
        return;
    }
    [self emit:command value:@""];
}

- (void)showSettings {
    if (!self.settings) {
        self.settings = [[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,RCSettingsWidth,RCSettingsBaseHeight)
          styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable)
          backing:NSBackingStoreBuffered defer:NO];
        self.settings.title = @"Reset Clock · 设置";
        self.settings.delegate = self;
        self.settings.releasedWhenClosed = NO;
        NSView *content = self.settings.contentView;
        RCSettingsText(content,16,20,460,@"公告来源",13,YES);
        self.feedField = [[NSTextField alloc] initWithFrame:RCTopRect(RCSettingsBaseHeight,20,44,476,28)];
        self.feedField.placeholderString = @"https://可信来源/events.json";
        [content addSubview:self.feedField];
        RCSettingsButton(content,80,18,115,@"保存并刷新",@selector(saveFeed:),self);
        RCSettingsButton(content,80,143,98,@"立即刷新",@selector(refresh:),self);
        self.sourceButton = RCSettingsButton(content,80,252,127,@"打开原始公告",@selector(openSourceClick:),self);
        self.sourceButton.enabled = NO;
        RCSettingsText(content,130,20,470,@"提醒设置",13,YES);
        self.advanceSwitch = RCSettingsCheckbox(content,160,20,235,@"提前 10 分钟提醒",@"advance",self);
        self.quietSwitch = RCSettingsCheckbox(content,160,270,225,@"免打扰",@"quiet",self);
        RCSettingsButton(content,189,18,165,@"10 分钟后手动提醒",@selector(manual:),self);
        RCSettingsText(content,232,20,470,@"桌面显示",13,YES);
        self.showSwitch = RCSettingsCheckbox(content,261,20,235,@"显示桌面卡片",@"show",self);
        self.lockSwitch = RCSettingsCheckbox(content,261,270,230,@"锁定位置（点击穿透）",@"lock",self);
        self.clockSwitch = RCSettingsCheckbox(content,294,20,235,@"24 小时制",@"clock",self);
        RCSettingsText(content,341,20,470,@"来源状态",13,YES);
        RCSettingsText(content,368,20,200,@"本机最近检查",11,NO);
        self.requestValue = RCSettingsText(content,386,20,205,@"未知",12,YES);
        RCSettingsText(content,368,270,200,@"上游最近检查",11,NO);
        self.sourceValue = RCSettingsText(content,386,270,208,@"未知",12,YES);
        RCSettingsText(content,415,20,230,@"公告内容最近变化",11,NO);
        self.changedValue = RCSettingsText(content,433,20,205,@"未知",12,YES);
        RCSettingsText(content,415,270,210,@"当前来源状态",11,NO);
        self.sourceStatus = RCSettingsText(content,433,270,215,@"未知",11,YES);
        self.advancedButton = RCSettingsButton(content,472,18,140,@"高级诊断 ▸",@selector(toggleDiagnostics:),self);
        self.diagnostics = RCText(content,RCTopRect(RCSettingsBaseHeight,20,529,476,110),
                                  11,NSFontWeightRegular,NSColor.secondaryLabelColor,YES,NSTextAlignmentLeft);
        self.diagnostics.maximumNumberOfLines = 6;
        self.diagnostics.selectable = YES;
        self.diagnostics.hidden = YES;
        // Top-anchored layout: expanding the diagnostic area does not move the settings controls.
        for (NSView *subview in content.subviews) subview.autoresizingMask = NSViewMinYMargin;
        [self.settings center];
    }
    [self.settings makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}
- (void)showDetails {
    if (!self.details) {
        self.details = [[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,560,RCDetailsHeight)
            styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable)
            backing:NSBackingStoreBuffered defer:NO];
        self.details.title = @"Reset Clock · 历史与资讯（来源声明）";
        self.details.releasedWhenClosed = NO;
        self.details.delegate = self;
        NSView *content = self.details.contentView;
        NSTextField *heading = RCText(content,RCTopRect(RCDetailsHeight,18,18,515,24),15,
                                     NSFontWeightSemibold,NSColor.labelColor,NO,NSTextAlignmentLeft);
        heading.stringValue = @"最近 30 天 / 自然月 · 历史统计";
        self.detailsHistory = RCText(content,RCTopRect(RCDetailsHeight,18,49,520,115),12,
                                    NSFontWeightRegular,NSColor.labelColor,YES,NSTextAlignmentLeft);
        self.detailsHistory.maximumNumberOfLines = 7;
        self.detailsHistory.selectable = YES;
        self.detailsSourceButton = [[NSButton alloc] initWithFrame:RCTopRect(RCDetailsHeight,18,171,163,28)];
        self.detailsSourceButton.title = @"打开统计来源 ↗";
        self.detailsSourceButton.bezelStyle = NSBezelStyleRounded;
        self.detailsSourceButton.target = self;
        self.detailsSourceButton.action = @selector(openHistoryClick:);
        [content addSubview:self.detailsSourceButton];
        NSTextField *newsLabel = RCText(content,RCTopRect(RCDetailsHeight,18,213,520,23),15,
                                        NSFontWeightSemibold,NSColor.labelColor,NO,NSTextAlignmentLeft);
        newsLabel.stringValue = @"精选动态 · 来源标注不等于官方核验";
        self.detailsNews = RCText(content,RCTopRect(RCDetailsHeight,18,245,520,109),12,
                                  NSFontWeightRegular,NSColor.labelColor,YES,NSTextAlignmentLeft);
        self.detailsNews.maximumNumberOfLines = 8;
        self.detailsNews.selectable = YES;
        NSMutableArray *news = [NSMutableArray array];
        for (NSInteger i=0; i<3; i++) {
            NSButton *button = [[NSButton alloc] initWithFrame:RCTopRect(RCDetailsHeight,18+i*169,364,158,28)];
            button.title = [NSString stringWithFormat:@"打开动态 %ld ↗",(long)i+1];
            button.tag = i;
            button.bezelStyle = NSBezelStyleRounded;
            button.target = self;
            button.action = @selector(openNewsClick:);
            [content addSubview:button];
            [news addObject:button];
        }
        self.newsButtons = news;
        self.detailsResources = RCText(content,RCTopRect(RCDetailsHeight,18,410,520,20),12,
                                      NSFontWeightMedium,NSColor.secondaryLabelColor,NO,NSTextAlignmentLeft);
        NSMutableArray *resources = [NSMutableArray array];
        for (NSInteger i=0; i<2; i++) {
            NSButton *button = [[NSButton alloc] initWithFrame:RCTopRect(RCDetailsHeight,18+i*215,436,204,27)];
            button.title = i==0 ? @"Codex 官方资源 ↗" : @"API 开发指南 ↗";
            button.tag = i;
            button.target = self;
            button.action = @selector(openResourceClick:);
            button.bezelStyle = NSBezelStyleRounded;
            [content addSubview:button];
            [resources addObject:button];
        }
        self.resourceButtons = resources;
        self.detailsMembership = RCText(content,RCTopRect(RCDetailsHeight,18,485,520,22),12,
                                       NSFontWeightSemibold,NSColor.labelColor,NO,NSTextAlignmentLeft);
        self.mockPayButton = [[NSButton alloc] initWithFrame:RCTopRect(RCDetailsHeight,18,527,220,29)];
        self.mockPayButton.title = @"启用模拟 Pro · 不收费";
        self.mockPayButton.target = self;
        self.mockPayButton.action = @selector(mockPayClick:);
        [content addSubview:self.mockPayButton];
        self.mockRefundButton = [[NSButton alloc] initWithFrame:RCTopRect(RCDetailsHeight,245,527,138,29)];
        self.mockRefundButton.title = @"模拟退款 / 撤权";
        self.mockRefundButton.target = self;
        self.mockRefundButton.action = @selector(mockRefundClick:);
        [content addSubview:self.mockRefundButton];
        [self.details center];
    }
    [self syncDetails:self.lastPayload];
    [self.details makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}
- (void)openSafeDetailsURL:(NSString *)value {
    NSURL *url = [NSURL URLWithString:value ?: @""];
    if ([[url.scheme lowercaseString] isEqualToString:@"https"] && url.host.length>0 &&
        !url.user && !url.password && !url.fragment) {
        [[NSWorkspace sharedWorkspace] openURL:url];
    }
}
- (void)openHistoryClick:(id)sender {
    [self openSafeDetailsURL:RCString(self.lastPayload,@"history_source_url")];
}
- (void)openNewsClick:(NSButton *)sender {
    NSArray *urls = self.lastPayload[@"news_urls"];
    if ([urls isKindOfClass:NSArray.class] && sender.tag < urls.count &&
        [urls[sender.tag] isKindOfClass:NSString.class])
        [self openSafeDetailsURL:urls[sender.tag]];
}
- (void)openResourceClick:(NSButton *)sender {
    NSArray *urls = self.lastPayload[@"resource_urls"];
    if ([urls isKindOfClass:NSArray.class] && sender.tag < urls.count &&
        [urls[sender.tag] isKindOfClass:NSString.class])
        [self openSafeDetailsURL:urls[sender.tag]];
}
- (void)mockPayClick:(id)sender { if (self.demo) [self emit:@"mock_pay" value:@""]; }
- (void)mockRefundClick:(id)sender { if (self.demo) [self emit:@"mock_refund" value:@""]; }
- (void)syncDetails:(NSDictionary *)data {
    if (!self.details || !data) return;
    RCSetString(self.detailsHistory,RCString(data,@"details_history"));
    RCSetString(self.detailsNews,RCString(data,@"details_news"));
    RCSetString(self.detailsResources,RCString(data,@"details_resources"));
    RCSetString(self.detailsMembership,RCString(data,@"member_status"));
    self.detailsSourceButton.enabled = [RCString(data,@"history_source_url") hasPrefix:@"https://"];
    NSArray *news = [data[@"news_urls"] isKindOfClass:NSArray.class] ? data[@"news_urls"] : @[];
    for (NSInteger i=0; i<self.newsButtons.count; i++)
        self.newsButtons[i].enabled = i<news.count && [news[i] isKindOfClass:NSString.class] &&
                                      [news[i] hasPrefix:@"https://"];
    NSArray *links = [data[@"resource_urls"] isKindOfClass:NSArray.class] ? data[@"resource_urls"] : @[];
    for (NSInteger i=0; i<self.resourceButtons.count; i++)
        self.resourceButtons[i].enabled = i<links.count && [links[i] isKindOfClass:NSString.class] &&
                                           [links[i] hasPrefix:@"https://"];
    self.mockPayButton.hidden = !self.demo;
    self.mockRefundButton.hidden = !self.demo;
}

- (void)saveFeed:(id)sender { [self emit:@"url" value:self.feedField.stringValue]; }
- (void)refresh:(id)sender { [self emit:@"refresh" value:@""]; }
- (void)manual:(id)sender { [self emit:@"manual" value:@""]; }
- (void)openSourceClick:(id)sender { [self openSource]; }
- (void)toggleSetting:(NSButton *)sender { [self emit:sender.identifier value:@""]; }
- (void)toggleDiagnostics:(id)sender {
    self.advancedShown = !self.advancedShown;
    self.diagnostics.hidden = !self.advancedShown;
    self.advancedButton.title = self.advancedShown ? @"高级诊断 ▾" : @"高级诊断 ▸";
    [self.settings setContentSize:NSMakeSize(RCSettingsWidth,
                             self.advancedShown ? RCSettingsExpandedHeight : RCSettingsBaseHeight)];
}
- (BOOL)windowShouldClose:(NSWindow *)window {
    if (window == self.settings) { [self.settings orderOut:nil]; return NO; }
    if (window == self.details) { [self.details orderOut:nil]; return NO; }
    return YES;
}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return NO; }
- (void)windowDidMove:(NSNotification *)note {
    if (note.object != self.card || self.locked) return;
    NSPoint origin = self.card.frame.origin;
    [self emit:@"position" value:[NSString stringWithFormat:@"%d,%d",(int)origin.x,(int)origin.y]];
}
- (void)syncCheckboxes:(NSDictionary *)data {
    self.quietSwitch.state = RCBool(data,@"quiet") ? NSControlStateValueOn : NSControlStateValueOff;
    self.advanceSwitch.state = RCBool(data,@"advance_10") ? NSControlStateValueOn : NSControlStateValueOff;
    self.showSwitch.state = RCBool(data,@"show") ? NSControlStateValueOn : NSControlStateValueOff;
    self.lockSwitch.state = RCBool(data,@"locked") ? NSControlStateValueOn : NSControlStateValueOff;
    self.clockSwitch.state = RCBool(data,@"clock_24") ? NSControlStateValueOn : NSControlStateValueOff;
}
- (void)apply:(NSString *)json {
    NSData *bytes = [json dataUsingEncoding:NSUTF8StringEncoding];
    NSDictionary *data = [NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil];
    if (![data isKindOfClass:NSDictionary.class]) return;
    self.sourceURL = RCString(data,@"source_url");
    self.lastPayload = data;
    BOOL demo = RCBool(data,@"demo");
    if (demo != self.demo) { self.demo = demo; [self makeMenu]; }
    self.shown = RCBool(data,@"show");
    self.locked = RCBool(data,@"locked");
    self.card.ignoresMouseEvents = self.locked;
    [self.card setMovableByWindowBackground:!self.locked];
    [self syncMenu:data];
    RCSetString(self.clockLabel,RCString(data,@"local_time"));
    RCSetString(self.dateLabel,RCString(data,@"local_date"));
    NSString *kind = RCString(data,@"status_kind");
    NSColor *badgeColor = RCColor(.16,.33,.29);
    NSColor *badgeText = RCColor(.70,.96,.82);
    if ([kind isEqualToString:@"revised"] || [kind isEqualToString:@"stale"] ||
        [kind isEqualToString:@"error"]) {
        badgeColor = RCColor(.38,.29,.18); badgeText = RCColor(1,.84,.60);
    } else if ([kind isEqualToString:@"withdrawn"]) {
        badgeColor = RCColor(.39,.22,.27); badgeText = RCColor(1,.72,.76);
    } else if ([kind isEqualToString:@"empty"]) {
        badgeColor = RCColor(.25,.33,.43); badgeText = RCColor(.82,.89,.96);
    }
    NSString *badge = RCString(data,@"badge");
    RCSetString(self.badgeLabel,badge);
    self.badgeLabel.textColor = badgeText;
    self.badgeBackground.layer.backgroundColor = badgeColor.CGColor;
    CGFloat preferred = ceil([self.badgeLabel intrinsicContentSize].width) + 18;
    CGFloat width = MIN(350,MAX(90,preferred));
    self.badgeBackground.frame = RCTopRect(RCScreenCardHeight,18,63,width,23);
    self.badgeLabel.frame = NSMakeRect(8,3,width-16,17);
    RCSetString(self.hintLabel,RCString(data,@"card_hint"));
    BOOL upcoming = RCBool(data,@"has_upcoming");
    self.valueLabel.font = [NSFont systemFontOfSize:upcoming ? 36 : 20 weight:NSFontWeightBold];
    RCSetString(self.valueLabel,RCString(data,@"card_value"));
    RCSetString(self.summaryLabel,RCString(data,@"card_summary"));
    RCSetString(self.metaLabel,RCString(data,@"card_meta"));
    RCSetString(self.footLabel,RCString(data,@"card_foot"));
    self.footLabel.textColor = ([kind isEqualToString:@"error"] || [kind isEqualToString:@"stale"])
        ? RCColor(1,.79,.50) : RCColor(.66,.87,.79);
    if (self.settings) {
        if (!self.settings.isKeyWindow) RCSetString(self.feedField,RCString(data,@"feed_url"));
        RCSetString(self.requestValue,RCString(data,@"last_request"));
        RCSetString(self.sourceValue,RCString(data,@"last_checked"));
        RCSetString(self.changedValue,RCString(data,@"last_changed"));
        RCSetString(self.sourceStatus,RCString(data,@"health"));
        RCSetString(self.diagnostics,RCString(data,@"diagnostics"));
        self.sourceButton.enabled = [self.sourceURL hasPrefix:@"https://"];
        [self syncCheckboxes:data];
    }
    [self syncDetails:data];
    NSRect frame = self.card.frame;
    NSPoint origin = NSMakePoint([data[@"x"] doubleValue],[data[@"y"] doubleValue]);
    if (fabs(frame.origin.x-origin.x) > 1 || fabs(frame.origin.y-origin.y) > 1)
        [self.card setFrameOrigin:origin];
    if (self.shown) [self.card orderFrontRegardless]; else [self.card orderOut:nil];
}
@end

void RCAppRun(void) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        controller = [RCController new];
        [NSApp setDelegate:controller];
        [NSApp run];
        controller = nil;
    }
}
void RCAppStop(void) { dispatch_async(dispatch_get_main_queue(),^{[NSApp terminate:nil];}); }
void RCAppUpdate(const char *json) {
    if (!json) return;
    NSString *serialized = [NSString stringWithUTF8String:json];
    dispatch_async(dispatch_get_main_queue(),^{[controller apply:serialized];});
}
void RCAppNotify(const char *text) {
    if (!text) return;
    NSString *message = [NSString stringWithUTF8String:text];
    dispatch_async(dispatch_get_main_queue(),^{
        UNMutableNotificationContent *content = [UNMutableNotificationContent new];
        content.title = @"OpenDesk Reset Clock";
        content.body = message;
        content.sound = UNNotificationSound.defaultSound;
        UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:[NSUUID UUID].UUIDString
                                                                              content:content trigger:nil];
        [[UNUserNotificationCenter currentNotificationCenter]
          addNotificationRequest:request withCompletionHandler:^(NSError *error) {}];
    });
}
