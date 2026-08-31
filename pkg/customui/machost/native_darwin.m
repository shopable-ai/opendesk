//go:build darwin && cgo

#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>
#import <WebKit/WebKit.h>
#import <unistd.h>
#import <math.h>
#import "native_darwin.h"

static NSString *const CDProtocolVersion = @"1.0.0";
static NSMutableDictionary<NSString *, id> *CDWindows;

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
         "const state = (id) => { const el = element(id); const r = el.getBoundingClientRect(); return {id, type:typeFor(id), text:el.textContent || '', value:('value' in el ? el.value : null), checked:('checked' in el ? !!el.checked : null), disabled:!!el.disabled, visible:!!(el.offsetWidth || el.offsetHeight || el.getClientRects().length), classes:Array.from(el.classList), localBounds:{x:r.x,y:r.y,width:r.width,height:r.height}, screenBounds:{x:window.screenX+r.x,y:window.screenY+r.y,width:r.width,height:r.height}}; };\n"
         "const update = (id, patch) => { const el = element(id); if (Object.prototype.hasOwnProperty.call(patch,'text')) el.textContent = String(patch.text ?? ''); if (Object.prototype.hasOwnProperty.call(patch,'value')) el.value = patch.value ?? ''; if (Object.prototype.hasOwnProperty.call(patch,'checked')) el.checked = !!patch.checked; if (Object.prototype.hasOwnProperty.call(patch,'disabled')) el.disabled = !!patch.disabled; if (Object.prototype.hasOwnProperty.call(patch,'visible')) el.hidden = !patch.visible; if (Array.isArray(patch.classes)) el.className = patch.classes.join(' '); if (Object.prototype.hasOwnProperty.call(patch,'source')) { if (el.tagName !== 'IMG') throw new Error('source is supported only for img controls'); el.src = patch.source || ''; } if (Array.isArray(patch.options)) { if (el.tagName !== 'SELECT') throw new Error('options are supported only for select controls'); el.replaceChildren(...patch.options.map(o => { const option=document.createElement('option'); option.value=String(o.value); option.textContent=String(o.label); return option; })); } return state(id); };\n"
         "const targetFor = (event) => { const el = event.target && event.target.closest ? event.target.closest('[id]') : null; return el && allowed.has(el.id) ? el : null; };\n"
         "document.addEventListener('click', event => { const el=targetFor(event); if (el) send({type:'click',targetId:el.id,value:('value' in el ? el.value : null),checked:('checked' in el ? !!el.checked : null)}); });\n"
         "document.addEventListener('input', event => { const el=targetFor(event); if (el) send({type:'input',targetId:el.id,value:('value' in el ? el.value : null),checked:('checked' in el ? !!el.checked : null)}); });\n"
         "document.addEventListener('change', event => { const el=targetFor(event); if (el) send({type:'change',targetId:el.id,value:('value' in el ? el.value : null),checked:('checked' in el ? !!el.checked : null)}); });\n"
         "let drag = null;\n"
         // data-clawdesk-drag is accepted only as legacy HTML compatibility;
         // newly generated and documented content uses data-opendesk-drag.
         "document.addEventListener('pointerdown', event => { if (!config.draggable || !event.target.closest('[data-opendesk-drag],[data-clawdesk-drag]')) return; drag={x:event.screenX,y:event.screenY,pointerId:event.pointerId}; event.target.setPointerCapture?.(event.pointerId); send({type:'__dragStart',screenX:event.screenX,screenY:event.screenY}); event.preventDefault(); });\n"
         "document.addEventListener('pointermove', event => { if (drag && drag.pointerId===event.pointerId) send({type:'__dragMove',screenX:event.screenX,screenY:event.screenY}); });\n"
         "const endDrag = (event) => { if (drag && drag.pointerId===event.pointerId) { send({type:'__dragEnd',screenX:Number.isFinite(event.screenX)?event.screenX:drag.x,screenY:Number.isFinite(event.screenY)?event.screenY:drag.y}); drag=null; } };\n"
         "document.addEventListener('pointerup', endDrag); document.addEventListener('pointercancel', endDrag); document.addEventListener('lostpointercapture', endDrag);\n"
         "const setDraggable = (enabled) => { config.draggable = !!enabled; if (!config.draggable) drag = null; };\n"
         "Object.defineProperty(window, '__opendesk', {value:Object.freeze({state,update,setDraggable}), configurable:false, writable:false});\n"
         "send({type:'ready'});\n"
         "})();", CDJSONString(configuration)];
}

@interface CDWindowController : NSObject <WKScriptMessageHandler, WKNavigationDelegate, NSWindowDelegate>
@property(nonatomic, copy) NSString *sessionID;
@property(nonatomic, copy) NSString *windowID;
@property(nonatomic, copy) NSString *kind;
@property(nonatomic, copy) NSString *basePath;
@property(nonatomic, copy) NSString *createRequestID;
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *webView;
@property(nonatomic, strong) NSSet<NSString *> *controlIDs;
@property(nonatomic) CGWindowID nativeWindowID;
@property(nonatomic) BOOL alwaysOnTop;
@property(nonatomic) BOOL draggable;
@property(nonatomic) BOOL closed;
@property(nonatomic) BOOL programmaticClose;
@property(nonatomic) BOOL dragActive;
@property(nonatomic) BOOL navigationFinished;
@property(nonatomic) BOOL bridgeReady;
@property(nonatomic) BOOL initialNavigationStarted;
@property(nonatomic) BOOL closeEventEmitted;
@property(nonatomic) NSPoint dragStart;
@property(nonatomic) NSRect dragFrame;
@property(nonatomic) uint64_t sequence;
@property(nonatomic) uint64_t revision;
- (void)completeCreateIfReady;
- (void)emitType:(NSString *)type target:(NSString *)target body:(NSDictionary *)body reason:(NSString *)reason;
@end

