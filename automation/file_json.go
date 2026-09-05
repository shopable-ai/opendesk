package automation

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"sync"
	"sync/atomic"
	"unicode/utf8"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

const (
	fileJSONDefaultMaxBytes = 8 * 1024 * 1024
	fileJSONMaxBytes        = fileJSONDefaultMaxBytes
	fileJSONMaxInFlight     = 8
)

// FileJSONErrorCode is the stable machine-readable failure class attached to
// every rejected File JSON Promise.
type FileJSONErrorCode string

const (
	FileJSONInvalidArgument          FileJSONErrorCode = "INVALID_ARGUMENT"
	FileJSONNotFound                 FileJSONErrorCode = "FILE_NOT_FOUND"
	FileJSONPermissionDenied         FileJSONErrorCode = "PERMISSION_DENIED"
	FileJSONUnsupportedFileType      FileJSONErrorCode = "UNSUPPORTED_FILE_TYPE"
	FileJSONInvalidEncoding          FileJSONErrorCode = "INVALID_ENCODING"
	FileJSONTooLarge                 FileJSONErrorCode = "FILE_TOO_LARGE"
	FileJSONDepthExceeded            FileJSONErrorCode = "JSON_DEPTH_EXCEEDED"
	FileJSONParseFailed              FileJSONErrorCode = "JSON_PARSE_FAILED"
	FileJSONSerializationFailed      FileJSONErrorCode = "JSON_SERIALIZATION_FAILED"
	FileJSONCanceled                 FileJSONErrorCode = "CANCELED"
	FileJSONIOFailed                 FileJSONErrorCode = "IO_FAILED"
	FileJSONAtomicReplaceUnsupported FileJSONErrorCode = "ATOMIC_REPLACE_UNSUPPORTED"
)

// FileJSONError deliberately keeps the host error out of Error(). Native
// filesystem errors frequently include user paths; callers get a stable code,
// operation and safe summary rather than an accidental copy of arbitrary input
// or JSON content.
type FileJSONError struct {
	Code      FileJSONErrorCode
	Operation string
	Message   string
	Committed bool
	Cause     error
}

func (e *FileJSONError) Error() string {
	if e == nil {
		return "File JSON operation failed"
	}
	message := e.Message
	if message == "" {
		message = "File JSON operation failed"
	}
	return fmt.Sprintf("%s: %s", e.Code, message)
}

