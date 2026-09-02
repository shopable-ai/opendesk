//go:build darwin && cgo

#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>
#import <WebKit/WebKit.h>
#import <unistd.h>
#import <math.h>
#import <stdlib.h>
#import "native_darwin.h"
#import "floating_toolbar_darwin.h"

static NSString *const CDProtocolVersion = @"1.1.0";
static NSMutableDictionary<NSString *, id> *CDWindows;

static BOOL CDDragDebugEnabled(void) {
	const char *value = getenv("CLAWDESK_UI_DEBUG_DRAG");
	return value != NULL && value[0] != '\0' && value[0] != '0';
}

static void CDDragDebug(NSString *message) {
	if (!CDDragDebugEnabled() || !message.length) return;
	fprintf(stderr, "clawdesk-ui-host drag: %s\n", message.UTF8String);
	fflush(stderr);
}

static void CDEmit(NSDictionary *object) {
    if (![NSJSONSerialization isValidJSONObject:object]) {
        return;
    }
    NSData *data = [NSJSONSerialization dataWithJSONObject:object options:0 error:nil];
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    OpenDeskUIEmitJSON((char *)json.UTF8String);
}

static void CDEmitHello(void) {
    CDEmit(@{@"version": CDProtocolVersion, @"kind": @"hello"});
}

static void CDRespond(NSString *requestID, id result) {
    CDEmit(@{
        @"version": CDProtocolVersion,
        @"kind": @"response",
        @"requestId": requestID ?: @"",
        @"ok": @YES,
        @"result": result ?: NSNull.null,
    });
}

static void CDFail(NSString *requestID, NSString *code, NSString *operation,
                   NSString *windowID, NSString *targetID, NSString *message) {
    NSMutableDictionary *error = [@{
        @"code": code ?: @"UI_DRIVER_FAILURE",
        @"message": message ?: @"native UI host failure",
    } mutableCopy];
    if (operation.length) error[@"operation"] = operation;
    if (windowID.length) error[@"windowId"] = windowID;
    if (targetID.length) error[@"targetId"] = targetID;
    CDEmit(@{
        @"version": CDProtocolVersion,
        @"kind": @"response",
        @"requestId": requestID ?: @"",
        @"ok": @NO,
        @"error": error,
    });
}

static NSString *CDWindowKey(NSString *sessionID, NSString *windowID) {
    return [NSString stringWithFormat:@"%@/%@", sessionID ?: @"", windowID ?: @""];
}

static NSString *CDJSONString(id object) {
	NSError *error = nil;
	NSData *data = [NSJSONSerialization dataWithJSONObject:object ?: NSNull.null options:NSJSONWritingFragmentsAllowed error:&error];
	if (!data || error) return @"null";
    return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}

static NSString *CDTimestamp(void) {
    static NSISO8601DateFormatter *formatter;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        formatter = [NSISO8601DateFormatter new];
        formatter.formatOptions = NSISO8601DateFormatWithInternetDateTime | NSISO8601DateFormatWithFractionalSeconds;
    });
    return [formatter stringFromDate:NSDate.date];
}

static NSRect CDNativeRect(NSDictionary *bounds) {
	// CoreGraphics desktop APIs use a global top-left coordinate system whose
	// origin is the primary display. AppKit uses global bottom-left coordinates.
	// Never subtract the current screen origin: doing so would turn a window on a
	// secondary display into a false primary-display identity.
	NSScreen *screen = NSScreen.screens.firstObject ?: NSScreen.mainScreen;
    NSRect frame = screen ? screen.frame : NSMakeRect(0, 0, 1440, 900);
    CGFloat x = [bounds[@"x"] doubleValue];
    CGFloat y = [bounds[@"y"] doubleValue];
    CGFloat width = MAX(1, [bounds[@"width"] doubleValue]);
    CGFloat height = MAX(1, [bounds[@"height"] doubleValue]);
	return NSMakeRect(x, NSMaxY(frame) - y - height, width, height);
}

static NSScreen *CDActiveDialogScreen(void) {
	NSPoint pointer = [NSEvent mouseLocation];
	for (NSScreen *screen in NSScreen.screens) {
		if (NSMouseInRect(pointer, screen.frame, NO)) return screen;
	}
	return NSScreen.mainScreen ?: NSScreen.screens.firstObject;
}

static NSRect CDCenteredDialogRect(NSRect requested) {
	NSScreen *screen = CDActiveDialogScreen();
	NSRect visible = screen ? screen.visibleFrame : NSMakeRect(0, 0, 1440, 900);
	CGFloat width = MIN(MAX(1, requested.size.width), NSWidth(visible));
	CGFloat height = MIN(MAX(1, requested.size.height), NSHeight(visible));
	return NSMakeRect(NSMidX(visible) - width / 2.0, NSMidY(visible) - height / 2.0, width, height);
}

static NSDictionary *CDBoundsFromNativeRect(NSRect rect) {
	NSScreen *screen = NSScreen.screens.firstObject ?: NSScreen.mainScreen;
    NSRect frame = screen ? screen.frame : NSMakeRect(0, 0, 1440, 900);
    return @{
		@"x": @(NSMinX(rect)),
        @"y": @(NSMaxY(frame) - NSMaxY(rect)),
        @"width": @(NSWidth(rect)),
        @"height": @(NSHeight(rect)),
    };
}

static NSDictionary *CDWindowServerSnapshot(CGWindowID windowID) {
	CFArrayRef descriptions = CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow, windowID);
	if (!descriptions) return @{};
	NSDictionary *result = @{};
	CFIndex count = CFArrayGetCount(descriptions);
	for (CFIndex index = 0; index < count; index++) {
		CFDictionaryRef description = (CFDictionaryRef)CFArrayGetValueAtIndex(descriptions, index);
		CFNumberRef numberValue = (CFNumberRef)CFDictionaryGetValue(description, kCGWindowNumber);
		int64_t number = 0;
		if (!numberValue || !CFNumberGetValue(numberValue, kCFNumberSInt64Type, &number) || number != windowID) continue;
		CFNumberRef layerValue = (CFNumberRef)CFDictionaryGetValue(description, kCGWindowLayer);
		CFNumberRef ownerValue = (CFNumberRef)CFDictionaryGetValue(description, kCGWindowOwnerPID);
		CFNumberRef alphaValue = (CFNumberRef)CFDictionaryGetValue(description, kCGWindowAlpha);
		CFBooleanRef onScreenValue = (CFBooleanRef)CFDictionaryGetValue(description, kCGWindowIsOnscreen);
		int layer = 0;
		int ownerPID = 0;
		double alpha = 0;
		if (layerValue) CFNumberGetValue(layerValue, kCFNumberIntType, &layer);
		if (ownerValue) CFNumberGetValue(ownerValue, kCFNumberIntType, &ownerPID);
		if (alphaValue) CFNumberGetValue(alphaValue, kCFNumberDoubleType, &alpha);
		if (ownerPID != getpid()) continue;
		CFDictionaryRef boundsValue = (CFDictionaryRef)CFDictionaryGetValue(description, kCGWindowBounds);
		CGRect bounds = CGRectZero;
		NSDictionary *boundsDictionary = @{};
		if (boundsValue && CGRectMakeWithDictionaryRepresentation(boundsValue, &bounds)) {
			boundsDictionary = @{@"x": @(bounds.origin.x), @"y": @(bounds.origin.y), @"width": @(bounds.size.width), @"height": @(bounds.size.height)};
		}
		result = @{
			@"onScreen": @((BOOL)(onScreenValue && CFBooleanGetValue(onScreenValue))),
			@"layer": @(layer), @"ownerPid": @(ownerPID), @"alpha": @(alpha), @"bounds": boundsDictionary,
		};
		break;
	}
	CFRelease(descriptions);
	return result;
}

static NSDictionary *CDWindowServerEvidence(NSWindow *window) {
	return CDWindowServerSnapshot((CGWindowID)window.windowNumber);
}

static NSDictionary *CDBoundsForWindow(NSWindow *window) {
	NSDictionary *bounds = CDWindowServerEvidence(window)[@"bounds"];
	return bounds.count ? bounds : CDBoundsFromNativeRect(window.frame);
}