static void CDFinalizeClosedWindow(CDWindowController *controller, NSUInteger attempt);

@implementation CDWindowController

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
		self.bridgeReady = YES;
		[self completeCreateIfReady];
		return;
	}
    if ([type isEqualToString:@"__dragStart"] && self.draggable) {
		if (![body[@"screenX"] isKindOfClass:NSNumber.class] || ![body[@"screenY"] isKindOfClass:NSNumber.class]) return;
        self.dragActive = YES;
        self.dragStart = NSMakePoint([body[@"screenX"] doubleValue], [body[@"screenY"] doubleValue]);
        self.dragFrame = self.window.frame;
        return;
    }
    if ([type isEqualToString:@"__dragMove"] && self.dragActive) {
		if (![body[@"screenX"] isKindOfClass:NSNumber.class] || ![body[@"screenY"] isKindOfClass:NSNumber.class]) return;
        CGFloat dx = [body[@"screenX"] doubleValue] - self.dragStart.x;
        CGFloat dy = [body[@"screenY"] doubleValue] - self.dragStart.y;
        NSRect frame = self.dragFrame;
        frame.origin.x += dx;
        frame.origin.y -= dy;
        [self.window setFrame:frame display:YES];
        return;
    }
    if ([type isEqualToString:@"__dragEnd"] && self.dragActive) {
        self.dragActive = NO;
        self.revision += 1;
        [self emitType:@"move" target:nil body:@{} reason:nil];
        return;
    }
	if ([type isEqualToString:@"click"] || [type isEqualToString:@"input"] || [type isEqualToString:@"change"]) {
		NSString *targetID = body[@"targetId"];
		if (![targetID isKindOfClass:NSString.class] || ![self.controlIDs containsObject:targetID]) return;
		[self emitType:type target:targetID body:body reason:nil];
    }
}

- (void)windowDidMove:(NSNotification *)notification {
    if (!self.dragActive && !self.closed) {
        self.revision += 1;
        [self emitType:@"move" target:nil body:@{} reason:nil];
    }
}

- (void)windowDidResize:(NSNotification *)notification {
    if (!self.closed) {
        self.revision += 1;
        [self emitType:@"resize" target:nil body:@{} reason:nil];
    }
}

- (void)windowWillClose:(NSNotification *)notification {
    if (self.closed) return;
    self.closed = YES;
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
	BOOL allowed = !mainFrame;
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
		CDRespond(requestID, controller.state);
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
    NSString *kind = spec[@"kind"] ?: @"normal";
    NSWindowStyleMask style = NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable | NSWindowStyleMaskMiniaturizable;
    NSRect frame = CDNativeRect(bounds);
    NSWindow *window;
    if ([kind isEqualToString:@"floating"]) {
		NSPanel *panel = [[NSPanel alloc] initWithContentRect:frame styleMask:(style | NSWindowStyleMaskNonactivatingPanel) backing:NSBackingStoreBuffered defer:NO];
        panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary;
		panel.floatingPanel = YES;
		panel.becomesKeyOnlyIfNeeded = YES;
		panel.hidesOnDeactivate = NO;
        window = panel;
    } else {
        window = [[NSWindow alloc] initWithContentRect:frame styleMask:style backing:NSBackingStoreBuffered defer:NO];
    }
	// Public bounds describe the outer native window. initWithContentRect treats
	// the input as content size, so normalize the actual frame explicitly.
	[window setFrame:frame display:NO];
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
    WKWebView *webView = [[WKWebView alloc] initWithFrame:window.contentView.bounds configuration:configuration];
    webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    webView.navigationDelegate = controller;
    controller.webView = webView;
    window.contentView = webView;
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
		NSMutableDictionary *state = [(NSDictionary *)result mutableCopy];
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
		CDRespond(requestID, state);
    }];
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
            [controller.window makeKeyAndOrderFront:nil];
            [NSApp activateIgnoringOtherApps:YES];
        }
        controller.revision += 1;
		CDRespondWhenVisible(controller, requestID, 0);
    } else if ([operation isEqualToString:@"hide"]) {
        [controller.window orderOut:nil];
        controller.revision += 1;
        CDRespond(requestID, controller.state);
    } else if ([operation isEqualToString:@"close"]) {
        controller.programmaticClose = YES;
        [controller.window close];
		CDRespondWhenClosed(controller, requestID, 0);
    } else if ([operation isEqualToString:@"setBounds"]) {
		NSDictionary *expected = request[@"payload"];
		[controller.window setFrame:CDNativeRect(expected) display:YES];
        controller.revision += 1;
		CDRespondWhenBoundsMatch(controller, requestID, expected, 0);
    } else if ([operation isEqualToString:@"setAlwaysOnTop"]) {
        controller.alwaysOnTop = [request[@"payload"][@"enabled"] boolValue];
		controller.window.level = controller.alwaysOnTop ? NSFloatingWindowLevel : NSNormalWindowLevel;
        controller.revision += 1;
		CDRespondWhenLayerMatches(controller, requestID, controller.window.level, 0);
    } else if ([operation isEqualToString:@"setDraggable"]) {
        controller.draggable = [request[@"payload"][@"enabled"] boolValue];
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
    } else if ([operation isEqualToString:@"getControlState"] || [operation isEqualToString:@"updateControl"]) {
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