func (e *FileJSONError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

func fileJSONOperationError(code FileJSONErrorCode, operation, message string, cause error) *FileJSONError {
	return &FileJSONError{Code: code, Operation: operation, Message: message, Cause: cause}
}

type fileJSONPending struct {
	operation    string
	resolve      func(interface{}) error
	reject       func(interface{}) error
	cancel       context.CancelFunc
	cleanupAbort func()
	defaultValue goja.Value
	hasDefault   bool
	commit       *fileJSONCommitState
}

type fileJSONReadSpec struct {
	context  context.Context
	path     string
	maxBytes int
}

type fileJSONWriteSpec struct {
	context    context.Context
	path       string
	payload    []byte
	createDirs bool
	commit     *fileJSONCommitState
}

type fileJSONReadOperation func(context.Context, string, int) (fileJSONReadResult, error)
type fileJSONWriteOperation func(context.Context, string, []byte, bool, *fileJSONCommitState, *atomic.Int64) (fileJSONWriteResult, error)

// fileJSONCommitState serializes cancellation with the replacement point. A
// cancellation that takes this lock first prevents a later worker commit; a
// commit that takes it first is reported as committed. This prevents teardown
// from rejecting "not written" while a worker can still replace the target.
type fileJSONCommitState struct {
	mu              sync.Mutex
	cancelRequested bool
	committed       bool
}

func (s *fileJSONCommitState) cancel() bool {
	if s == nil {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cancelRequested = true
	return s.committed
}

func (s *fileJSONCommitState) replace(ctx context.Context, replace func() error) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancelRequested {
		return false, fileJSONOperationError(FileJSONCanceled, "File.writeJSON", "operation was canceled", nil)
	}
	if ctx != nil && ctx.Err() != nil {
		return false, fileJSONContextError(ctx, "File.writeJSON", false)
	}
	if err := replace(); err != nil {
		return false, err
	}
	s.committed = true
	return true, nil
}

// FileJSONRuntime is the execution-owned native owner for File.readJSON and
// File.writeJSON. JavaScript values, Promise callbacks, JSON parse/stringify,
// and AbortSignal listeners stay on the EventLoop owner. Workers receive only
// immutable Go payloads and perform bounded regular-file I/O.
type FileJSONRuntime struct {
	runtime *goja.Runtime
	loop    *eventloop.EventLoop
	context context.Context
	fs      *FileSystem

	jsonObject      *goja.Object
	jsonParseFn     goja.Callable
	jsonStringifyFn goja.Callable
	onAsyncError    func(error)
	readFile        fileJSONReadOperation
	writeFile       fileJSONWriteOperation

	closing atomic.Bool
	workers atomic.Int64
	temps   atomic.Int64
	wg      sync.WaitGroup
	queueMu sync.Mutex

	nextID  uint64 // EventLoop owner only.
	pending map[uint64]fileJSONPending
}

// registerFileJSON augments the already-created File object. It is purposefully
// not put in jsMethodAllowlist: these methods own workers and Promises, so they
// need an explicit Runtime owner rather than reflected synchronous methods.
func registerFileJSON(runtimeValue *goja.Runtime, fileObject *goja.Object, fs *FileSystem, opts InitJSOptions) (*FileJSONRuntime, error) {
	if runtimeValue == nil || fileObject == nil || fs == nil {
		return nil, fmt.Errorf("File JSON registration requires Runtime, File object, and filesystem")
	}
	jsonObject := runtimeValue.Get("JSON").ToObject(runtimeValue)
	if jsonObject == nil {
		return nil, fmt.Errorf("File JSON registration requires JSON")
	}
	parse, ok := goja.AssertFunction(jsonObject.Get("parse"))
	if !ok {
		return nil, fmt.Errorf("File JSON registration requires JSON.parse")
	}
	stringify, ok := goja.AssertFunction(jsonObject.Get("stringify"))
	if !ok {
		return nil, fmt.Errorf("File JSON registration requires JSON.stringify")
	}
	ctx := opts.Context
	if ctx == nil {
		ctx = context.Background()
	}
	owner := &FileJSONRuntime{
		runtime:         runtimeValue,
		loop:            opts.EventLoop,
		context:         ctx,
		fs:              fs,
		jsonObject:      jsonObject,
		jsonParseFn:     parse,
		jsonStringifyFn: stringify,
		onAsyncError:    opts.OnAsyncError,
		readFile:        fileJSONReadFile,
		writeFile:       fileJSONWriteFile,
		pending:         make(map[uint64]fileJSONPending),
	}
	if err := fileObject.Set("readJSON", func(call goja.FunctionCall) goja.Value { return owner.readJSON(call) }); err != nil {
		return nil, fmt.Errorf("register File.readJSON: %w", err)
	}
	if err := fileObject.Set("writeJSON", func(call goja.FunctionCall) goja.Value { return owner.writeJSON(call) }); err != nil {
		return nil, fmt.Errorf("register File.writeJSON: %w", err)
	}
	return owner, nil
}

func (f *FileJSONRuntime) readJSON(call goja.FunctionCall) (value goja.Value) {
	promise, resolve, reject := f.runtime.NewPromise()
	promiseValue := f.runtime.ToValue(promise)
	rejectWith := func(err error) goja.Value {
		_ = reject(fileJSONJSError(f.runtime, err))
		return promiseValue
	}
	// Accessors on an options object execute JavaScript while we are extracting
	// the arguments. A throwing accessor must still surface as this method's
	// rejected Promise rather than escape synchronously through the host call.
	defer func() {
		if recover() != nil {
			_ = reject(fileJSONJSError(f.runtime, fileJSONOperationError(FileJSONInvalidArgument, "File.readJSON", "could not read options", nil)))
			value = promiseValue
		}
	}()
	if err := f.available("File.readJSON"); err != nil {
		return rejectWith(err)
	}
	spec, pending, err := f.readSpec(call, resolve, reject)
	if err != nil {
		return rejectWith(err)
	}
	if err := f.startRead(spec, pending); err != nil {
		pending.cleanupAbort()
		pending.cancel()
		return rejectWith(err)
	}
	return promiseValue
}

func (f *FileJSONRuntime) writeJSON(call goja.FunctionCall) (value goja.Value) {
	promise, resolve, reject := f.runtime.NewPromise()
	promiseValue := f.runtime.ToValue(promise)
	rejectWith := func(err error) goja.Value {
		_ = reject(fileJSONJSError(f.runtime, err))
		return promiseValue
	}
	// JSON.stringify, option accessors, and signal accessors can execute
	// JavaScript. Keep their ordinary failures in the Promise channel as well.
	defer func() {
		if recover() != nil {
			_ = reject(fileJSONJSError(f.runtime, fileJSONOperationError(FileJSONInvalidArgument, "File.writeJSON", "could not read options or serialize value", nil)))
			value = promiseValue
		}
	}()
	if err := f.available("File.writeJSON"); err != nil {
		return rejectWith(err)
	}
	spec, pending, err := f.writeSpec(call, resolve, reject)
	if err != nil {
		return rejectWith(err)
	}
	if err := f.startWrite(spec, pending); err != nil {
		pending.cleanupAbort()
		pending.cancel()
		return rejectWith(err)
	}
	return promiseValue
}

func (f *FileJSONRuntime) available(operation string) error {
	if f == nil || f.loop == nil {
		return fileJSONOperationError(FileJSONIOFailed, operation, "asynchronous File JSON methods require an event-loop-owned Runtime", nil)
	}
	if f.closing.Load() {
		return fileJSONOperationError(FileJSONCanceled, operation, "File JSON Runtime is closing", nil)
	}
	if len(f.pending) >= fileJSONMaxInFlight {
		return fileJSONOperationError(FileJSONIOFailed, operation, fmt.Sprintf("File JSON Runtime permits at most %d in-flight operations", fileJSONMaxInFlight), nil)
	}
	return nil
}

func (f *FileJSONRuntime) readSpec(call goja.FunctionCall, resolve, reject func(interface{}) error) (fileJSONReadSpec, fileJSONPending, error) {
	const operation = "File.readJSON"
	path, err := f.filePath(call.Argument(0), operation)
	if err != nil {
		return fileJSONReadSpec{}, fileJSONPending{}, err
	}
	options, err := f.options(call.Argument(1), operation, map[string]bool{"defaultValue": true, "maxBytes": true, "signal": true})
	if err != nil {
		return fileJSONReadSpec{}, fileJSONPending{}, err
	}
	for index := 2; index < len(call.Arguments); index++ {
		if !goja.IsUndefined(call.Argument(index)) {
			return fileJSONReadSpec{}, fileJSONPending{}, fileJSONOperationError(FileJSONInvalidArgument, operation, "too many arguments", nil)
		}
	}
	maxBytes, err := f.maxBytes(options, operation)
	if err != nil {
		return fileJSONReadSpec{}, fileJSONPending{}, err
	}
	ctx, contextCancel := context.WithCancel(f.context)
	cancel := contextCancel
	cleanupAbort, err := f.bindAbortSignal(f.option(options, "signal"), cancel, operation)
	if err != nil {
		cancel()
		return fileJSONReadSpec{}, fileJSONPending{}, err
	}
	if ctx.Err() != nil {
		cleanupAbort()
		cancel()
		return fileJSONReadSpec{}, fileJSONPending{}, fileJSONOperationError(FileJSONCanceled, operation, "operation was canceled before it started", ctx.Err())
	}
	hasDefault := f.hasOption(options, "defaultValue")
	pending := fileJSONPending{operation: operation, resolve: resolve, reject: reject, cancel: cancel, cleanupAbort: cleanupAbort, hasDefault: hasDefault}
	if hasDefault {
		pending.defaultValue = f.option(options, "defaultValue")
	}
	return fileJSONReadSpec{context: ctx, path: path, maxBytes: maxBytes}, pending, nil
}

func (f *FileJSONRuntime) writeSpec(call goja.FunctionCall, resolve, reject func(interface{}) error) (fileJSONWriteSpec, fileJSONPending, error) {
	const operation = "File.writeJSON"
	path, err := f.filePath(call.Argument(0), operation)
	if err != nil {
		return fileJSONWriteSpec{}, fileJSONPending{}, err
	}
	options, err := f.options(call.Argument(2), operation, map[string]bool{"spaces": true, "createDirs": true, "maxBytes": true, "signal": true})
	if err != nil {
		return fileJSONWriteSpec{}, fileJSONPending{}, err
	}
	for index := 3; index < len(call.Arguments); index++ {
		if !goja.IsUndefined(call.Argument(index)) {
			return fileJSONWriteSpec{}, fileJSONPending{}, fileJSONOperationError(FileJSONInvalidArgument, operation, "too many arguments", nil)
		}
	}
	maxBytes, err := f.maxBytes(options, operation)
	if err != nil {
		return fileJSONWriteSpec{}, fileJSONPending{}, err
	}
	spaces, err := f.spaces(options, operation)
	if err != nil {
		return fileJSONWriteSpec{}, fileJSONPending{}, err
	}
	createDirs, err := f.createDirs(options, operation)
	if err != nil {
		return fileJSONWriteSpec{}, fileJSONPending{}, err
	}
	// JSON.stringify is intentionally invoked exactly once before native I/O.
	// This creates the JavaScript-standard snapshot and avoids a second walk of
	// getters or toJSON methods for validation.
	serialized, err := f.jsonStringify(call.Argument(1), spaces, operation)
	if err != nil {
		return fileJSONWriteSpec{}, fileJSONPending{}, err
	}
	payload := []byte(serialized + "\n")
	if len(payload) > maxBytes {
		return fileJSONWriteSpec{}, fileJSONPending{}, fileJSONOperationError(FileJSONTooLarge, operation, fmt.Sprintf("serialized JSON exceeds maxBytes (%d)", maxBytes), nil)
	}
	if err := fileJSONDepth(payload); err != nil {
		err.(*FileJSONError).Operation = operation
		return fileJSONWriteSpec{}, fileJSONPending{}, err
	}
	ctx, contextCancel := context.WithCancel(f.context)
	commit := &fileJSONCommitState{}
	cancel := func() {
		commit.cancel()
		contextCancel()
	}
	cleanupAbort, err := f.bindAbortSignal(f.option(options, "signal"), cancel, operation)
	if err != nil {
		cancel()
		return fileJSONWriteSpec{}, fileJSONPending{}, err
	}
	if ctx.Err() != nil {
		cleanupAbort()
		cancel()
		return fileJSONWriteSpec{}, fileJSONPending{}, fileJSONOperationError(FileJSONCanceled, operation, "operation was canceled before it started", ctx.Err())
	}
	pending := fileJSONPending{operation: operation, resolve: resolve, reject: reject, cancel: cancel, cleanupAbort: cleanupAbort, commit: commit}
	return fileJSONWriteSpec{context: ctx, path: path, payload: payload, createDirs: createDirs, commit: commit}, pending, nil
}

func (f *FileJSONRuntime) filePath(value goja.Value, operation string) (string, error) {
	path, ok := value.Export().(string)
	if !ok || path == "" || strings.ContainsRune(path, '\x00') {
		return "", fileJSONOperationError(FileJSONInvalidArgument, operation, "filePath must be a non-empty string without NUL", nil)
	}
	abs, err := f.fs.Path(path)
	if err != nil {
		return "", fileJSONOperationError(FileJSONInvalidArgument, operation, "filePath could not be resolved", err)
	}
	return abs, nil
}

func (f *FileJSONRuntime) options(value goja.Value, operation string, allowed map[string]bool) (*goja.Object, error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return nil, nil
	}
	object, ok := value.(*goja.Object)
	if !ok || object.ClassName() != "Object" {
		return nil, fileJSONOperationError(FileJSONInvalidArgument, operation, "options must be an object", nil)
	}
	for _, key := range object.GetOwnPropertyNames() {
		if !allowed[key] {
			return nil, fileJSONOperationError(FileJSONInvalidArgument, operation, "options contains unknown field "+key, nil)
		}
	}
	if len(object.Symbols()) != 0 {
		return nil, fileJSONOperationError(FileJSONInvalidArgument, operation, "options must not contain symbol fields", nil)
	}
	return object, nil
}

