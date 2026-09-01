//go:build darwin && cgo

#import <Cocoa/Cocoa.h>
#import <math.h>
#import "floating_toolbar_darwin.h"
#include "toolbar_icons_generated.inc"

static const CGFloat CDToolbarButtonSize = 40.0;
static const CGFloat CDToolbarButtonGap = 8.0;
static const CGFloat CDToolbarHorizontalPadding = 10.0;
static const CGFloat CDToolbarVerticalPadding = 8.0;
static const CGFloat CDToolbarMinOuterWidth = 60.0;
static const CGFloat CDToolbarMaxOuterWidth = 960.0;
static const CGFloat CDToolbarChromeHeight = 25.0;
static const NSUInteger CDToolbarMaxColumns = 19;

BOOL CDIsTrustedToolbarSymbol(NSString *symbol) {
	return [symbol isKindOfClass:NSString.class] && CDGeneratedToolbarIcons()[symbol] != nil;
}

static NSColor *CDToolbarColor(CGFloat red, CGFloat green, CGFloat blue) {
	return [NSColor colorWithCalibratedRed:red green:green blue:blue alpha:1.0];
}

static NSDictionary *CDToolbarScreenBounds(NSWindow *window, NSRect local) {
	NSScreen *screen = NSScreen.screens.firstObject ?: NSScreen.mainScreen;
	NSRect primary = screen ? screen.frame : NSMakeRect(0, 0, 1440, 900);
	NSRect frame = window.frame;
	NSRect content = [window contentRectForFrameRect:frame];
	CGFloat outerX = NSMinX(frame);
	CGFloat outerY = NSMaxY(primary) - NSMaxY(frame);
	return @{
		@"x": @(outerX + NSMinX(content) - NSMinX(frame) + NSMinX(local)),
		@"y": @(outerY + NSMaxY(frame) - NSMaxY(content) + NSMinY(local)),
		@"width": @(NSWidth(local)), @"height": @(NSHeight(local)),
	};
}

@interface CDToolbarButton : NSButton
@property(nonatomic, copy) NSString *targetID;
@property(nonatomic, copy) NSString *semanticLabel;
@property(nonatomic, copy) NSString *iconName;
@property(nonatomic, copy) NSDictionary *iconPresentation;
@property(nonatomic, copy) NSString *errorMessage;
@property(nonatomic) BOOL toolbarActive;
@property(nonatomic) BOOL toolbarDisabled;
@property(nonatomic) BOOL toolbarBusy;
@property(nonatomic) BOOL pointerInside;
@property(nonatomic) BOOL toolbarPressed;
@property(nonatomic) uint64_t revision;
@property(nonatomic, strong) NSProgressIndicator *busyIndicator;
@end

@implementation CDToolbarButton

- (instancetype)initWithFrame:(NSRect)frameRect {
	self = [super initWithFrame:frameRect];
	if (self) {
		self.title = @"";
		self.bordered = NO;
		self.buttonType = NSButtonTypeMomentaryChange;
		self.focusRingType = NSFocusRingTypeNone;
		self.wantsLayer = YES;
		self.accessibilityElement = YES;
		_busyIndicator = [[NSProgressIndicator alloc] initWithFrame:NSMakeRect(13, 13, 14, 14)];
		_busyIndicator.style = NSProgressIndicatorStyleSpinning;
		_busyIndicator.controlSize = NSControlSizeSmall;
		_busyIndicator.displayedWhenStopped = NO;
		_busyIndicator.hidden = YES;
		_busyIndicator.accessibilityElement = NO;
		_busyIndicator.accessibilityHidden = YES;
		[self addSubview:_busyIndicator];
	}
	return self;
}

- (BOOL)acceptsFirstMouse:(NSEvent *)event { (void)event; return YES; }

