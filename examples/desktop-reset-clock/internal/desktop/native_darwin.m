#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CGWindowLevel.h>
#import <UserNotifications/UserNotifications.h>
#include <stdio.h>
extern void RCGoAction(char *name, char *value);

@interface RCCard : NSView
@end
@implementation RCCard
- (BOOL)mouseDownCanMoveWindow { return YES; }
@end

@interface RCController : NSObject <NSApplicationDelegate,NSWindowDelegate>
@property NSPanel *card;
@property NSWindow *settings;
@property NSTextField *cardLabel;
@property NSTextField *feedField;
@property NSTextField *diagnostics;
@property NSStatusItem *tray;
@property NSString *sourceURL;
@property BOOL shown;
@property BOOL locked;
@property BOOL demo;
@end
static RCController *controller;
static NSString *str(NSDictionary *d,NSString *key) {id o=d[key];return [o isKindOfClass:[NSString class]]?o:@"";}
static NSTextField *label(NSView *parent,NSRect r,NSString *value,CGFloat font,BOOL wraps){
 NSTextField *f=[[NSTextField alloc]initWithFrame:r];f.stringValue=value?:@"";f.editable=NO;f.bezeled=NO;f.drawsBackground=NO;f.selectable=NO;f.textColor=[NSColor whiteColor];f.font=[NSFont systemFontOfSize:font weight:NSFontWeightRegular];f.lineBreakMode=wraps?NSLineBreakByWordWrapping:NSLineBreakByTruncatingTail;f.maximumNumberOfLines=wraps?5:1;[parent addSubview:f];return f;
}
@implementation RCController
- (void)applicationDidFinishLaunching:(NSNotification *)note {
 self.card=[[NSPanel alloc]initWithContentRect:NSMakeRect(70,70,350,215) styleMask:(NSWindowStyleMaskNonactivatingPanel|NSWindowStyleMaskBorderless) backing:NSBackingStoreBuffered defer:NO];
 self.card.level=CGWindowLevelForKey(kCGDesktopIconWindowLevelKey)+1;
 self.card.collectionBehavior=NSWindowCollectionBehaviorCanJoinAllSpaces|NSWindowCollectionBehaviorStationary|NSWindowCollectionBehaviorIgnoresCycle;
 self.card.opaque=NO;self.card.backgroundColor=[NSColor clearColor];self.card.hasShadow=NO;self.card.hidesOnDeactivate=NO;self.card.delegate=self;
 RCCard *bg=[[RCCard alloc]initWithFrame:NSMakeRect(0,0,350,215)];bg.wantsLayer=YES;bg.layer.backgroundColor=[[NSColor colorWithCalibratedRed:.09 green:.12 blue:.17 alpha:.90]CGColor];bg.layer.cornerRadius=14;self.card.contentView=bg;
 self.cardLabel=label(bg,NSMakeRect(18,14,315,185),@"Reset Clock · 正在加载...",14,YES);
 self.tray=[[NSStatusBar systemStatusBar]statusItemWithLength:NSVariableStatusItemLength];self.tray.button.title=@"◷";self.tray.button.toolTip=@"OpenDesk Reset Clock";
 [self makeMenu];self.shown=YES;self.locked=YES;self.card.ignoresMouseEvents=YES;[self.card orderFrontRegardless];
}
- (void)makeMenu {
 NSMenu *menu=[[NSMenu alloc]initWithTitle:@"Reset Clock"];
 NSArray *items=@[@[@"查看公告 / 设置",@"settings"],@[@"立即刷新",@"refresh"],@[@"显示 / 隐藏桌面卡片",@"show"],@[@"编辑 / 锁定位置",@"lock"],@[@"12 / 24 小时制",@"clock"],@[@"免打扰开关",@"quiet"],@[@"提前10分钟提醒开关",@"advance"],@[@"10分钟后手动提醒",@"manual"],@[@"打开原始公告",@"source"]];
 for(NSArray *i in items){NSMenuItem *it=[[NSMenuItem alloc]initWithTitle:i[0] action:@selector(menuAction:) keyEquivalent:@""];it.representedObject=i[1];it.target=self;[menu addItem:it];}
 [menu addItem:[NSMenuItem separatorItem]];
 if(self.demo){for(int v=1;v<=3;v++){NSMenuItem *it=[[NSMenuItem alloc]initWithTitle:[NSString stringWithFormat:@"模拟公告 V%d",v] action:@selector(menuAction:) keyEquivalent:@""];it.representedObject=[NSString stringWithFormat:@"demo_v%d",v];it.target=self;[menu addItem:it];} [menu addItem:[NSMenuItem separatorItem]];}
 NSMenuItem *permission=[[NSMenuItem alloc]initWithTitle:@"启用系统通知权限" action:@selector(menuAction:) keyEquivalent:@""];permission.representedObject=@"permission";permission.target=self;[menu addItem:permission];
 [menu addItem:[NSMenuItem separatorItem]];NSMenuItem *quit=[[NSMenuItem alloc]initWithTitle:@"退出" action:@selector(menuAction:) keyEquivalent:@""];quit.representedObject=@"quit";quit.target=self;[menu addItem:quit];self.tray.menu=menu;
}
- (void)emit:(NSString *)name value:(NSString *)value {RCGoAction((char*)name.UTF8String,(char*)(value?:@"").UTF8String);}
- (void)menuAction:(NSMenuItem*)item {
 NSString *cmd=item.representedObject;
 if([cmd isEqualToString:@"settings"]){[self showSettings];return;}
 if([cmd isEqualToString:@"source"]){NSURL *u=[NSURL URLWithString:self.sourceURL];if([u.scheme isEqualToString:@"https"])[[NSWorkspace sharedWorkspace]openURL:u];return;}
 if([cmd isEqualToString:@"permission"]){[[UNUserNotificationCenter currentNotificationCenter] requestAuthorizationWithOptions:(UNAuthorizationOptionAlert|UNAuthorizationOptionSound) completionHandler:^(BOOL granted,NSError *error){}];return;}
 if([cmd isEqualToString:@"quit"]){[self emit:cmd value:@""];[NSApp terminate:nil];return;}
 [self emit:cmd value:@""];
}
- (void)showSettings {
 if(!self.settings){
  self.settings=[[NSWindow alloc]initWithContentRect:NSMakeRect(0,0,480,290) styleMask:(NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable) backing:NSBackingStoreBuffered defer:NO];self.settings.title=@"Reset Clock · 设置";self.settings.delegate=self;
  NSView *v=self.settings.contentView;
  NSTextField *title=label(v,NSMakeRect(18,245,430,28),@"公告来源（HTTPS JSON Feed）",13,NO);title.textColor=NSColor.labelColor;
  self.feedField=[[NSTextField alloc]initWithFrame:NSMakeRect(18,210,445,27)];self.feedField.placeholderString=@"https://.../events.json";[v addSubview:self.feedField];
  NSButton *save=[[NSButton alloc]initWithFrame:NSMakeRect(18,170,112,30)];save.title=@"保存并刷新";save.target=self;save.action=@selector(saveFeed:);[v addSubview:save];
  NSButton *refresh=[[NSButton alloc]initWithFrame:NSMakeRect(138,170,100,30)];refresh.title=@"立即刷新";refresh.target=self;refresh.action=@selector(refresh:);[v addSubview:refresh];
  self.diagnostics=[[NSTextField alloc]initWithFrame:NSMakeRect(18,15,445,145)];self.diagnostics.editable=NO;self.diagnostics.bezeled=NO;self.diagnostics.drawsBackground=NO;self.diagnostics.font=[NSFont systemFontOfSize:11];self.diagnostics.lineBreakMode=NSLineBreakByWordWrapping;self.diagnostics.maximumNumberOfLines=9;[v addSubview:self.diagnostics];
  [self.settings center];
 }
 [self.settings makeKeyAndOrderFront:nil];[NSApp activateIgnoringOtherApps:YES];
}
- (void)saveFeed:(id)sender {[self emit:@"url" value:self.feedField.stringValue];}
- (void)refresh:(id)sender {[self emit:@"refresh" value:@""];}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication*)sender{return NO;}
- (void)windowDidMove:(NSNotification*)n {
 if(n.object!=self.card||self.locked)return;
 NSPoint p=self.card.frame.origin;[self emit:@"position" value:[NSString stringWithFormat:@"%d,%d",(int)p.x,(int)p.y]];
}
- (void)apply:(NSString*)json {
 NSData *b=[json dataUsingEncoding:NSUTF8StringEncoding];NSDictionary *d=[NSJSONSerialization JSONObjectWithData:b options:0 error:nil];if(![d isKindOfClass:NSDictionary.class])return;
 BOOL demo=[d[@"demo"] boolValue];if(self.demo!=demo){self.demo=demo;[self makeMenu];}
 self.shown=[d[@"show"] boolValue];self.locked=[d[@"locked"] boolValue];self.card.ignoresMouseEvents=self.locked;[self.card setMovableByWindowBackground:!self.locked];
 NSString *text=[NSString stringWithFormat:@"%@\n\n%@\n%@\n%@\n%@\n%@\n%@",str(d,@"clock"),str(d,@"title"),str(d,@"summary"),str(d,@"published"),str(d,@"effective"),str(d,@"countdown"),str(d,@"health")];self.cardLabel.stringValue=text;self.sourceURL=str(d,@"source_url");
 if(self.settings){if(!self.settings.isKeyWindow)self.feedField.stringValue=str(d,@"feed_url");self.diagnostics.stringValue=str(d,@"diagnostics");}
 NSRect f=self.card.frame;NSPoint point=NSMakePoint([d[@"x"] doubleValue],[d[@"y"] doubleValue]);if(fabs(f.origin.x-point.x)>1||fabs(f.origin.y-point.y)>1)[self.card setFrameOrigin:point];
 if(self.shown)[self.card orderFrontRegardless];else [self.card orderOut:nil];
}
@end
void RCAppRun(void){@autoreleasepool{[NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];controller=[RCController new];[NSApp setDelegate:controller];[NSApp run];controller=nil;}}
void RCAppStop(void){dispatch_async(dispatch_get_main_queue(),^{[NSApp terminate:nil];});}
void RCAppUpdate(const char *json){if(!json)return;NSString *v=[NSString stringWithUTF8String:json];dispatch_async(dispatch_get_main_queue(),^{[controller apply:v];});}
void RCAppNotify(const char *text){if(!text)return;NSString *v=[NSString stringWithUTF8String:text];dispatch_async(dispatch_get_main_queue(),^{UNMutableNotificationContent *c=[UNMutableNotificationContent new];c.title=@"OpenDesk Reset Clock";c.body=v;c.sound=UNNotificationSound.defaultSound;UNNotificationRequest *r=[UNNotificationRequest requestWithIdentifier:[[NSUUID UUID]UUIDString] content:c trigger:nil];[[UNUserNotificationCenter currentNotificationCenter] addNotificationRequest:r withCompletionHandler:^(NSError *error){}];});}
