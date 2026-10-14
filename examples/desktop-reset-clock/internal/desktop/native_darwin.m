#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CGWindowLevel.h>
#import <UserNotifications/UserNotifications.h>
#include <math.h>

extern void RCGoAction(char *name, char *value);

static const CGFloat RCScreenCardWidth = 386;
// One row is reserved for the verified empty state; three rows maximum.
static const CGFloat RCScreenCardHeight = 265;
static CGFloat RCCardHeight(NSUInteger count) {
    return 231 + MAX((NSUInteger)1,MIN(count,(NSUInteger)3)) * 34;
}
static const CGFloat RCMiniWidth = 176;
static const CGFloat RCMiniHeight = 44;
static const CGFloat RCSettingsWidth = 520;
static const CGFloat RCSettingsBaseHeight = 562;
static const CGFloat RCSettingsExpandedHeight = 688;
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
// C3 countdown: dominant numeric glyphs, quiet mint unit labels. Source
// validity remains entirely in Go; this is native text typography only.
static NSAttributedString *RCStyledCardValue(NSString *value, BOOL upcoming) {
    NSString *text=value ?: @"";
    NSMutableAttributedString *result=[[NSMutableAttributedString alloc] initWithString:text];
    if (!text.length) return result;
    NSRange full=NSMakeRange(0,text.length);
    CGFloat unitSize=upcoming?16:22;
    [result addAttributes:@{
       NSFontAttributeName:[NSFont systemFontOfSize:unitSize weight:NSFontWeightSemibold],
       NSForegroundColorAttributeName:upcoming?RCColor(.61,1,.86):NSColor.whiteColor
    } range:full];
    if (!upcoming) return result;
    CGFloat digitSize=text.length>18?36:(text.length>12?41:48);
    NSRegularExpression *digits=[NSRegularExpression regularExpressionWithPattern:@"[0-9]+"
         options:0 error:NULL];
    for (NSTextCheckingResult *match in [digits matchesInString:text options:0 range:full]) {
       [result addAttributes:@{
          NSFontAttributeName:[NSFont systemFontOfSize:digitSize weight:NSFontWeightBold],
          NSForegroundColorAttributeName:NSColor.whiteColor,
          NSKernAttributeName:@(-1.1)
       } range:match.range];
    }
    return result;
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


static NSTextView *RCScrollableText(NSView *parent,NSRect frame) {
 NSScrollView *scroll=[[NSScrollView alloc] initWithFrame:frame];
 scroll.hasVerticalScroller=YES;
 scroll.borderType=NSNoBorder;
 scroll.drawsBackground=NO;
 NSTextView *view=[[NSTextView alloc] initWithFrame:NSMakeRect(0,0,frame.size.width,frame.size.height)];
 view.editable=NO;view.selectable=YES;
 view.drawsBackground=NO;view.font=[NSFont systemFontOfSize:12];
 view.textColor=NSColor.labelColor;
 view.textContainerInset=NSMakeSize(5,8);
 view.minSize=NSMakeSize(0,frame.size.height);
 view.maxSize=NSMakeSize(CGFLOAT_MAX,CGFLOAT_MAX);
 view.verticallyResizable=YES;view.horizontallyResizable=NO;
 view.textContainer.widthTracksTextView=YES;
 scroll.documentView=view;
 [parent addSubview:scroll];
 return view;
}

// The approved C3 artwork is decoded once from Go-embedded bytes.
static NSImage *RCC3HeroImage;
@interface RCCardView : NSView
@property (strong) NSTrackingArea *hoverArea;
@property (strong) NSImage *heroImage;
@end
@implementation RCCardView
- (BOOL)mouseDownCanMoveWindow { return YES; }
- (void)drawRect:(NSRect)dirtyRect {
    NSRect bounds=self.bounds;
    NSBezierPath *shape=[NSBezierPath bezierPathWithRoundedRect:bounds xRadius:18 yRadius:18];
    [NSGraphicsContext saveGraphicsState];
    [shape addClip];
    NSGradient *gradient=[[NSGradient alloc] initWithStartingColor:RCColor(.043,.259,.243)
        endingColor:RCColor(.024,.180,.192)];
    [gradient drawInRect:bounds angle:-24];
    if (self.heroImage) {
        NSRect hero=NSMakeRect(NSWidth(bounds)-230,NSHeight(bounds)-18-172,228,172);
        [self.heroImage drawInRect:hero fromRect:NSZeroRect
            operation:NSCompositingOperationSourceOver fraction:1.0];
    }
    NSGradient *horizon=[[NSGradient alloc] initWithStartingColor:
        [RCColor(.06,.38,.35) colorWithAlphaComponent:.19]
        endingColor:[RCColor(.02,.18,.18) colorWithAlphaComponent:0]];
    [horizon drawInRect:NSMakeRect(0,NSHeight(bounds)-225,NSWidth(bounds),44) angle:-90];
    [[RCColor(.025,.16,.16) colorWithAlphaComponent:.66] setFill];
    NSRectFill(NSMakeRect(0,0,NSWidth(bounds),43));
    [[RCColor(.66,.95,.82) colorWithAlphaComponent:.17] setStroke];
    NSBezierPath *footLine=[NSBezierPath bezierPath];
    [footLine moveToPoint:NSMakePoint(0,43)];
    [footLine lineToPoint:NSMakePoint(NSWidth(bounds),43)];
    [footLine stroke];
    [NSGraphicsContext restoreGraphicsState];
    [[RCColor(.70,.98,.90) colorWithAlphaComponent:.18] setStroke];
    shape.lineWidth=1;
    [shape stroke];
}
- (void)updateTrackingAreas {
 [super updateTrackingAreas];
 if (self.hoverArea) [self removeTrackingArea:self.hoverArea];
 self.hoverArea=[[NSTrackingArea alloc] initWithRect:NSZeroRect
   options:NSTrackingMouseEnteredAndExited|NSTrackingActiveAlways|NSTrackingInVisibleRect
   owner:self userInfo:nil];
 [self addTrackingArea:self.hoverArea];
}
- (void)mouseEntered:(NSEvent *)event { RCGoAction("ticker_pause",""); }
- (void)mouseExited:(NSEvent *)event { RCGoAction("ticker_resume",""); }
@end

// The optional mini surface is a second native panel owned by the *same*
// process and fed by the same Go Display. Nothing polls or stores separately.
@interface RCMiniView : NSView
@end
@implementation RCMiniView
- (BOOL)mouseDownCanMoveWindow { return YES; }
- (void)drawRect:(NSRect)dirtyRect {
    NSBezierPath *pill=[NSBezierPath bezierPathWithRoundedRect:self.bounds xRadius:22 yRadius:22];
    NSGradient *gradient=[[NSGradient alloc] initWithStartingColor:RCColor(.055,.22,.22)
        endingColor:RCColor(.06,.35,.30)];
    [gradient drawInBezierPath:pill angle:-15];
    [[RCColor(.61,.98,.82) colorWithAlphaComponent:.38] setStroke];
    pill.lineWidth=.8;[pill stroke];
}
@end

@interface RCController : NSObject <NSApplicationDelegate, NSWindowDelegate>
@property (strong) NSPanel *card;
@property (strong) NSPanel *mini;
@property (strong) NSTextField *miniLabel;
@property (strong) NSButton *miniOpen;
@property (copy) NSString *traySymbol;
@property BOOL adjustingMini;
@property BOOL miniPositionInitialized;
@property NSInteger requestedMiniX;
@property NSInteger requestedMiniY;
@property (strong) NSWindow *settings;
@property (strong) NSWindow *details;
@property (strong) NSSegmentedControl *detailTabs;
@property (strong) NSSegmentedControl *detailPeriod;
@property (strong) NSArray<NSView *> *detailPages;
@property (strong) NSArray<NSTextField *> *statValues;
@property (strong) NSTextField *overviewNews;
@property (strong) NSTextField *detailHealth;
@property (strong) NSTextView *timelineText;
@property (strong) NSTextView *fullNewsText;
@property (strong) NSTextField *detailsHistory;
@property (strong) NSTextField *detailsNews;
@property (strong) NSTextField *detailsResources;
@property (strong) NSTextField *detailsMembership;
@property (strong) NSButton *detailsSourceButton;
@property (strong) NSButton *detailsCredit;
@property (strong) NSPopUpButton *historyPicker;
@property (copy) NSArray *lastEvidenceOptions;
@property (strong) NSPopUpButton *newsPicker;
@property (strong) NSButton *newsSourceButton;
@property (copy) NSArray *lastNewsOptions;
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
@property (strong) NSTextField *tickerText;
@property (strong) NSButton *detailsEntry;
@property (strong) NSButton *creditLink;
@property (strong) NSTextField *emptyNews;
@property (strong) NSTextField *tickerCount;
@property (strong) NSButton *tickerPrev;
@property (strong) NSButton *tickerNext;
@property (strong) NSButton *tickerExpand;
@property (strong) NSArray<NSTextField *> *tickerRows;
@property (strong) NSArray<NSTextField *> *tickerDates;
@property (strong) NSArray<NSView *> *tickerDividers;
@property BOOL adjustingCard;
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
@property (strong) NSButton *menuTextSwitch;
@property (strong) NSButton *miniShowSwitch;
@property (strong) NSButton *miniFloatSwitch;
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
    background.wantsLayer=YES;
    background.layer.cornerRadius=18;
    background.layer.masksToBounds=YES;
    background.heroImage=RCC3HeroImage;
    background.autoresizingMask=NSViewWidthSizable|NSViewHeightSizable;
    self.card.contentView=background;
    NSTextField *brand=RCText(background,RCTopRect(RCScreenCardHeight,17,16,195,25),14,
                             NSFontWeightBold,NSColor.whiteColor,NO,NSTextAlignmentLeft);
    brand.stringValue=@"↻  Reset Clock";
    self.detailsEntry=[[NSButton alloc] initWithFrame:RCTopRect(RCScreenCardHeight,239,14,130,29)];
    self.detailsEntry.bordered=NO;
    self.detailsEntry.title=@"记录与动态 ›";
    self.detailsEntry.font=[NSFont systemFontOfSize:11 weight:NSFontWeightSemibold];
    self.detailsEntry.contentTintColor=NSColor.whiteColor;
    self.detailsEntry.wantsLayer=YES;
    self.detailsEntry.layer.cornerRadius=14.5;
    self.detailsEntry.layer.backgroundColor=[RCColor(.04,.34,.29) colorWithAlphaComponent:.90].CGColor;
    self.detailsEntry.layer.borderWidth=.7;
    self.detailsEntry.layer.borderColor=[RCColor(.46,.84,.71) colorWithAlphaComponent:.55].CGColor;
    self.detailsEntry.target=self;
    self.detailsEntry.action=@selector(openDetailsClick:);
    [background addSubview:self.detailsEntry];
    self.hintLabel=RCText(background,RCTopRect(RCScreenCardHeight,17,67,237,21),13,
                   NSFontWeightSemibold,RCColor(.91,1,.96),NO,NSTextAlignmentLeft);
    self.valueLabel=RCText(background,RCTopRect(RCScreenCardHeight,17,91,350,59),45,
                   NSFontWeightBold,NSColor.whiteColor,NO,NSTextAlignmentLeft);
    self.metaLabel=RCText(background,RCTopRect(RCScreenCardHeight,17,152,350,21),11,
                   NSFontWeightMedium,RCColor(.84,.95,.89),NO,NSTextAlignmentLeft);
    NSView *divider=[[NSView alloc] initWithFrame:RCTopRect(RCScreenCardHeight,17,185,352,1)];
    divider.wantsLayer=YES;
    divider.layer.backgroundColor=[RCColor(.49,.92,.78) colorWithAlphaComponent:.29].CGColor;
    [background addSubview:divider];
    self.emptyNews=RCText(background,RCTopRect(RCScreenCardHeight,17,194,352,22),11,
                          NSFontWeightRegular,RCColor(.79,.91,.85),NO,NSTextAlignmentLeft);
    self.emptyNews.stringValue=@"暂无可核验动态";
    NSMutableArray<NSTextField *> *titles=[NSMutableArray array];
    NSMutableArray<NSTextField *> *dates=[NSMutableArray array];
    NSMutableArray<NSView *> *lines=[NSMutableArray array];
    for (NSInteger i=0;i<3;i++) {
        CGFloat top=190+i*34;
        NSTextField *date=RCText(background,RCTopRect(RCScreenCardHeight,17,top,49,30),11,
                                 NSFontWeightSemibold,RCColor(.63,.96,.85),NO,NSTextAlignmentLeft);
        NSTextField *title=RCText(background,RCTopRect(RCScreenCardHeight,75,top,293,30),12,
                                  NSFontWeightMedium,NSColor.whiteColor,NO,NSTextAlignmentLeft);
        date.hidden=YES; title.hidden=YES;
        [dates addObject:date]; [titles addObject:title];
        if (i<2) {
            NSView *line=[[NSView alloc] initWithFrame:RCTopRect(RCScreenCardHeight,17,top+33,352,1)];
            line.wantsLayer=YES;
            line.layer.backgroundColor=[RCColor(.69,.96,.83) colorWithAlphaComponent:.12].CGColor;
            line.hidden=YES;
            [background addSubview:line];
            [lines addObject:line];
        }
    }
    self.tickerRows=titles;
    self.tickerDates=dates;
    self.tickerDividers=lines;
    // Bottom-anchored footer remains visible as rows are added/removed.
    self.summaryLabel=RCText(background,NSMakeRect(17,24,352,16),10,
                   NSFontWeightRegular,RCColor(.76,.88,.83),NO,NSTextAlignmentLeft);
    self.creditLink=[[NSButton alloc] initWithFrame:NSMakeRect(17,5,230,20)];
    self.creditLink.bordered=NO;
    self.creditLink.title=@"Data: codex-reset.com ↗";
    self.creditLink.font=[NSFont systemFontOfSize:10.5 weight:NSFontWeightMedium];
    self.creditLink.contentTintColor=RCColor(.68,.96,.85);
    self.creditLink.target=self;
    self.creditLink.action=@selector(openCreditClick:);
    [background addSubview:self.creditLink];
    for (NSView *v in background.subviews)
        if (v!=self.creditLink && v!=self.summaryLabel) v.autoresizingMask=NSViewMinYMargin;
    self.summaryLabel.autoresizingMask=NSViewMaxYMargin;
    self.creditLink.autoresizingMask=NSViewMaxYMargin;
    self.tray = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
    self.tray.button.title = @"◷"; // fallback on systems without SF Symbols
    self.tray.button.imagePosition = NSImageLeft;
    self.tray.button.toolTip = @"OpenDesk Reset Clock";
    self.shown = YES;
    self.locked = YES;
    self.card.ignoresMouseEvents = YES;
    [self createMini];
    [self makeMenu];
    [self.card orderFrontRegardless];
}