- (void)updateTrackingAreas {
	[super updateTrackingAreas];
	for (NSTrackingArea *area in self.trackingAreas.copy) [self removeTrackingArea:area];
	NSTrackingAreaOptions options = NSTrackingMouseEnteredAndExited | NSTrackingActiveAlways | NSTrackingInVisibleRect;
	[self addTrackingArea:[[NSTrackingArea alloc] initWithRect:self.bounds options:options owner:self userInfo:nil]];
}

- (void)mouseEntered:(NSEvent *)event { (void)event; self.pointerInside = YES; [self setNeedsDisplay:YES]; }
- (void)mouseExited:(NSEvent *)event { (void)event; self.pointerInside = NO; [self setNeedsDisplay:YES]; }

- (void)setHighlighted:(BOOL)highlighted {
	[super setHighlighted:highlighted];
	[self setNeedsDisplay:YES];
}

- (void)mouseDown:(NSEvent *)event {
	if (!self.enabled || self.toolbarBusy || self.toolbarDisabled) return;
	self.toolbarPressed = YES;
	[self setNeedsDisplay:YES];
	[self displayIfNeeded];
	[super mouseDown:event];
	self.toolbarPressed = NO;
	[self setNeedsDisplay:YES];
}

- (BOOL)accessibilityPerformPress {
	if (!self.enabled || self.toolbarBusy || self.toolbarDisabled) return NO;
	[self performClick:nil];
	return YES;
}

- (void)applySpec:(NSDictionary *)spec presentation:(NSDictionary *)presentation {
	NSDictionary *state = [spec[@"state"] isKindOfClass:NSDictionary.class] ? spec[@"state"] : @{};
	self.targetID = spec[@"id"];
	self.semanticLabel = spec[@"label"];
	self.iconName = spec[@"icon"];
	self.iconPresentation = presentation;
	self.toolbarActive = [state[@"active"] boolValue];
	self.toolbarDisabled = [state[@"disabled"] boolValue];
	self.toolbarBusy = [state[@"busy"] boolValue];
	self.errorMessage = [state[@"error"] isKindOfClass:NSString.class] ? state[@"error"] : @"";
	self.revision = [state[@"revision"] unsignedLongLongValue];
	self.enabled = !self.toolbarDisabled && !self.toolbarBusy;
	self.toolTip = self.semanticLabel;
	self.accessibilityLabel = self.semanticLabel;
	self.accessibilityHelp = self.errorMessage.length ? self.errorMessage : nil;
	self.accessibilityValue = @(self.toolbarActive);
	if (self.toolbarBusy) {
		self.busyIndicator.hidden = NO;
		[self.busyIndicator startAnimation:nil];
	} else {
		[self.busyIndicator stopAnimation:nil];
		self.busyIndicator.hidden = YES;
	}
	[self setNeedsDisplay:YES];
	NSAccessibilityPostNotification(self, NSAccessibilityValueChangedNotification);
}

