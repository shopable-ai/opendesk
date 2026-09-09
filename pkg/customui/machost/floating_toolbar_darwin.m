//go:build darwin && cgo

#import <Cocoa/Cocoa.h>
#import <math.h>
#include <string.h>
#import "floating_toolbar_darwin.h"
#include "toolbar_icons_generated.inc"

static const CGFloat CDToolbarContentItemHeight = 40.0;
static const CGFloat CDToolbarButtonSize = CDToolbarContentItemHeight;
static const CGFloat CDToolbarLabelHeight = CDToolbarContentItemHeight;
static const CGFloat CDToolbarMinLabelWidth = 48.0;
static const CGFloat CDToolbarMaxLabelWidth = 240.0;
static const CGFloat CDToolbarMinControlWidth = 80.0;
static const CGFloat CDToolbarMaxControlWidth = 360.0;
static const CGFloat CDToolbarContentItemGap = 8.0;
static const CGFloat CDToolbarSeparatorThickness = 1.0;
// A spacer uses the preceding standard stack gap and suppresses the following
// one, creating a fixed 8pt group boundary. Giving the view another intrinsic
// track or leaving both stack gaps would create an unintended larger gap.
static const CGFloat CDToolbarSpacerIntrinsicSize = 0.0;
static const CGFloat CDToolbarHorizontalPadding = 10.0;
static const CGFloat CDToolbarVerticalPadding = 8.0;
static const CGFloat CDToolbarMinOuterWidth = 60.0;
static const CGFloat CDToolbarMaxOuterWidth = 960.0;
static const CGFloat CDToolbarChromeHeight = 25.0;
static const NSUInteger CDToolbarMaxColumns = 19;
static const NSUInteger CDToolbarMaxVerticalButtons = 5;
static const NSUInteger CDToolbarMaxItems = 63;
static const NSUInteger CDToolbarMaxVerticalItems = 9;
static const NSUInteger CDToolbarMaxImageBytes = 512 * 1024;
static const NSUInteger CDToolbarMaxTotalImageBytes = 4 * 1024 * 1024;
static const NSUInteger CDToolbarMaxImageDimension = 1024;
static const NSTimeInterval CDToolbarTooltipDelay = 0.55;
static const NSUInteger CDToolbarMaxControlText = 256;
static const NSUInteger CDToolbarMaxOptions = 12;
static const NSUInteger CDToolbarMaxBadgeScalars = 4;

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

static BOOL CDToolbarUnsignedInteger(id value, NSUInteger minimum, NSUInteger maximum, NSUInteger *result) {
	if (![value isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()) return NO;
	double number = [value doubleValue];
	if (!isfinite(number) || floor(number) != number || number < minimum || number > maximum) return NO;
	if (result) *result = (NSUInteger)number;
	return YES;
}

static BOOL CDToolbarFiniteNumber(id value, CGFloat minimum, CGFloat maximum, CGFloat *result) {
	if (![value isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()) return NO;
	double number = [value doubleValue];
	if (!isfinite(number) || number < minimum || number > maximum) return NO;
	if (result) *result = (CGFloat)number;
	return YES;
}

static BOOL CDToolbarBoolean(id value) {
	return value && CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID();
}

static BOOL CDToolbarNumber(id value, double *result) {
	if (![value isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()) return NO;
	double number = [value doubleValue];
	if (!isfinite(number)) return NO;
	if (result) *result = number;
	return YES;
}

static BOOL CDToolbarEmptyOptions(id value) {
	return !value || value == NSNull.null || ([value isKindOfClass:NSArray.class] && [(NSArray *)value count] == 0);
}

static NSUInteger CDToolbarUnicodeScalarCount(NSString *value) {
	NSUInteger count = 0;
	for (NSUInteger index = 0; index < value.length; index++, count++) {
		unichar character = [value characterAtIndex:index];
		if (CFStringIsSurrogateHighCharacter(character) && index + 1 < value.length &&
			CFStringIsSurrogateLowCharacter([value characterAtIndex:index + 1])) index++;
	}
	return count;
}

static BOOL CDToolbarValidIdentifier(NSString *value) {
	if (![value isKindOfClass:NSString.class] || value.length < 1 || value.length > 64) return NO;
	unichar first = [value characterAtIndex:0];
	if (!((first >= 'A' && first <= 'Z') || (first >= 'a' && first <= 'z'))) return NO;
	for (NSUInteger index = 1; index < value.length; index++) {
		unichar character = [value characterAtIndex:index];
		if (!((character >= 'A' && character <= 'Z') || (character >= 'a' && character <= 'z') ||
			(character >= '0' && character <= '9') || character == '_' || character == '-')) return NO;
	}
	return YES;
}

// The Runtime resolves and validates caller paths. The native host accepts only
// a bounded raster payload and independently revalidates it before AppKit sees
// the bytes, so it never receives a caller-selected filesystem path or URL.
static NSDictionary *CDToolbarIconForButtonSpec(NSDictionary *spec, NSImage **customImage,
	NSUInteger *customImageBytes, NSString **message) {
	if (customImage) *customImage = nil;
	if (customImageBytes) *customImageBytes = 0;
	id rawImage = spec[@"iconImage"];
	if (rawImage && rawImage != NSNull.null) {
		NSDictionary *imageSpec = [rawImage isKindOfClass:NSDictionary.class] ? rawImage : nil;
		NSString *builtIn = [spec[@"icon"] isKindOfClass:NSString.class] ? spec[@"icon"] : @"";
		NSSet *allowedKeys = [NSSet setWithArray:@[@"mediaType", @"dataBase64", @"byteLength", @"pixelWidth", @"pixelHeight", @"renderingMode"]];
		for (id key in imageSpec.allKeys) {
			if (![key isKindOfClass:NSString.class] || ![allowedKeys containsObject:key]) {
				if (message) *message = @"custom toolbar icon contains an unsupported field";
				return nil;
			}
		}
		NSString *mediaType = [imageSpec[@"mediaType"] isKindOfClass:NSString.class] ? imageSpec[@"mediaType"] : @"";
		NSString *encoded = [imageSpec[@"dataBase64"] isKindOfClass:NSString.class] ? imageSpec[@"dataBase64"] : @"";
		NSString *renderingMode = [imageSpec[@"renderingMode"] isKindOfClass:NSString.class] ? imageSpec[@"renderingMode"] : @"";
		NSUInteger declaredBytes = 0, declaredWidth = 0, declaredHeight = 0;
		BOOL validMetadata = imageSpec && !builtIn.length &&
			([mediaType isEqualToString:@"image/png"] || [mediaType isEqualToString:@"image/jpeg"]) &&
			([renderingMode isEqualToString:@"original"] || [renderingMode isEqualToString:@"template"]) &&
			CDToolbarUnsignedInteger(imageSpec[@"byteLength"], 1, CDToolbarMaxImageBytes, &declaredBytes) &&
			CDToolbarUnsignedInteger(imageSpec[@"pixelWidth"], 1, CDToolbarMaxImageDimension, &declaredWidth) &&
			CDToolbarUnsignedInteger(imageSpec[@"pixelHeight"], 1, CDToolbarMaxImageDimension, &declaredHeight);
		if (!validMetadata || !encoded.length) {
			if (message) *message = @"custom toolbar icon metadata is invalid";
			return nil;
		}
		NSData *data = [[NSData alloc] initWithBase64EncodedString:encoded options:0];
		if (!data || data.length != declaredBytes || ![[data base64EncodedStringWithOptions:0] isEqualToString:encoded]) {
			if (message) *message = @"custom toolbar icon data is invalid";
			return nil;
		}
		const unsigned char *bytes = data.bytes;
		static const unsigned char pngSignature[] = {0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a};
		BOOL isPNG = data.length >= sizeof(pngSignature) && memcmp(bytes, pngSignature, sizeof(pngSignature)) == 0;
		BOOL isJPEG = data.length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff;
		if (([mediaType isEqualToString:@"image/png"] && !isPNG) || ([mediaType isEqualToString:@"image/jpeg"] && !isJPEG)) {
			if (message) *message = @"custom toolbar icon media type does not match its data";
			return nil;
		}
		NSBitmapImageRep *representation = [NSBitmapImageRep imageRepWithData:data];
		NSImage *image = [[NSImage alloc] initWithData:data];
		if (!representation || !image || representation.pixelsWide != declaredWidth || representation.pixelsHigh != declaredHeight) {
			if (message) *message = @"custom toolbar icon dimensions or raster data are invalid";
			return nil;
		}
		if (customImage) *customImage = image;
		if (customImageBytes) *customImageBytes = declaredBytes;
		return @{ @"kind": @"image", @"mediaType": mediaType, @"pixelWidth": @(declaredWidth),
			@"pixelHeight": @(declaredHeight), @"renderingMode": renderingMode };
	}
	NSString *icon = [spec[@"icon"] isKindOfClass:NSString.class] ? spec[@"icon"] : @"";
	NSDictionary *generated = CDGeneratedToolbarIcons()[icon];
	if (!generated) {
		if (message) *message = @"unknown built-in toolbar icon";
		return nil;
	}
	NSMutableDictionary *presentation = generated.mutableCopy;
	presentation[@"kind"] = @"builtIn";
	return presentation.copy;
}

@interface CDToolbarButton : NSButton
@property(nonatomic, copy) NSString *targetID;
@property(nonatomic, copy) NSString *semanticLabel;
@property(nonatomic, copy) NSString *iconName;
@property(nonatomic, copy) NSDictionary *iconPresentation;
@property(nonatomic, strong) NSImage *customIconImage;
@property(nonatomic, copy) NSString *customIconRenderingMode;
@property(nonatomic) NSUInteger customIconByteLength;
@property(nonatomic, copy) NSString *errorMessage;
@property(nonatomic, copy) NSString *badgeText;
@property(nonatomic) BOOL toolbarActive;
@property(nonatomic) BOOL toolbarDisabled;
@property(nonatomic) BOOL toolbarBusy;
@property(nonatomic) BOOL pointerInside;
@property(nonatomic) BOOL toolbarPressed;
@property(nonatomic) uint64_t revision;
@property(nonatomic, strong) NSProgressIndicator *busyIndicator;
@property(nonatomic, strong) NSTextField *badgeLabel;
@property(nonatomic, strong) NSTrackingArea *hoverTrackingArea;
@property(nonatomic, strong) NSPanel *tooltipPanel;
@property(nonatomic) NSUInteger tooltipGeneration;
- (void)invalidateTooltip;
- (void)layoutBadge;
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
		_badgeLabel = [NSTextField labelWithString:@""];
		_badgeLabel.frame = NSMakeRect(22, 1, 17, 15);
		_badgeLabel.alignment = NSTextAlignmentCenter;
		_badgeLabel.font = [NSFont systemFontOfSize:9 weight:NSFontWeightBold];
		_badgeLabel.textColor = NSColor.whiteColor;
		_badgeLabel.wantsLayer = YES;
		_badgeLabel.layer.backgroundColor = CDToolbarColor(0.90, 0.18, 0.25).CGColor;
		_badgeLabel.layer.cornerRadius = 7.5;
		_badgeLabel.hidden = YES;
		_badgeLabel.accessibilityElement = NO;
		_badgeLabel.accessibilityHidden = YES;
		[self addSubview:_badgeLabel];
	}
	return self;
}

- (void)layout {
	[super layout];
	[self layoutBadge];
}

- (void)layoutBadge {
	NSFont *font = [NSFont systemFontOfSize:9 weight:NSFontWeightBold];
	CGFloat measured = [self.badgeText sizeWithAttributes:@{NSFontAttributeName: font}].width;
	if (measured > 23.0) {
		font = [NSFont systemFontOfSize:MAX(5.5, 9.0 * 23.0 / measured) weight:NSFontWeightBold];
		measured = [self.badgeText sizeWithAttributes:@{NSFontAttributeName: font}].width;
	}
	self.badgeLabel.font = font;
	CGFloat badgeWidth = MIN(29.0, MAX(15.0, ceil(measured) + 6.0));
	self.badgeLabel.frame = NSMakeRect(NSWidth(self.bounds) - badgeWidth - 1.0, 1.0, badgeWidth, 15.0);
}

- (BOOL)acceptsFirstMouse:(NSEvent *)event { (void)event; return YES; }

- (BOOL)isAccessibilityElement { return YES; }

- (NSString *)accessibilityRole { return NSAccessibilityButtonRole; }

- (void)updateTrackingAreas {
	[super updateTrackingAreas];
	// Only replace the area owned by our hover/tooltip rendering; AppKit and
	// NSButton may own other tracking areas that must remain intact.
	if (self.hoverTrackingArea && [self.trackingAreas containsObject:self.hoverTrackingArea]) {
		[self removeTrackingArea:self.hoverTrackingArea];
	}
	NSTrackingAreaOptions options = NSTrackingMouseEnteredAndExited | NSTrackingActiveAlways | NSTrackingInVisibleRect;
	self.hoverTrackingArea = [[NSTrackingArea alloc] initWithRect:self.bounds options:options owner:self userInfo:nil];
	[self addTrackingArea:self.hoverTrackingArea];
}

- (void)mouseEntered:(NSEvent *)event {
	(void)event;
	self.pointerInside = YES;
	[self setNeedsDisplay:YES];
	[self scheduleTooltip];
}

- (void)mouseExited:(NSEvent *)event {
	(void)event;
	self.pointerInside = NO;
	[self setNeedsDisplay:YES];
	[self invalidateTooltip];
}

- (void)scheduleTooltip {
	[self invalidateTooltip];
	if (!self.pointerInside || !self.semanticLabel.length || !self.window) return;
	NSUInteger generation = ++self.tooltipGeneration;
	__weak CDToolbarButton *weakSelf = self;
	dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(CDToolbarTooltipDelay * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
		CDToolbarButton *button = weakSelf;
		if (!button || !button.pointerInside || button.tooltipGeneration != generation || !button.window) return;
		[button showTooltip];
	});
}

