#import <WebKit/WebKit.h>

// Fixed-byte, per-window origin. No filesystem handler is registered here.
@interface CDTrustedSchemeHandler : NSObject <WKURLSchemeHandler>
@property(nonatomic, copy) NSData *html;
@property(nonatomic, strong) NSURL *url;
@end

static NSString *CDTrustedNonce(void) {
 unsigned char bytes[32]; arc4random_buf(bytes, sizeof(bytes));
 NSMutableString *result = [NSMutableString string];
 for (NSUInteger i=0;i<sizeof(bytes);i++) [result appendFormat:@"%02x",bytes[i]];
 return result;
}

static BOOL CDTrustedJSONValue(id value, NSUInteger depth, NSUInteger *nodes) {
 if (depth>32 || ++*nodes>4096) return NO;
 if (value==NSNull.null || [value isKindOfClass:NSString.class]) return YES;
 if ([value isKindOfClass:NSNumber.class]) return isfinite([value doubleValue]);
 if ([value isKindOfClass:NSArray.class]) { for (id item in value) if (!CDTrustedJSONValue(item,depth+1,nodes)) return NO; return YES; }
 if ([value isKindOfClass:NSDictionary.class]) { for (id key in value) if (![key isKindOfClass:NSString.class] || !CDTrustedJSONValue(value[key],depth+1,nodes)) return NO; return YES; }
 return NO;
}
static BOOL CDTrustedJSON(id value) {
 NSUInteger nodes=0;
 if (!CDTrustedJSONValue(value,0,&nodes)) return NO;
 NSData *data=[NSJSONSerialization dataWithJSONObject:value options:NSJSONWritingFragmentsAllowed error:nil];
 return data && data.length<=65536;
}

static NSString *CDTrustedCSP(void) {
 return @"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'; font-src 'none'; media-src 'none'";
}

@implementation CDTrustedSchemeHandler
- (void)webView:(WKWebView *)webView startURLSchemeTask:(id<WKURLSchemeTask>)task {
 if (![task.request.URL.absoluteString isEqualToString:self.url.absoluteString] || !self.html) {
  [task didFailWithError:[NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorResourceUnavailable userInfo:nil]]; return;
 }
 NSString *policy=CDTrustedCSP();
 NSHTTPURLResponse *response=[[NSHTTPURLResponse alloc] initWithURL:self.url statusCode:200 HTTPVersion:@"HTTP/1.1" headerFields:@{@"Content-Type":@"text/html; charset=utf-8",@"Content-Security-Policy":policy,@"Cache-Control":@"no-store"}];
 [task didReceiveResponse:response]; [task didReceiveData:self.html]; [task didFinish];
}
- (void)webView:(WKWebView *)webView stopURLSchemeTask:(id<WKURLSchemeTask>)task {}
@end

static NSString *CDTrustedBridgeSource(NSString *nonce) {
 return [NSString stringWithFormat:@"(()=>{'use strict';const nonce=%@,listeners=new Set();const valid=v=>{let n=0;const walk=(x,d)=>{if(d>32||++n>4096)throw Error('message limits');if(x===null||typeof x==='string'||typeof x==='boolean')return;if(typeof x==='number'&&Number.isFinite(x))return;if(Array.isArray(x)){for(const y of x)walk(y,d+1);return;}if(typeof x==='object'&&Object.getPrototypeOf(x)===Object.prototype){for(const k of Object.keys(x))walk(x[k],d+1);return;}throw Error('JSON required');};walk(v,0);const s=JSON.stringify(v);if(new TextEncoder().encode(s).length>65536)throw Error('message too large');return s;};const send=(kind,json)=>window.webkit.messageHandlers.opendeskTrusted.postMessage({nonce,kind,json});Object.defineProperty(window,'OpenDeskApp',{value:Object.freeze({postMessage(v){send('message',valid(v));},onMessage(fn){if(typeof fn!=='function')throw TypeError('handler required');listeners.add(fn);return()=>listeners.delete(fn);}}),writable:false,configurable:false});Object.defineProperty(window,'__opendeskTrustedReceive',{value:(token,json)=>{if(token!==nonce)return;const value=JSON.parse(json);valid(value);for(const fn of [...listeners]){try{fn(value);}catch(e){console.error(e);}}},writable:false,configurable:false});send('ready','null');})();",CDJSONString(nonce)];
}