- (void)drawRect:(NSRect)dirtyRect {
	(void)dirtyRect;
	NSRect box = NSInsetRect(self.bounds, 0.5, 0.5);
	NSBezierPath *path = [NSBezierPath bezierPathWithRoundedRect:box xRadius:8 yRadius:8];
	NSColor *background = CDToolbarColor(0.21, 0.24, 0.29);
	NSColor *border = CDToolbarColor(0.33, 0.36, 0.43);
	if (self.toolbarDisabled) {
		background = CDToolbarColor(0.16, 0.18, 0.22); border = CDToolbarColor(0.23, 0.26, 0.32);
	} else if (self.errorMessage.length) {
		background = CDToolbarColor(0.40, 0.20, 0.24); border = CDToolbarColor(0.93, 0.55, 0.59);
	} else if (self.toolbarBusy) {
		background = CDToolbarColor(0.20, 0.26, 0.36); border = CDToolbarColor(0.51, 0.66, 0.87);
	} else if (self.toolbarActive) {
		background = CDToolbarColor(0.09, 0.42, 0.83); border = CDToolbarColor(0.47, 0.69, 1.0);
	} else if (self.toolbarPressed || self.highlighted) {
		background = CDToolbarColor(0.16, 0.19, 0.24); border = CDToolbarColor(0.54, 0.60, 0.70);
	} else if (self.pointerInside) {
		background = CDToolbarColor(0.28, 0.32, 0.39); border = CDToolbarColor(0.45, 0.51, 0.60);
	}
	[background setFill]; [path fill];
	[border setStroke]; path.lineWidth = 1.0; [path stroke];
	if (self.toolbarBusy) return;
	NSString *symbolName = self.iconPresentation[@"systemSymbol"];
	if (![symbolName isKindOfClass:NSString.class]) return;
	CGFloat scale = [self.iconPresentation[@"scale"] doubleValue];
	CGFloat pointSize = 16.0 * scale;
	NSImage *image = [NSImage imageWithSystemSymbolName:symbolName accessibilityDescription:nil];
	if (!image) return;
	NSImageSymbolConfiguration *configuration = [NSImageSymbolConfiguration configurationWithPointSize:pointSize weight:NSFontWeightMedium scale:NSImageSymbolScaleMedium];
	image = [image imageWithSymbolConfiguration:configuration] ?: image;
	image.template = YES;
	NSColor *color = self.toolbarDisabled ? CDToolbarColor(0.56, 0.60, 0.67) :
		(self.errorMessage.length ? CDToolbarColor(1.0, 0.83, 0.85) : NSColor.whiteColor);
	CGFloat offsetX = [self.iconPresentation[@"offsetX"] doubleValue];
	CGFloat offsetY = [self.iconPresentation[@"offsetY"] doubleValue];
	NSRect iconRect = NSMakeRect((NSWidth(self.bounds) - pointSize) / 2.0 + offsetX,
		(NSHeight(self.bounds) - pointSize) / 2.0 + offsetY, pointSize, pointSize);
	NSImage *tinted = [[NSImage alloc] initWithSize:iconRect.size];
	[tinted lockFocus];
	[image drawInRect:NSMakeRect(0, 0, iconRect.size.width, iconRect.size.height)];
	[color setFill];
	NSRectFillUsingOperation(NSMakeRect(0, 0, iconRect.size.width, iconRect.size.height), NSCompositingOperationSourceIn);
	[tinted unlockFocus];
	[tinted drawInRect:iconRect];
}

@end

@interface CDToolbarView ()
@property(nonatomic, strong) NSMutableDictionary<NSString *, CDToolbarButton *> *buttonsByID;
@property(nonatomic, copy) NSArray<CDToolbarButton *> *orderedButtons;
@property(nonatomic, strong) NSStackView *columnStack;
@property(nonatomic, copy) NSArray<NSStackView *> *rowStacks;
@end

@implementation CDToolbarView

+ (NSDictionary *)outerBoundsForSpec:(NSDictionary *)spec position:(NSDictionary *)position {
	NSArray *buttons = [spec[@"buttons"] isKindOfClass:NSArray.class] ? spec[@"buttons"] : @[];
	NSUInteger count = MIN((NSUInteger)32, buttons.count);
	NSUInteger columns = MIN(CDToolbarMaxColumns, MAX((NSUInteger)1, count));
	NSUInteger rows = count ? (count + CDToolbarMaxColumns - 1) / CDToolbarMaxColumns : 1;
	CGFloat preferred = CDToolbarHorizontalPadding * 2 + columns * CDToolbarButtonSize + (columns - 1) * CDToolbarButtonGap;
	CGFloat width = count > CDToolbarMaxColumns ? CDToolbarMaxOuterWidth : MAX(CDToolbarMinOuterWidth, preferred);
	CGFloat height = CDToolbarChromeHeight + CDToolbarVerticalPadding * 2 + rows * CDToolbarButtonSize + (rows - 1) * CDToolbarButtonGap;
	return @{@"x": position[@"x"] ?: @0, @"y": position[@"y"] ?: @0, @"width": @(width), @"height": @(height)};
}