static NSString *CDBridgeSource(NSArray *controls, NSString *css, BOOL draggable) {
    NSMutableArray *ids = [NSMutableArray arrayWithCapacity:controls.count];
    NSMutableDictionary *types = [NSMutableDictionary dictionaryWithCapacity:controls.count];
    for (NSDictionary *control in controls) {
        NSString *identifier = control[@"id"];
        if (identifier.length) {
            [ids addObject:identifier];
            types[identifier] = control[@"type"] ?: @"unknown";
        }
    }
    NSDictionary *configuration = @{
        @"ids": ids,
        @"types": types,
        @"css": css ?: @"",
        @"draggable": @(draggable),
    };
    return [NSString stringWithFormat:
        @"(() => {\n"
         "'use strict';\n"
         "const config = %@;\n"
         "const allowed = new Set(config.ids);\n"
         "const send = (message) => window.webkit.messageHandlers.opendesk.postMessage(message);\n"
         "if (config.css) { const style = document.createElement('style'); style.textContent = config.css; (document.head || document.documentElement).appendChild(style); }\n"
         "const element = (id) => { if (!allowed.has(id)) throw new Error('unknown custom UI control: ' + id); return document.getElementById(id); };\n"
         "const typeFor = (id) => config.types[id] || 'unknown';\n"
         "const dragRects = () => Array.from(document.querySelectorAll('[data-clawdesk-drag],[data-opendesk-drag]')).map(el => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; }).filter(r => r.width>0 && r.height>0);\n"
	         "const state = (id) => { const el = element(id); const r = el.getBoundingClientRect(); return {id, type:typeFor(id), text:el.textContent || '', icon:el.dataset.icon || '', value:('value' in el ? el.value : null), checked:('checked' in el ? !!el.checked : null), active:el.getAttribute('aria-pressed') === 'true', disabled:!!el.disabled, busy:el.getAttribute('aria-busy') === 'true', error:el.dataset.error || '', visible:!!(el.offsetWidth || el.offsetHeight || el.getClientRects().length), classes:Array.from(el.classList), localBounds:{x:r.x,y:r.y,width:r.width,height:r.height}, screenBounds:{x:window.screenX+r.x,y:window.screenY+r.y,width:r.width,height:r.height}}; };\n"
	         "const toolbarState = (id) => { const value=state(id); const el=element(id); if (el.dataset.opendeskIconOnly === 'true') { value.accessibilityName=el.getAttribute('aria-label') || ''; value.iconPresentation={systemSymbol:el.dataset.iconSymbol || '',scale:Number(el.dataset.iconScale || 1),offsetX:Number(el.dataset.iconOffsetX || 0),offsetY:Number(el.dataset.iconOffsetY || 0)}; } return value; };\n"
	         "const states = () => config.ids.map(toolbarState);\n"
	         "const px = value => { const number=Number.parseFloat(value); return Number.isFinite(number) ? number : 0; };\n"
	         "const dialogLayout = () => { const root=document.getElementById('dialogRoot'); if (!root || !root.classList.contains('dialog')) return null; const icon=document.getElementById('dialogIcon'); const message=document.getElementById('dialogMessage'); const input=document.querySelector('.dialog-input'); const actions=document.getElementById('dialogButtons'); if (!icon || !message || !actions) return null; const rs=getComputedStyle(root); const is=getComputedStyle(icon); const ms=getComputedStyle(message); const messageHeight=Math.ceil(Math.max(message.scrollHeight,message.getBoundingClientRect().height)); const iconHeight=px(is.marginTop)+icon.getBoundingClientRect().height+px(is.marginBottom); const inputHeight=input ? px(getComputedStyle(input).marginTop)+input.getBoundingClientRect().height+px(getComputedStyle(input).marginBottom) : 0; const actionStyle=getComputedStyle(actions); const actionHeight=actions.getBoundingClientRect().height+px(actionStyle.marginBottom); const rightHeight=px(ms.marginTop)+messageHeight+px(ms.marginBottom)+inputHeight+actionHeight; return {contentHeight:Math.ceil(px(rs.paddingTop)+Math.max(iconHeight,rightHeight)+px(rs.paddingBottom)),messageHeight,inputHeight,actionHeight}; };\n"
	         "const update = (id, patch) => { const el = element(id); if (Object.prototype.hasOwnProperty.call(patch,'text')) { const text=String(patch.text ?? ''); el.textContent=text; if (el.tagName === 'BUTTON') { el.title=text; el.setAttribute('aria-label',text); } } if (Object.prototype.hasOwnProperty.call(patch,'icon')) el.dataset.icon=String(patch.icon ?? ''); if (Object.prototype.hasOwnProperty.call(patch,'value')) el.value = patch.value ?? ''; if (Object.prototype.hasOwnProperty.call(patch,'checked')) el.checked = !!patch.checked; if (Object.prototype.hasOwnProperty.call(patch,'active')) el.setAttribute('aria-pressed',patch.active ? 'true' : 'false'); if (Object.prototype.hasOwnProperty.call(patch,'disabled')) el.disabled = !!patch.disabled; if (Object.prototype.hasOwnProperty.call(patch,'busy')) { el.dataset.busy=patch.busy ? 'true' : 'false'; el.setAttribute('aria-busy',patch.busy ? 'true' : 'false'); } if (Object.prototype.hasOwnProperty.call(patch,'error')) { const message=String(patch.error ?? ''); el.dataset.error=message; el.setAttribute('aria-invalid',message ? 'true' : 'false'); } if (Object.prototype.hasOwnProperty.call(patch,'visible')) el.hidden = !patch.visible; if (Array.isArray(patch.classes)) el.className = patch.classes.join(' '); if (Object.prototype.hasOwnProperty.call(patch,'source')) { if (el.tagName !== 'IMG') throw new Error('source is supported only for img controls'); el.src = patch.source || ''; } if (Array.isArray(patch.options)) { if (el.tagName !== 'SELECT') throw new Error('options are supported only for select controls'); el.replaceChildren(...patch.options.map(o => { const option=document.createElement('option'); option.value=String(o.value); option.textContent=String(o.label); return option; })); } return state(id); };\n"
	         "const toolbarUpdate = (id, patch) => { update(id, patch); const el=element(id); if (el.dataset.opendeskIconOnly === 'true') { if (Object.prototype.hasOwnProperty.call(patch,'text')) el.textContent=''; const p=patch.iconPresentation; if (p && typeof p.systemSymbol === 'string') { el.dataset.iconSymbol=p.systemSymbol; el.dataset.iconScale=String(p.scale); el.dataset.iconOffsetX=String(p.offsetX); el.dataset.iconOffsetY=String(p.offsetY); } } return toolbarState(id); };\n"
	         "const targetFor = (event) => { const el = event.target && event.target.closest ? event.target.closest('[id]') : null; return el && allowed.has(el.id) ? el : null; };\n"
	         "document.addEventListener('click', event => { const el=targetFor(event); if (el && !el.disabled && el.dataset.busy !== 'true') send({type:'click',targetId:el.id,value:('value' in el ? el.value : null),checked:('checked' in el ? !!el.checked : null)}); });\n"
	         "document.addEventListener('input', event => { const el=targetFor(event); if (el && !el.hasAttribute('data-opendesk-dialog-private-input')) send({type:'input',targetId:el.id,value:('value' in el ? el.value : null),checked:('checked' in el ? !!el.checked : null)}); });\n"
	         "document.addEventListener('change', event => { const el=targetFor(event); if (el && !el.hasAttribute('data-opendesk-dialog-private-input')) send({type:'change',targetId:el.id,value:('value' in el ? el.value : null),checked:('checked' in el ? !!el.checked : null)}); });\n"
	         "document.addEventListener('keydown', event => { if (event.isComposing || event.defaultPrevented) return; if (event.key === 'Escape') { const cancel=document.querySelector('[data-opendesk-dialog-cancel]'); if (cancel || document.querySelector('[data-opendesk-dialog-default]')) { event.preventDefault(); send({type:'dialogCancel'}); } return; } if (event.key === 'Enter') { const button=document.querySelector('[data-opendesk-dialog-default]'); if (button && !button.disabled) { event.preventDefault(); send({type:'click',targetId:button.id}); } } });\n"
	         "const dialogFocus = document.querySelector('[data-opendesk-dialog-focus]'); if (dialogFocus) requestAnimationFrame(() => dialogFocus.focus());\n"
         "const setDraggable = (enabled) => { config.draggable = !!enabled; };\n"
	         "Object.defineProperty(window, '__opendesk', {value:Object.freeze({state:toolbarState,states,update:toolbarUpdate,setDraggable,dragRects}), configurable:false, writable:false});\n"
	         "send({type:'ready',dragRects:dragRects(),controls:states(),dialogLayout:dialogLayout()});\n"
         "})();", CDJSONString(configuration)];
}

// A nonactivating panel must still receive the user's first physical click.
// WKWebView otherwise treats that event as activation-only and the controlled
// pointer bridge never sees a drag start. Accepting first mouse does not make
// the application active or grant page JavaScript any Runtime capability.
@interface CDWebView : WKWebView
@end

@implementation CDWebView
- (BOOL)acceptsFirstMouse:(NSEvent *)event {
    return YES;
}
@end

@protocol CDDragOverlayDelegate <NSObject>
- (void)dragOverlayDidBeginAtScreenPoint:(NSPoint)point;
- (void)dragOverlayDidMoveToScreenPoint:(NSPoint)point;
- (void)dragOverlayDidEndAtScreenPoint:(NSPoint)point;
@end

// This transparent AppKit view is above WKWebView only at validated DOM drag
// rectangles. Everywhere else hitTest returns nil so buttons and inputs remain
// owned by WebKit. It keeps dragging inside the nonactivating panel and avoids
// a global event tap or page JavaScript pointer privileges.
@interface CDDragOverlayView : NSView
@property(nonatomic, weak) id<CDDragOverlayDelegate> dragDelegate;
@property(nonatomic, copy) NSArray<NSDictionary *> *regions;
@property(nonatomic) BOOL enabled;
@property(nonatomic) NSUInteger debugDragEvents;
@end

@implementation CDDragOverlayView
- (BOOL)isFlipped {
	return YES;
}

- (BOOL)isAccessibilityElement {
	return NO;
}

- (BOOL)accessibilityIsIgnored {
	return YES;
}

- (BOOL)acceptsFirstMouse:(NSEvent *)event {
	return YES;
}