func (f *FileJSONRuntime) hasOption(options *goja.Object, name string) bool {
	if options == nil {
		return false
	}
	for _, candidate := range options.GetOwnPropertyNames() {
		if candidate == name {
			return true
		}
	}
	return false
}

func (f *FileJSONRuntime) option(options *goja.Object, name string) goja.Value {
	if options == nil || !f.hasOption(options, name) {
		return goja.Undefined()
	}
	return options.Get(name)
}

func (f *FileJSONRuntime) maxBytes(options *goja.Object, operation string) (int, error) {
	if !f.hasOption(options, "maxBytes") {
		return fileJSONDefaultMaxBytes, nil
	}
	value, ok := fileJSONInteger(f.option(options, "maxBytes"))
	if !ok || value < 1 || value > fileJSONMaxBytes {
		return 0, fileJSONOperationError(FileJSONInvalidArgument, operation, fmt.Sprintf("maxBytes must be an integer from 1 through %d", fileJSONMaxBytes), nil)
	}
	return value, nil
}

func (f *FileJSONRuntime) spaces(options *goja.Object, operation string) (int, error) {
	if !f.hasOption(options, "spaces") {
		return 2, nil
	}
	value, ok := fileJSONInteger(f.option(options, "spaces"))
	if !ok || value < 0 || value > 10 {
		return 0, fileJSONOperationError(FileJSONInvalidArgument, operation, "spaces must be an integer from 0 through 10", nil)
	}
	return value, nil
}