- (BOOL)isFlipped { return YES; }

- (instancetype)initWithFrame:(NSRect)frame spec:(NSDictionary *)spec error:(NSError **)error {
	self = [super initWithFrame:frame];
	if (!self) return nil;
	NSArray *buttons = [spec[@"buttons"] isKindOfClass:NSArray.class] ? spec[@"buttons"] : nil;
	uint64_t toolbarRevision = [spec[@"revision"] unsignedLongLongValue];
	if ([spec[@"schemaVersion"] integerValue] != 1 || toolbarRevision == 0 || buttons.count < 1 || buttons.count > 32) {
		if (error) *error = [NSError errorWithDomain:@"OpenDeskToolbar" code:1 userInfo:@{NSLocalizedDescriptionKey: @"invalid toolbar schema or button count"}];
		return nil;
	}
	_buttonsByID = [NSMutableDictionary dictionaryWithCapacity:buttons.count];
	NSMutableArray *ordered = [NSMutableArray arrayWithCapacity:buttons.count];
	NSMutableArray<NSStackView *> *rows = [NSMutableArray array];
	self.wantsLayer = YES;
	self.layer.backgroundColor = CDToolbarColor(0.11, 0.13, 0.16).CGColor;
	self.accessibilityElement = NO;
	_columnStack = [[NSStackView alloc] initWithFrame:NSZeroRect];
	_columnStack.orientation = NSUserInterfaceLayoutOrientationVertical;
	_columnStack.alignment = NSLayoutAttributeLeading;
	_columnStack.distribution = NSStackViewDistributionFill;
	_columnStack.spacing = CDToolbarButtonGap;
	_columnStack.translatesAutoresizingMaskIntoConstraints = NO;
	[self addSubview:_columnStack];
	[NSLayoutConstraint activateConstraints:@[
		[_columnStack.leadingAnchor constraintEqualToAnchor:self.leadingAnchor constant:CDToolbarHorizontalPadding],
		[_columnStack.topAnchor constraintEqualToAnchor:self.topAnchor constant:CDToolbarVerticalPadding],
	]];
	for (NSUInteger index = 0; index < buttons.count; index++) {
		NSDictionary *buttonSpec = [buttons[index] isKindOfClass:NSDictionary.class] ? buttons[index] : nil;
		NSString *identifier = buttonSpec[@"id"];
		NSString *label = buttonSpec[@"label"];
		NSString *icon = buttonSpec[@"icon"];
		NSDictionary *state = [buttonSpec[@"state"] isKindOfClass:NSDictionary.class] ? buttonSpec[@"state"] : nil;
		uint64_t buttonRevision = [state[@"revision"] unsignedLongLongValue];
		NSDictionary *presentation = CDGeneratedToolbarIcons()[icon];
		if (!identifier.length || !label.length || _buttonsByID[identifier] || !presentation ||
			!state || buttonRevision == 0 || buttonRevision > toolbarRevision) {
			if (error) *error = [NSError errorWithDomain:@"OpenDeskToolbar" code:2 userInfo:@{NSLocalizedDescriptionKey: @"invalid, duplicate, or untrusted toolbar button"}];
			return nil;
		}
		NSUInteger rowIndex = index / CDToolbarMaxColumns;
		if (rowIndex == rows.count) {
			NSStackView *row = [[NSStackView alloc] initWithFrame:NSZeroRect];
			row.orientation = NSUserInterfaceLayoutOrientationHorizontal;
			row.alignment = NSLayoutAttributeCenterY;
			row.distribution = NSStackViewDistributionFill;
			row.spacing = CDToolbarButtonGap;
			[_columnStack addArrangedSubview:row];
			[rows addObject:row];
		}
		CDToolbarButton *button = [[CDToolbarButton alloc] initWithFrame:NSZeroRect];
		button.translatesAutoresizingMaskIntoConstraints = NO;
		[NSLayoutConstraint activateConstraints:@[
			[button.widthAnchor constraintEqualToConstant:CDToolbarButtonSize],
			[button.heightAnchor constraintEqualToConstant:CDToolbarButtonSize],
		]];
		button.target = self;
		button.action = @selector(buttonActivated:);
		[button applySpec:buttonSpec presentation:presentation];
		[rows[rowIndex] addArrangedSubview:button];
		_buttonsByID[identifier] = button;
		[ordered addObject:button];
	}
	_rowStacks = rows.copy;
	_orderedButtons = ordered.copy;
	[self layoutSubtreeIfNeeded];
	return self;
}