- (NSView *)hitTest:(NSPoint)point {
	if (!self.enabled || self.hidden) return nil;
	for (NSDictionary *region in self.regions) {
		NSRect rect = NSMakeRect([region[@"x"] doubleValue], [region[@"y"] doubleValue],
			[region[@"width"] doubleValue], [region[@"height"] doubleValue]);
		if (NSPointInRect(point, rect)) return self;
	}
	return nil;
}

- (void)mouseDown:(NSEvent *)event {
	self.debugDragEvents = 0;
	CDDragDebug([NSString stringWithFormat:@"overlay mouseDown window=%ld point=(%.1f,%.1f)",
		(long)event.window.windowNumber, event.locationInWindow.x, event.locationInWindow.y]);
	[self.dragDelegate dragOverlayDidBeginAtScreenPoint:NSEvent.mouseLocation];
}

- (void)mouseDragged:(NSEvent *)event {
	self.debugDragEvents += 1;
	CDDragDebug([NSString stringWithFormat:@"overlay mouseDragged count=%lu screen=(%.1f,%.1f)",
		(unsigned long)self.debugDragEvents, NSEvent.mouseLocation.x, NSEvent.mouseLocation.y]);
	[self.dragDelegate dragOverlayDidMoveToScreenPoint:NSEvent.mouseLocation];
}

- (void)mouseUp:(NSEvent *)event {
	CDDragDebug([NSString stringWithFormat:@"overlay mouseUp dragged=%lu screen=(%.1f,%.1f)",
		(unsigned long)self.debugDragEvents, NSEvent.mouseLocation.x, NSEvent.mouseLocation.y]);
	[self.dragDelegate dragOverlayDidEndAtScreenPoint:NSEvent.mouseLocation];
}
@end

@interface CDContentView : NSView
@property(nonatomic, weak) WKWebView *webView;
@property(nonatomic, weak) CDDragOverlayView *dragOverlay;
@property(nonatomic, copy) NSArray<NSView *> *nativeAccessibilityChildren;
@end

@implementation CDContentView
- (BOOL)isAccessibilityElement {
	// AppKit omits an ignored content view and its descendants from the Window
	// AX tree. Expose a minimal group only after the fixed host bridge has
	// published native button peers; pointer hit-testing remains unchanged.
	return self.nativeAccessibilityChildren.count > 0;
}

- (BOOL)accessibilityIsIgnored {
	return self.nativeAccessibilityChildren.count == 0;
}

- (NSString *)accessibilityRole {
	return NSAccessibilityGroupRole;
}

- (NSArray *)accessibilityChildren {
	// CDContentView is intentionally ignored so it does not add a meaningless
	// wrapper to VoiceOver. Accessory processes hosting a nonactivating NSPanel
	// do not reliably export the remote WebKit subtree, so validated buttons are
	// mirrored by non-drawing native AXButton children below.
	if (self.nativeAccessibilityChildren.count) return self.nativeAccessibilityChildren;
	return self.webView ? @[self.webView] : @[];
}

- (NSView *)hitTest:(NSPoint)point {
	if (self.dragOverlay) {
		NSPoint overlayPoint = [self.dragOverlay convertPoint:point fromView:self];
		NSView *dragHit = [self.dragOverlay hitTest:overlayPoint];
		if (dragHit) return dragHit;
	}
	if (self.webView) {
		NSPoint webPoint = [self.webView convertPoint:point fromView:self];
		return [self.webView hitTest:webPoint];
	}
	return [super hitTest:point];
}

- (id)accessibilityHitTest:(NSPoint)point {
	return self.webView ? [self.webView accessibilityHitTest:point] : [super accessibilityHitTest:point];
}
@end

@protocol CDWebAccessibilityButtonProxyDelegate <NSObject>
- (void)accessibilityButtonDidPress:(NSString *)targetID;
@end

// A native, non-drawing Accessibility peer for a validated DOM button. Pointer
// hit-testing remains owned by WKWebView; this object exists only so VoiceOver
// and AXPress receive a stable semantic name, bounds, and action in an
// NSApplicationActivationPolicyAccessory host.
@interface CDWebAccessibilityButtonProxy : NSButton
@property(nonatomic, copy) NSString *targetID;
@property(nonatomic, weak) id<CDWebAccessibilityButtonProxyDelegate> eventDelegate;
@property(nonatomic) BOOL callbackBusy;
@end

@implementation CDWebAccessibilityButtonProxy
- (void)drawRect:(NSRect)dirtyRect {
	(void)dirtyRect;
}

- (BOOL)isAccessibilityElement {
	return YES;
}

- (NSString *)accessibilityRole {
	return NSAccessibilityButtonRole;
}

- (id)accessibilityParent {
	// These peers are intentionally exported from CDDialogWindow rather than
	// the ignored WebKit content hierarchy. Returning the window explicitly
	// keeps the parent/child relationship coherent for AX tree enumeration and
	// point hit-testing.
	return self.window;
}

- (BOOL)accessibilityPerformPress {
	if (!self.enabled || self.callbackBusy || !self.targetID.length) return NO;
	[self.eventDelegate accessibilityButtonDidPress:self.targetID];
	return YES;
}
@end

// Dialog buttons live visually in a WKWebView, whose remote subtree is not
// exported reliably from this accessory-process host. Publishing the bounded
// native peers directly from the host-owned window gives VoiceOver and
// mouse.clickForPID a stable AXButton parent without making arbitrary WebView
// content accessible as native controls.
@interface CDDialogWindow : NSWindow
@property(nonatomic, copy) NSArray<NSView *> *dialogAccessibilityChildren;
@end

@implementation CDDialogWindow
- (NSArray *)accessibilityChildren {
	if (self.dialogAccessibilityChildren.count) return self.dialogAccessibilityChildren;
	return [super accessibilityChildren];
}
@end

// Generic ui.createWindow() remains a WebKit surface. This compatibility-only
// overlay is constructed exclusively after the native-toolbar branch returns;
// it is never part of FloatingWindow and consults the generated icon registry.
@interface CDWebIconOverlayView : NSView
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSDictionary *> *iconStates;
- (void)syncState:(NSDictionary *)state;
- (void)clear;
@end

@implementation CDWebIconOverlayView

- (instancetype)initWithFrame:(NSRect)frame {
	self = [super initWithFrame:frame];
	if (self) {
		_iconStates = [NSMutableDictionary dictionary];
		self.accessibilityElement = NO;
		self.accessibilityHidden = YES;
	}
	return self;
}

- (BOOL)isFlipped { return YES; }
- (NSView *)hitTest:(NSPoint)point { (void)point; return nil; }

- (void)syncState:(NSDictionary *)state {
	NSString *targetID = [state[@"id"] isKindOfClass:NSString.class] ? state[@"id"] : @"";
	NSDictionary *presentation = [state[@"iconPresentation"] isKindOfClass:NSDictionary.class] ? state[@"iconPresentation"] : nil;
	NSString *symbol = [presentation[@"systemSymbol"] isKindOfClass:NSString.class] ? presentation[@"systemSymbol"] : @"";
	NSDictionary *bounds = [state[@"localBounds"] isKindOfClass:NSDictionary.class] ? state[@"localBounds"] : nil;
	if (!targetID.length || !bounds || !CDIsTrustedToolbarSymbol(symbol)) {
		if (targetID.length) [self.iconStates removeObjectForKey:targetID];
		[self setNeedsDisplay:YES];
		return;
	}
	self.iconStates[targetID] = [state copy];
	[self setNeedsDisplay:YES];
}

- (void)clear {
	[self.iconStates removeAllObjects];
	[self setNeedsDisplay:YES];
}