func (f *FileJSONRuntime) createDirs(options *goja.Object, operation string) (bool, error) {
	if !f.hasOption(options, "createDirs") {
		return true, nil
	}
	value := f.option(options, "createDirs")
	result, ok := value.Export().(bool)
	if !ok {
		return false, fileJSONOperationError(FileJSONInvalidArgument, operation, "createDirs must be a boolean", nil)
	}
	return result, nil
}

func fileJSONInteger(value goja.Value) (int, bool) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return 0, false
	}
	var number float64
	switch typed := value.Export().(type) {
	case int:
		number = float64(typed)
	case int64:
		number = float64(typed)
	case float64:
		number = typed
	default:
		return 0, false
	}
	if math.IsNaN(number) || math.IsInf(number, 0) || math.Trunc(number) != number || number < math.MinInt || number > math.MaxInt {
		return 0, false
	}
	return int(number), true
}

func (f *FileJSONRuntime) jsonStringify(value goja.Value, spaces int, operation string) (string, error) {
	result, err := f.jsonStringifyFn(f.jsonObject, value, goja.Null(), f.runtime.ToValue(spaces))
	if err != nil || result == nil || goja.IsUndefined(result) {
		return "", fileJSONOperationError(FileJSONSerializationFailed, operation, "value is not JSON-serializable", err)
	}
	text, ok := result.Export().(string)
	if !ok {
		return "", fileJSONOperationError(FileJSONSerializationFailed, operation, "value is not JSON-serializable", nil)
	}
	return text, nil
}