- (void)showTooltip {
	if (!self.pointerInside || !self.semanticLabel.length || !self.window) return;
	[self.tooltipPanel close];

	NSFont *font = [NSFont systemFontOfSize:12.0 weight:NSFontWeightRegular];
	NSDictionary *attributes = @{NSFontAttributeName: font};
	NSRect measured = [self.semanticLabel boundingRectWithSize:NSMakeSize(300.0, CGFLOAT_MAX)
		options:NSStringDrawingUsesLineFragmentOrigin | NSStringDrawingUsesFontLeading attributes:attributes];
	// NSTextField's cell keeps a small internal horizontal inset that is not
	// included in NSString's glyph bounds. Reserve it so the final CJK glyph
	// is not clipped at the right edge.
	CGFloat textWidth = MIN(300.0, MAX(1.0, ceil(NSWidth(measured)) + 8.0));
	CGFloat textHeight = MAX(15.0, ceil(NSHeight(measured)));
	NSSize panelSize = NSMakeSize(textWidth + 20.0, textHeight + 12.0);

	NSPanel *panel = [[NSPanel alloc] initWithContentRect:NSMakeRect(0, 0, panelSize.width, panelSize.height)
		styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel
		backing:NSBackingStoreBuffered defer:NO];
	panel.opaque = NO;
	panel.backgroundColor = NSColor.clearColor;
	panel.hasShadow = YES;
	panel.hidesOnDeactivate = NO;
	panel.ignoresMouseEvents = YES;
	panel.releasedWhenClosed = NO;
	panel.becomesKeyOnlyIfNeeded = YES;
	panel.level = self.window.level + 1;
	panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary;

	NSView *background = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, panelSize.width, panelSize.height)];
	background.wantsLayer = YES;
	background.layer.backgroundColor = [NSColor colorWithCalibratedWhite:0.12 alpha:0.96].CGColor;
	background.layer.cornerRadius = 5.0;
	background.layer.borderWidth = 0.5;
	background.layer.borderColor = [NSColor colorWithCalibratedWhite:0.55 alpha:0.75].CGColor;

	NSTextField *label = [NSTextField labelWithString:self.semanticLabel];
	label.frame = NSMakeRect(10.0, 6.0, textWidth, textHeight);
	label.font = font;
	label.textColor = NSColor.whiteColor;
	label.lineBreakMode = NSLineBreakByWordWrapping;
	label.maximumNumberOfLines = 0;
	[background addSubview:label];
	panel.contentView = background;

	NSRect buttonInWindow = [self convertRect:self.bounds toView:nil];
	NSRect buttonOnScreen = [self.window convertRectToScreen:buttonInWindow];
	NSScreen *screen = self.window.screen ?: NSScreen.mainScreen ?: NSScreen.screens.firstObject;
	NSRect visible = screen ? screen.visibleFrame : NSMakeRect(0, 0, 1440, 900);
	CGFloat x = NSMidX(buttonOnScreen) - panelSize.width / 2.0;
	CGFloat y = NSMinY(buttonOnScreen) - panelSize.height - 7.0;
	if (y < NSMinY(visible)) y = NSMaxY(buttonOnScreen) + 7.0;
	x = MIN(MAX(x, NSMinX(visible) + 4.0), NSMaxX(visible) - panelSize.width - 4.0);
	y = MIN(MAX(y, NSMinY(visible) + 4.0), NSMaxY(visible) - panelSize.height - 4.0);
	[panel setFrameOrigin:NSMakePoint(round(x), round(y))];
	[panel orderFrontRegardless];
	self.tooltipPanel = panel;
}

- (void)invalidateTooltip {
	self.tooltipGeneration++;
	[self.tooltipPanel orderOut:nil];
	[self.tooltipPanel close];
	self.tooltipPanel = nil;
}

- (void)setHighlighted:(BOOL)highlighted {
	[super setHighlighted:highlighted];
	[self setNeedsDisplay:YES];
}