- (void)drawRect:(NSRect)dirtyRect {
	[super drawRect:dirtyRect];
	for (NSString *targetID in self.iconStates.allKeys) {
		NSDictionary *state = self.iconStates[targetID];
		if (![state[@"visible"] boolValue]) continue;
		NSDictionary *bounds = state[@"localBounds"];
		NSDictionary *presentation = state[@"iconPresentation"];
		NSString *symbolName = presentation[@"systemSymbol"];
		if (!CDIsTrustedToolbarSymbol(symbolName)) continue;
		double x = [bounds[@"x"] doubleValue], y = [bounds[@"y"] doubleValue];
		double width = [bounds[@"width"] doubleValue], height = [bounds[@"height"] doubleValue];
		if (!isfinite(x) || !isfinite(y) || !isfinite(width) || !isfinite(height) || width <= 0 || height <= 0) continue;
		double scale = [presentation[@"scale"] doubleValue];
		if (!isfinite(scale) || scale < 0.5 || scale > 1.25) continue;
		double offsetX = [presentation[@"offsetX"] doubleValue], offsetY = [presentation[@"offsetY"] doubleValue];
		if (!isfinite(offsetX) || !isfinite(offsetY) || fabs(offsetX) > 4 || fabs(offsetY) > 4) continue;
		CGFloat pointSize = 16.0 * scale;
		NSImage *image = [NSImage imageWithSystemSymbolName:symbolName accessibilityDescription:nil];
		if (!image) continue;
		NSImageSymbolConfiguration *configuration = [NSImageSymbolConfiguration configurationWithPointSize:pointSize weight:NSFontWeightMedium scale:NSImageSymbolScaleMedium];
		image = [image imageWithSymbolConfiguration:configuration] ?: image;
		image.template = YES;
		BOOL disabled = [state[@"disabled"] boolValue];
		BOOL busy = [state[@"busy"] boolValue];
		// The DOM busy spinner occupies this same fixed box. Do not draw an
		// overlapping SF Symbol underneath it: replacement is visually clear and
		// does not participate in layout, so no icon/button width can be squeezed.
		if (busy) continue;
		BOOL active = [state[@"active"] boolValue];
		NSString *error = [state[@"error"] isKindOfClass:NSString.class] ? state[@"error"] : @"";
		NSColor *color;
		if (disabled) color = [NSColor colorWithCalibratedRed:0.56 green:0.60 blue:0.67 alpha:1];
		else if (error.length) color = [NSColor colorWithCalibratedRed:1 green:0.83 blue:0.85 alpha:1];
		else if (active) color = NSColor.whiteColor;
		else color = [NSColor colorWithCalibratedRed:0.97 green:0.98 blue:1 alpha:1];
		NSRect rect = NSMakeRect(x + (width - pointSize) / 2.0 + offsetX,
			y + (height - pointSize) / 2.0 + offsetY, pointSize, pointSize);
		// NSImage template rendering defaults to black outside a control cell.
		// Rasterize and tint it in an offscreen image, so the icon remains
		// legible above every toolbar background/state without affecting hit tests.
		NSImage *tinted = [[NSImage alloc] initWithSize:rect.size];
		[tinted lockFocusFlipped:YES];
		[image drawInRect:NSMakeRect(0, 0, rect.size.width, rect.size.height) fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:YES hints:nil];
		[color setFill];
		NSRectFillUsingOperation(NSMakeRect(0, 0, rect.size.width, rect.size.height), NSCompositingOperationSourceIn);
		[tinted unlockFocus];
		[tinted drawInRect:rect fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:YES hints:nil];
	}
}

@end

@interface CDWindowController : NSObject <WKScriptMessageHandler, WKNavigationDelegate, NSWindowDelegate, CDDragOverlayDelegate, CDWebAccessibilityButtonProxyDelegate, CDFloatingToolbarDelegate>
@property(nonatomic, copy) NSString *sessionID;
@property(nonatomic, copy) NSString *windowID;
@property(nonatomic, copy) NSString *kind;
@property(nonatomic, copy) NSString *basePath;
@property(nonatomic, copy) NSString *createRequestID;
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, strong) CDDragOverlayView *dragOverlay;
@property(nonatomic, strong) CDWebIconOverlayView *webIconOverlay;
@property(nonatomic, strong) CDToolbarView *floatingToolbarView;
@property(nonatomic, weak) CDContentView *contentView;
@property(nonatomic, strong) NSMutableDictionary<NSString *, CDWebAccessibilityButtonProxy *> *webAccessibilityButtons;
@property(nonatomic, strong) NSSet<NSString *> *controlIDs;
@property(nonatomic, copy) NSArray<NSDictionary *> *dragRegions;
@property(nonatomic) CGWindowID nativeWindowID;
@property(nonatomic) BOOL alwaysOnTop;
@property(nonatomic) BOOL draggable;
@property(nonatomic) BOOL closed;
@property(nonatomic) BOOL programmaticClose;
@property(nonatomic) BOOL dragActive;
@property(nonatomic) BOOL navigationFinished;
@property(nonatomic) BOOL bridgeReady;
@property(nonatomic) BOOL dialogLayoutFitting;
@property(nonatomic) BOOL initialNavigationStarted;
@property(nonatomic) BOOL closeEventEmitted;
@property(nonatomic) NSPoint dragStart;
@property(nonatomic) NSRect dragFrame;
@property(nonatomic) uint64_t sequence;
@property(nonatomic) uint64_t revision;
- (void)completeCreateIfReady;
- (void)emitType:(NSString *)type target:(NSString *)target body:(NSDictionary *)body reason:(NSString *)reason;
- (void)setDragRegionsFromValue:(id)value;
- (void)syncAccessibilityControlsFromValue:(id)value;
- (void)syncAccessibilityControlFromState:(NSDictionary *)state;
- (BOOL)fitHostDialogToContentLayout:(NSDictionary *)layout;
- (void)failInitialNavigation:(NSError *)error;
- (void)refreshDragRegionsWithCompletion:(void (^)(NSError *error))completion;
@end

static void CDFinalizeClosedWindow(CDWindowController *controller, NSUInteger attempt);

@implementation CDWindowController

- (BOOL)fitHostDialogToContentLayout:(NSDictionary *)layout {
	if (![self.window isKindOfClass:CDDialogWindow.class]) return YES;
	NSNumber *rawContentHeight = [layout isKindOfClass:NSDictionary.class] ? layout[@"contentHeight"] : nil;
	double contentHeight = [rawContentHeight isKindOfClass:NSNumber.class] ? rawContentHeight.doubleValue : 0;
	if (!isfinite(contentHeight) || contentHeight <= 0) return NO;
	NSRect frame = self.window.frame;
	NSRect contentRect = [self.window contentRectForFrameRect:frame];
	CGFloat chromeHeight = MAX(0, NSHeight(frame) - NSHeight(contentRect));
	CGFloat minimumHeight = MAX(1, self.window.minSize.height);
	NSScreen *screen = self.window.screen ?: CDActiveDialogScreen();
	NSRect visible = screen ? screen.visibleFrame : NSMakeRect(0, 0, 1440, 900);
	CGFloat maximumHeight = MAX(minimumHeight, NSHeight(visible) - 80.0);
	CGFloat targetHeight = MIN(maximumHeight, MAX(minimumHeight, ceil(contentHeight + chromeHeight)));
	NSRect target = NSMakeRect(NSMidX(visible) - NSWidth(frame) / 2.0,
		NSMidY(visible) - targetHeight / 2.0, NSWidth(frame), targetHeight);
	self.dialogLayoutFitting = YES;
	[self.window setMinSize:target.size];
	[self.window setMaxSize:target.size];
	[self.window setFrame:target display:NO];
	[self.window.contentView layoutSubtreeIfNeeded];
	self.dialogLayoutFitting = NO;
	return YES;
}

- (void)floatingToolbarDidActivateButton:(NSString *)targetID {
	if (self.closed || ![self.controlIDs containsObject:targetID]) return;
	[self emitType:@"click" target:targetID body:@{} reason:nil];
}

- (void)syncAccessibilityControlFromState:(NSDictionary *)state {
	if (![state isKindOfClass:NSDictionary.class] || ![state[@"type"] isEqualToString:@"button"] || !self.contentView) return;
	NSString *targetID = state[@"id"];
	if (![targetID isKindOfClass:NSString.class] || ![self.controlIDs containsObject:targetID]) return;
	CDWebAccessibilityButtonProxy *button = self.webAccessibilityButtons[targetID];
	if (!button) {
		button = [[CDWebAccessibilityButtonProxy alloc] initWithFrame:NSZeroRect];
		button.targetID = targetID;
		button.eventDelegate = self;
		button.bordered = NO;
		button.transparent = YES;
		button.focusRingType = NSFocusRingTypeNone;
		button.accessibilityElement = YES;
		[self.contentView addSubview:button positioned:NSWindowBelow relativeTo:self.webView];
		self.webAccessibilityButtons[targetID] = button;
	}
	NSString *label = [state[@"text"] isKindOfClass:NSString.class] ? state[@"text"] : @"";
	button.title = label;
	button.toolTip = label;
	button.accessibilityLabel = label;
	NSString *error = [state[@"error"] isKindOfClass:NSString.class] ? state[@"error"] : @"";
	button.accessibilityHelp = error.length ? error : nil;
	button.callbackBusy = [state[@"busy"] boolValue];
	button.enabled = ![state[@"disabled"] boolValue] && !button.callbackBusy;
	button.hidden = state[@"visible"] && ![state[@"visible"] boolValue];
	NSDictionary *bounds = state[@"localBounds"];
	if ([bounds isKindOfClass:NSDictionary.class]) {
		double x = [bounds[@"x"] doubleValue];
		double y = [bounds[@"y"] doubleValue];
		double width = [bounds[@"width"] doubleValue];
		double height = [bounds[@"height"] doubleValue];
		if (isfinite(x) && isfinite(y) && isfinite(width) && isfinite(height) && width > 0 && height > 0) {
			button.frame = NSMakeRect(x, NSHeight(self.contentView.bounds) - y - height, width, height);
		}
	}
	[self.webIconOverlay syncState:state];
	NSAccessibilityPostNotification(button, NSAccessibilityValueChangedNotification);
}

- (void)syncAccessibilityControlsFromValue:(id)value {
	if (![value isKindOfClass:NSArray.class] || !self.contentView) return;
	NSMutableArray<NSView *> *orderedButtons = [NSMutableArray array];
	for (id rawState in (NSArray *)value) {
		if (![rawState isKindOfClass:NSDictionary.class]) continue;
		NSDictionary *state = (NSDictionary *)rawState;
		if (![state[@"type"] isEqualToString:@"button"]) continue;
		[self syncAccessibilityControlFromState:state];
		CDWebAccessibilityButtonProxy *button = self.webAccessibilityButtons[state[@"id"]];
		if (button) [orderedButtons addObject:button];
	}
	self.contentView.nativeAccessibilityChildren = orderedButtons.copy;
	if ([self.window isKindOfClass:CDDialogWindow.class]) {
		((CDDialogWindow *)self.window).dialogAccessibilityChildren = orderedButtons.copy;
	}
	NSAccessibilityPostNotification(self.contentView, NSAccessibilityLayoutChangedNotification);
	NSAccessibilityPostNotification(self.window, NSAccessibilityLayoutChangedNotification);
}