func (f *FileJSONRuntime) bindAbortSignal(value goja.Value, cancel context.CancelFunc, operation string) (func(), error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return func() {}, nil
	}
	signal, ok := value.(*goja.Object)
	if !ok {
		return nil, fileJSONOperationError(FileJSONInvalidArgument, operation, "signal must be an AbortSignal", nil)
	}
	if signal.Get("aborted").ToBoolean() {
		cancel()
		return func() {}, nil
	}
	listener := f.runtime.ToValue(func(goja.FunctionCall) goja.Value {
		cancel()
		return goja.Undefined()
	})
	if add, ok := goja.AssertFunction(signal.Get("addEventListener")); ok {
		if _, err := add(signal, f.runtime.ToValue("abort"), listener); err == nil {
			return func() {
				if remove, ok := goja.AssertFunction(signal.Get("removeEventListener")); ok {
					_, _ = remove(signal, f.runtime.ToValue("abort"), listener)
				}
			}, nil
		}
	}
	return nil, fileJSONOperationError(FileJSONInvalidArgument, operation, "signal must be an AbortSignal", nil)
}

func (f *FileJSONRuntime) startRead(spec fileJSONReadSpec, pending fileJSONPending) error {
	id, err := f.start(pending)
	if err != nil {
		return err
	}
	f.workers.Add(1)
	f.wg.Add(1)
	go func() {
		defer f.workers.Add(-1)
		defer f.wg.Done()
		result, workerErr := f.readFile(spec.context, spec.path, spec.maxBytes)
		f.queue(func() { f.finishRead(id, result, workerErr) })
	}()
	return nil
}