- (NSArray *)accessibilityChildren { return self.orderedButtons; }

- (void)buttonActivated:(CDToolbarButton *)sender {
	if (!sender.enabled || sender.toolbarBusy || sender.toolbarDisabled || !sender.targetID.length) return;
	[self.eventDelegate floatingToolbarDidActivateButton:sender.targetID];
}

- (NSDictionary *)stateForButtonID:(NSString *)targetID window:(NSWindow *)window {
	CDToolbarButton *button = self.buttonsByID[targetID];
	if (!button) return nil;
	// NSStackView makes button.frame row-local. Convert from the real NSButton
	// coordinate space so Runtime readback stays toolbar-local across rows.
	NSRect local = [self convertRect:button.bounds fromView:button];
	NSDictionary *state = @{
		@"active": @(button.toolbarActive), @"disabled": @(button.toolbarDisabled),
		@"busy": @(button.toolbarBusy), @"error": button.errorMessage ?: @"",
		@"revision": @(button.revision),
	};
	return @{
		@"id": button.targetID, @"label": button.semanticLabel ?: @"", @"icon": button.iconName ?: @"",
		@"state": state, @"renderedText": @"", @"iconPresentation": button.iconPresentation ?: @{},
		@"accessibilityName": button.accessibilityLabel ?: @"",
		@"localBounds": @{@"x": @(NSMinX(local)), @"y": @(NSMinY(local)), @"width": @(NSWidth(local)), @"height": @(NSHeight(local))},
		@"screenBounds": CDToolbarScreenBounds(window, local),
	};
}

- (NSDictionary *)applyButtonSpec:(NSDictionary *)spec window:(NSWindow *)window error:(NSError **)error {
	NSString *targetID = [spec[@"id"] isKindOfClass:NSString.class] ? spec[@"id"] : @"";
	CDToolbarButton *button = self.buttonsByID[targetID];
	NSDictionary *presentation = CDGeneratedToolbarIcons()[spec[@"icon"]];
	NSDictionary *state = [spec[@"state"] isKindOfClass:NSDictionary.class] ? spec[@"state"] : nil;
	NSString *label = [spec[@"label"] isKindOfClass:NSString.class] ? spec[@"label"] : @"";
	uint64_t revision = [state[@"revision"] unsignedLongLongValue];
	if (!button || !label.length || !presentation || !state || revision == 0) {
		if (error) *error = [NSError errorWithDomain:@"OpenDeskToolbar" code:3 userInfo:@{NSLocalizedDescriptionKey: @"invalid toolbar button update"}];
		return nil;
	}
	if (revision > button.revision) [button applySpec:spec presentation:presentation];
	return [self stateForButtonID:targetID window:window];
}

- (void)releaseResources {
	self.eventDelegate = nil;
	for (CDToolbarButton *button in self.orderedButtons) {
		button.target = nil; button.action = nil;
		[button.busyIndicator stopAnimation:nil];
	}
	for (NSStackView *row in self.rowStacks) {
		for (NSView *view in row.arrangedSubviews.copy) {
			[row removeArrangedSubview:view];
			[view removeFromSuperview];
		}
		[self.columnStack removeArrangedSubview:row];
		[row removeFromSuperview];
	}
	[self.buttonsByID removeAllObjects];
	self.orderedButtons = @[];
	self.rowStacks = @[];
}

@end