- (void)accessibilityButtonDidPress:(NSString *)targetID {
	if (self.closed || ![self.controlIDs containsObject:targetID]) return;
	CDWebAccessibilityButtonProxy *button = self.webAccessibilityButtons[targetID];
	if (!button || !button.enabled || button.callbackBusy) return;
	[self emitType:@"click" target:targetID body:@{} reason:nil];
}

- (void)setDragRegionsFromValue:(id)value {
	NSMutableArray<NSDictionary *> *regions = [NSMutableArray array];
	if ([value isKindOfClass:NSArray.class]) {
		for (id rawRegion in (NSArray *)value) {
			if (![rawRegion isKindOfClass:NSDictionary.class]) continue;
			NSDictionary *raw = (NSDictionary *)rawRegion;
			NSNumber *x = raw[@"x"];
			NSNumber *y = raw[@"y"];
			NSNumber *width = raw[@"width"];
			NSNumber *height = raw[@"height"];
			if (![x isKindOfClass:NSNumber.class] || ![y isKindOfClass:NSNumber.class] ||
				![width isKindOfClass:NSNumber.class] || ![height isKindOfClass:NSNumber.class]) continue;
			double xValue = x.doubleValue;
			double yValue = y.doubleValue;
			double widthValue = width.doubleValue;
			double heightValue = height.doubleValue;
			if (!isfinite(xValue) || !isfinite(yValue) || !isfinite(widthValue) ||
				!isfinite(heightValue) || widthValue <= 0 || heightValue <= 0) continue;
			[regions addObject:@{@"x": @(xValue), @"y": @(yValue),
				@"width": @(widthValue), @"height": @(heightValue)}];
		}
	}
	self.dragRegions = regions.copy;
	self.dragOverlay.regions = self.dragRegions;
	if (self.dragOverlay && self.webView && self.dragRegions.count > 0 && CDDragDebugEnabled()) {
		NSDictionary *region = self.dragRegions.firstObject;
		NSPoint overlayPoint = NSMakePoint([region[@"x"] doubleValue] + [region[@"width"] doubleValue] / 2,
			[region[@"y"] doubleValue] + [region[@"height"] doubleValue] / 2);
		NSView *rootView = self.webView.superview ?: self.webView;
		NSPoint rootPoint = [self.dragOverlay convertPoint:overlayPoint toView:rootView];
		NSView *hit = [rootView hitTest:rootPoint];
		CDDragDebug([NSString stringWithFormat:@"regions=%lu programmaticHit=%@ overlayPoint=(%.1f,%.1f) rootPoint=(%.1f,%.1f)",
			(unsigned long)self.dragRegions.count, hit == self.dragOverlay ? @"overlay" : NSStringFromClass(hit.class),
			overlayPoint.x, overlayPoint.y, rootPoint.x, rootPoint.y]);
	}
}

- (void)dragOverlayDidBeginAtScreenPoint:(NSPoint)point {
	if (self.closed || !self.draggable) return;
	self.dragActive = YES;
	self.dragStart = point;
	self.dragFrame = self.window.frame;
}

- (void)dragOverlayDidMoveToScreenPoint:(NSPoint)point {
	if (self.closed || !self.dragActive) return;
	NSRect frame = self.dragFrame;
	frame.origin.x += point.x - self.dragStart.x;
	frame.origin.y += point.y - self.dragStart.y;
	[self.window setFrame:frame display:YES];
}

- (void)dragOverlayDidEndAtScreenPoint:(NSPoint)point {
	if (self.closed || !self.dragActive) return;
	[self dragOverlayDidMoveToScreenPoint:point];
	__weak CDWindowController *weakSelf = self;
	dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
		CDWindowController *controller = weakSelf;
		if (!controller || controller.closed || !controller.dragActive) return;
		controller.dragActive = NO;
		controller.revision += 1;
		[controller emitType:@"move" target:nil body:@{} reason:nil];
	});
}

- (void)refreshDragRegionsWithCompletion:(void (^)(NSError *error))completion {
	if (self.closed || !self.webView) {
		if (completion) completion(nil);
		return;
	}
	__weak CDWindowController *weakSelf = self;
	[self.webView evaluateJavaScript:@"window.__opendesk.dragRects()" inFrame:nil
		inContentWorld:WKContentWorld.defaultClientWorld completionHandler:^(id result, NSError *error) {
			CDWindowController *controller = weakSelf;
			if (!controller || controller.closed) {
				if (completion) completion(error);
				return;
			}
			if (!error) [controller setDragRegionsFromValue:result];
			if (completion) completion(error);
		}];
}

- (NSDictionary *)state {
    NSString *status = self.closed ? @"closed" : (self.window.visible ? @"visible" : @"hidden");
	NSDictionary *evidence = CDWindowServerSnapshot(self.nativeWindowID);
	NSDictionary *bounds = evidence[@"bounds"];
	if (!bounds.count) bounds = CDBoundsFromNativeRect(self.window.frame);
    return @{
        @"id": self.windowID,
        @"sessionId": self.sessionID,
        @"status": status,
		@"visible": @((BOOL)self.window.visible),
		@"bounds": bounds,
        @"alwaysOnTop": @(self.alwaysOnTop),
        @"draggable": @(self.draggable),
        @"hostPid": @(getpid()),
        @"nativeWindowId": @(self.nativeWindowID),
		@"onScreen": evidence[@"onScreen"] ?: @NO,
		@"layer": evidence[@"layer"] ?: @0,
		@"alpha": evidence[@"alpha"] ?: @0,
        @"revision": @(self.revision),
        @"lastSequence": @(self.sequence),
    };
}

- (void)emitType:(NSString *)type target:(NSString *)target body:(NSDictionary *)body reason:(NSString *)reason {
    self.sequence += 1;
    NSMutableDictionary *event = [@{
        @"sessionId": self.sessionID,
        @"windowId": self.windowID,
        @"type": type,
        @"sequence": @(self.sequence),
        @"timestamp": CDTimestamp(),
    } mutableCopy];
    if (target.length) event[@"targetId"] = target;
    if (body[@"value"] && body[@"value"] != NSNull.null) event[@"value"] = body[@"value"];
    if (body[@"checked"] && body[@"checked"] != NSNull.null) event[@"checked"] = body[@"checked"];
	if ([type isEqualToString:@"move"] || [type isEqualToString:@"resize"]) event[@"bounds"] = CDBoundsForWindow(self.window);
    if (reason.length) event[@"reason"] = reason;
    CDEmit(@{@"version": CDProtocolVersion, @"kind": @"event", @"event": event});
}

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.name isEqualToString:@"opendesk"] || !message.frameInfo.mainFrame || ![message.body isKindOfClass:NSDictionary.class] || self.closed) return;
    NSDictionary *body = (NSDictionary *)message.body;
    NSString *type = body[@"type"];
	if (![type isKindOfClass:NSString.class]) return;
	if ([type isEqualToString:@"ready"]) {
		[self setDragRegionsFromValue:body[@"dragRects"]];
		if ([self.window isKindOfClass:CDDialogWindow.class]) {
			if (![self fitHostDialogToContentLayout:body[@"dialogLayout"]]) {
				NSError *error = [NSError errorWithDomain:@"OpenDeskDialog" code:1
					userInfo:@{NSLocalizedDescriptionKey: @"native Dialog content layout was invalid"}];
				[self failInitialNavigation:error];
				return;
			}
			__weak CDWindowController *weakSelf = self;
			[self.webView evaluateJavaScript:@"window.__opendesk.states()" inFrame:nil
				inContentWorld:WKContentWorld.defaultClientWorld completionHandler:^(id result, NSError *error) {
					CDWindowController *controller = weakSelf;
					if (!controller || controller.closed) return;
					if (error || ![result isKindOfClass:NSArray.class]) {
						NSError *layoutError = error ?: [NSError errorWithDomain:@"OpenDeskDialog" code:2
							userInfo:@{NSLocalizedDescriptionKey: @"native Dialog controls could not be measured after fitting"}];
						[controller failInitialNavigation:layoutError];
						return;
					}
					[controller syncAccessibilityControlsFromValue:result];
					controller.bridgeReady = YES;
					[controller completeCreateIfReady];
				}];
			return;
		}
		[self syncAccessibilityControlsFromValue:body[@"controls"]];
		self.bridgeReady = YES;
		[self completeCreateIfReady];
		return;
	}
	if ([type isEqualToString:@"click"] || [type isEqualToString:@"input"] || [type isEqualToString:@"change"]) {
		NSString *targetID = body[@"targetId"];
		if (![targetID isKindOfClass:NSString.class] || ![self.controlIDs containsObject:targetID]) return;
		[self emitType:type target:targetID body:body reason:nil];
		return;
    }
	if ([type isEqualToString:@"dialogCancel"]) {
		// This message is emitted only by the native, fixed Dialog bridge. It
		// preserves the user-close semantics instead of exposing a new public
		// Custom UI event type or accepting caller-supplied script behavior.
		[self.window close];
	}
}

