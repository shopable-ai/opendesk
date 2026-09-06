//go:build darwin && cgo

package automation

/*
#cgo CFLAGS: -x objective-c -fobjc-arc
#include <ApplicationServices/ApplicationServices.h>
#include <AudioToolbox/AudioToolbox.h>
#include <CoreMedia/CoreMedia.h>
#include <Foundation/Foundation.h>
#include <dlfcn.h>
#include <objc/message.h>
#include <objc/runtime.h>
#include <stdint.h>

#define OPENDESK_PATTERN_OK 0
#define OPENDESK_PATTERN_UNSUPPORTED 1
#define OPENDESK_PATTERN_PERMISSION 2
#define OPENDESK_PATTERN_FAILED 3
#define OPENDESK_PATTERN_PENDING 4
#define OPENDESK_PATTERN_READY 5
#define OPENDESK_PATTERN_STOPPED 6
#define OPENDESK_PATTERN_MAX_SAMPLES 48000
#define OPENDESK_SC_STREAM_OUTPUT_AUDIO 1

extern void opendesk_audio_pattern_capture_pcm(uint64_t id, float *samples, size_t sampleCount, int discontinuity, unsigned long long dropped);
extern void opendesk_audio_pattern_capture_error(uint64_t id, int32_t status);

static BOOL OpenDeskClassRespondsToSelector(Class klass, const char *name) {
  return klass != Nil && [klass respondsToSelector:sel_registerName(name)];
}

static BOOL OpenDeskInstancesRespondToSelector(Class klass, const char *name) {
  return klass != Nil && [klass instancesRespondToSelector:sel_registerName(name)];
}

// ScreenCaptureKit is loaded dynamically. Its system-audio APIs are macOS 13+
// but OpenDesk still supports launching on macOS 12.0; a direct framework link
// would make 12.0–12.2 fail before capability discovery can fail closed.
static BOOL OpenDeskScreenCaptureKitAvailable(void) {
  static void *framework = NULL;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    if (@available(macOS 13.0, *)) {
      framework = dlopen("/System/Library/Frameworks/ScreenCaptureKit.framework/ScreenCaptureKit", RTLD_LAZY | RTLD_LOCAL);
    }
  });
  Class content = NSClassFromString(@"SCShareableContent");
  Class filter = NSClassFromString(@"SCContentFilter");
  Class configuration = NSClassFromString(@"SCStreamConfiguration");
  Class stream = NSClassFromString(@"SCStream");
  return framework != NULL &&
    OpenDeskClassRespondsToSelector(content, "getShareableContentWithCompletionHandler:") &&
    OpenDeskInstancesRespondToSelector(content, "displays") &&
    OpenDeskInstancesRespondToSelector(filter, "initWithDisplay:excludingWindows:") &&
    OpenDeskInstancesRespondToSelector(configuration, "setCapturesAudio:") &&
    OpenDeskInstancesRespondToSelector(configuration, "setSampleRate:") &&
    OpenDeskInstancesRespondToSelector(configuration, "setChannelCount:") &&
    OpenDeskInstancesRespondToSelector(configuration, "setExcludesCurrentProcessAudio:") &&
    OpenDeskInstancesRespondToSelector(configuration, "setQueueDepth:") &&
    OpenDeskInstancesRespondToSelector(stream, "initWithFilter:configuration:delegate:") &&
    OpenDeskInstancesRespondToSelector(stream, "addStreamOutput:type:sampleHandlerQueue:error:") &&
    OpenDeskInstancesRespondToSelector(stream, "startCaptureWithCompletionHandler:") &&
    OpenDeskInstancesRespondToSelector(stream, "stopCaptureWithCompletionHandler:");
}

@interface OpenDeskPatternStream : NSObject
@property(nonatomic) uint64_t identifier;
@property(nonatomic, strong) id stream;
@property(nonatomic) dispatch_queue_t outputQueue;
@property(nonatomic) dispatch_group_t callbackGroup;
@property(nonatomic) int32_t state;
@property(nonatomic) BOOL stopping;
@property(nonatomic) BOOL stopIssued;
@property(nonatomic) BOOL startIssued;
@property(nonatomic) BOOL startCallInProgress;
@property(nonatomic) BOOL captureEnded;
@property(nonatomic) CMTime lastAudioEnd;
@property(nonatomic) BOOL hasLastAudioEnd;
@end

@implementation OpenDeskPatternStream

- (instancetype)init {
  self = [super init];
  if (self) {
    _state = OPENDESK_PATTERN_PENDING;
    _outputQueue = dispatch_queue_create("opendesk.audio.pattern.output", DISPATCH_QUEUE_SERIAL);
    _callbackGroup = dispatch_group_create();
  }
  return self;
}

- (int32_t)stateSnapshot {
  @synchronized (self) { return _state; }
}

- (BOOL)isStopping {
  @synchronized (self) { return _stopping; }
}

- (BOOL)hasCaptureEnded {
  @synchronized (self) { return _captureEnded; }
}

- (void)completeTerminalStopWithError:(NSError *)error notifyIfReady:(BOOL)notifyIfReady {
  BOOL notify = NO;
  @synchronized (self) {
    if (_captureEnded) return;
    BOOL wasReady = _state == OPENDESK_PATTERN_READY;
    _captureEnded = YES;
    if (error != nil) {
      _state = OPENDESK_PATTERN_FAILED;
      notify = notifyIfReady && wasReady && !_stopping;
    } else {
      _state = OPENDESK_PATTERN_STOPPED;
    }
  }
  if (notify) opendesk_audio_pattern_capture_error(_identifier, OPENDESK_PATTERN_FAILED);
}

- (void)markStopRequestFailed {
  // stopCapture's completion error does not prove that ScreenCaptureKit has
  // stopped delivering callbacks. Keep the stream registered and permit a
  // later Stop call to retry; didStopWithError remains the terminal signal.
  @synchronized (self) {
    if (!_captureEnded) _stopIssued = NO;
  }
}

- (BOOL)admitOutputCallback {
  // Admission and dispatch-group enter must share the lifecycle lock. If
  // terminal teardown wins, no callback may enter after Wait observes an empty
  // group and releases this Objective-C object.
  @synchronized (self) {
    if (_stopping || _captureEnded) return NO;
    dispatch_group_enter(_callbackGroup);
    return YES;
  }
}

- (void)releaseCaptureResources {
  @synchronized (self) {
    _stream = nil;
  }
}

- (void)emitDiscontinuity {
  if (![self admitOutputCallback]) return;
  @autoreleasepool {
    opendesk_audio_pattern_capture_pcm(_identifier, NULL, 0, 1, 0);
  }
  dispatch_group_leave(_callbackGroup);
}

- (BOOL)recordAudioTiming:(CMSampleBufferRef)sampleBuffer sampleCount:(size_t)sampleCount {
  CMTime presentation = CMSampleBufferGetPresentationTimeStamp(sampleBuffer);
  CMTime duration = CMSampleBufferGetDuration(sampleBuffer);
  BOOL discontinuity = NO;
  if (_hasLastAudioEnd && CMTIME_IS_VALID(presentation) && CMTIME_IS_VALID(_lastAudioEnd)) {
    CMTime delta = CMTimeSubtract(presentation, _lastAudioEnd);
    CMTime tolerance = CMTimeMake(2, 1000); // tolerate normal scheduler jitter only.
    if (CMTimeCompare(delta, tolerance) > 0 || CMTimeCompare(delta, CMTimeMake(-2, 1000)) < 0) discontinuity = YES;
  }
  if (CMTIME_IS_VALID(presentation)) {
    CMTime effectiveDuration = CMTIME_IS_VALID(duration) && duration.value > 0
      ? duration : CMTimeMake((int64_t)sampleCount, 48000);
    _lastAudioEnd = CMTimeAdd(presentation, effectiveDuration);
    _hasLastAudioEnd = CMTIME_IS_VALID(_lastAudioEnd);
  } else {
    _hasLastAudioEnd = NO;
    discontinuity = YES;
  }
  return discontinuity;
}

- (void)failBeforeReady {
  @synchronized (self) {
    if (_captureEnded) return;
    _state = _stopping ? OPENDESK_PATTERN_STOPPED : OPENDESK_PATTERN_FAILED;
    _captureEnded = YES;
  }
}

- (void)failAfterReady {
  BOOL notify = NO;
  @synchronized (self) {
    if (_captureEnded || _state != OPENDESK_PATTERN_READY || _stopping) return;
    _state = OPENDESK_PATTERN_FAILED;
    notify = YES;
  }
  if (notify) {
    opendesk_audio_pattern_capture_error(_identifier, OPENDESK_PATTERN_FAILED);
    [self requestStop];
  }
}

- (void)issueStopCaptureForStream:(id)stream {
  SEL stopCapture = sel_registerName("stopCaptureWithCompletionHandler:");
  if (stream == nil || ![stream respondsToSelector:stopCapture]) {
    NSError *bridgeError = [NSError errorWithDomain:@"OpenDeskPatternCapture" code:1 userInfo:nil];
    [self completeTerminalStopWithError:bridgeError notifyIfReady:NO];
    return;
  }
  typedef void (*OpenDeskStopCapture)(id, SEL, void (^)(NSError *));
  ((OpenDeskStopCapture)objc_msgSend)(stream, stopCapture, ^(NSError *error) {
    if (error != nil) {
      [self markStopRequestFailed];
      return;
    }
    [self completeTerminalStopWithError:nil notifyIfReady:NO];
  });
}

- (void)startInvocationReturned {
  id stream = nil;
  BOOL shouldIssueStop = NO;
  @synchronized (self) {
    _startCallInProgress = NO;
    if (!_captureEnded && _stopping && _startIssued && !_stopIssued && _stream != nil) {
      _stopIssued = YES;
      stream = _stream;
      shouldIssueStop = YES;
    }
  }
  if (shouldIssueStop) [self issueStopCaptureForStream:stream];
}

- (void)begin {
  if ([self isStopping] || [self hasCaptureEnded]) {
    [self completeTerminalStopWithError:nil notifyIfReady:NO];
    return;
  }
  Class contentClass = NSClassFromString(@"SCShareableContent");
  SEL getContent = sel_registerName("getShareableContentWithCompletionHandler:");
  if (contentClass == nil || ![contentClass respondsToSelector:getContent]) {
    [self failBeforeReady];
    return;
  }
  typedef void (*OpenDeskGetShareableContent)(id, SEL, void (^)(id, NSError *));
  OpenDeskGetShareableContent get = (OpenDeskGetShareableContent)objc_msgSend;
  __weak OpenDeskPatternStream *weakSelf = self;
  get(contentClass, getContent, ^(id content, NSError *error) {
    OpenDeskPatternStream *session = weakSelf;
    if (session == nil) return;
    if (error != nil || content == nil) {
      [session failBeforeReady];
      return;
    }
    SEL displaysSelector = sel_registerName("displays");
    if (![content respondsToSelector:displaysSelector]) {
      [session failBeforeReady];
      return;
    }
    typedef id (*OpenDeskObjectGetter)(id, SEL);
    NSArray *displays = ((OpenDeskObjectGetter)objc_msgSend)(content, displaysSelector);
    id display = displays.firstObject;
    if (display == nil || [session isStopping] || [session hasCaptureEnded]) {
      if ([session isStopping] || [session hasCaptureEnded]) [session completeTerminalStopWithError:nil notifyIfReady:NO];
      else [session failBeforeReady];
      return;
    }

    Class filterClass = NSClassFromString(@"SCContentFilter");
    Class configClass = NSClassFromString(@"SCStreamConfiguration");
    Class streamClass = NSClassFromString(@"SCStream");
    if (filterClass == nil || configClass == nil || streamClass == nil) {
      [session failBeforeReady];
      return;
    }
    typedef id (*OpenDeskAlloc)(id, SEL);
    typedef id (*OpenDeskInitFilter)(id, SEL, id, id);
    typedef void (*OpenDeskSetBool)(id, SEL, BOOL);
    typedef void (*OpenDeskSetInteger)(id, SEL, NSInteger);
    typedef id (*OpenDeskInitStream)(id, SEL, id, id, id);
    typedef BOOL (*OpenDeskAddOutput)(id, SEL, id, NSInteger, dispatch_queue_t, NSError **);
    id filter = ((OpenDeskInitFilter)objc_msgSend)(((OpenDeskAlloc)objc_msgSend)(filterClass, sel_registerName("alloc")), sel_registerName("initWithDisplay:excludingWindows:"), display, @[]);
    id configuration = ((OpenDeskAlloc)objc_msgSend)(configClass, sel_registerName("new"));
    ((OpenDeskSetBool)objc_msgSend)(configuration, sel_registerName("setCapturesAudio:"), YES);
    ((OpenDeskSetInteger)objc_msgSend)(configuration, sel_registerName("setSampleRate:"), 48000);
    ((OpenDeskSetInteger)objc_msgSend)(configuration, sel_registerName("setChannelCount:"), 1);
    ((OpenDeskSetBool)objc_msgSend)(configuration, sel_registerName("setExcludesCurrentProcessAudio:"), YES);
    ((OpenDeskSetInteger)objc_msgSend)(configuration, sel_registerName("setQueueDepth:"), 3);
    id stream = ((OpenDeskInitStream)objc_msgSend)(((OpenDeskAlloc)objc_msgSend)(streamClass, sel_registerName("alloc")), sel_registerName("initWithFilter:configuration:delegate:"), filter, configuration, session);
    if (filter == nil || configuration == nil || stream == nil) {
      [session failBeforeReady];
      return;
    }

    BOOL stoppedBeforeStart = NO;
    @synchronized (session) {
      stoppedBeforeStart = session.stopping || session.captureEnded;
      if (!stoppedBeforeStart) session.stream = stream;
    }
    if (stoppedBeforeStart) {
      [session completeTerminalStopWithError:nil notifyIfReady:NO];
      return;
    }

    BOOL mayAddOutput = NO;
    @synchronized (session) {
      mayAddOutput = !session.stopping && !session.captureEnded;
    }
    if (!mayAddOutput) {
      [session completeTerminalStopWithError:nil notifyIfReady:NO];
      return;
    }
    NSError *outputError = nil;
    BOOL added = ((OpenDeskAddOutput)objc_msgSend)(stream, sel_registerName("addStreamOutput:type:sampleHandlerQueue:error:"), session, OPENDESK_SC_STREAM_OUTPUT_AUDIO, session.outputQueue, &outputError);
    if (!added) {
      [session failBeforeReady];
      return;
    }

    BOOL shouldStart = NO;
    @synchronized (session) {
      if (!session.stopping && !session.captureEnded) {
        session.startIssued = YES;
        session.startCallInProgress = YES;
        shouldStart = YES;
      }
    }
    if (!shouldStart) {
      [session completeTerminalStopWithError:nil notifyIfReady:NO];
      return;
    }
    typedef void (*OpenDeskStartCapture)(id, SEL, void (^)(NSError *));
    ((OpenDeskStartCapture)objc_msgSend)(stream, sel_registerName("startCaptureWithCompletionHandler:"), ^(NSError *startError) {
      if (startError != nil) {
        [session failBeforeReady];
        return;
      }
      @synchronized (session) {
        if (!session.stopping && !session.captureEnded) session.state = OPENDESK_PATTERN_READY;
      }
      if ([session isStopping]) [session requestStop];
    });
    [session startInvocationReturned];
  });
}

- (void)requestStop {
  id stream = nil;
  BOOL shouldIssue = NO;
  BOOL shouldCompleteWithoutStart = NO;
  @synchronized (self) {
    if (_captureEnded) return;
    _stopping = YES;
    stream = _stream;
    if (stream == nil || !_startIssued) {
      shouldCompleteWithoutStart = YES;
    } else if (!_startCallInProgress && !_stopIssued) {
      _stopIssued = YES;
      shouldIssue = YES;
    }
  }
  if (shouldCompleteWithoutStart) {
    [self completeTerminalStopWithError:nil notifyIfReady:NO];
    return;
  }
  if (shouldIssue) [self issueStopCaptureForStream:stream];
}

// ScreenCaptureKit discovers protocol methods dynamically, so the bridge can
// remain weak-linked and retain macOS 12 launch compatibility.
- (void)stream:(id)stream didStopWithError:(NSError *)error {
  [self completeTerminalStopWithError:error notifyIfReady:YES];
}

- (void)stream:(id)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(NSInteger)type {
  if (type != OPENDESK_SC_STREAM_OUTPUT_AUDIO || ![self admitOutputCallback]) return;
  @autoreleasepool {
    if (!CMSampleBufferDataIsReady(sampleBuffer)) {
      _hasLastAudioEnd = NO;
      opendesk_audio_pattern_capture_pcm(_identifier, NULL, 0, 1, 0);
      dispatch_group_leave(_callbackGroup);
      return;
    }
    AudioBufferList buffers = {0};
    CMBlockBufferRef block = NULL;
    OSStatus listStatus = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
      sampleBuffer, NULL, &buffers, sizeof(buffers), kCFAllocatorDefault, kCFAllocatorDefault,
      kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment, &block);
    CMAudioFormatDescriptionRef description = CMSampleBufferGetFormatDescription(sampleBuffer);
    const AudioStreamBasicDescription *format = description == NULL ? NULL : CMAudioFormatDescriptionGetStreamBasicDescription(description);
    BOOL valid = listStatus == noErr && buffers.mNumberBuffers == 1 && buffers.mBuffers[0].mData != NULL &&
      format != NULL && format->mFormatID == kAudioFormatLinearPCM && format->mSampleRate == 48000 &&
      format->mChannelsPerFrame == 1 && format->mBitsPerChannel == 32 && format->mBytesPerFrame == sizeof(float) &&
      (format->mFormatFlags & kAudioFormatFlagIsFloat) != 0 && buffers.mBuffers[0].mDataByteSize % sizeof(float) == 0;
    size_t count = valid ? buffers.mBuffers[0].mDataByteSize / sizeof(float) : 0;
    if (!valid || count == 0 || count > OPENDESK_PATTERN_MAX_SAMPLES) {
      if (block != NULL) CFRelease(block);
      _hasLastAudioEnd = NO;
      opendesk_audio_pattern_capture_pcm(_identifier, NULL, 0, 1, 0);
      [self failAfterReady];
      dispatch_group_leave(_callbackGroup);
      return;
    }
    BOOL discontinuity = [self recordAudioTiming:sampleBuffer sampleCount:count];
    opendesk_audio_pattern_capture_pcm(_identifier, (float *)buffers.mBuffers[0].mData, count, discontinuity ? 1 : 0, 0);
    if (block != NULL) CFRelease(block);
  }
  dispatch_group_leave(_callbackGroup);
}

@end

static NSMutableDictionary<NSNumber *, OpenDeskPatternStream *> *openDeskPatternStreams;
static dispatch_queue_t openDeskPatternLock;

static void OpenDeskPatternInit(void) {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    openDeskPatternStreams = [NSMutableDictionary dictionary];
    openDeskPatternLock = dispatch_queue_create("opendesk.audio.pattern.sessions", DISPATCH_QUEUE_SERIAL);
  });
}

static OpenDeskPatternStream *OpenDeskPatternLookup(uint64_t identifier) {
  OpenDeskPatternInit();
  __block OpenDeskPatternStream *session = nil;
  dispatch_sync(openDeskPatternLock, ^{ session = openDeskPatternStreams[@(identifier)]; });
  return session;
}

int32_t opendesk_audio_pattern_capture_probe(int32_t *platform_available, int32_t *permission_granted) {
  @autoreleasepool {
    if (platform_available != NULL) *platform_available = 0;
    if (permission_granted != NULL) *permission_granted = 0;
    if (OpenDeskScreenCaptureKitAvailable()) {
      if (platform_available != NULL) *platform_available = 1;
      if (permission_granted != NULL && CGPreflightScreenCaptureAccess()) *permission_granted = 1;
    }
    return OPENDESK_PATTERN_OK;
  }
}

int32_t opendesk_audio_pattern_capture_create(uint64_t identifier) {
  @autoreleasepool {
    int32_t available = 0, permission = 0;
    opendesk_audio_pattern_capture_probe(&available, &permission);
    if (!available) return OPENDESK_PATTERN_UNSUPPORTED;
    if (!permission) return OPENDESK_PATTERN_PERMISSION;
    OpenDeskPatternInit();
    __block BOOL inserted = NO;
    dispatch_sync(openDeskPatternLock, ^{
      if (openDeskPatternStreams[@(identifier)] == nil) {
        OpenDeskPatternStream *session = [OpenDeskPatternStream new];
        session.identifier = identifier;
        openDeskPatternStreams[@(identifier)] = session;
        inserted = YES;
      }
    });
    return inserted ? OPENDESK_PATTERN_OK : OPENDESK_PATTERN_FAILED;
  }
}

int32_t opendesk_audio_pattern_capture_begin(uint64_t identifier) {
  @autoreleasepool {
    OpenDeskPatternStream *session = OpenDeskPatternLookup(identifier);
    if (session == nil || !OpenDeskScreenCaptureKitAvailable()) return OPENDESK_PATTERN_UNSUPPORTED;
    [session begin];
    return OPENDESK_PATTERN_OK;
  }
}

int32_t opendesk_audio_pattern_capture_state(uint64_t identifier) {
  @autoreleasepool {
    OpenDeskPatternStream *session = OpenDeskPatternLookup(identifier);
    return session == nil ? OPENDESK_PATTERN_FAILED : [session stateSnapshot];
  }
}

int32_t opendesk_audio_pattern_capture_stop(uint64_t identifier) {
  @autoreleasepool {
    OpenDeskPatternStream *session = OpenDeskPatternLookup(identifier);
    if (session == nil) return OPENDESK_PATTERN_OK;
    [session requestStop];
    return OPENDESK_PATTERN_OK;
  }
}

int32_t opendesk_audio_pattern_capture_wait(uint64_t identifier, int32_t timeout_ms) {
  @autoreleasepool {
    OpenDeskPatternStream *session = OpenDeskPatternLookup(identifier);
    if (session == nil) return OPENDESK_PATTERN_FAILED;
    if (![session hasCaptureEnded]) return OPENDESK_PATTERN_PENDING;
    int64_t milliseconds = timeout_ms < 0 ? 0 : timeout_ms;
    dispatch_time_t deadline = dispatch_time(DISPATCH_TIME_NOW, milliseconds * NSEC_PER_MSEC);
    if (dispatch_group_wait(session.callbackGroup, deadline) != 0) return OPENDESK_PATTERN_PENDING;
    return [session stateSnapshot];
  }
}

void opendesk_audio_pattern_capture_release(uint64_t identifier) {
  @autoreleasepool {
    OpenDeskPatternInit();
    __block OpenDeskPatternStream *session = nil;
    dispatch_sync(openDeskPatternLock, ^{
      session = openDeskPatternStreams[@(identifier)];
      [openDeskPatternStreams removeObjectForKey:@(identifier)];
    });
    [session releaseCaptureResources];
  }
}
*/
import "C"