func (f *FileJSONRuntime) startWrite(spec fileJSONWriteSpec, pending fileJSONPending) error {
	id, err := f.start(pending)
	if err != nil {
		return err
	}
	f.workers.Add(1)
	f.wg.Add(1)
	go func() {
		defer f.workers.Add(-1)
		defer f.wg.Done()
		result, workerErr := f.writeFile(spec.context, spec.path, spec.payload, spec.createDirs, spec.commit, &f.temps)
		f.queue(func() { f.finishWrite(id, result, workerErr) })
	}()
	return nil
}

func (f *FileJSONRuntime) start(pending fileJSONPending) (uint64, error) {
	if f.closing.Load() {
		return 0, fileJSONOperationError(FileJSONCanceled, pending.operation, "File JSON Runtime is closing", nil)
	}
	if len(f.pending) >= fileJSONMaxInFlight {
		return 0, fileJSONOperationError(FileJSONIOFailed, pending.operation, fmt.Sprintf("File JSON Runtime permits at most %d in-flight operations", fileJSONMaxInFlight), nil)
	}
	f.nextID++
	f.pending[f.nextID] = pending
	return f.nextID, nil
}

func (f *FileJSONRuntime) queue(callback func()) bool {
	if callback == nil || f.loop == nil {
		return false
	}
	f.queueMu.Lock()
	defer f.queueMu.Unlock()
	if f.closing.Load() {
		return false
	}
	return f.loop.RunOnLoop(func(*goja.Runtime) {
		if !f.closing.Load() {
			callback()
		}
	})
}

func (f *FileJSONRuntime) finishRead(id uint64, result fileJSONReadResult, workerErr error) {
	pending, ok := f.takePending(id)
	if !ok {
		return
	}
	if workerErr != nil {
		f.reject(pending, workerErr)
		return
	}
	if result.missing {
		if pending.hasDefault {
			if err := pending.resolve(pending.defaultValue); err != nil {
				f.reportAsyncError(err)
			}
			return
		}
		f.reject(pending, fileJSONOperationError(FileJSONNotFound, pending.operation, "file does not exist", nil))
		return
	}
	payload := result.data
	if len(payload) >= 3 && payload[0] == 0xEF && payload[1] == 0xBB && payload[2] == 0xBF {
		payload = payload[3:]
	}
	if !utf8.Valid(payload) {
		f.reject(pending, fileJSONOperationError(FileJSONInvalidEncoding, pending.operation, "file is not valid UTF-8", nil))
		return
	}
	if err := fileJSONDepth(payload); err != nil {
		err.(*FileJSONError).Operation = pending.operation
		f.reject(pending, err)
		return
	}
	value, err := f.jsonParse(f.runtime.ToValue(string(payload)))
	if err != nil {
		f.reject(pending, fileJSONOperationError(FileJSONParseFailed, pending.operation, "file does not contain valid JSON", err))
		return
	}
	if err := pending.resolve(value); err != nil {
		f.reportAsyncError(err)
	}
}