- (void)windowDidMove:(NSNotification *)notification {
    if (!self.dragActive && !self.closed) {
        [self.floatingToolbarView invalidateTooltips];
        self.revision += 1;
        [self emitType:@"move" target:nil body:@{} reason:nil];
    }
}

- (void)windowDidResize:(NSNotification *)notification {
    if (!self.closed && !self.dialogLayoutFitting) {
        self.revision += 1;
        [self emitType:@"resize" target:nil body:@{} reason:nil];
		if (self.webView) [self refreshDragRegionsWithCompletion:nil];
    }
}

- (void)windowWillClose:(NSNotification *)notification {
	if (self.closed) return;
	self.closed = YES;
	self.dragActive = NO;
	self.dragOverlay.enabled = NO;
	self.dragOverlay.dragDelegate = nil;
	[self.floatingToolbarView releaseResources];
	for (CDWebAccessibilityButtonProxy *button in self.webAccessibilityButtons.allValues) button.eventDelegate = nil;
	self.contentView.nativeAccessibilityChildren = @[];
	[self.webIconOverlay clear];
    self.revision += 1;
	[self.webView.configuration.userContentController removeScriptMessageHandlerForName:@"opendesk" contentWorld:WKContentWorld.defaultClientWorld];
	dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
		CDFinalizeClosedWindow(self, 0);
	});
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
	self.navigationFinished = YES;
	[self completeCreateIfReady];
}

- (void)completeCreateIfReady {
	if (!self.createRequestID.length || !self.navigationFinished || !self.bridgeReady) return;
	CDRespond(self.createRequestID, self.state);
	self.createRequestID = nil;
}

- (void)failInitialNavigation:(NSError *)error {
	if (!self.createRequestID.length) return;
	CDFail(self.createRequestID, @"UI_DRIVER_FAILURE", @"create", self.windowID, nil, error.localizedDescription ?: @"custom UI document failed to load");
	self.createRequestID = nil;
	self.programmaticClose = YES;
	[self.window close];
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
	[self failInitialNavigation:error];
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
	[self failInitialNavigation:error];
}

- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
	BOOL mainFrame = navigationAction.targetFrame == nil || navigationAction.targetFrame.mainFrame;
	BOOL allowed = NO;
	if (mainFrame && !self.initialNavigationStarted) {
		self.initialNavigationStarted = YES;
		allowed = YES;
	}
    decisionHandler(allowed ? WKNavigationActionPolicyAllow : WKNavigationActionPolicyCancel);
}

@end

static void CDFinalizeClosedWindow(CDWindowController *controller, NSUInteger attempt) {
	if (!controller || controller.closeEventEmitted) return;
	NSDictionary *evidence = CDWindowServerSnapshot(controller.nativeWindowID);
	if (!evidence.count || ![evidence[@"onScreen"] boolValue]) {
		controller.closeEventEmitted = YES;
		[controller emitType:@"close" target:nil body:@{} reason:(controller.programmaticClose ? @"script" : @"user")];
		[CDWindows removeObjectForKey:CDWindowKey(controller.sessionID, controller.windowID)];
		// The host is normally an accessory process. Restore that nonpersistent
		// status only after the last native window is gone; a normal Dialog must
		// be able to become the key application while its prompt is visible.
		if (CDWindows.count == 0) [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
		return;
	}
	if (attempt >= 500) return;
	dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
		CDFinalizeClosedWindow(controller, attempt + 1);
	});
}

static void CDFailCreateIfNotReady(CDWindowController *controller, NSUInteger attempt) {
	if (!controller.createRequestID.length) return;
	if (controller.navigationFinished && controller.bridgeReady) {
		[controller completeCreateIfReady];
		return;
	}
	if (attempt >= 500) {
		NSString *requestID = controller.createRequestID;
		controller.createRequestID = nil;
		CDFail(requestID, @"UI_DRIVER_FAILURE", @"create", controller.windowID, nil, @"custom UI document and isolated bridge did not become ready");
		controller.programmaticClose = YES;
		[controller.window close];
		return;
	}
	dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
		CDFailCreateIfNotReady(controller, attempt + 1);
	});
}

static CDWindowController *CDFindWindow(NSDictionary *request, NSString *requestID, NSString *operation) {
    NSString *windowID = request[@"windowId"] ?: @"";
    CDWindowController *controller = CDWindows[CDWindowKey(request[@"sessionId"], windowID)];
    if (!controller) {
        CDFail(requestID, @"NOT_FOUND", operation, windowID, nil, @"custom UI window was not found");
    }
    return controller;
}

static void CDRespondWhenVisible(CDWindowController *controller, NSString *requestID, NSUInteger attempt) {
	NSDictionary *state = controller.state;
	if ([state[@"onScreen"] boolValue] && [state[@"alpha"] doubleValue] > 0) {
		CDRespond(requestID, state);
		return;
	}
	if (attempt >= 100) {
		CDFail(requestID, @"UI_DRIVER_FAILURE", @"show", controller.windowID, nil, @"WindowServer did not report the custom UI window on screen");
		return;
	}
	dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
		CDRespondWhenVisible(controller, requestID, attempt + 1);
	});
}

static BOOL CDBoundsMatch(NSDictionary *actual, NSDictionary *expected) {
	if (!actual || !expected) return NO;
	for (NSString *key in @[@"x", @"y", @"width", @"height"]) {
		if (fabs([actual[key] doubleValue] - [expected[key] doubleValue]) > 0.5) return NO;
	}
	return YES;
}

static void CDRespondWhenBoundsMatch(CDWindowController *controller, NSString *requestID,
									 NSDictionary *expected, NSUInteger attempt) {
	NSDictionary *actual = CDWindowServerSnapshot(controller.nativeWindowID)[@"bounds"];
	if (actual.count && CDBoundsMatch(actual, expected)) {
		[controller refreshDragRegionsWithCompletion:^(NSError *error) {
			if (error) {
				CDFail(requestID, @"UI_DRIVER_FAILURE", @"setBounds", controller.windowID, nil,
					error.localizedDescription ?: @"failed to refresh custom UI drag regions");
				return;
			}
			CDRespond(requestID, controller.state);
		}];
		return;
	}
	if (attempt >= 100) {
		CDFail(requestID, @"UI_DRIVER_FAILURE", @"setBounds", controller.windowID, nil, @"WindowServer did not apply the requested custom UI bounds");
		return;
	}
	dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
		CDRespondWhenBoundsMatch(controller, requestID, expected, attempt + 1);
	});
}

static void CDRespondWhenClosed(CDWindowController *controller, NSString *requestID, NSUInteger attempt) {
	NSDictionary *evidence = CDWindowServerSnapshot(controller.nativeWindowID);
	if (!evidence.count || ![evidence[@"onScreen"] boolValue]) {
		CDFinalizeClosedWindow(controller, 0);
		CDRespond(requestID, controller.state);
		return;
	}
	if (attempt >= 100) {
		CDFail(requestID, @"UI_DRIVER_FAILURE", @"close", controller.windowID, nil, @"WindowServer still reports the custom UI window on screen after close");
		return;
	}
	dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
		CDRespondWhenClosed(controller, requestID, attempt + 1);
	});
}

static void CDRespondWhenLayerMatches(CDWindowController *controller, NSString *requestID, NSInteger expectedLayer, NSUInteger attempt) {
	NSDictionary *evidence = CDWindowServerSnapshot(controller.nativeWindowID);
	if (evidence.count && [evidence[@"layer"] integerValue] == expectedLayer) {
		CDRespond(requestID, controller.state);
		return;
	}
	if (attempt >= 100) {
		CDFail(requestID, @"UI_DRIVER_FAILURE", @"setAlwaysOnTop", controller.windowID, nil, @"WindowServer did not apply the requested window layer");
		return;
	}
	dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
		CDRespondWhenLayerMatches(controller, requestID, expectedLayer, attempt + 1);
	});
}

static void CDRespondWhenSessionClosed(NSArray<CDWindowController *> *controllers, NSString *requestID, NSUInteger attempt) {
	BOOL allClosed = YES;
	for (CDWindowController *controller in controllers) {
		NSDictionary *evidence = CDWindowServerSnapshot(controller.nativeWindowID);
		if (evidence.count && [evidence[@"onScreen"] boolValue]) {
			allClosed = NO;
			break;
		}
	}
	if (allClosed) {
		NSMutableArray *states = [NSMutableArray arrayWithCapacity:controllers.count];
		for (CDWindowController *controller in controllers) {
			CDFinalizeClosedWindow(controller, 0);
			[states addObject:controller.state];
		}
		CDRespond(requestID, states);
		return;
	}
	if (attempt >= 100) {
		CDFail(requestID, @"UI_DRIVER_FAILURE", @"closeSession", nil, nil, @"WindowServer still reports custom UI windows on screen after closing the session");
		return;
	}
	dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
		CDRespondWhenSessionClosed(controllers, requestID, attempt + 1);
	});
}

