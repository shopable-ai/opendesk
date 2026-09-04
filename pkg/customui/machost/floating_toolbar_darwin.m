//go:build darwin && cgo

#import <Cocoa/Cocoa.h>
#import <math.h>
#include <string.h>
#import "floating_toolbar_darwin.h"
#include "toolbar_icons_generated.inc"

static const CGFloat CDToolbarButtonSize = 40.0;
static const CGFloat CDToolbarButtonGap = 8.0;
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
@property(nonatomic) BOOL toolbarActive;
@property(nonatomic) BOOL toolbarDisabled;
@property(nonatomic) BOOL toolbarBusy;
@property(nonatomic) BOOL pointerInside;
@property(nonatomic) BOOL toolbarPressed;
@property(nonatomic) uint64_t revision;
@property(nonatomic, strong) NSProgressIndicator *busyIndicator;
@property(nonatomic, strong) NSTrackingArea *hoverTrackingArea;
@property(nonatomic, strong) NSPanel *tooltipPanel;
@property(nonatomic) NSUInteger tooltipGeneration;
- (void)invalidateTooltip;
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
	self.revision = [state[@"revision"] unsignedLongLongValue];
	self.enabled = !self.toolbarDisabled && !self.toolbarBusy;
	// The toolbar is deliberately nonactivating. AppKit's standard NSView
	// tooltip manager does not reliably present for such panels, so the label
	// is rendered by our own nonactivating native tooltip panel instead.
	self.toolTip = nil;
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

static CGFloat CDToolbarItemWidth(NSDictionary *item) {
	if (CDToolbarIsButtonItem(item)) return CDToolbarButtonSize;
	NSString *type = item[@"type"];
	if ([type isEqualToString:@"separator"]) return CDToolbarSeparatorThickness;
	if ([type isEqualToString:@"spacer"]) return CDToolbarSpacerIntrinsicSize;
	return 0;
}

static CGFloat CDToolbarItemHeight(NSDictionary *item, BOOL vertical) {
	if (CDToolbarIsButtonItem(item)) return CDToolbarButtonSize;
	NSString *type = item[@"type"];
	if ([type isEqualToString:@"separator"]) return vertical ? CDToolbarSeparatorThickness : CDToolbarButtonSize;
	if ([type isEqualToString:@"spacer"]) return vertical ? CDToolbarSpacerIntrinsicSize : CDToolbarButtonSize;
	return 0;
}

static CGFloat CDToolbarRowWidth(NSArray<NSDictionary *> *row) {
	CGFloat width = 0;
	for (NSUInteger index = 0; index < row.count; index++) {
		if (index && ![row[index - 1][@"type"] isEqualToString:@"spacer"]) width += CDToolbarButtonGap;
		width += CDToolbarItemWidth(row[index]);
	}
	return width;
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
	BOOL structural = NO;
	for (NSUInteger index = 0; index < items.count; index++) {
		NSDictionary *item = [items[index] isKindOfClass:NSDictionary.class] ? items[index] : nil;
		NSString *type = [item[@"type"] isKindOfClass:NSString.class] ? item[@"type"] : @"";
		NSString *identifier = [item[@"id"] isKindOfClass:NSString.class] ? item[@"id"] : @"";
		if (!item || !identifier.length || [identifiers containsObject:identifier] ||
			!([type isEqualToString:@"button"] || [type isEqualToString:@"separator"] || [type isEqualToString:@"spacer"])) {
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
			if (!button || ![button[@"id"] isEqualToString:identifier]) {
				if (message) *message = @"toolbar button item payload is invalid";
				return nil;
			}
			buttonCount++;
		} else {
			if (item[@"button"] && item[@"button"] != NSNull.null) {
				if (message) *message = @"structural toolbar item cannot contain a button";
				return nil;
			}
			structural = YES;
		}
	}
	if (CDToolbarIsStructuralItem(items.lastObject) || buttonCount < 1 || buttonCount > maximumButtons) {
		if (message) *message = @"toolbar has an invalid action or terminal structure";
		return nil;
	}
	if (vertical) {
		CGFloat height = CDToolbarChromeHeight + CDToolbarVerticalPadding * 2;
		for (NSUInteger index = 0; index < items.count; index++) {
			if (index && ![items[index - 1][@"type"] isEqualToString:@"spacer"]) height += CDToolbarButtonGap;
			height += CDToolbarItemHeight(items[index], YES);
		}
		return @{@"rows": @[items], @"width": @(CDToolbarMinOuterWidth), @"height": @(height), @"structural": @(structural)};
	}
	CGFloat outerCap = requestedMaxWidth ? requestedMaxWidth : CDToolbarMaxOuterWidth;
	CGFloat contentCap = outerCap - CDToolbarHorizontalPadding * 2;
	NSMutableArray<NSArray<NSDictionary *> *> *rows = [NSMutableArray array];
	NSMutableArray<NSDictionary *> *row = [NSMutableArray array];
	__block NSUInteger rowButtons = 0;
	NSDictionary *pending = nil;
	void (^flush)(void) = ^{
		if (row.count) {
			[rows addObject:row.copy];
			[row removeAllObjects];
			rowButtons = 0;
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
			if (rowButtons < columns && CDToolbarRowWidth(candidate) <= contentCap + 0.0001) {
				[row addObjectsFromArray:@[pending, item]];
				rowButtons++;
			} else {
				flush();
				[row addObject:item];
				rowButtons = 1;
			}
			pending = nil;
			continue;
		}
		NSMutableArray *candidate = row.mutableCopy;
		[candidate addObject:item];
		if (rowButtons >= columns || CDToolbarRowWidth(candidate) > contentCap + 0.0001) flush();
		[row addObject:item];
		rowButtons++;
	}
	flush();
	if (maxRows && rows.count > maxRows) {
		if (message) *message = [NSString stringWithFormat:@"toolbar items require %lu rows but maxRows is %lu", (unsigned long)rows.count, (unsigned long)maxRows];
		return nil;
	}
	CGFloat contentWidth = 0;
	for (NSArray *plannedRow in rows) contentWidth = MAX(contentWidth, CDToolbarRowWidth(plannedRow));
	CGFloat width = MAX(CDToolbarMinOuterWidth, contentWidth + CDToolbarHorizontalPadding * 2);
	if (!requestedMaxWidth && !structural && buttonCount > CDToolbarMaxColumns) width = CDToolbarMaxOuterWidth;
	CGFloat height = CDToolbarChromeHeight + CDToolbarVerticalPadding * 2 + rows.count * CDToolbarButtonSize + (rows.count > 1 ? (rows.count - 1) * CDToolbarButtonGap : 0);
	return @{@"rows": rows.copy, @"width": @(width), @"height": @(height), @"structural": @(structural)};
}