- (void)createMini {
    self.mini=[[NSPanel alloc] initWithContentRect:NSMakeRect(120,110,RCMiniWidth,RCMiniHeight)
        styleMask:NSWindowStyleMaskNonactivatingPanel|NSWindowStyleMaskBorderless
        backing:NSBackingStoreBuffered defer:NO];
    self.mini.level=CGWindowLevelForKey(kCGDesktopIconWindowLevelKey)+1;
    self.mini.collectionBehavior=NSWindowCollectionBehaviorCanJoinAllSpaces |
        NSWindowCollectionBehaviorStationary | NSWindowCollectionBehaviorIgnoresCycle;
    self.mini.opaque=NO;
    self.mini.backgroundColor=NSColor.clearColor;
    self.mini.hasShadow=YES;
    self.mini.hidesOnDeactivate=NO;
    self.mini.delegate=self;
    [self.mini setMovableByWindowBackground:YES];
    RCMiniView *background=[[RCMiniView alloc] initWithFrame:NSMakeRect(0,0,RCMiniWidth,RCMiniHeight)];
    self.mini.contentView=background;
    self.miniOpen=[[NSButton alloc] initWithFrame:NSMakeRect(8,8,29,29)];
    self.miniOpen.bordered=NO;
    self.miniOpen.title=@"◷";
    self.miniOpen.font=[NSFont systemFontOfSize:20 weight:NSFontWeightMedium];
    self.miniOpen.contentTintColor=RCColor(.65,.98,.84);
    self.miniOpen.target=self;
    self.miniOpen.action=@selector(openDetailsClick:);
    self.miniOpen.toolTip=@"查看 Reset Clock 记录与动态";
    [background addSubview:self.miniOpen];
    self.miniLabel=RCText(background,NSMakeRect(39,11,128,22),15,
                       NSFontWeightSemibold,NSColor.whiteColor,NO,NSTextAlignmentCenter);
    self.miniLabel.stringValue=@"待公布";
}
- (void)syncCompact:(NSDictionary *)data {
    NSDictionary *status=[data[@"menu_status"] isKindOfClass:NSDictionary.class] ?
        data[@"menu_status"] : @{};
    NSString *state=RCString(status,@"state");
    BOOL live=[state isEqualToString:@"upcoming"] || [state isEqualToString:@"revised"] ||
         [state isEqualToString:@"soon"];
    NSString *icon=@"clock";
    if ([state isEqualToString:@"upcoming"] || [state isEqualToString:@"revised"]) icon=@"clock.fill";
    else if ([state isEqualToString:@"soon"] || [state isEqualToString:@"error"] ||
        [state isEqualToString:@"stale"]) icon=@"exclamationmark.circle";
    else if ([state isEqualToString:@"withdrawn"]) icon=@"clock.arrow.circlepath";
    if (![self.traySymbol isEqualToString:icon]) {
        NSImage *image=[NSImage imageWithSystemSymbolName:icon accessibilityDescription:@"Reset Clock"];
        if (!image) image=[NSImage imageWithSystemSymbolName:@"clock" accessibilityDescription:@"Reset Clock"];
        if (image) {
            image.template=YES;
            self.tray.button.image=image;
        } else {
            self.tray.button.image=nil;
        }
        self.traySymbol=icon;
    }
    NSString *remaining=RCString(status,@"short_remaining");
    NSString *text=RCBool(data,@"menu_text")?remaining:@"";
    if (!self.tray.button.image) text=[@"◷ " stringByAppendingString:text];
    if (![self.tray.button.title isEqualToString:text]) self.tray.button.title=text;
    self.tray.button.appearsDisabled=!live; // Still clickable in inactive state.
    NSString *tooltip=RCString(status,@"tooltip");
    if (![self.tray.button.toolTip isEqualToString:tooltip]) self.tray.button.toolTip=tooltip;
    self.tray.button.accessibilityLabel=tooltip;
    NSString *summary=RCString(status,@"label");
    NSString *head=remaining.length>0?[NSString stringWithFormat:@"%@ · %@",summary,remaining]:summary;
    for (NSMenuItem *item in self.tray.menu.itemArray) {
        if ([item.representedObject isEqual:@"status"] && ![item.title isEqualToString:head])
            item.title=head;
    }
    NSString *miniValue=remaining.length>0?remaining:summary;
    if ([state isEqualToString:@"idle"] || [state isEqualToString:@"withdrawn"]) miniValue=@"待公布";
    if ([state isEqualToString:@"error"] || [state isEqualToString:@"stale"]) miniValue=@"来源异常";
    RCSetString(self.miniLabel,miniValue);
    self.miniLabel.textColor=live?NSColor.whiteColor:RCColor(.72,.81,.79);
    self.miniOpen.contentTintColor=live?RCColor(.66,1,.83):RCColor(.68,.78,.75);
    self.mini.contentView.toolTip=tooltip;
    self.mini.level=RCBool(data,@"mini_float")?NSFloatingWindowLevel:
        CGWindowLevelForKey(kCGDesktopIconWindowLevelKey)+1;
    self.adjustingMini=YES;
    NSRect frame=self.mini.frame;
    NSScreen *screen=self.mini.screen?:NSScreen.mainScreen;
    if (screen) {
        NSRect visible=screen.visibleFrame;
        NSInteger nextX=[data[@"mini_x"] integerValue],nextY=[data[@"mini_y"] integerValue];
        BOOL newPosition=!self.miniPositionInitialized || self.requestedMiniX!=nextX ||
            self.requestedMiniY!=nextY;
        self.miniPositionInitialized=YES;
        self.requestedMiniX=nextX;self.requestedMiniY=nextY;
        // Do not jump back to the old persisted point while the user drags.
        CGFloat x=newPosition?(CGFloat)nextX:frame.origin.x;
        CGFloat y=newPosition?(CGFloat)nextY:frame.origin.y;
        if (newPosition && nextX==0 && nextY==0) {
            x=NSMaxX(visible)-RCMiniWidth-24;
            y=NSMinY(visible)+25;
        }
        x=MAX(NSMinX(visible),MIN(x,NSMaxX(visible)-RCMiniWidth));
        y=MAX(NSMinY(visible),MIN(y,NSMaxY(visible)-RCMiniHeight));
        if (fabs(frame.origin.x-x)>1 || fabs(frame.origin.y-y)>1)
            [self.mini setFrameOrigin:NSMakePoint(x,y)];
    }
    self.adjustingMini=NO;
    if (RCBool(data,@"mini_show")) [self.mini orderFrontRegardless];
    else [self.mini orderOut:nil];
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
    NSMenu *menu=[[NSMenu alloc] initWithTitle:@"Reset Clock"];
    NSMenuItem *summary=[[NSMenuItem alloc] initWithTitle:@"下一次时间待公布" action:nil keyEquivalent:@""];
    summary.enabled=NO; summary.representedObject=@"status";[menu addItem:summary];
    [menu addItem:[NSMenuItem separatorItem]];
    [menu addItem:[self menuItem:@"记录与动态（网页优先）" action:@"details"]];
    [menu addItem:[self menuItem:@"设置" action:@"settings"]];
    [menu addItem:[self menuItem:@"立即刷新" action:@"refresh"]];
    [menu addItem:[self menuItem:@"打开数据来源" action:@"data_source"]];
    [menu addItem:[self menuItem:@"打开原始公告" action:@"source"]];
    [menu addItem:[NSMenuItem separatorItem]];
    [menu addItem:[self menuItem:@"显示桌面卡片" action:@"show"]];
    [menu addItem:[self menuItem:@"显示迷你挂件" action:@"mini"]];
    [menu addItem:[self menuItem:@"迷你挂件悬浮置顶" action:@"mini_float"]];
    [menu addItem:[self menuItem:@"菜单栏显示剩余时间" action:@"menu_text"]];
    [menu addItem:[self menuItem:@"锁定位置（点击穿透）" action:@"lock"]];
    [menu addItem:[self menuItem:@"免打扰" action:@"quiet"]];
    if (self.demo) {
        [menu addItem:[NSMenuItem separatorItem]];
        for (int revision=1;revision<=3;revision++)
            [menu addItem:[self menuItem:[NSString stringWithFormat:@"模拟公告 V%d",revision]
                                       action:[NSString stringWithFormat:@"demo_v%d",revision]]];
    }
    [menu addItem:[NSMenuItem separatorItem]];
    [menu addItem:[self menuItem:@"退出程序" action:@"quit"]];
    self.tray.menu=menu;
}
- (void)syncMenu:(NSDictionary *)data {
    for (NSMenuItem *item in self.tray.menu.itemArray) {
        NSString *command = [item.representedObject isKindOfClass:NSString.class] ? item.representedObject : @"";
        if ([command isEqualToString:@"show"] || [command isEqualToString:@"mini"] ||
            [command isEqualToString:@"mini_float"] || [command isEqualToString:@"menu_text"] ||
            [command isEqualToString:@"lock"] ||
            [command isEqualToString:@"quiet"] || [command isEqualToString:@"advance"] ||
            [command isEqualToString:@"clock"] || [command isEqualToString:@"ticker_toggle"]) {
            NSString *key = @{ @"show":@"show", @"mini":@"mini_show",
                                @"mini_float":@"mini_float", @"menu_text":@"menu_text",
                                @"lock":@"locked", @"quiet":@"quiet",
                                @"advance":@"advance_10", @"clock":@"clock_24", @"ticker_toggle":@"ticker_expanded" }[command];
            item.state = RCBool(data,key) ? NSControlStateValueOn : NSControlStateValueOff;
        }
        if ([command isEqualToString:@"source"]) item.enabled = self.sourceURL.length > 0;
        if ([command isEqualToString:@"data_source"])
            item.enabled = [RCString(data,@"data_source_url") isEqualToString:@"https://codex-reset.com/"];
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
    if ([command isEqualToString:@"details"]) { [self openDetailsPreferWeb]; return; }
    if ([command isEqualToString:@"source"]) { [self openSource]; return; }
    if ([command isEqualToString:@"data_source"]) { [self openCreditClick:nil]; return; }
    if ([command hasPrefix:@"resource_"]) {
      NSInteger idx=[[command substringFromIndex:9] integerValue];
      NSArray *urls=self.lastPayload[@"resource_urls"];
      if ([urls isKindOfClass:NSArray.class] && idx>=0 && idx<urls.count) [self openSafeDetailsURL:urls[idx]];
      return;
    }
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

// The browser-first route is supplied and same-origin checked by Go, not
// derived from third-party marketing URLs. The native details remain as a
// fallback until a real web deployment is available.
- (void)openDetailsPreferWeb {
    NSString *raw=RCString(self.lastPayload,@"web_details_url");
    NSURLComponents *parts=[NSURLComponents componentsWithString:raw];
    NSString *host=parts.host.lowercaseString;
    BOOL secure=[parts.scheme.lowercaseString isEqualToString:@"https"];
    BOOL loopback=[parts.scheme.lowercaseString isEqualToString:@"http"] &&
       ([host isEqualToString:@"localhost"] || [host isEqualToString:@"127.0.0.1"] ||
        [host isEqualToString:@"::1"]);
    if (parts && (secure||loopback) && parts.user==nil && parts.password==nil &&
        [parts.path isEqualToString:@"/reset-clock/"] && parts.query==nil && parts.fragment==nil &&
        [[NSWorkspace sharedWorkspace] openURL:parts.URL]) return;
    [self showDetails];
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
        self.miniShowSwitch=RCSettingsCheckbox(content,294,20,230,@"显示迷你挂件",@"mini",self);
        self.miniFloatSwitch=RCSettingsCheckbox(content,294,270,230,@"迷你挂件悬浮置顶",@"mini_float",self);
        self.menuTextSwitch=RCSettingsCheckbox(content,325,20,235,@"菜单栏显示倒计时",@"menu_text",self);
        self.clockSwitch = RCSettingsCheckbox(content,325,270,230,@"24 小时制",@"clock",self);
        RCSettingsText(content,368,20,470,@"来源状态",13,YES);
        RCSettingsText(content,395,20,200,@"本机最近检查",11,NO);
        self.requestValue = RCSettingsText(content,413,20,205,@"未知",12,YES);
        RCSettingsText(content,395,270,200,@"上游最近检查",11,NO);
        self.sourceValue = RCSettingsText(content,413,270,208,@"未知",12,YES);
        RCSettingsText(content,442,20,230,@"公告内容最近变化",11,NO);
        self.changedValue = RCSettingsText(content,460,20,205,@"未知",12,YES);
        RCSettingsText(content,442,270,210,@"当前来源状态",11,NO);
        self.sourceStatus = RCSettingsText(content,460,270,215,@"未知",11,YES);
        self.advancedButton = RCSettingsButton(content,499,18,140,@"高级诊断 ▸",@selector(toggleDiagnostics:),self);
        self.diagnostics = RCText(content,RCTopRect(RCSettingsBaseHeight,20,556,476,110),
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
  self.details=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,560,RCDetailsHeight)
     styleMask:NSWindowStyleMaskTitled|NSWindowStyleMaskClosable|NSWindowStyleMaskMiniaturizable|NSWindowStyleMaskResizable
     backing:NSBackingStoreBuffered defer:NO];
  self.details.title=@"Reset Clock · 记录与动态";
  self.details.releasedWhenClosed=NO;
  self.details.delegate=self;
  self.details.minSize=NSMakeSize(560,RCDetailsHeight+40);
  NSView *content=self.details.contentView;
  NSTextField *heading=RCText(content,RCTopRect(RCDetailsHeight,18,15,520,24),16,
                         NSFontWeightSemibold,NSColor.labelColor,NO,NSTextAlignmentLeft);
  heading.stringValue=@"记录与动态";
  self.detailsCredit=[[NSButton alloc] initWithFrame:RCTopRect(RCDetailsHeight,356,13,187,27)];
  self.detailsCredit.bordered=NO;
  self.detailsCredit.title=@"Data: codex-reset.com ↗";
  self.detailsCredit.font=[NSFont systemFontOfSize:11 weight:NSFontWeightMedium];
  self.detailsCredit.contentTintColor=NSColor.secondaryLabelColor;
  self.detailsCredit.target=self;
  self.detailsCredit.action=@selector(openCreditClick:);
  [content addSubview:self.detailsCredit];
  self.detailTabs=[[NSSegmentedControl alloc] initWithFrame:RCTopRect(RCDetailsHeight,18,48,524,31)];
  self.detailTabs.segmentCount=3;
  for (NSInteger i=0;i<3;i++) [self.detailTabs setLabel:@[@"概览",@"历史记录",@"资讯"][i] forSegment:i];
  self.detailTabs.selectedSegment=0;
  self.detailTabs.target=self;self.detailTabs.action=@selector(switchDetailsTab:);
  [content addSubview:self.detailTabs];
  CGFloat height=RCDetailsHeight-87;
  NSMutableArray<NSView *> *pages=[NSMutableArray array];
  for (NSInteger i=0;i<3;i++) {
    NSView *page=[[NSView alloc] initWithFrame:NSMakeRect(0,0,560,height)];
    page.autoresizingMask=NSViewWidthSizable|NSViewHeightSizable;
    page.hidden=i!=0;
    [content addSubview:page];
    [pages addObject:page];
  }
  self.detailPages=pages;
  NSView *overview=pages[0],*history=pages[1],*news=pages[2];
  NSTextField *overviewTitle=RCText(overview,RCTopRect(height,18,13,290,22),14,
       NSFontWeightSemibold,NSColor.labelColor,NO,NSTextAlignmentLeft);
  overviewTitle.stringValue=@"来源事件统计";
  self.detailPeriod=[[NSSegmentedControl alloc] initWithFrame:RCTopRect(height,309,10,232,28)];
  self.detailPeriod.segmentCount=2;
  [self.detailPeriod setLabel:@"最近 30 天" forSegment:0];
  [self.detailPeriod setLabel:@"本月" forSegment:1];
  self.detailPeriod.selectedSegment=0;
  self.detailPeriod.target=self;self.detailPeriod.action=@selector(changeDetailsPeriod:);
  [overview addSubview:self.detailPeriod];
  NSArray<NSString *> *names=@[@"来源预告",@"确认完成",@"赠送机会",@"用户观察"];
  NSMutableArray<NSTextField *> *values=[NSMutableArray array];
  for (NSInteger i=0;i<4;i++) {
    CGFloat x=18+(i%2)*270,top=57+(i/2)*82;
    NSTextField *label=RCText(overview,RCTopRect(height,x,top,240,18),12,
      NSFontWeightRegular,NSColor.secondaryLabelColor,NO,NSTextAlignmentLeft);
    label.stringValue=names[i];
    NSTextField *value=RCText(overview,RCTopRect(height,x,top+24,245,33),23,
      NSFontWeightSemibold,NSColor.labelColor,NO,NSTextAlignmentLeft);
    [values addObject:value];
  }
  self.statValues=values;
  NSTextField *newsTitle=RCText(overview,RCTopRect(height,18,237,520,23),14,
     NSFontWeightSemibold,NSColor.labelColor,NO,NSTextAlignmentLeft);
  newsTitle.stringValue=@"最新三条有效动态";
  self.overviewNews=RCText(overview,RCTopRect(height,18,270,520,132),12,
     NSFontWeightRegular,NSColor.labelColor,YES,NSTextAlignmentLeft);
  self.overviewNews.maximumNumberOfLines=9;
  self.overviewNews.selectable=YES;
  self.detailHealth=RCText(overview,RCTopRect(height,18,423,520,51),11,
     NSFontWeightRegular,NSColor.secondaryLabelColor,YES,NSTextAlignmentLeft);
  self.detailHealth.maximumNumberOfLines=3;

  NSTextField *historyTitle=RCText(history,RCTopRect(height,18,14,520,23),14,
     NSFontWeightSemibold,NSColor.labelColor,NO,NSTextAlignmentLeft);
  historyTitle.stringValue=@"事件时间线 · 含更正与撤回";
  self.timelineText=RCScrollableText(history,RCTopRect(height,18,47,522,347));
  self.historyPicker=[[NSPopUpButton alloc] initWithFrame:RCTopRect(height,18,412,320,29) pullsDown:NO];
  self.historyPicker.target=self;self.historyPicker.action=@selector(syncSelectedLinks:);
  self.historyPicker.toolTip=@"选择历史事件的 HTTPS 证据";
  [history addSubview:self.historyPicker];
  self.detailsSourceButton=[[NSButton alloc] initWithFrame:RCTopRect(height,349,412,190,29)];
  self.detailsSourceButton.title=@"查看证据 ↗";
  self.detailsSourceButton.bezelStyle=NSBezelStyleRounded;
  self.detailsSourceButton.target=self;
  self.detailsSourceButton.action=@selector(openHistoryClick:);
  [history addSubview:self.detailsSourceButton];
  NSTextField *historyNotice=RCText(history,RCTopRect(height,18,454,520,32),11,
     NSFontWeightRegular,NSColor.secondaryLabelColor,YES,NSTextAlignmentLeft);
  historyNotice.stringValue=@"仅呈现已取得证据的修订；记录不完整时统计为「数据不足」。";

  NSTextField *newsTitle2=RCText(news,RCTopRect(height,18,14,520,23),14,
     NSFontWeightSemibold,NSColor.labelColor,NO,NSTextAlignmentLeft);
  newsTitle2.stringValue=@"全部资讯 · 标注来源及修订状态";
  self.fullNewsText=RCScrollableText(news,RCTopRect(height,18,47,522,347));
  self.newsPicker=[[NSPopUpButton alloc] initWithFrame:RCTopRect(height,18,412,320,29) pullsDown:NO];
  self.newsPicker.target=self;self.newsPicker.action=@selector(syncSelectedLinks:);
  self.newsPicker.toolTip=@"完整资讯包含撤回与来源失效记录";
  [news addSubview:self.newsPicker];
  self.newsSourceButton=[[NSButton alloc] initWithFrame:RCTopRect(height,349,412,190,29)];
  self.newsSourceButton.title=@"打开 HTTPS 原文 ↗";
  self.newsSourceButton.bezelStyle=NSBezelStyleRounded;
  self.newsSourceButton.target=self;
  self.newsSourceButton.action=@selector(openNewsClick:);
  [news addSubview:self.newsSourceButton];
  NSTextField *newsNotice=RCText(news,RCTopRect(height,18,454,520,34),11,
     NSFontWeightRegular,NSColor.secondaryLabelColor,YES,NSTextAlignmentLeft);
  newsNotice.stringValue=@"来源类别为提供方声明；已撤回或不可访问的来源不作为有效动态。";
  [self.details center];
 }
 [self syncDetails:self.lastPayload];
 [self.details makeKeyAndOrderFront:nil];
 [NSApp activateIgnoringOtherApps:YES];
}
- (void)switchDetailsTab:(id)sender {
 NSInteger selected=self.detailTabs.selectedSegment;
 for (NSInteger i=0;i<self.detailPages.count;i++) self.detailPages[i].hidden=i!=selected;
}
- (void)changeDetailsPeriod:(id)sender { [self syncDetails:self.lastPayload]; }
- (void)syncSelectedLinks:(id)sender {
 NSArray *records=[self.lastPayload[@"history_evidence"] isKindOfClass:NSArray.class]?self.lastPayload[@"history_evidence"]:@[];
 NSArray *news=[self.lastPayload[@"all_news"] isKindOfClass:NSArray.class]?self.lastPayload[@"all_news"]:@[];
 NSInteger h=self.historyPicker.indexOfSelectedItem,n=self.newsPicker.indexOfSelectedItem;
 self.detailsSourceButton.enabled=h>=0&&h<records.count &&
     [RCString(records[h],@"url") hasPrefix:@"https://"];
 self.newsSourceButton.enabled=n>=0&&n<news.count &&
     [RCString(news[n],@"url") hasPrefix:@"https://"];
}
- (void)openSafeDetailsURL:(NSString *)value {
    NSURL *url = [NSURL URLWithString:value ?: @""];
    if ([[url.scheme lowercaseString] isEqualToString:@"https"] && url.host.length>0 &&
        !url.user && !url.password && !url.fragment) {
        [[NSWorkspace sharedWorkspace] openURL:url];
    }
}
- (void)openHistoryClick:(id)sender {
    NSArray *list = self.lastPayload[@"history_evidence"];
    NSInteger selected = self.historyPicker.indexOfSelectedItem;
    if (![list isKindOfClass:NSArray.class] || selected<0 || selected>=list.count) return;
    NSDictionary *entry = [list[selected] isKindOfClass:NSDictionary.class] ? list[selected] : nil;
    [self openSafeDetailsURL:RCString(entry,@"url")];
}
- (void)openNewsClick:(id)sender {
    NSArray *items = self.lastPayload[@"all_news"];
    NSInteger selected = self.newsPicker.indexOfSelectedItem;
    if (![items isKindOfClass:NSArray.class] || selected<0 || selected>=items.count) return;
    NSDictionary *entry = [items[selected] isKindOfClass:NSDictionary.class] ? items[selected] : nil;
    [self openSafeDetailsURL:RCString(entry,@"url")];
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
 self.detailsCredit.hidden=RCString(data,@"data_source_url").length==0;
 NSString *period=self.detailPeriod.selectedSegment==1?@"stats_month":@"stats_30";
 NSArray *metrics=[data[period] isKindOfClass:NSArray.class]?data[period]:@[];
 for (NSUInteger i=0;i<self.statValues.count;i++){
   NSDictionary *row=i<metrics.count&&[metrics[i] isKindOfClass:NSDictionary.class]?metrics[i]:nil;
   RCSetString(self.statValues[i],row?RCString(row,@"value"):@"数据不足");
 }
 RCSetString(self.overviewNews,RCString(data,@"details_overview_news"));
 RCSetString(self.detailHealth,[NSString stringWithFormat:@"%@\n%@\n不能推断个人额度已恢复。",
    RCString(data,@"card_meta"),RCString(data,@"health")]);
 NSMutableString *timeline=[NSMutableString string];
 NSArray *rows=[data[@"history_rows"] isKindOfClass:NSArray.class]?data[@"history_rows"]:@[];
 for (NSDictionary *row in rows) {
   if (![row isKindOfClass:NSDictionary.class])continue;
   [timeline appendFormat:@"%@  %@ · 修订 %@\n%@\n\n",RCString(row,@"when"),
    RCString(row,@"title"),row[@"revision"]?:@0,RCString(row,@"summary")];
 }
 NSString *historyText=timeline.length?timeline:@"数据不足 · 暂无完整可核验历史归档。";
 if (![self.timelineText.string isEqualToString:historyText]) self.timelineText.string=historyText;
 NSString *newsText=RCString(data,@"details_full_news");
 if (![self.fullNewsText.string isEqualToString:newsText]) self.fullNewsText.string=newsText;
 NSArray *links=[data[@"history_evidence"] isKindOfClass:NSArray.class]?data[@"history_evidence"]:@[];
 if (![self.lastEvidenceOptions isEqualToArray:links]) {
   NSInteger selected=self.historyPicker.indexOfSelectedItem;
   [self.historyPicker removeAllItems];
   for (NSDictionary *row in links) if ([row isKindOfClass:NSDictionary.class])
     [self.historyPicker addItemWithTitle:RCString(row,@"label")];
   self.lastEvidenceOptions=[links copy];
   if (links.count>0)[self.historyPicker selectItemAtIndex:MAX(0,MIN(selected,(NSInteger)links.count-1))];
   else [self.historyPicker addItemWithTitle:@"暂无证据"];
 }
 self.historyPicker.enabled=links.count>0;
 NSArray *news=[data[@"all_news"] isKindOfClass:NSArray.class]?data[@"all_news"]:@[];
 if (![self.lastNewsOptions isEqualToArray:news]) {
   NSInteger selected=self.newsPicker.indexOfSelectedItem;
   [self.newsPicker removeAllItems];
   for (NSDictionary *row in news) if ([row isKindOfClass:NSDictionary.class])
     [self.newsPicker addItemWithTitle:RCString(row,@"label")];
   self.lastNewsOptions=[news copy];
   if(news.count>0)[self.newsPicker selectItemAtIndex:MAX(0,MIN(selected,(NSInteger)news.count-1))];
   else [self.newsPicker addItemWithTitle:@"暂无资讯"];
 }
 self.newsPicker.enabled=news.count>0;
 [self syncSelectedLinks:nil];
}
- (void)openDetailsClick:(id)sender { [self openDetailsPreferWeb]; }
- (void)openCreditClick:(id)sender {
    NSString *url=RCString(self.lastPayload,@"data_source_url");
    if ([url isEqualToString:@"https://codex-reset.com/"]) [self openSafeDetailsURL:url];
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
    if (note.object==self.mini) {
        if (!self.adjustingMini) {
            // Drag events can be frequent. Persist only after the pointer
            // settles; the renderer must not snap to stale model coordinates.
            [NSObject cancelPreviousPerformRequestsWithTarget:self selector:@selector(persistMiniPosition) object:nil];
            [self performSelector:@selector(persistMiniPosition) withObject:nil afterDelay:.35];
        }
        return;
    }
    if (note.object != self.card || self.locked || self.adjustingCard) return;
    NSPoint origin = self.card.frame.origin;
    CGFloat expansion=self.card.frame.size.height-RCScreenCardHeight;
    [self emit:@"position" value:[NSString stringWithFormat:@"%d,%d",(int)origin.x,(int)(origin.y+expansion)]];
}
- (void)persistMiniPosition {
    if (!self.mini) return;
    NSPoint point=self.mini.frame.origin;
    [self emit:@"mini_position" value:[NSString stringWithFormat:@"%d,%d",(int)point.x,(int)point.y]];
}
- (void)syncCheckboxes:(NSDictionary *)data {
    self.quietSwitch.state = RCBool(data,@"quiet") ? NSControlStateValueOn : NSControlStateValueOff;
    self.advanceSwitch.state = RCBool(data,@"advance_10") ? NSControlStateValueOn : NSControlStateValueOff;
    self.showSwitch.state = RCBool(data,@"show") ? NSControlStateValueOn : NSControlStateValueOff;
    self.lockSwitch.state = RCBool(data,@"locked") ? NSControlStateValueOn : NSControlStateValueOff;
    self.clockSwitch.state = RCBool(data,@"clock_24") ? NSControlStateValueOn : NSControlStateValueOff;
    self.miniShowSwitch.state = RCBool(data,@"mini_show") ? NSControlStateValueOn : NSControlStateValueOff;
    self.miniFloatSwitch.state = RCBool(data,@"mini_float") ? NSControlStateValueOn : NSControlStateValueOff;
    self.menuTextSwitch.state = RCBool(data,@"menu_text") ? NSControlStateValueOn : NSControlStateValueOff;
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
    [self syncCompact:data];
    RCSetString(self.hintLabel,RCString(data,@"card_hint"));
    BOOL upcoming=RCBool(data,@"has_upcoming");
    NSString *cardValue=RCString(data,@"card_value");
    self.valueLabel.attributedStringValue=RCStyledCardValue(cardValue,upcoming);
    RCSetString(self.metaLabel,RCString(data,@"card_meta"));
    BOOL cached=RCBool(data,@"ticker_cached");
    NSString *kind=RCString(data,@"status_kind");
    NSString *note=[kind isEqualToString:@"withdrawn"]?
        @"先前公告已撤回 · 下一次时间待公布":
        (cached?@"来源待核验 · 以下仅为已保存的历史内容":
          @"独立第三方追踪 · 不代表个人额度恢复");
    RCSetString(self.summaryLabel,note);
    NSArray *stories=[data[@"ticker_items"] isKindOfClass:NSArray.class]?data[@"ticker_items"]:@[];
    NSUInteger count=MIN(stories.count,(NSUInteger)3);
    CGFloat desiredHeight=RCCardHeight(count);
    self.emptyNews.hidden=count>0;
    for (NSUInteger i=0;i<self.tickerRows.count;i++) {
        BOOL active=i<count && [stories[i] isKindOfClass:NSDictionary.class];
        self.tickerRows[i].hidden=!active;
        self.tickerDates[i].hidden=!active;
        if (active) {
            NSDictionary *item=stories[i];
            RCSetString(self.tickerRows[i],RCString(item,@"title"));
            RCSetString(self.tickerDates[i],RCString(item,@"updated"));
        }
    }
    for (NSUInteger i=0;i<self.tickerDividers.count;i++)
        self.tickerDividers[i].hidden=i+1>=count;
    self.creditLink.hidden=RCString(data,@"data_source_url").length==0;
    self.adjustingCard=YES;
    NSRect frame=self.card.frame;
    NSPoint origin=NSMakePoint([data[@"x"] doubleValue],
                 [data[@"y"] doubleValue]-(desiredHeight-RCScreenCardHeight));
    NSScreen *screen=self.card.screen ?: NSScreen.mainScreen;
    if (screen) {
        NSRect visible=screen.visibleFrame;
        origin.x=MAX(NSMinX(visible),MIN(origin.x,NSMaxX(visible)-RCScreenCardWidth));
        origin.y=MAX(NSMinY(visible),MIN(origin.y,NSMaxY(visible)-desiredHeight));
    }
    if (fabs(frame.size.height-desiredHeight)>1 || fabs(frame.origin.x-origin.x)>1 ||
        fabs(frame.origin.y-origin.y)>1)
        [self.card setFrame:NSMakeRect(origin.x,origin.y,RCScreenCardWidth,desiredHeight) display:YES];
    self.adjustingCard=NO;
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
    if (self.shown) [self.card orderFrontRegardless]; else [self.card orderOut:nil];
}
@end

void RCAppSetHeroPNG(const unsigned char *data, int length) {
    if (!data || length<=0) return;
    NSData *bytes=[NSData dataWithBytes:data length:(NSUInteger)length];
    RCC3HeroImage=[[NSImage alloc] initWithData:bytes];
}
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