static void CDHandleCreate(NSDictionary *request, NSString *requestID) {
    NSDictionary *spec = request[@"payload"];
    NSString *sessionID = request[@"sessionId"] ?: @"";
    NSString *windowID = request[@"windowId"] ?: spec[@"id"];
    NSString *key = CDWindowKey(sessionID, windowID);
    if (CDWindows[key]) {
        CDFail(requestID, @"DUPLICATE_ID", @"create", windowID, nil, @"window id already exists");
        return;
    }
    NSDictionary *bounds = spec[@"bounds"];
    if (![bounds isKindOfClass:NSDictionary.class]) {
        CDFail(requestID, @"INVALID_SPEC", @"create", windowID, nil, @"window bounds are required");
        return;
    }
    NSDictionary *toolbarSpec = [spec[@"toolbar"] isKindOfClass:NSDictionary.class] ? spec[@"toolbar"] : nil;
	BOOL isNativeToolbar = toolbarSpec != nil;
	if (isNativeToolbar) bounds = [CDToolbarView outerBoundsForSpec:toolbarSpec position:bounds];
    NSString *kind = spec[@"kind"] ?: @"normal";
	// Host-owned Dialog frames deliberately keep the compact, non-resizable
	// AppKit alert shape. Public Custom UI windows retain their existing normal
	// window chrome and resize behavior.
	BOOL isHostDialog = [spec[@"centerOnActiveDisplay"] boolValue];
    NSWindowStyleMask style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable;
	if (!isHostDialog && !isNativeToolbar) style |= NSWindowStyleMaskResizable | NSWindowStyleMaskMiniaturizable;
    NSRect frame = CDNativeRect(bounds);
	if ([spec[@"centerOnActiveDisplay"] boolValue]) {
		frame = CDCenteredDialogRect(frame);
	}
    NSWindow *window;
    if ([kind isEqualToString:@"floating"]) {
		NSPanel *panel = [[NSPanel alloc] initWithContentRect:frame styleMask:(style | NSWindowStyleMaskNonactivatingPanel) backing:NSBackingStoreBuffered defer:NO];
        panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary;
		panel.floatingPanel = YES;
		panel.becomesKeyOnlyIfNeeded = YES;
		panel.hidesOnDeactivate = NO;
        window = panel;
	} else {
		Class windowClass = isHostDialog ? CDDialogWindow.class : NSWindow.class;
		window = [[windowClass alloc] initWithContentRect:frame styleMask:style backing:NSBackingStoreBuffered defer:NO];
	}
	// Public bounds describe the outer native window. initWithContentRect treats
	// the input as content size, so normalize the actual frame explicitly.
    [window setFrame:frame display:NO];
	if (isHostDialog || isNativeToolbar) {
		[window setMinSize:frame.size];
		[window setMaxSize:frame.size];
	}
    window.releasedWhenClosed = NO;
    window.title = spec[@"title"] ?: @"";

    CDWindowController *controller = [CDWindowController new];
    controller.sessionID = sessionID;
    controller.windowID = windowID;
    controller.kind = kind;
    controller.window = window;
	controller.nativeWindowID = (CGWindowID)window.windowNumber;
    controller.alwaysOnTop = [spec[@"alwaysOnTop"] boolValue];
    controller.draggable = [spec[@"draggable"] boolValue];
	NSMutableSet<NSString *> *controlIDs = [NSMutableSet set];
	for (NSDictionary *control in spec[@"controls"] ?: @[]) {
		NSString *identifier = control[@"id"];
		if ([identifier isKindOfClass:NSString.class] && identifier.length) [controlIDs addObject:identifier];
	}
	controller.controlIDs = controlIDs.copy;
    controller.revision = 1;
	window.level = controller.alwaysOnTop ? NSFloatingWindowLevel : NSNormalWindowLevel;
	window.movableByWindowBackground = NO;
	window.delegate = controller;
	if (isNativeToolbar) {
		NSError *toolbarError = nil;
		CDToolbarView *toolbarView = [[CDToolbarView alloc] initWithFrame:window.contentView.bounds spec:toolbarSpec error:&toolbarError];
		if (!toolbarView || toolbarError) {
			CDFail(requestID, @"INVALID_SPEC", @"create", windowID, nil, toolbarError.localizedDescription ?: @"native toolbar declaration is invalid");
			controller.programmaticClose = YES;
			[window close];
			return;
		}
		toolbarView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
		toolbarView.eventDelegate = controller;
		controller.floatingToolbarView = toolbarView;
		window.contentView = toolbarView;
		window.movableByWindowBackground = controller.draggable;
		CDWindows[key] = controller;
		CDRespond(requestID, controller.state);
		return;
	}
	// Generic WebKit compatibility controls are allocated only after the
	// native-toolbar branch has returned. FloatingWindow therefore has no DOM,
	// icon overlay, or non-drawing Accessibility proxy objects.
	controller.webAccessibilityButtons = [NSMutableDictionary dictionary];

    NSDictionary *content = spec[@"content"];
    NSString *html = content[@"html"] ?: @"";
    NSString *css = content[@"css"] ?: @"";
    controller.basePath = [content[@"basePath"] stringByStandardizingPath] ?: @"";
	controller.createRequestID = requestID;
    WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
	configuration.defaultWebpagePreferences.allowsContentJavaScript = NO;
	configuration.preferences.javaScriptCanOpenWindowsAutomatically = NO;
	[configuration.userContentController addScriptMessageHandler:controller contentWorld:WKContentWorld.defaultClientWorld name:@"opendesk"];
    NSString *bridge = CDBridgeSource(spec[@"controls"] ?: @[], css, controller.draggable);
	WKUserScript *script = [[WKUserScript alloc] initWithSource:bridge injectionTime:WKUserScriptInjectionTimeAtDocumentEnd forMainFrameOnly:YES inContentWorld:WKContentWorld.defaultClientWorld];
    [configuration.userContentController addUserScript:script];
	CDContentView *contentView = [[CDContentView alloc] initWithFrame:window.contentView.bounds];
	contentView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
	contentView.accessibilityElement = YES;
	WKWebView *webView = [[CDWebView alloc] initWithFrame:contentView.bounds configuration:configuration];
    webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    webView.navigationDelegate = controller;
	controller.webView = webView;
	CDWebIconOverlayView *webIconOverlay = [[CDWebIconOverlayView alloc] initWithFrame:contentView.bounds];
	webIconOverlay.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
	controller.webIconOverlay = webIconOverlay;
	CDDragOverlayView *dragOverlay = [[CDDragOverlayView alloc] initWithFrame:contentView.bounds];
	dragOverlay.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
	dragOverlay.accessibilityElement = NO;
	dragOverlay.accessibilityHidden = YES;
	dragOverlay.enabled = controller.draggable;
	dragOverlay.dragDelegate = controller;
	controller.dragOverlay = dragOverlay;
	contentView.webView = webView;
	contentView.dragOverlay = dragOverlay;
	controller.contentView = contentView;
	[contentView addSubview:webView];
	[contentView addSubview:webIconOverlay positioned:NSWindowAbove relativeTo:webView];
	[contentView addSubview:dragOverlay positioned:NSWindowAbove relativeTo:webView];
	window.contentView = contentView;
    NSURL *baseURL = controller.basePath.length ? [NSURL fileURLWithPath:controller.basePath isDirectory:YES] : nil;
    CDWindows[key] = controller;
	NSString *policy = @"default-src 'none'; img-src data: file:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; media-src 'none'; font-src 'none'; child-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
	NSString *protectedHTML = [NSString stringWithFormat:@"<meta http-equiv=\"Content-Security-Policy\" content=\"%@\">%@", policy, html];
	[webView loadHTMLString:protectedHTML baseURL:baseURL];
	CDFailCreateIfNotReady(controller, 0);
}

static void CDEvaluateControl(CDWindowController *controller, NSDictionary *request,
                              NSString *requestID, NSString *operation) {
    NSDictionary *payload = request[@"payload"] ?: @{};
    NSString *targetID = payload[@"id"] ?: @"";
    NSString *script;
    if ([operation isEqualToString:@"getControlState"]) {
        script = [NSString stringWithFormat:@"window.__opendesk.state(%@)", CDJSONString(targetID)];
    } else {
        script = [NSString stringWithFormat:@"window.__opendesk.update(%@, %@)", CDJSONString(targetID), CDJSONString(payload[@"patch"] ?: @{})];
    }
	[controller.webView evaluateJavaScript:script inFrame:nil inContentWorld:WKContentWorld.defaultClientWorld completionHandler:^(id result, NSError *error) {
        if (error) {
            CDFail(requestID, @"UI_DRIVER_FAILURE", operation, controller.windowID, targetID, error.localizedDescription);
            return;
        }
		if (![result isKindOfClass:NSDictionary.class]) {
			CDFail(requestID, @"UI_DRIVER_FAILURE", operation, controller.windowID, targetID, @"custom UI control state was not an object");
			return;
		}
		[controller syncAccessibilityControlFromState:(NSDictionary *)result];
		NSMutableDictionary *state = [(NSDictionary *)result mutableCopy];
		// Return the name from the real native AXButton peer rather than merely
		// echoing the DOM aria-label. The JS conformance result can therefore
		// prove the name used by the subsequent PID-directed AXPress.
		CDWebAccessibilityButtonProxy *accessibilityButton = controller.webAccessibilityButtons[targetID];
		if (accessibilityButton.accessibilityLabel.length) {
			state[@"accessibilityName"] = accessibilityButton.accessibilityLabel;
		}
		NSDictionary *local = state[@"localBounds"];
		if ([local isKindOfClass:NSDictionary.class]) {
			NSRect frame = controller.window.frame;
			NSRect content = [controller.window contentRectForFrameRect:frame];
			NSDictionary *outer = CDBoundsForWindow(controller.window);
			state[@"screenBounds"] = @{
				@"x": @([outer[@"x"] doubleValue] + NSMinX(content) - NSMinX(frame) + [local[@"x"] doubleValue]),
				@"y": @([outer[@"y"] doubleValue] + NSMaxY(frame) - NSMaxY(content) + [local[@"y"] doubleValue]),
				@"width": local[@"width"] ?: @0,
				@"height": local[@"height"] ?: @0,
			};
		}
			if ([operation isEqualToString:@"updateControl"]) {
				[controller refreshDragRegionsWithCompletion:^(NSError *refreshError) {
					if (refreshError) {
						CDFail(requestID, @"UI_DRIVER_FAILURE", operation, controller.windowID, targetID,
							refreshError.localizedDescription ?: @"failed to refresh custom UI drag regions");
						return;
					}
					CDRespond(requestID, state);
				}];
				return;
			}
			CDRespond(requestID, state);
	    }];
}