@interface CDToolbarView ()
@property(nonatomic, strong) NSMutableDictionary<NSString *, CDToolbarButton *> *buttonsByID;
@property(nonatomic, copy) NSArray<CDToolbarButton *> *orderedButtons;
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
		height = CDToolbarChromeHeight + CDToolbarVerticalPadding * 2 + CDToolbarButtonSize;
	}
	return @{@"x": position[@"x"] ?: @0, @"y": position[@"y"] ?: @0, @"width": @(width), @"height": @(height)};
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
	if ([spec[@"schemaVersion"] integerValue] != 2 || toolbarRevision == 0) {
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
	NSMutableArray *ordered = [NSMutableArray arrayWithCapacity:itemCount];
	NSMutableArray<NSStackView *> *rows = [NSMutableArray array];
	NSUInteger totalCustomImageBytes = 0;
	self.wantsLayer = YES;
	self.layer.backgroundColor = CDToolbarColor(0.11, 0.13, 0.16).CGColor;
	// The toolbar itself is the native AX group. Its explicit child list below
	// contains only action buttons; Separator and Spacer remain ignored views
	// and therefore cannot leak into the assistive-control tree.
	self.accessibilityElement = YES;
	self.accessibilityRole = NSAccessibilityGroupRole;
	self.accessibilityLabel = @"Floating action toolbar";
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
	for (NSUInteger rowIndex = 0; rowIndex < plannedRows.count; rowIndex++) {
		NSArray<NSDictionary *> *plannedRow = plannedRows[rowIndex];
		NSStackView *container = _columnStack;
		if (!vertical) {
			NSStackView *row = [[NSStackView alloc] initWithFrame:NSZeroRect];
			row.orientation = NSUserInterfaceLayoutOrientationHorizontal;
			row.alignment = NSLayoutAttributeCenterY;
			row.distribution = NSStackViewDistributionFill;
			row.spacing = CDToolbarButtonGap;
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
				view = button;
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
		@"state": state, @"renderedText": @"", @"tooltip": button.semanticLabel ?: @"",
		@"tooltipVisible": @(button.tooltipPanel.visible),
		@"iconPresentation": button.iconPresentation ?: @{},
		@"accessibilityName": button.accessibilityLabel ?: @"",
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
	if (!button || !label.length || !presentation || !state || revision == 0 || totalCustomImageBytes > CDToolbarMaxTotalImageBytes) {
		NSString *reason = iconMessage ?: (totalCustomImageBytes > CDToolbarMaxTotalImageBytes ? @"custom toolbar icon data exceeds the window limit" : @"invalid toolbar button update");
		if (error) *error = [NSError errorWithDomain:@"OpenDeskToolbar" code:3 userInfo:@{NSLocalizedDescriptionKey: reason}];
		return nil;
	}
	if (revision > button.revision) [button applySpec:spec presentation:presentation customImage:customImage customImageBytes:customImageBytes];
	return [self stateForButtonID:targetID window:window];
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
	self.orderedButtons = @[];
	self.rowStacks = @[];
}

@end