func (f *FileJSONRuntime) finishWrite(id uint64, result fileJSONWriteResult, workerErr error) {
	pending, ok := f.takePending(id)
	if !ok {
		return
	}
	if workerErr != nil {
		var typed *FileJSONError
		if errors.As(workerErr, &typed) {
			typed.Operation = pending.operation
			typed.Committed = result.committed
		}
		f.reject(pending, workerErr)
		return
	}
	if err := pending.resolve(goja.Undefined()); err != nil {
		f.reportAsyncError(err)
	}
}

func (f *FileJSONRuntime) takePending(id uint64) (fileJSONPending, bool) {
	pending, ok := f.pending[id]
	if !ok {
		return fileJSONPending{}, false
	}
	delete(f.pending, id)
	pending.cleanupAbort()
	pending.cancel()
	return pending, true
}

func (f *FileJSONRuntime) reject(pending fileJSONPending, err error) {
	if rejectErr := pending.reject(fileJSONJSError(f.runtime, err)); rejectErr != nil {
		f.reportAsyncError(rejectErr)
	}
}

func (f *FileJSONRuntime) jsonParse(value goja.Value) (goja.Value, error) {
	return f.jsonParseFn(f.jsonObject, value)
}

// CancelPending runs on the EventLoop owner. It rejects uncommitted pending
// Promises and asks workers to stop; a worker that committed just before this
// boundary never claims rollback and its temporary resource is still cleaned.
func (f *FileJSONRuntime) CancelPending() {
	if f == nil || !f.closing.CompareAndSwap(false, true) {
		return
	}
	f.queueMu.Lock()
	f.queueMu.Unlock()
	for id, pending := range f.pending {
		delete(f.pending, id)
		pending.cleanupAbort()
		pending.cancel()
		canceled := fileJSONOperationError(FileJSONCanceled, pending.operation, "operation canceled during execution teardown", nil)
		if pending.commit != nil {
			canceled.Committed = pending.commit.cancel()
		}
		f.reject(pending, canceled)
	}
}

func (f *FileJSONRuntime) Wait() {
	if f != nil {
		f.wg.Wait()
	}
}

func (f *FileJSONRuntime) ResourceCounts() (workers int64, callbacks int, tempResources int64) {
	if f == nil {
		return 0, 0, 0
	}
	return f.workers.Load(), len(f.pending), f.temps.Load()
}

func (f *FileJSONRuntime) reportAsyncError(err error) {
	if err != nil && f.onAsyncError != nil {
		f.onAsyncError(err)
	}
}

func fileJSONJSError(runtimeValue *goja.Runtime, err error) *goja.Object {
	var typed *FileJSONError
	if !errors.As(err, &typed) {
		typed = fileJSONOperationError(FileJSONIOFailed, "File.readJSON", "file operation failed", err)
	}
	object := runtimeValue.NewGoError(typed)
	_ = object.Set("name", "FileJSONError")
	_ = object.Set("code", string(typed.Code))
	_ = object.Set("operation", typed.Operation)
	_ = object.Set("committed", typed.Committed)
	return object
}

// fileJSONDepth counts JSON containers outside JSON strings. It is performed
// on the bounded actual text (not an arbitrary Go representation), so braces
// inside escaped strings do not affect the documented depth limit.
func fileJSONDepth(payload []byte) error {
	depth := 0
	inString := false
	escaped := false
	for _, current := range payload {
		if inString {
			if escaped {
				escaped = false
				continue
			}
			if current == '\\' {
				escaped = true
			} else if current == '"' {
				inString = false
			}
			continue
		}
		switch current {
		case '"':
			inString = true
		case '{', '[':
			depth++
			if depth > 128 {
				return fileJSONOperationError(FileJSONDepthExceeded, "", "JSON container nesting exceeds 128", nil)
			}
		case '}', ']':
			if depth > 0 {
				depth--
			}
		}
	}
	return nil
}