static void CDEvaluateToolbarButton(CDWindowController *controller, NSDictionary *request,
								 NSString *requestID, NSString *operation) {
	NSDictionary *payload = [request[@"payload"] isKindOfClass:NSDictionary.class] ? request[@"payload"] : @{};
	NSString *targetID = @"";
	NSDictionary *result = nil;
	if ([operation isEqualToString:@"getToolbarButtonState"]) {
		targetID = [payload[@"id"] isKindOfClass:NSString.class] ? payload[@"id"] : @"";
		result = [controller.floatingToolbarView stateForButtonID:targetID window:controller.window];
	} else {
		NSDictionary *button = [payload[@"button"] isKindOfClass:NSDictionary.class] ? payload[@"button"] : nil;
		targetID = [button[@"id"] isKindOfClass:NSString.class] ? button[@"id"] : @"";
		NSError *error = nil;
		result = [controller.floatingToolbarView applyButtonSpec:button window:controller.window error:&error];
		if (error) {
			CDFail(requestID, @"INVALID_SPEC", operation, controller.windowID, targetID, error.localizedDescription);
			return;
		}
	}
	if (!result) {
		CDFail(requestID, @"NOT_FOUND", operation, controller.windowID, targetID, @"native toolbar button was not found");
		return;
	}
	CDRespond(requestID, result);
}

static void CDHandleRequest(NSDictionary *request) {
    NSString *version = request[@"version"];
    NSString *requestID = request[@"requestId"] ?: @"";
    NSString *operation = request[@"operation"] ?: @"";
    if (![version isEqualToString:CDProtocolVersion]) {
        CDFail(requestID, @"UI_DRIVER_FAILURE", operation, request[@"windowId"], nil, @"custom UI protocol version mismatch");
        return;
    }
    if ([operation isEqualToString:@"create"]) {
        CDHandleCreate(request, requestID);
        return;
    }
    if ([operation isEqualToString:@"closeSession"]) {
        NSString *sessionID = request[@"sessionId"] ?: @"";
		NSMutableArray<CDWindowController *> *controllers = [NSMutableArray array];
        for (NSString *key in CDWindows.allKeys.copy) {
            CDWindowController *controller = CDWindows[key];
            if ([controller.sessionID isEqualToString:sessionID]) {
				[controllers addObject:controller];
                controller.programmaticClose = YES;
                [controller.window close];
            }
        }
		CDRespondWhenSessionClosed(controllers, requestID, 0);
        return;
    }
    if ([operation isEqualToString:@"shutdown"]) {
        for (CDWindowController *controller in CDWindows.allValues.copy) {
            controller.programmaticClose = YES;
            [controller.window close];
        }
        CDRespond(requestID, NSNull.null);
        [NSApp terminate:nil];
        return;
    }

    CDWindowController *controller = CDFindWindow(request, requestID, operation);
    if (!controller) return;
    if ([operation isEqualToString:@"show"]) {
		if ([controller.kind isEqualToString:@"floating"]) {
			[controller.window orderFrontRegardless];
		}
        else {
			[NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
            [NSApp activateIgnoringOtherApps:YES];
			[controller.window makeKeyAndOrderFront:nil];
			[controller.window makeFirstResponder:controller.webView];
			// Dialog templates use this host-owned marker to make their input the
			// first responder. Floating panels intentionally retain nonactivating
			// behavior; normal windows are allowed to receive keyboard input.
			[controller.webView evaluateJavaScript:@"(function(){var el=document.querySelector('[data-opendesk-dialog-focus]');if(el){el.focus();return true;}return false;})()" completionHandler:nil];
        }
        controller.revision += 1;
		CDRespondWhenVisible(controller, requestID, 0);
    } else if ([operation isEqualToString:@"hide"]) {
        [controller.floatingToolbarView invalidateTooltips];
        [controller.window orderOut:nil];
        controller.revision += 1;
        CDRespond(requestID, controller.state);
    } else if ([operation isEqualToString:@"close"]) {
        controller.programmaticClose = YES;
        [controller.window close];
		CDRespondWhenClosed(controller, requestID, 0);
    } else if ([operation isEqualToString:@"setBounds"]) {
		NSDictionary *expected = request[@"payload"];
        [controller.floatingToolbarView invalidateTooltips];
		[controller.window setFrame:CDNativeRect(expected) display:YES];
        controller.revision += 1;
		CDRespondWhenBoundsMatch(controller, requestID, expected, 0);
    } else if ([operation isEqualToString:@"setAlwaysOnTop"]) {
        [controller.floatingToolbarView invalidateTooltips];
        controller.alwaysOnTop = [request[@"payload"][@"enabled"] boolValue];
		controller.window.level = controller.alwaysOnTop ? NSFloatingWindowLevel : NSNormalWindowLevel;
        controller.revision += 1;
		CDRespondWhenLayerMatches(controller, requestID, controller.window.level, 0);
	} else if ([operation isEqualToString:@"setDraggable"]) {
        controller.draggable = [request[@"payload"][@"enabled"] boolValue];
		if (controller.floatingToolbarView) {
			controller.window.movableByWindowBackground = controller.draggable;
			controller.revision += 1;
			CDRespond(requestID, controller.state);
			return;
		}
		controller.dragOverlay.enabled = controller.draggable;
		controller.window.movableByWindowBackground = NO;
        controller.revision += 1;
		NSString *script = [NSString stringWithFormat:@"window.__opendesk.setDraggable(%@)", controller.draggable ? @"true" : @"false"];
		[controller.webView evaluateJavaScript:script inFrame:nil inContentWorld:WKContentWorld.defaultClientWorld completionHandler:^(id result, NSError *error) {
			if (error) {
				CDFail(requestID, @"UI_DRIVER_FAILURE", @"setDraggable", controller.windowID, nil, error.localizedDescription);
				return;
			}
			CDRespond(requestID, controller.state);
		}];
    } else if ([operation isEqualToString:@"getState"]) {
        CDRespond(requestID, controller.state);
	} else if ([operation isEqualToString:@"getToolbarButtonState"] || [operation isEqualToString:@"applyToolbarButton"]) {
		if (!controller.floatingToolbarView) {
			CDFail(requestID, @"UNSUPPORTED_CAPABILITY", operation, controller.windowID, nil, @"window is not a native toolbar");
			return;
		}
		CDEvaluateToolbarButton(controller, request, requestID, operation);
	} else if ([operation isEqualToString:@"getControlState"] || [operation isEqualToString:@"updateControl"]) {
		if (controller.floatingToolbarView) {
			CDFail(requestID, @"UNSUPPORTED_CAPABILITY", operation, controller.windowID, nil, @"native toolbar requires structured button operations");
			return;
		}
        CDEvaluateControl(controller, request, requestID, operation);
    } else {
        CDFail(requestID, @"UNSUPPORTED_CAPABILITY", operation, controller.windowID, nil, @"native UI operation is unsupported");
    }
}

void OpenDeskUIHandleCommand(const char *json) {
    if (!json) return;
    NSString *copy = [NSString stringWithUTF8String:json];
    dispatch_async(dispatch_get_main_queue(), ^{
        NSData *data = [copy dataUsingEncoding:NSUTF8StringEncoding];
        NSError *error = nil;
        id value = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];
        if (![value isKindOfClass:NSDictionary.class]) {
            CDFail(@"", @"UI_DRIVER_FAILURE", @"decode", nil, nil, error.localizedDescription ?: @"invalid protocol frame");
            return;
        }
        CDHandleRequest((NSDictionary *)value);
    });
}

void OpenDeskUIShutdown(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        for (CDWindowController *controller in CDWindows.allValues.copy) {
            controller.programmaticClose = YES;
            [controller.window close];
        }
        [NSApp terminate:nil];
    });
}

void OpenDeskUIRun(void) {
    @autoreleasepool {
        CDWindows = [NSMutableDictionary dictionary];
        NSApplication *application = NSApplication.sharedApplication;
        [application setActivationPolicy:NSApplicationActivationPolicyAccessory];
		[application finishLaunching];
        CDEmitHello();
        [application run];
    }
}

int OpenDeskUIIsMainThread(void) {
	return NSThread.isMainThread ? 1 : 0;
}