- (void)mouseDown:(NSEvent *)event {
	if (!self.enabled || self.toolbarBusy || self.toolbarDisabled) return;
	[self invalidateTooltip];
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

- (void)applySpec:(NSDictionary *)spec presentation:(NSDictionary *)presentation customImage:(NSImage *)customImage customImageBytes:(NSUInteger)customImageBytes {
	NSDictionary *state = [spec[@"state"] isKindOfClass:NSDictionary.class] ? spec[@"state"] : @{};
	self.targetID = spec[@"id"];
	self.semanticLabel = spec[@"label"];
	self.iconName = [spec[@"icon"] isKindOfClass:NSString.class] ? spec[@"icon"] : @"";
	self.iconPresentation = presentation;
	self.customIconImage = customImage;
	self.customIconRenderingMode = [presentation[@"renderingMode"] isKindOfClass:NSString.class] ? presentation[@"renderingMode"] : @"";
	self.customIconByteLength = customImageBytes;
	self.toolbarActive = [state[@"active"] boolValue];
	self.toolbarDisabled = [state[@"disabled"] boolValue];
	self.toolbarBusy = [state[@"busy"] boolValue];
	self.errorMessage = [state[@"error"] isKindOfClass:NSString.class] ? state[@"error"] : @"";
	self.badgeText = [spec[@"badge"] isKindOfClass:NSString.class] ? spec[@"badge"] : @"";
	self.revision = [state[@"revision"] unsignedLongLongValue];
	self.enabled = !self.toolbarDisabled && !self.toolbarBusy;
	// The toolbar is deliberately nonactivating. AppKit's standard NSView
	// tooltip manager does not reliably present for such panels, so the label
	// is rendered by our own nonactivating native tooltip panel instead.
	self.toolTip = nil;
	self.accessibilityLabel = self.semanticLabel;
	self.accessibilityHelp = self.errorMessage.length ? self.errorMessage : nil;
	self.accessibilityValue = self.badgeText.length ?
		[NSString stringWithFormat:@"%@; badge %@", self.toolbarActive ? @"active" : @"inactive", self.badgeText] : @(self.toolbarActive);
	self.badgeLabel.stringValue = self.badgeText;
	[self layoutBadge];
	self.badgeLabel.hidden = !self.badgeText.length || self.toolbarBusy;
	if (self.toolbarBusy) {
		self.busyIndicator.hidden = NO;
		[self.busyIndicator startAnimation:nil];
	} else {
		[self.busyIndicator stopAnimation:nil];
		self.busyIndicator.hidden = YES;
	}
	[self setNeedsDisplay:YES];
	NSAccessibilityPostNotification(self, NSAccessibilityValueChangedNotification);
	if (self.pointerInside) [self scheduleTooltip];
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
	if (self.customIconImage) {
		CGFloat pixelWidth = [self.iconPresentation[@"pixelWidth"] doubleValue];
		CGFloat pixelHeight = [self.iconPresentation[@"pixelHeight"] doubleValue];
		if (pixelWidth <= 0 || pixelHeight <= 0) return;
		CGFloat maximum = 22.0;
		CGFloat scale = MIN(maximum / pixelWidth, maximum / pixelHeight);
		NSSize size = NSMakeSize(MAX(1.0, round(pixelWidth * scale)), MAX(1.0, round(pixelHeight * scale)));
		NSRect iconRect = NSMakeRect(round((NSWidth(self.bounds) - size.width) / 2.0),
			round((NSHeight(self.bounds) - size.height) / 2.0), size.width, size.height);
		if ([self.customIconRenderingMode isEqualToString:@"original"]) {
			CGFloat opacity = self.toolbarDisabled ? 0.42 : 1.0;
			[self.customIconImage drawInRect:iconRect fromRect:NSZeroRect operation:NSCompositingOperationSourceOver
				fraction:opacity respectFlipped:YES hints:nil];
			return;
		}
		NSColor *color = self.toolbarDisabled ? CDToolbarColor(0.56, 0.60, 0.67) :
			(self.errorMessage.length ? CDToolbarColor(1.0, 0.83, 0.85) : NSColor.whiteColor);
		NSImage *tinted = [[NSImage alloc] initWithSize:size];
		[tinted lockFocus];
		[self.customIconImage drawInRect:NSMakeRect(0, 0, size.width, size.height) fromRect:NSZeroRect
			operation:NSCompositingOperationSourceOver fraction:1.0 respectFlipped:NO hints:nil];
		[color setFill];
		NSRectFillUsingOperation(NSMakeRect(0, 0, size.width, size.height), NSCompositingOperationSourceIn);
		[tinted unlockFocus];
		[tinted drawInRect:iconRect fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1.0 respectFlipped:YES hints:nil];
		return;
	}
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

@interface CDToolbarLabelTextField : NSTextField
@end

@implementation CDToolbarLabelTextField

- (NSEdgeInsets)alignmentRectInsets {
	return NSEdgeInsetsMake(0, 0, 0, 0);
}

@end

@interface CDToolbarLabel : NSView
@property(nonatomic, copy) NSString *targetID;
@property(nonatomic, copy) NSString *tone;
@property(nonatomic, copy) NSString *verticalAlignment;
@property(nonatomic) uint64_t revision;
@property(nonatomic, strong, readonly) NSTextField *textField;
@property(nonatomic, strong) NSLayoutConstraint *verticalConstraint;
- (void)applySpec:(NSDictionary *)spec;
- (NSRect)renderedTextBounds;
- (BOOL)isTextTruncated;
@end

@implementation CDToolbarLabel

static const CGFloat CDToolbarLabelHorizontalInset = 4.0;
static const CGFloat CDToolbarLabelVerticalInset = 4.0;

// FloatingWindow width/height are a public fixed-frame contract, so keep Auto
// Layout constraints aligned with the wrapper bounds used for native readback.
// The nested NSTextField supplies native text shaping/truncation while this
// wrapper explicitly positions its intrinsic-height peer on the vertical axis.
- (NSEdgeInsets)alignmentRectInsets {
	return NSEdgeInsetsMake(0, 0, 0, 0);
}

- (instancetype)initWithFrame:(NSRect)frameRect {
	self = [super initWithFrame:frameRect];
	if (self) {
		_textField = [[CDToolbarLabelTextField alloc] initWithFrame:NSZeroRect];
		_textField.editable = NO;
		_textField.selectable = NO;
		_textField.bezeled = NO;
		_textField.drawsBackground = NO;
		_textField.maximumNumberOfLines = 1;
		_textField.lineBreakMode = NSLineBreakByTruncatingTail;
		_textField.font = [NSFont monospacedDigitSystemFontOfSize:13.0 weight:NSFontWeightMedium];
		_textField.translatesAutoresizingMaskIntoConstraints = NO;
		_textField.accessibilityElement = NO;
		_textField.accessibilityHidden = YES;
		[self addSubview:_textField];
		[NSLayoutConstraint activateConstraints:@[
			[_textField.leadingAnchor constraintEqualToAnchor:self.leadingAnchor constant:CDToolbarLabelHorizontalInset],
			[_textField.trailingAnchor constraintEqualToAnchor:self.trailingAnchor constant:-CDToolbarLabelHorizontalInset],
		]];
		self.accessibilityElement = YES;
		self.accessibilityRole = NSAccessibilityStaticTextRole;
	}
	return self;
}

- (void)applyVerticalAlignment:(NSString *)alignment {
	[self.verticalConstraint setActive:NO];
	self.verticalAlignment = alignment;
	if ([alignment isEqualToString:@"top"]) {
		self.verticalConstraint = [self.textField.topAnchor constraintEqualToAnchor:self.topAnchor constant:CDToolbarLabelVerticalInset];
	} else if ([alignment isEqualToString:@"bottom"]) {
		self.verticalConstraint = [self.textField.bottomAnchor constraintEqualToAnchor:self.bottomAnchor constant:-CDToolbarLabelVerticalInset];
	} else {
		self.verticalConstraint = [self.textField.centerYAnchor constraintEqualToAnchor:self.centerYAnchor];
	}
	self.verticalConstraint.active = YES;
	[self setNeedsLayout:YES];
}

- (void)applySpec:(NSDictionary *)spec {
	self.targetID = spec[@"id"];
	self.textField.stringValue = spec[@"text"];
	self.tone = spec[@"tone"];
	self.revision = [spec[@"revision"] unsignedLongLongValue];
	NSString *alignment = spec[@"alignment"];
	if ([alignment isEqualToString:@"center"]) self.textField.alignment = NSTextAlignmentCenter;
	else if ([alignment isEqualToString:@"trailing"]) self.textField.alignment = NSTextAlignmentRight;
	else self.textField.alignment = NSTextAlignmentLeft;
	[self applyVerticalAlignment:spec[@"verticalAlignment"]];
	if ([self.tone isEqualToString:@"secondary"]) self.textField.textColor = CDToolbarColor(0.66, 0.70, 0.77);
	else if ([self.tone isEqualToString:@"success"]) self.textField.textColor = CDToolbarColor(0.42, 0.82, 0.57);
	else if ([self.tone isEqualToString:@"warning"]) self.textField.textColor = CDToolbarColor(0.96, 0.72, 0.32);
	else if ([self.tone isEqualToString:@"error"]) self.textField.textColor = CDToolbarColor(1.0, 0.55, 0.59);
	else self.textField.textColor = NSColor.whiteColor;
	self.accessibilityLabel = self.textField.stringValue;
	self.accessibilityValue = self.textField.stringValue;
	[self setNeedsDisplay:YES];
	NSAccessibilityPostNotification(self, NSAccessibilityValueChangedNotification);
}

- (NSRect)renderedTextBounds {
	[self layoutSubtreeIfNeeded];
	NSTextFieldCell *cell = (NSTextFieldCell *)self.textField.cell;
	NSRect drawing = [cell drawingRectForBounds:self.textField.bounds];
	NSDictionary *attributes = @{NSFontAttributeName: self.textField.font ?: [NSFont systemFontOfSize:13.0]};
	NSSize measured = [self.textField.stringValue sizeWithAttributes:attributes];
	CGFloat visibleWidth = MIN(ceil(measured.width), NSWidth(drawing));
	CGFloat visibleHeight = MIN(ceil(measured.height), NSHeight(drawing));
	CGFloat x = NSMinX(drawing);
	if (self.textField.alignment == NSTextAlignmentCenter) x = NSMidX(drawing) - visibleWidth / 2.0;
	else if (self.textField.alignment == NSTextAlignmentRight) x = NSMaxX(drawing) - visibleWidth;
	NSRect glyphs = NSMakeRect(x, NSMidY(drawing) - visibleHeight / 2.0, visibleWidth, visibleHeight);
	return [self convertRect:glyphs fromView:self.textField];
}

- (BOOL)isTextTruncated {
	[self layoutSubtreeIfNeeded];
	NSTextFieldCell *cell = (NSTextFieldCell *)self.textField.cell;
	NSRect drawing = [cell drawingRectForBounds:self.textField.bounds];
	NSDictionary *attributes = @{NSFontAttributeName: self.textField.font ?: [NSFont systemFontOfSize:13.0]};
	return ceil([self.textField.stringValue sizeWithAttributes:attributes].width) > NSWidth(drawing);
}

@end

@interface CDToolbarInputField : NSTextField
@end

@implementation CDToolbarInputField
- (BOOL)acceptsFirstMouse:(NSEvent *)event { (void)event; return YES; }

- (void)mouseDown:(NSEvent *)event {
	if (!self.enabled) return;
	// Input is the only FloatingWindow primitive allowed to activate the host.
	// show() remains order-front-only; activation happens solely after a direct
	// user gesture enters the real native text field.
	[NSApp activateIgnoringOtherApps:YES];
	[self.window makeKeyWindow];
	[super mouseDown:event];
}
@end

@interface CDToolbarControlView : NSView
@property(nonatomic, copy) NSString *targetID;
@property(nonatomic, copy) NSString *kind;
@property(nonatomic, copy) NSString *semanticLabel;
@property(nonatomic, copy) NSArray<NSString *> *optionValues;
@property(nonatomic, strong) NSView *nativeControl;
@property(nonatomic, strong) NSTextField *textLabel;
@property(nonatomic) NSUInteger maxLength;
@property(nonatomic, copy) NSDictionary *appliedSpec;
@property(nonatomic) uint64_t revision;
- (BOOL)configureWithSpec:(NSDictionary *)spec target:(id)target action:(SEL)action inputDelegate:(id<NSTextFieldDelegate>)inputDelegate;
- (void)applySpec:(NSDictionary *)spec;
- (id)renderedValue;
- (NSString *)accessibilityRoleName;
@end

@implementation CDToolbarControlView

- (NSEdgeInsets)alignmentRectInsets { return NSEdgeInsetsMake(0, 0, 0, 0); }

- (BOOL)configureWithSpec:(NSDictionary *)spec target:(id)target action:(SEL)action inputDelegate:(id<NSTextFieldDelegate>)inputDelegate {
	self.targetID = spec[@"id"];
	self.kind = spec[@"kind"];
	self.semanticLabel = spec[@"label"];
	CGFloat width = [spec[@"width"] doubleValue];
	NSView *control = nil;
	if ([self.kind isEqualToString:@"switch"]) {
		NSSwitch *toggle = [[NSSwitch alloc] initWithFrame:NSMakeRect(MAX(0, width - 42), 9, 38, 22)];
		toggle.accessibilityRole = NSAccessibilityCheckBoxRole;
		toggle.accessibilitySubrole = NSAccessibilitySwitchSubrole;
		NSTextField *label = [NSTextField labelWithString:self.semanticLabel];
		label.frame = NSMakeRect(0, 11, MAX(1, width - 48), 18);
		label.textColor = NSColor.labelColor;
		label.lineBreakMode = NSLineBreakByTruncatingTail;
		label.accessibilityElement = NO;
		label.accessibilityHidden = YES;
		[self addSubview:label];
		self.textLabel = label;
		control = (NSView *)toggle;
	} else if ([self.kind isEqualToString:@"checkbox"]) {
		NSButton *checkbox = [NSButton checkboxWithTitle:self.semanticLabel target:target action:action];
		checkbox.accessibilityRole = NSAccessibilityCheckBoxRole;
		checkbox.frame = NSMakeRect(0, 7, width, 26);
		control = (NSView *)checkbox;
	} else if ([self.kind isEqualToString:@"input"]) {
		CDToolbarInputField *input = [[CDToolbarInputField alloc] initWithFrame:NSMakeRect(0, 6, width, 28)];
		input.accessibilityRole = NSAccessibilityTextFieldRole;
		input.delegate = inputDelegate;
		input.target = target;
		input.action = action;
		input.bezelStyle = NSTextFieldRoundedBezel;
		control = (NSView *)input;
	} else if ([self.kind isEqualToString:@"select"]) {
		NSPopUpButton *select = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(0, 6, width, 28) pullsDown:NO];
		select.accessibilityRole = NSAccessibilityPopUpButtonRole;
		NSMutableArray *values = [NSMutableArray array];
		for (NSDictionary *option in spec[@"options"] ?: @[]) {
			[select addItemWithTitle:option[@"label"] ?: @""];
			[values addObject:option[@"value"] ?: @""];
		}
		self.optionValues = values.copy;
		control = (NSView *)select;
	} else if ([self.kind isEqualToString:@"slider"]) {
		NSSlider *slider = [[NSSlider alloc] initWithFrame:NSMakeRect(0, 7, width, 26)];
		slider.accessibilityRole = NSAccessibilitySliderRole;
		slider.continuous = YES;
		control = (NSView *)slider;
	} else if ([self.kind isEqualToString:@"segmentedControl"]) {
		NSArray *options = spec[@"options"] ?: @[];
		NSSegmentedControl *segmented = [[NSSegmentedControl alloc] initWithFrame:NSMakeRect(0, 5, width, 30)];
		segmented.trackingMode = NSSegmentSwitchTrackingSelectOne;
		segmented.accessibilityRole = NSAccessibilityRadioGroupRole;
		segmented.segmentCount = options.count;
		NSMutableArray *values = [NSMutableArray arrayWithCapacity:options.count];
		for (NSUInteger index = 0; index < options.count; index++) {
			NSDictionary *option = options[index];
			[segmented setLabel:option[@"label"] ?: @"" forSegment:index];
			[values addObject:option[@"value"] ?: @""];
		}
		self.optionValues = values.copy;
		control = (NSView *)segmented;
	} else if ([self.kind isEqualToString:@"progress"]) {
		NSProgressIndicator *progress = [[NSProgressIndicator alloc] initWithFrame:NSMakeRect(0, 12, width, 16)];
		progress.accessibilityRole = NSAccessibilityProgressIndicatorRole;
		progress.style = NSProgressIndicatorStyleBar;
		control = progress;
	}
	if (!control) return NO;
	self.nativeControl = control;
	control.identifier = self.targetID;
	if ([control respondsToSelector:@selector(setTarget:)]) [(id)control setTarget:target];
	if ([control respondsToSelector:@selector(setAction:)]) [(id)control setAction:action];
	control.toolTip = self.semanticLabel;
	control.accessibilityLabel = self.semanticLabel;
	[self addSubview:control];
	[self applySpec:spec];
	return YES;
}

- (void)applySpec:(NSDictionary *)spec {
	self.appliedSpec = spec.copy;
	self.revision = [spec[@"revision"] unsignedLongLongValue];
	self.semanticLabel = spec[@"label"];
	BOOL disabled = [spec[@"disabled"] boolValue];
	if ([self.nativeControl respondsToSelector:@selector(setEnabled:)]) [(id)self.nativeControl setEnabled:!disabled];
	self.textLabel.textColor = disabled ? NSColor.disabledControlTextColor : NSColor.labelColor;
	self.nativeControl.toolTip = self.semanticLabel;
	self.nativeControl.accessibilityLabel = self.semanticLabel;
	if ([self.kind isEqualToString:@"switch"]) {
		((NSSwitch *)self.nativeControl).state = [spec[@"checked"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff;
	} else if ([self.kind isEqualToString:@"checkbox"]) {
		((NSButton *)self.nativeControl).state = [spec[@"checked"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff;
	} else if ([self.kind isEqualToString:@"input"]) {
		NSTextField *input = (NSTextField *)self.nativeControl;
		input.stringValue = spec[@"text"] ?: @"";
		input.placeholderString = spec[@"placeholder"] ?: @"";
		self.maxLength = [spec[@"maxLength"] unsignedIntegerValue];
	} else if ([self.kind isEqualToString:@"select"]) {
		NSUInteger index = [self.optionValues indexOfObject:spec[@"selected"] ?: @""];
		if (index != NSNotFound) [(NSPopUpButton *)self.nativeControl selectItemAtIndex:index];
	} else if ([self.kind isEqualToString:@"slider"]) {
		NSSlider *slider = (NSSlider *)self.nativeControl;
		slider.minValue = [spec[@"min"] doubleValue];
		slider.maxValue = [spec[@"max"] doubleValue];
		slider.altIncrementValue = [spec[@"step"] doubleValue];
		slider.doubleValue = [spec[@"value"] doubleValue];
	} else if ([self.kind isEqualToString:@"segmentedControl"]) {
		NSUInteger index = [self.optionValues indexOfObject:spec[@"selected"] ?: @""];
		((NSSegmentedControl *)self.nativeControl).selectedSegment = index == NSNotFound ? -1 : (NSInteger)index;
	} else if ([self.kind isEqualToString:@"progress"]) {
		NSProgressIndicator *progress = (NSProgressIndicator *)self.nativeControl;
		progress.minValue = [spec[@"min"] doubleValue];
		progress.maxValue = [spec[@"max"] doubleValue];
		progress.doubleValue = [spec[@"value"] doubleValue];
		progress.indeterminate = [spec[@"indeterminate"] boolValue];
		if (progress.indeterminate && self.window.visible) [progress startAnimation:nil]; else [progress stopAnimation:nil];
	}
	NSAccessibilityPostNotification(self.nativeControl, NSAccessibilityValueChangedNotification);
}

- (id)renderedValue {
	if ([self.kind isEqualToString:@"switch"]) return [NSNumber numberWithBool:((NSSwitch *)self.nativeControl).state == NSControlStateValueOn];
	if ([self.kind isEqualToString:@"checkbox"]) return [NSNumber numberWithBool:((NSButton *)self.nativeControl).state == NSControlStateValueOn];
	if ([self.kind isEqualToString:@"input"]) return ((NSTextField *)self.nativeControl).stringValue ?: @"";
	if ([self.kind isEqualToString:@"select"]) {
		NSInteger index = ((NSPopUpButton *)self.nativeControl).indexOfSelectedItem;
		return index >= 0 && index < (NSInteger)self.optionValues.count ? self.optionValues[(NSUInteger)index] : @"";
	}
	if ([self.kind isEqualToString:@"segmentedControl"]) {
		NSInteger index = ((NSSegmentedControl *)self.nativeControl).selectedSegment;
		return index >= 0 && index < (NSInteger)self.optionValues.count ? self.optionValues[(NSUInteger)index] : @"";
	}
	if ([self.kind isEqualToString:@"slider"]) return @(((NSSlider *)self.nativeControl).doubleValue);
	if ([self.kind isEqualToString:@"progress"]) return ((NSProgressIndicator *)self.nativeControl).indeterminate ? NSNull.null : @(((NSProgressIndicator *)self.nativeControl).doubleValue);
	return NSNull.null;
}

- (NSString *)accessibilityRoleName {
	if ([self.kind isEqualToString:@"switch"]) return @"AXSwitch";
	if ([self.kind isEqualToString:@"checkbox"]) return @"AXCheckBox";
	if ([self.kind isEqualToString:@"input"]) return @"AXTextField";
	if ([self.kind isEqualToString:@"select"]) return @"AXPopUpButton";
	if ([self.kind isEqualToString:@"slider"]) return @"AXSlider";
	if ([self.kind isEqualToString:@"segmentedControl"]) return @"AXRadioGroup";
	return @"AXProgressIndicator";
}

@end

// Structural toolbar primitives intentionally do not inherit NSButton. They
// have no target/action, focus ring, tooltip, callback state, or Accessibility
// element, so they cannot be mistaken for actionable controls by AppKit/AX.
@interface CDToolbarSeparator : NSView
@property(nonatomic) BOOL vertical;
@end

@implementation CDToolbarSeparator

- (instancetype)initWithVertical:(BOOL)vertical {
	self = [super initWithFrame:NSZeroRect];
	if (self) {
		_vertical = vertical;
		self.wantsLayer = YES;
		self.accessibilityElement = NO;
		self.accessibilityHidden = YES;
	}
	return self;
}

- (void)drawRect:(NSRect)dirtyRect {
	(void)dirtyRect;
	[[CDToolbarColor(0.48, 0.53, 0.61) colorWithAlphaComponent:0.72] setFill];
	if (self.vertical) {
		NSRectFill(NSMakeRect(floor((NSWidth(self.bounds) - CDToolbarSeparatorThickness) / 2.0), 0,
			CDToolbarSeparatorThickness, NSHeight(self.bounds)));
	} else {
		NSRectFill(NSMakeRect(0, floor((NSHeight(self.bounds) - CDToolbarSeparatorThickness) / 2.0),
			NSWidth(self.bounds), CDToolbarSeparatorThickness));
	}
}

@end

@interface CDToolbarSpacer : NSView
@end

@implementation CDToolbarSpacer

- (instancetype)init {
	self = [super initWithFrame:NSZeroRect];
	if (self) {
		self.accessibilityElement = NO;
		self.accessibilityHidden = YES;
	}
	return self;
}

@end

static BOOL CDToolbarIsStructuralItem(NSDictionary *item) {
	NSString *type = [item[@"type"] isKindOfClass:NSString.class] ? item[@"type"] : @"";
	return [type isEqualToString:@"separator"] || [type isEqualToString:@"spacer"];
}

static BOOL CDToolbarIsButtonItem(NSDictionary *item) {
	NSString *type = [item[@"type"] isKindOfClass:NSString.class] ? item[@"type"] : @"";
	return [type isEqualToString:@"button"];
}

static BOOL CDToolbarIsLabelItem(NSDictionary *item) {
	NSString *type = [item[@"type"] isKindOfClass:NSString.class] ? item[@"type"] : @"";
	return [type isEqualToString:@"label"];
}

static BOOL CDToolbarIsControlType(NSString *type) {
	return [type isEqualToString:@"switch"] || [type isEqualToString:@"checkbox"] ||
		[type isEqualToString:@"input"] || [type isEqualToString:@"select"] ||
		[type isEqualToString:@"slider"] || [type isEqualToString:@"segmentedControl"] ||
		[type isEqualToString:@"progress"];
}

static BOOL CDToolbarIsControlItem(NSDictionary *item) {
	NSString *type = [item[@"type"] isKindOfClass:NSString.class] ? item[@"type"] : @"";
	return CDToolbarIsControlType(type);
}

static BOOL CDToolbarIsContentItem(NSDictionary *item) {
	return CDToolbarIsButtonItem(item) || CDToolbarIsLabelItem(item) || CDToolbarIsControlItem(item);
}

static CGFloat CDToolbarItemWidth(NSDictionary *item) {
	if (CDToolbarIsButtonItem(item)) return CDToolbarButtonSize;
	if (CDToolbarIsLabelItem(item)) return [item[@"label"][@"width"] doubleValue];
	if (CDToolbarIsControlItem(item)) return [item[@"control"][@"width"] doubleValue];
	NSString *type = item[@"type"];
	if ([type isEqualToString:@"separator"]) return CDToolbarSeparatorThickness;
	if ([type isEqualToString:@"spacer"]) return CDToolbarSpacerIntrinsicSize;
	return 0;
}

static CGFloat CDToolbarItemHeight(NSDictionary *item, BOOL vertical) {
	if (CDToolbarIsButtonItem(item)) return CDToolbarButtonSize;
	if (CDToolbarIsLabelItem(item)) return CDToolbarLabelHeight;
	if (CDToolbarIsControlItem(item)) return CDToolbarContentItemHeight;
	NSString *type = item[@"type"];
	if ([type isEqualToString:@"separator"]) return vertical ? CDToolbarSeparatorThickness : CDToolbarContentItemHeight;
	if ([type isEqualToString:@"spacer"]) return vertical ? CDToolbarSpacerIntrinsicSize : CDToolbarContentItemHeight;
	return 0;
}

static CGFloat CDToolbarRowWidth(NSArray<NSDictionary *> *row) {
	CGFloat width = 0;
	for (NSUInteger index = 0; index < row.count; index++) {
		if (index && ![row[index - 1][@"type"] isEqualToString:@"spacer"]) width += CDToolbarContentItemGap;
		width += CDToolbarItemWidth(row[index]);
	}
	return width;
}

static BOOL CDToolbarValidBadge(id rawBadge) {
	if (!rawBadge || rawBadge == NSNull.null) return YES;
	if (![rawBadge isKindOfClass:NSString.class]) return NO;
	NSString *badge = rawBadge;
	return badge.length > 0 && CDToolbarUnicodeScalarCount(badge) <= CDToolbarMaxBadgeScalars &&
		[[badge stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] isEqualToString:badge] &&
		[badge rangeOfCharacterFromSet:[NSCharacterSet characterSetWithCharactersInString:@"\r\n\t"]].location == NSNotFound;
}

static BOOL CDToolbarValidControl(NSDictionary *item, uint64_t toolbarRevision) {
	NSDictionary *control = [item[@"control"] isKindOfClass:NSDictionary.class] ? item[@"control"] : nil;
	NSString *type = [item[@"type"] isKindOfClass:NSString.class] ? item[@"type"] : @"";
	NSString *identifier = [item[@"id"] isKindOfClass:NSString.class] ? item[@"id"] : @"";
	NSString *kind = [control[@"kind"] isKindOfClass:NSString.class] ? control[@"kind"] : @"";
	NSString *label = [control[@"label"] isKindOfClass:NSString.class] ? control[@"label"] : @"";
	CGFloat width = 0;
	NSUInteger revisionValue = 0, maxLength = 0;
	double minimum = 0, maximum = 0, step = 0, value = 0;
	NSSet *allowedKeys = [NSSet setWithArray:@[
		@"id", @"kind", @"label", @"width", @"disabled", @"checked", @"text", @"placeholder",
		@"maxLength", @"selected", @"options", @"min", @"max", @"step", @"value", @"indeterminate", @"revision",
	]];
	for (id key in control.allKeys) {
		if (![key isKindOfClass:NSString.class] || ![allowedKeys containsObject:key]) return NO;
	}
	BOOL validScalars = CDToolbarBoolean(control[@"disabled"]) && CDToolbarBoolean(control[@"checked"]) &&
		CDToolbarBoolean(control[@"indeterminate"]) && [control[@"text"] isKindOfClass:NSString.class] &&
		[control[@"placeholder"] isKindOfClass:NSString.class] && [control[@"selected"] isKindOfClass:NSString.class] &&
		CDToolbarUnsignedInteger(control[@"maxLength"], 0, CDToolbarMaxControlText, &maxLength) &&
		CDToolbarNumber(control[@"min"], &minimum) && CDToolbarNumber(control[@"max"], &maximum) &&
		CDToolbarNumber(control[@"step"], &step) && CDToolbarNumber(control[@"value"], &value) &&
		CDToolbarUnsignedInteger(control[@"revision"], 1, NSUIntegerMax, &revisionValue);
	uint64_t revision = (uint64_t)revisionValue;
	if (!control || ![control[@"id"] isEqualToString:identifier] || ![kind isEqualToString:type] ||
		!CDToolbarIsControlType(kind) || ![[label stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] length] || CDToolbarUnicodeScalarCount(label) > 60 ||
		!CDToolbarFiniteNumber(control[@"width"], CDToolbarMinControlWidth, CDToolbarMaxControlWidth, &width) ||
		!validScalars || revision > toolbarRevision || item[@"button"] || item[@"label"]) return NO;
	NSString *text = control[@"text"];
	NSString *placeholder = control[@"placeholder"];
	NSString *selected = control[@"selected"];
	BOOL checked = [control[@"checked"] boolValue];
	BOOL disabled = [control[@"disabled"] boolValue];
	BOOL indeterminate = [control[@"indeterminate"] boolValue];
	BOOL emptyOptions = CDToolbarEmptyOptions(control[@"options"]);
	if ([kind isEqualToString:@"switch"] || [kind isEqualToString:@"checkbox"]) {
		return text.length == 0 && placeholder.length == 0 && maxLength == 0 && selected.length == 0 && emptyOptions &&
			minimum == 0 && maximum == 0 && step == 0 && value == 0 && !indeterminate;
	}
	if ([kind isEqualToString:@"input"]) {
		return !checked && selected.length == 0 && emptyOptions && minimum == 0 && maximum == 0 && step == 0 && value == 0 && !indeterminate &&
			CDToolbarUnicodeScalarCount(text) <= CDToolbarMaxControlText &&
			CDToolbarUnicodeScalarCount(placeholder) <= 120 &&
			maxLength >= 1 &&
			CDToolbarUnicodeScalarCount(text) <= maxLength;
	}
	if ([kind isEqualToString:@"select"] || [kind isEqualToString:@"segmentedControl"]) {
		NSArray *options = [control[@"options"] isKindOfClass:NSArray.class] ? control[@"options"] : nil;
		if (checked || text.length || placeholder.length || maxLength != 0 || minimum != 0 || maximum != 0 || step != 0 || value != 0 || indeterminate ||
			!options || options.count < 2 || options.count > CDToolbarMaxOptions || !selected.length) return NO;
		NSMutableSet *values = [NSMutableSet setWithCapacity:options.count];
		BOOL found = NO;
		for (id candidate in options) {
			if (![candidate isKindOfClass:NSDictionary.class]) return NO;
			NSDictionary *option = candidate;
			NSSet *optionKeys = [NSSet setWithArray:@[@"value", @"label"]];
			for (id key in option.allKeys) if (![key isKindOfClass:NSString.class] || ![optionKeys containsObject:key]) return NO;
			NSString *value = [option[@"value"] isKindOfClass:NSString.class] ? option[@"value"] : @"";
			NSString *optionLabel = [option[@"label"] isKindOfClass:NSString.class] ? option[@"label"] : @"";
			if (![[value stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] length] ||
				![[optionLabel stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] length] || CDToolbarUnicodeScalarCount(value) > 40 ||
				CDToolbarUnicodeScalarCount(optionLabel) > 40 || [values containsObject:value]) return NO;
			[values addObject:value];
			found = found || [value isEqualToString:selected];
		}
		return found;
	}
	if ([kind isEqualToString:@"slider"] || [kind isEqualToString:@"progress"]) {
		if (checked || text.length || placeholder.length || maxLength != 0 || selected.length || !emptyOptions ||
			minimum >= maximum || value < minimum || value > maximum) return NO;
		if ([kind isEqualToString:@"slider"]) {
			return !indeterminate && step > 0 && step <= maximum - minimum;
		}
		return !disabled && step == 0;
	}
	return NO;
}

// CDToolbarLayoutForSpec independently mirrors the Go planner. A structural
// boundary is retained only when both adjacent groups fit in the same row;
// natural wrapping itself becomes the boundary otherwise.
static NSDictionary *CDToolbarLayoutForSpec(NSDictionary *spec, NSString **message) {
	NSArray *items = [spec[@"items"] isKindOfClass:NSArray.class] ? spec[@"items"] : nil;
	NSString *orientation = [spec[@"orientation"] isKindOfClass:NSString.class] ? spec[@"orientation"] : @"";
	BOOL vertical = [orientation isEqualToString:@"vertical"];
	if (!items || (![orientation isEqualToString:@"horizontal"] && !vertical)) {
		if (message) *message = @"unsupported toolbar orientation or items";
		return nil;
	}
	NSUInteger requestedColumns = [spec[@"maxColumns"] unsignedIntegerValue];
	NSUInteger columns = requestedColumns ? requestedColumns : CDToolbarMaxColumns;
	NSUInteger maxRows = [spec[@"maxRows"] unsignedIntegerValue];
	CGFloat requestedMaxWidth = [spec[@"maxWidth"] doubleValue];
	NSUInteger maximumItems = vertical ? CDToolbarMaxVerticalItems : CDToolbarMaxItems;
	NSUInteger maximumButtons = vertical ? CDToolbarMaxVerticalButtons : (NSUInteger)32;
	if (items.count < 1 || items.count > maximumItems || columns < 1 || columns > CDToolbarMaxColumns ||
		(vertical && (columns != 1 || maxRows != 0 || requestedMaxWidth != 0)) ||
		(!vertical && maxRows > 32) || (!vertical && requestedMaxWidth != 0 &&
		(requestedMaxWidth < CDToolbarMinOuterWidth || requestedMaxWidth > CDToolbarMaxOuterWidth))) {
		if (message) *message = @"invalid toolbar item or layout limits";
		return nil;
	}
	NSMutableSet<NSString *> *identifiers = [NSMutableSet setWithCapacity:items.count];
	NSUInteger buttonCount = 0;
	NSUInteger contentCount = 0;
	NSUInteger labelCount = 0;
	NSUInteger controlCount = 0;
	BOOL structural = NO;
	for (NSUInteger index = 0; index < items.count; index++) {
		NSDictionary *item = [items[index] isKindOfClass:NSDictionary.class] ? items[index] : nil;
		NSString *type = [item[@"type"] isKindOfClass:NSString.class] ? item[@"type"] : @"";
		NSString *identifier = [item[@"id"] isKindOfClass:NSString.class] ? item[@"id"] : @"";
		NSSet *itemKeys = [NSSet setWithArray:@[@"type", @"id", @"button", @"label", @"control"]];
		for (id key in item.allKeys) {
			if (![key isKindOfClass:NSString.class] || ![itemKeys containsObject:key]) {
				if (message) *message = @"toolbar item contains an unsupported field";
				return nil;
			}
		}
		if (!item || !CDToolbarValidIdentifier(identifier) || [identifiers containsObject:identifier] ||
			!([type isEqualToString:@"button"] || [type isEqualToString:@"label"] || CDToolbarIsControlType(type) || [type isEqualToString:@"separator"] || [type isEqualToString:@"spacer"])) {
			if (message) *message = @"invalid or duplicate toolbar item";
			return nil;
		}
		[identifiers addObject:identifier];
		if (index == 0 && CDToolbarIsStructuralItem(item)) {
			if (message) *message = @"toolbar cannot start with a structural item";
			return nil;
		}
		if (index > 0 && CDToolbarIsStructuralItem(item) && CDToolbarIsStructuralItem(items[index - 1])) {
			if (message) *message = @"toolbar cannot contain consecutive structural items";
			return nil;
		}
		if (CDToolbarIsButtonItem(item)) {
			NSDictionary *button = [item[@"button"] isKindOfClass:NSDictionary.class] ? item[@"button"] : nil;
			if (!button || ![button[@"id"] isEqualToString:identifier] || item[@"label"] || item[@"control"] || !CDToolbarValidBadge(button[@"badge"])) {
				if (message) *message = @"toolbar button item payload is invalid";
				return nil;
			}
			buttonCount++;
			contentCount++;
		} else if (CDToolbarIsLabelItem(item)) {
			NSDictionary *label = [item[@"label"] isKindOfClass:NSDictionary.class] ? item[@"label"] : nil;
			NSSet *allowedKeys = [NSSet setWithArray:@[@"id", @"text", @"width", @"alignment", @"verticalAlignment", @"tone", @"revision"]];
			for (id key in label.allKeys) {
				if (![key isKindOfClass:NSString.class] || ![allowedKeys containsObject:key]) {
					if (message) *message = @"toolbar label contains an unsupported field";
					return nil;
				}
			}
			NSString *text = [label[@"text"] isKindOfClass:NSString.class] ? label[@"text"] : @"";
			NSString *alignment = [label[@"alignment"] isKindOfClass:NSString.class] ? label[@"alignment"] : @"";
			NSString *verticalAlignment = [label[@"verticalAlignment"] isKindOfClass:NSString.class] ? label[@"verticalAlignment"] : @"";
			NSString *tone = [label[@"tone"] isKindOfClass:NSString.class] ? label[@"tone"] : @"";
			CGFloat width = 0;
			uint64_t revision = [label[@"revision"] unsignedLongLongValue];
			BOOL validAlignment = [alignment isEqualToString:@"leading"] || [alignment isEqualToString:@"center"] || [alignment isEqualToString:@"trailing"];
			BOOL validVerticalAlignment = [verticalAlignment isEqualToString:@"top"] || [verticalAlignment isEqualToString:@"center"] || [verticalAlignment isEqualToString:@"bottom"];
			BOOL validTone = [tone isEqualToString:@"primary"] || [tone isEqualToString:@"secondary"] || [tone isEqualToString:@"success"] || [tone isEqualToString:@"warning"] || [tone isEqualToString:@"error"];
			if (!label || ![label[@"id"] isEqualToString:identifier] ||
				![[text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] length] ||
				CDToolbarUnicodeScalarCount(text) > 120 ||
				!CDToolbarFiniteNumber(label[@"width"], CDToolbarMinLabelWidth, CDToolbarMaxLabelWidth, &width) ||
				!validAlignment || !validVerticalAlignment || !validTone || revision == 0 || revision > [spec[@"revision"] unsignedLongLongValue] || item[@"button"] || item[@"control"]) {
				if (message) *message = @"toolbar label item payload is invalid";
				return nil;
			}
			contentCount++;
			labelCount++;
		} else if (CDToolbarIsControlItem(item)) {
			if (!CDToolbarValidControl(item, [spec[@"revision"] unsignedLongLongValue])) {
				if (message) *message = @"toolbar control item payload is invalid";
				return nil;
			}
			contentCount++;
			controlCount++;
		} else {
			if ((item[@"button"] && item[@"button"] != NSNull.null) || (item[@"label"] && item[@"label"] != NSNull.null) || (item[@"control"] && item[@"control"] != NSNull.null)) {
				if (message) *message = @"structural toolbar item cannot contain content";
				return nil;
			}
			structural = YES;
		}
	}
	if (CDToolbarIsStructuralItem(items.lastObject) || contentCount < 1 || contentCount > maximumButtons || buttonCount > maximumButtons) {
		if (message) *message = @"toolbar has an invalid action or terminal structure";
		return nil;
	}
	if (vertical) {
		CGFloat height = CDToolbarChromeHeight + CDToolbarVerticalPadding * 2;
		CGFloat contentWidth = 0;
		for (NSUInteger index = 0; index < items.count; index++) {
			if (index && ![items[index - 1][@"type"] isEqualToString:@"spacer"]) height += CDToolbarContentItemGap;
			height += CDToolbarItemHeight(items[index], YES);
			contentWidth = MAX(contentWidth, CDToolbarItemWidth(items[index]));
		}
		return @{@"rows": @[items], @"width": @(MAX(CDToolbarMinOuterWidth, contentWidth + CDToolbarHorizontalPadding * 2)), @"height": @(height), @"structural": @(structural)};
	}
	CGFloat outerCap = requestedMaxWidth ? requestedMaxWidth : CDToolbarMaxOuterWidth;
	CGFloat contentCap = outerCap - CDToolbarHorizontalPadding * 2;
	NSMutableArray<NSArray<NSDictionary *> *> *rows = [NSMutableArray array];
	NSMutableArray<NSDictionary *> *row = [NSMutableArray array];
	__block NSUInteger rowContent = 0;
	NSDictionary *pending = nil;
	void (^flush)(void) = ^{
		if (row.count) {
			[rows addObject:row.copy];
			[row removeAllObjects];
			rowContent = 0;
		}
	};
	for (NSDictionary *item in items) {
		if (CDToolbarIsStructuralItem(item)) {
			pending = item;
			continue;
		}
		if (pending) {
			NSMutableArray *candidate = row.mutableCopy;
			[candidate addObject:pending];
			[candidate addObject:item];
			if (rowContent < columns && CDToolbarRowWidth(candidate) <= contentCap + 0.0001) {
				[row addObjectsFromArray:@[pending, item]];
				rowContent++;
			} else {
				flush();
				if (CDToolbarItemWidth(item) > contentCap + 0.0001) {
					if (message) *message = @"toolbar item exceeds maxWidth";
					return nil;
				}
				[row addObject:item];
				rowContent = 1;
			}
			pending = nil;
			continue;
		}
		NSMutableArray *candidate = row.mutableCopy;
		[candidate addObject:item];
		if (rowContent >= columns || CDToolbarRowWidth(candidate) > contentCap + 0.0001) flush();
		if (CDToolbarItemWidth(item) > contentCap + 0.0001) {
			if (message) *message = @"toolbar item exceeds maxWidth";
			return nil;
		}
		[row addObject:item];
		rowContent++;
	}
	flush();
	if (maxRows && rows.count > maxRows) {
		if (message) *message = [NSString stringWithFormat:@"toolbar items require %lu rows but maxRows is %lu", (unsigned long)rows.count, (unsigned long)maxRows];
		return nil;
	}
	CGFloat contentWidth = 0;
	for (NSArray *plannedRow in rows) contentWidth = MAX(contentWidth, CDToolbarRowWidth(plannedRow));
	CGFloat width = MAX(CDToolbarMinOuterWidth, contentWidth + CDToolbarHorizontalPadding * 2);
	if (!requestedMaxWidth && !structural && labelCount == 0 && controlCount == 0 && buttonCount > CDToolbarMaxColumns) width = CDToolbarMaxOuterWidth;
	CGFloat height = CDToolbarChromeHeight + CDToolbarVerticalPadding * 2 + rows.count * CDToolbarContentItemHeight + (rows.count > 1 ? (rows.count - 1) * CDToolbarContentItemGap : 0);
	return @{@"rows": rows.copy, @"width": @(width), @"height": @(height), @"structural": @(structural)};
}

@interface CDToolbarView () <NSTextFieldDelegate>
@property(nonatomic, strong) NSMutableDictionary<NSString *, CDToolbarButton *> *buttonsByID;
@property(nonatomic, strong) NSMutableDictionary<NSString *, CDToolbarLabel *> *labelsByID;
@property(nonatomic, strong) NSMutableDictionary<NSString *, CDToolbarControlView *> *controlsByID;
@property(nonatomic, copy) NSArray<CDToolbarButton *> *orderedButtons;
@property(nonatomic, copy) NSArray<NSView *> *orderedAccessibilityItems;
@property(nonatomic, strong) NSStackView *columnStack;
@property(nonatomic, copy) NSArray<NSStackView *> *rowStacks;
@end

@implementation CDToolbarView

+ (NSDictionary *)outerBoundsForSpec:(NSDictionary *)spec position:(NSDictionary *)position {
	NSString *message = nil;
	NSDictionary *layout = CDToolbarLayoutForSpec(spec, &message);
	CGFloat width = [layout[@"width"] doubleValue];
	CGFloat height = [layout[@"height"] doubleValue];
	if (!layout || width <= 0 || height <= 0) {
		// Create will report the strict structural error from init below; this
		// fallback only keeps AppKit construction safe long enough to do so.
		width = CDToolbarMinOuterWidth;
		height = CDToolbarChromeHeight + CDToolbarVerticalPadding * 2 + CDToolbarContentItemHeight;
	}
	return @{@"x": position[@"x"] ?: @0, @"y": position[@"y"] ?: @0, @"width": @(width), @"height": @(height)};
}

+ (BOOL)requiresKeyboardActivationForSpec:(NSDictionary *)spec {
	for (NSDictionary *item in spec[@"items"] ?: @[]) {
		if ([item[@"type"] isEqualToString:@"input"]) return YES;
	}
	return NO;
}

- (BOOL)isFlipped { return YES; }

- (instancetype)initWithFrame:(NSRect)frame spec:(NSDictionary *)spec error:(NSError **)error {
	self = [super initWithFrame:frame];
	if (!self) return nil;
	uint64_t toolbarRevision = [spec[@"revision"] unsignedLongLongValue];
	NSString *orientation = [spec[@"orientation"] isKindOfClass:NSString.class] ? spec[@"orientation"] : @"";
	BOOL vertical = [orientation isEqualToString:@"vertical"];
	if (![orientation isEqualToString:@"horizontal"] && !vertical) {
		if (error) *error = [NSError errorWithDomain:@"OpenDeskToolbar" code:1 userInfo:@{NSLocalizedDescriptionKey: @"unsupported toolbar orientation"}];
		return nil;
	}
	if ([spec[@"schemaVersion"] integerValue] != 4 || toolbarRevision == 0) {
		if (error) *error = [NSError errorWithDomain:@"OpenDeskToolbar" code:1 userInfo:@{NSLocalizedDescriptionKey: @"invalid toolbar schema or revision"}];
		return nil;
	}
	NSString *layoutMessage = nil;
	NSDictionary *layout = CDToolbarLayoutForSpec(spec, &layoutMessage);
	if (!layout) {
		if (error) *error = [NSError errorWithDomain:@"OpenDeskToolbar" code:1 userInfo:@{NSLocalizedDescriptionKey: layoutMessage ?: @"invalid toolbar item layout"}];
		return nil;
	}
	NSArray<NSArray<NSDictionary *> *> *plannedRows = layout[@"rows"];
	NSUInteger itemCount = 0;
	for (NSArray *row in plannedRows) itemCount += row.count;
	_buttonsByID = [NSMutableDictionary dictionaryWithCapacity:itemCount];
	_labelsByID = [NSMutableDictionary dictionaryWithCapacity:itemCount];
	_controlsByID = [NSMutableDictionary dictionaryWithCapacity:itemCount];
	NSMutableArray *ordered = [NSMutableArray arrayWithCapacity:itemCount];
	NSMutableArray *accessibilityItems = [NSMutableArray arrayWithCapacity:itemCount];
	NSMutableArray<NSStackView *> *rows = [NSMutableArray array];
	NSUInteger totalCustomImageBytes = 0;
	self.wantsLayer = YES;
	self.layer.backgroundColor = CDToolbarColor(0.11, 0.13, 0.16).CGColor;
	// The toolbar itself is the native AX group. Its explicit child list below
	// contains action buttons, static-text labels, and native controls in visual
	// order; Separator and Spacer remain ignored views.
	self.accessibilityElement = YES;
	self.accessibilityRole = NSAccessibilityGroupRole;
	self.accessibilityLabel = @"Floating action toolbar";
	_columnStack = [[NSStackView alloc] initWithFrame:NSZeroRect];
	_columnStack.orientation = NSUserInterfaceLayoutOrientationVertical;
	_columnStack.alignment = NSLayoutAttributeLeading;
	_columnStack.distribution = NSStackViewDistributionFill;
	_columnStack.spacing = CDToolbarContentItemGap;
	_columnStack.translatesAutoresizingMaskIntoConstraints = NO;
	[self addSubview:_columnStack];
	[NSLayoutConstraint activateConstraints:@[
		[_columnStack.leadingAnchor constraintEqualToAnchor:self.leadingAnchor constant:CDToolbarHorizontalPadding],
		[_columnStack.topAnchor constraintEqualToAnchor:self.topAnchor constant:CDToolbarVerticalPadding],
	]];
	for (NSUInteger rowIndex = 0; rowIndex < plannedRows.count; rowIndex++) {
		NSArray<NSDictionary *> *plannedRow = plannedRows[rowIndex];
		NSStackView *container = _columnStack;
		if (!vertical) {
			NSStackView *row = [[NSStackView alloc] initWithFrame:NSZeroRect];
			row.orientation = NSUserInterfaceLayoutOrientationHorizontal;
			row.alignment = NSLayoutAttributeCenterY;
			row.distribution = NSStackViewDistributionFill;
			row.spacing = CDToolbarContentItemGap;
			[_columnStack addArrangedSubview:row];
			[rows addObject:row];
			container = row;
		}
		for (NSDictionary *item in plannedRow) {
			NSString *type = item[@"type"];
			NSView *view = nil;
			if ([type isEqualToString:@"button"]) {
				NSDictionary *buttonSpec = item[@"button"];
				NSString *identifier = buttonSpec[@"id"];
				NSString *label = buttonSpec[@"label"];
				NSDictionary *state = [buttonSpec[@"state"] isKindOfClass:NSDictionary.class] ? buttonSpec[@"state"] : nil;
				uint64_t buttonRevision = [state[@"revision"] unsignedLongLongValue];
				NSImage *customImage = nil;
				NSUInteger customImageBytes = 0;
				NSString *iconMessage = nil;
				NSDictionary *presentation = CDToolbarIconForButtonSpec(buttonSpec, &customImage, &customImageBytes, &iconMessage);
				totalCustomImageBytes += customImageBytes;
				if (!identifier.length || !label.length || _buttonsByID[identifier] || !presentation || !state ||
					buttonRevision == 0 || buttonRevision > toolbarRevision || totalCustomImageBytes > CDToolbarMaxTotalImageBytes) {
					NSString *reason = iconMessage ?: (totalCustomImageBytes > CDToolbarMaxTotalImageBytes ? @"custom toolbar icon data exceeds the window limit" : @"invalid, duplicate, or untrusted toolbar button");
					if (error) *error = [NSError errorWithDomain:@"OpenDeskToolbar" code:2 userInfo:@{NSLocalizedDescriptionKey: reason}];
					return nil;
				}
				CDToolbarButton *button = [[CDToolbarButton alloc] initWithFrame:NSZeroRect];
				button.target = self;
				button.action = @selector(buttonActivated:);
				[button applySpec:buttonSpec presentation:presentation customImage:customImage customImageBytes:customImageBytes];
				_buttonsByID[identifier] = button;
				[ordered addObject:button];
				[accessibilityItems addObject:button];
				view = button;
			} else if ([type isEqualToString:@"label"]) {
				NSDictionary *labelSpec = item[@"label"];
				NSString *identifier = labelSpec[@"id"];
				NSString *text = labelSpec[@"text"];
				uint64_t labelRevision = [labelSpec[@"revision"] unsignedLongLongValue];
				if (!identifier.length || !text.length || _labelsByID[identifier] || _buttonsByID[identifier] ||
					labelRevision == 0 || labelRevision > toolbarRevision) {
					if (error) *error = [NSError errorWithDomain:@"OpenDeskToolbar" code:2 userInfo:@{NSLocalizedDescriptionKey: @"invalid or duplicate toolbar label"}];
					return nil;
				}
				CDToolbarLabel *label = [[CDToolbarLabel alloc] initWithFrame:NSZeroRect];
				[label applySpec:labelSpec];
				_labelsByID[identifier] = label;
				[accessibilityItems addObject:label];
				view = label;
			} else if (CDToolbarIsControlType(type)) {
				NSDictionary *controlSpec = item[@"control"];
				NSString *identifier = controlSpec[@"id"];
				if (!identifier.length || _controlsByID[identifier] || _buttonsByID[identifier] || _labelsByID[identifier]) {
					if (error) *error = [NSError errorWithDomain:@"OpenDeskToolbar" code:2 userInfo:@{NSLocalizedDescriptionKey: @"invalid or duplicate toolbar control"}];
					return nil;
				}
				CDToolbarControlView *control = [[CDToolbarControlView alloc] initWithFrame:NSZeroRect];
				if (![control configureWithSpec:controlSpec target:self action:@selector(controlChanged:) inputDelegate:self]) {
					if (error) *error = [NSError errorWithDomain:@"OpenDeskToolbar" code:2 userInfo:@{NSLocalizedDescriptionKey: @"unsupported toolbar control"}];
					return nil;
				}
				_controlsByID[identifier] = control;
				[accessibilityItems addObject:control.nativeControl];
				view = control;
			} else if ([type isEqualToString:@"separator"]) {
				view = [[CDToolbarSeparator alloc] initWithVertical:!vertical];
			} else if ([type isEqualToString:@"spacer"]) {
				view = [CDToolbarSpacer new];
			}
			if (!view) {
				if (error) *error = [NSError errorWithDomain:@"OpenDeskToolbar" code:2 userInfo:@{NSLocalizedDescriptionKey: @"unsupported toolbar item"}];
				return nil;
			}
			view.translatesAutoresizingMaskIntoConstraints = NO;
			CGFloat width = CDToolbarItemWidth(item);
			CGFloat height = CDToolbarItemHeight(item, vertical);
			[NSLayoutConstraint activateConstraints:@[
				[view.widthAnchor constraintEqualToConstant:width],
				[view.heightAnchor constraintEqualToConstant:height],
			]];
			[container addArrangedSubview:view];
			if ([type isEqualToString:@"spacer"]) {
				[container setCustomSpacing:0 afterView:view];
			}
		}
	}
	_rowStacks = rows.copy;
	_orderedButtons = ordered.copy;
	_orderedAccessibilityItems = accessibilityItems.copy;
	[self layoutSubtreeIfNeeded];
	return self;
}

- (NSArray *)accessibilityChildren { return self.orderedAccessibilityItems; }

- (void)buttonActivated:(CDToolbarButton *)sender {
	if (!sender.enabled || sender.toolbarBusy || sender.toolbarDisabled || !sender.targetID.length) return;
	[self.eventDelegate floatingToolbarDidActivateButton:sender.targetID];
}

- (void)controlChanged:(NSControl *)sender {
	CDToolbarControlView *control = self.controlsByID[sender.identifier];
	if (!control || !control.targetID.length || [control.kind isEqualToString:@"input"] || [control.kind isEqualToString:@"progress"]) return;
	id value = [control renderedValue];
	NSNumber *checked = nil;
	if ([control.kind isEqualToString:@"switch"] || [control.kind isEqualToString:@"checkbox"]) checked = value;
	if ([control.kind isEqualToString:@"slider"]) {
		double minimum = [control.appliedSpec[@"min"] doubleValue];
		double maximum = [control.appliedSpec[@"max"] doubleValue];
		double step = [control.appliedSpec[@"step"] doubleValue];
		double snapped = minimum + round(([value doubleValue] - minimum) / step) * step;
		snapped = MIN(maximum, MAX(minimum, snapped));
		((NSSlider *)sender).doubleValue = snapped;
		value = @(snapped);
	}
	[self.eventDelegate floatingToolbarDidChangeControl:control.targetID type:@"change" value:value checked:checked];
}

- (void)controlTextDidChange:(NSNotification *)notification {
	NSTextField *field = [notification.object isKindOfClass:NSTextField.class] ? notification.object : nil;
	CDToolbarControlView *control = field ? self.controlsByID[field.identifier] : nil;
	if (!control || ![control.kind isEqualToString:@"input"]) return;
	NSString *value = field.stringValue ?: @"";
	if (CDToolbarUnicodeScalarCount(value) > control.maxLength) {
		NSUInteger scalarCount = 0, index = 0;
		while (index < value.length && scalarCount < control.maxLength) {
			unichar character = [value characterAtIndex:index++];
			if (CFStringIsSurrogateHighCharacter(character) && index < value.length && CFStringIsSurrogateLowCharacter([value characterAtIndex:index])) index++;
			scalarCount++;
		}
		value = [value substringToIndex:index];
		field.stringValue = value;
	}
	[self.eventDelegate floatingToolbarDidChangeControl:control.targetID type:@"input" value:value checked:nil];
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
		@"id": button.targetID, @"label": button.semanticLabel ?: @"", @"icon": button.iconName ?: @"", @"badge": button.badgeText ?: @"",
		@"state": state, @"renderedText": @"", @"tooltip": button.semanticLabel ?: @"",
		@"tooltipVisible": @(button.tooltipPanel.visible),
		@"iconPresentation": button.iconPresentation ?: @{},
		@"accessibilityName": button.accessibilityLabel ?: @"",
		@"accessibilityValue": button.accessibilityValue ?: NSNull.null,
		@"localBounds": @{@"x": @(NSMinX(local)), @"y": @(NSMinY(local)), @"width": @(NSWidth(local)), @"height": @(NSHeight(local))},
		@"screenBounds": CDToolbarScreenBounds(window, local),
	};
}

- (NSDictionary *)applyButtonSpec:(NSDictionary *)spec window:(NSWindow *)window error:(NSError **)error {
	NSString *targetID = [spec[@"id"] isKindOfClass:NSString.class] ? spec[@"id"] : @"";
	CDToolbarButton *button = self.buttonsByID[targetID];
	NSImage *customImage = nil;
	NSUInteger customImageBytes = 0;
	NSString *iconMessage = nil;
	NSDictionary *presentation = CDToolbarIconForButtonSpec(spec, &customImage, &customImageBytes, &iconMessage);
	NSDictionary *state = [spec[@"state"] isKindOfClass:NSDictionary.class] ? spec[@"state"] : nil;
	NSString *label = [spec[@"label"] isKindOfClass:NSString.class] ? spec[@"label"] : @"";
	uint64_t revision = [state[@"revision"] unsignedLongLongValue];
	NSUInteger totalCustomImageBytes = customImageBytes;
	for (CDToolbarButton *existing in self.orderedButtons) {
		if (existing != button) totalCustomImageBytes += existing.customIconByteLength;
	}
	if (!button || !label.length || !presentation || !state || revision == 0 || !CDToolbarValidBadge(spec[@"badge"]) || totalCustomImageBytes > CDToolbarMaxTotalImageBytes) {
		NSString *reason = iconMessage ?: (totalCustomImageBytes > CDToolbarMaxTotalImageBytes ? @"custom toolbar icon data exceeds the window limit" : @"invalid toolbar button update");
		if (error) *error = [NSError errorWithDomain:@"OpenDeskToolbar" code:3 userInfo:@{NSLocalizedDescriptionKey: reason}];
		return nil;
	}
	if (revision > button.revision) [button applySpec:spec presentation:presentation customImage:customImage customImageBytes:customImageBytes];
	return [self stateForButtonID:targetID window:window];
}

- (NSDictionary *)stateForLabelID:(NSString *)targetID window:(NSWindow *)window {
	CDToolbarLabel *label = self.labelsByID[targetID];
	if (!label) return nil;
	NSRect local = [self convertRect:label.bounds fromView:label];
	NSRect renderedText = [self convertRect:label.renderedTextBounds fromView:label];
	return @{
		@"id": label.targetID, @"text": label.textField.stringValue ?: @"", @"width": @(NSWidth(label.bounds)),
		@"alignment": label.textField.alignment == NSTextAlignmentCenter ? @"center" : (label.textField.alignment == NSTextAlignmentRight ? @"trailing" : @"leading"),
		@"verticalAlignment": label.verticalAlignment ?: @"center",
		@"tone": label.tone ?: @"primary", @"revision": @(label.revision),
		@"renderedText": label.textField.stringValue ?: @"", @"truncated": @(label.isTextTruncated),
		@"accessibilityName": label.accessibilityLabel ?: @"",
		@"accessibilityRole": [label.accessibilityRole isEqualToString:NSAccessibilityStaticTextRole] ? @"staticText" : (label.accessibilityRole ?: @""),
		@"accessibilityValue": label.accessibilityValue ?: label.textField.stringValue ?: @"",
		@"renderedTextBounds": @{@"x": @(NSMinX(renderedText)), @"y": @(NSMinY(renderedText)), @"width": @(NSWidth(renderedText)), @"height": @(NSHeight(renderedText))},
		@"localBounds": @{@"x": @(NSMinX(local)), @"y": @(NSMinY(local)), @"width": @(NSWidth(local)), @"height": @(NSHeight(local))},
		@"screenBounds": CDToolbarScreenBounds(window, local),
	};
}

- (NSDictionary *)applyLabelSpec:(NSDictionary *)spec window:(NSWindow *)window error:(NSError **)error {
	NSString *targetID = [spec[@"id"] isKindOfClass:NSString.class] ? spec[@"id"] : @"";
	CDToolbarLabel *label = self.labelsByID[targetID];
	NSString *text = [spec[@"text"] isKindOfClass:NSString.class] ? spec[@"text"] : @"";
	NSString *alignment = [spec[@"alignment"] isKindOfClass:NSString.class] ? spec[@"alignment"] : @"";
	NSString *verticalAlignment = [spec[@"verticalAlignment"] isKindOfClass:NSString.class] ? spec[@"verticalAlignment"] : @"";
	NSString *tone = [spec[@"tone"] isKindOfClass:NSString.class] ? spec[@"tone"] : @"";
	CGFloat width = 0;
	uint64_t revision = [spec[@"revision"] unsignedLongLongValue];
	BOOL validAlignment = [alignment isEqualToString:@"leading"] || [alignment isEqualToString:@"center"] || [alignment isEqualToString:@"trailing"];
	BOOL validVerticalAlignment = [verticalAlignment isEqualToString:@"top"] || [verticalAlignment isEqualToString:@"center"] || [verticalAlignment isEqualToString:@"bottom"];
	BOOL validTone = [tone isEqualToString:@"primary"] || [tone isEqualToString:@"secondary"] || [tone isEqualToString:@"success"] || [tone isEqualToString:@"warning"] || [tone isEqualToString:@"error"];
	BOOL validText = [[text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] length] && CDToolbarUnicodeScalarCount(text) <= 120;
	if (!label || !validText || !CDToolbarFiniteNumber(spec[@"width"], CDToolbarMinLabelWidth, CDToolbarMaxLabelWidth, &width) ||
		fabs(width - NSWidth(label.bounds)) > 0.0001 || !validAlignment || !validVerticalAlignment || !validTone || revision == 0) {
		if (error) *error = [NSError errorWithDomain:@"OpenDeskToolbar" code:4 userInfo:@{NSLocalizedDescriptionKey: @"invalid toolbar label update"}];
		return nil;
	}
	if (revision > label.revision) [label applySpec:spec];
	return [self stateForLabelID:targetID window:window];
}

- (NSDictionary *)stateForControlID:(NSString *)targetID window:(NSWindow *)window {
	CDToolbarControlView *control = self.controlsByID[targetID];
	if (!control) return nil;
	NSRect local = [self convertRect:control.bounds fromView:control];
	id rendered = [control renderedValue];
	id accessibilityValue = control.nativeControl.accessibilityValue ?: rendered;
	if ([control.kind isEqualToString:@"progress"] && [(NSProgressIndicator *)control.nativeControl isIndeterminate]) accessibilityValue = @"indeterminate";
	NSString *accessibilityRole = control.nativeControl.accessibilityRole ?: control.accessibilityRoleName;
	NSString *accessibilitySubrole = control.nativeControl.accessibilitySubrole ?: @"";
	id firstResponder = window.firstResponder;
	BOOL responderMatches = firstResponder == control.nativeControl ||
		([firstResponder isKindOfClass:NSTextView.class] && [(NSTextView *)firstResponder delegate] == (id)control.nativeControl);
	BOOL focused = window.visible && window.keyWindow && NSApp.active && responderMatches;
	NSMutableDictionary *result = control.appliedSpec.mutableCopy;
	BOOL nativeEnabled = YES;
	if ([control.nativeControl respondsToSelector:@selector(isEnabled)]) nativeEnabled = [(id)control.nativeControl isEnabled];
	result[@"disabled"] = @((BOOL)!nativeEnabled);
	result[@"renderedValue"] = rendered ?: NSNull.null;
	result[@"accessibilityName"] = control.nativeControl.accessibilityLabel ?: control.semanticLabel ?: @"";
	result[@"accessibilityRole"] = accessibilityRole;
	result[@"accessibilitySubrole"] = accessibilitySubrole;
	result[@"accessibilityValue"] = accessibilityValue ?: NSNull.null;
	result[@"focused"] = @(focused);
	result[@"localBounds"] = @{@"x": @(NSMinX(local)), @"y": @(NSMinY(local)), @"width": @(NSWidth(local)), @"height": @(NSHeight(local))};
	result[@"screenBounds"] = CDToolbarScreenBounds(window, local);
	return result.copy;
}

- (NSDictionary *)applyControlSpec:(NSDictionary *)spec window:(NSWindow *)window error:(NSError **)error {
	NSString *targetID = [spec[@"id"] isKindOfClass:NSString.class] ? spec[@"id"] : @"";
	CDToolbarControlView *control = self.controlsByID[targetID];
	NSDictionary *item = @{@"type": spec[@"kind"] ?: @"", @"id": targetID, @"control": spec ?: @{}};
	CGFloat width = [spec[@"width"] doubleValue];
	uint64_t revision = [spec[@"revision"] unsignedLongLongValue];
	NSDictionary *declared = control.appliedSpec;
	BOOL immutableFieldsMatch = [spec[@"label"] isEqual:declared[@"label"]] && fabs(width - [declared[@"width"] doubleValue]) <= 0.0001;
	if ([control.kind isEqualToString:@"input"]) {
		immutableFieldsMatch = immutableFieldsMatch && [spec[@"maxLength"] isEqual:declared[@"maxLength"]];
	} else if ([control.kind isEqualToString:@"select"] || [control.kind isEqualToString:@"segmentedControl"]) {
		immutableFieldsMatch = immutableFieldsMatch && [spec[@"options"] isEqual:declared[@"options"]];
	} else if ([control.kind isEqualToString:@"slider"]) {
		immutableFieldsMatch = immutableFieldsMatch && [spec[@"min"] isEqual:declared[@"min"]] &&
			[spec[@"max"] isEqual:declared[@"max"]] && [spec[@"step"] isEqual:declared[@"step"]];
	} else if ([control.kind isEqualToString:@"progress"]) {
		immutableFieldsMatch = immutableFieldsMatch && [spec[@"min"] isEqual:declared[@"min"]] &&
			[spec[@"max"] isEqual:declared[@"max"]];
	}
	if (!control || !CDToolbarValidControl(item, UINT64_MAX) || ![spec[@"kind"] isEqualToString:control.kind] ||
		!immutableFieldsMatch || fabs(width - NSWidth(control.bounds)) > 0.0001 || revision == 0) {
		if (error) *error = [NSError errorWithDomain:@"OpenDeskToolbar" code:5 userInfo:@{NSLocalizedDescriptionKey: @"invalid toolbar control update"}];
		return nil;
	}
	if (revision > control.revision) [control applySpec:spec];
	return [self stateForControlID:targetID window:window];
}

- (void)setAnimationsActive:(BOOL)active {
	for (CDToolbarControlView *control in self.controlsByID.allValues) {
		if (![control.nativeControl isKindOfClass:NSProgressIndicator.class]) continue;
		NSProgressIndicator *progress = (NSProgressIndicator *)control.nativeControl;
		if (active && progress.indeterminate) [progress startAnimation:nil]; else [progress stopAnimation:nil];
	}
}

- (void)invalidateTooltips {
	for (CDToolbarButton *button in self.orderedButtons) [button invalidateTooltip];
}

- (void)releaseResources {
	self.eventDelegate = nil;
	[self invalidateTooltips];
	for (CDToolbarButton *button in self.orderedButtons) {
		button.target = nil; button.action = nil;
		[button.busyIndicator stopAnimation:nil];
		if (button.hoverTrackingArea && [button.trackingAreas containsObject:button.hoverTrackingArea]) {
			[button removeTrackingArea:button.hoverTrackingArea];
		}
		button.hoverTrackingArea = nil;
		button.customIconImage = nil;
	}
	for (CDToolbarControlView *control in self.controlsByID.allValues) {
		if ([control.nativeControl respondsToSelector:@selector(setTarget:)]) [(id)control.nativeControl setTarget:nil];
		if ([control.nativeControl respondsToSelector:@selector(setAction:)]) [(id)control.nativeControl setAction:nil];
		if ([control.nativeControl isKindOfClass:NSProgressIndicator.class]) [(NSProgressIndicator *)control.nativeControl stopAnimation:nil];
		if ([control.nativeControl isKindOfClass:NSTextField.class]) ((NSTextField *)control.nativeControl).delegate = nil;
	}
	for (NSView *view in self.columnStack.arrangedSubviews.copy) {
		if ([view isKindOfClass:NSStackView.class]) {
			NSStackView *row = (NSStackView *)view;
			for (NSView *item in row.arrangedSubviews.copy) {
				[row removeArrangedSubview:item];
				[item removeFromSuperview];
			}
		}
		[self.columnStack removeArrangedSubview:view];
		[view removeFromSuperview];
	}
	[self.buttonsByID removeAllObjects];
	[self.labelsByID removeAllObjects];
	[self.controlsByID removeAllObjects];
	self.orderedButtons = @[];
	self.orderedAccessibilityItems = @[];
	self.rowStacks = @[];
}

@end
