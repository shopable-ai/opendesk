package automation

// The SQLite Runtime API intentionally lives in automation rather than a
// polyfill. It owns a real database connection, its asynchronous worker, and
// its execution lifetime; JavaScript only receives the small Promise-based
// facade registered below.

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"math/big"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
	_ "modernc.org/sqlite"
)

const (
	sqliteDefaultTimeout  = 30 * time.Second
	sqliteMaxTimeout      = 10 * time.Minute
	sqliteDefaultMaxRows  = 10_000
	sqliteMaxRows         = 100_000
	sqliteDefaultMaxBytes = 8 * 1024 * 1024
	sqliteMaxBytes        = 64 * 1024 * 1024
	sqliteMaxQueue        = 32
	sqliteMaxBatch        = 256
	sqliteBusyTimeout     = 10 * time.Minute
	sqliteRollbackTimeout = 5 * time.Second
	sqliteSafeInteger     = int64(9_007_199_254_740_991)
)

// SQLiteErrorCode is the stable machine-readable class attached to every
// SQLite Promise rejection. It intentionally avoids exposing driver-specific
// error strings as a contract.
type SQLiteErrorCode string

const (
	SQLiteInvalidArgument             SQLiteErrorCode = "INVALID_ARGUMENT"
	SQLiteClosed                      SQLiteErrorCode = "CLOSED"
	SQLiteCanceled                    SQLiteErrorCode = "CANCELED"
	SQLiteTimeout                     SQLiteErrorCode = "TIMEOUT"
	SQLiteOpenFailed                  SQLiteErrorCode = "OPEN_FAILED"
	SQLiteSQLError                    SQLiteErrorCode = "SQL_ERROR"
	SQLiteReadOnly                    SQLiteErrorCode = "READ_ONLY"
	SQLiteResultLimit                 SQLiteErrorCode = "RESULT_LIMIT"
	SQLiteQueueFull                   SQLiteErrorCode = "QUEUE_FULL"
	SQLiteMultipleStatements          SQLiteErrorCode = "MULTIPLE_STATEMENTS"
	SQLiteTransactionControlForbidden SQLiteErrorCode = "TRANSACTION_CONTROL_FORBIDDEN"
	SQLiteConnectionControlForbidden  SQLiteErrorCode = "CONNECTION_CONTROL_FORBIDDEN"
	SQLiteProtectedPath               SQLiteErrorCode = "PROTECTED_PATH"
	SQLiteCloseFailed                 SQLiteErrorCode = "CLOSE_FAILED"
	SQLiteInternal                    SQLiteErrorCode = "INTERNAL"
)

const (
	sqliteWriteNotStarted    = "not_started"
	sqliteWriteRolledBack    = "rolled_back"
	sqliteWriteCommitted     = "committed"
	sqliteWriteUnknown       = "unknown"
	sqliteWriteNotApplicable = "not_applicable"
)

// SQLiteError is converted to a JavaScript SQLiteError object at the owner
// EventLoop. Committed is nil when SQLite's state cannot be determined (for
// example cancellation racing a single-statement commit).
type SQLiteError struct {
	Code       SQLiteErrorCode
	Operation  string
	Message    string
	WriteState string
	Committed  *bool
	Cause      error
}

func (e *SQLiteError) Error() string {
	if e == nil {
		return "SQLite operation failed"
	}
	message := e.Message
	if message == "" {
		message = "SQLite operation failed"
	}
	return fmt.Sprintf("%s: %s", e.Code, message)
}

func (e *SQLiteError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

func sqliteError(code SQLiteErrorCode, operation, message, writeState string, committed *bool, cause error) *SQLiteError {
	return &SQLiteError{
		Code:       code,
		Operation:  operation,
		Message:    message,
		WriteState: writeState,
		Committed:  committed,
		Cause:      cause,
	}
}

func sqliteBool(value bool) *bool { return &value }

// SQLiteRuntime is the execution-owned native owner for SQLite.open and its
// database handles. Every Goja access and Promise settlement occurs on loop;
// workers receive immutable Go values only.
type SQLiteRuntime struct {
	runtime      *goja.Runtime
	loop         *eventloop.EventLoop
	context      context.Context
	fs           *FileSystem
	onAsyncError func(error)
	// Capture the intrinsic before any script runs. A query result must not
	// consult a mutable global Uint8Array property from an asynchronous
	// settlement callback, where a throwing user-defined getter could otherwise
	// escape the EventLoop callback and crash the Runtime.
	uint8ArrayObject      *goja.Object
	uint8ArrayConstructor goja.Constructor
	// protectedPaths contains normalized and symlink-aware database paths that
	// are owned by another subsystem, notably Scheduler's private store.
	protectedPaths map[string]struct{}

	closing  atomic.Bool
	workers  atomic.Int64 // active native operations, not idle per-handle workers
	workerWG sync.WaitGroup
	queueMu  sync.Mutex

	nextID  uint64 // EventLoop owner only.
	handles map[uint64]*SQLiteDatabase
}

// SQLiteDatabase is deliberately not reflected into JavaScript. Explicit
// methods below enforce Promise-only behavior and prevent diagnostic methods
// from accidentally becoming public API.
type SQLiteDatabase struct {
	owner *SQLiteRuntime
	id    uint64
	path  string
	mode  string

	object *goja.Object // EventLoop owner only.

	jobs     chan *sqliteJob
	stop     chan struct{}
	stopOnce sync.Once
	// physicalCloseOnce lets the worker's normal close job and every early
	// return/teardown path converge on the same connection cleanup.
	physicalCloseOnce sync.Once
	physicalCloseErr  error

	// All fields below are EventLoop-owner state, except the job state itself.
	opened        bool
	closing       bool
	closed        bool
	nextOperation uint64
	pending       map[uint64]*sqlitePending
	closePromise  goja.Value
	// nextTempTableID is owned by this handle's one worker. Internal SELECT
	// materialization uses unique temp identifiers so it cannot collide with a
	// script's own temp schema objects.
	nextTempTableID uint64
}

type sqlitePending struct {
	operation        string
	resolve          func(interface{}) error
	reject           func(interface{}) error
	cancel           context.CancelFunc
	cleanupAbort     func()
	stopContextWatch func() bool
	job              *sqliteJob
}

type sqliteJobKind uint8

const (
	sqliteJobOpen sqliteJobKind = iota
	sqliteJobExec
	sqliteJobQuery
	sqliteJobBatch
	sqliteJobClose
)

const (
	sqliteJobQueued int32 = iota
	sqliteJobRunning
	sqliteJobAbandoned
	sqliteJobDone
)

type sqliteJob struct {
	id        uint64
	kind      sqliteJobKind
	operation string
	context   context.Context
	state     atomic.Int32

	open  sqliteOpenSpec
	exec  sqliteExecSpec
	query sqliteQuerySpec
	batch sqliteBatchSpec
}

type sqliteOpenSpec struct {
	context context.Context
	dsn     string
	path    string
	mode    string
}

type sqliteExecSpec struct {
	context context.Context
	sql     string
	args    []any
}

type sqliteQuerySpec struct {
	context           context.Context
	sql               string
	statementSQL      string
	args              []any
	maxRows           int
	maxBytes          int
	materializeSelect bool
	mayWrite          bool
}

type sqliteStatementSpec struct {
	sql  string
	args []any
}

type sqliteBatchSpec struct {
	context    context.Context
	statements []sqliteStatementSpec
}

type sqliteExecResult struct {
	changes int64
}

type sqliteQueryResult struct {
	columns []string
	rows    [][]any
}

type sqliteBatchResult struct {
	results []sqliteExecResult
}

type sqliteWorkerResult struct {
	exec          sqliteExecResult
	query         sqliteQueryResult
	batch         sqliteBatchResult
	err           *SQLiteError
	startedSQL    bool
	queryMayWrite bool
	// poisonConnection means a batch could not establish whether its native
	// transaction was completely rolled back or committed. The pinned worker
	// must not reuse that connection for later queued work.
	poisonConnection bool
	physicalCloseErr error
}

// registerSQLite injects the first-party global only for a transport that has
// explicitly opted into local filesystem database access. Remote callers must
// deliberately decide to expose it rather than inheriting it from shared
// Runtime initialization.
func registerSQLite(runtimeValue *goja.Runtime, fs *FileSystem, opts InitJSOptions) (*SQLiteRuntime, error) {
	if runtimeValue == nil || fs == nil {
		return nil, fmt.Errorf("SQLite registration requires Runtime and filesystem")
	}
	ctx := opts.Context
	if ctx == nil {
		ctx = context.Background()
	}
	protectedPaths, err := sqliteProtectedPathSet(fs, opts.SQLiteProtectedPaths)
	if err != nil {
		return nil, fmt.Errorf("configure SQLite protected paths: %w", err)
	}
	uint8ArrayObject := runtimeValue.Get("Uint8Array").ToObject(runtimeValue)
	uint8ArrayConstructor, ok := goja.AssertConstructor(uint8ArrayObject)
	if !ok {
		return nil, fmt.Errorf("SQLite registration requires Uint8Array intrinsic")
	}
	owner := &SQLiteRuntime{
		runtime:               runtimeValue,
		loop:                  opts.EventLoop,
		context:               ctx,
		fs:                    fs,
		onAsyncError:          opts.OnAsyncError,
		protectedPaths:        protectedPaths,
		uint8ArrayObject:      uint8ArrayObject,
		uint8ArrayConstructor: uint8ArrayConstructor,
		handles:               make(map[uint64]*SQLiteDatabase),
	}
	object := runtimeValue.NewObject()
	if err := object.Set("open", func(call goja.FunctionCall) goja.Value { return owner.open(call) }); err != nil {
		return nil, fmt.Errorf("register SQLite.open: %w", err)
	}
	if err := runtimeValue.Set("SQLite", object); err != nil {
		return nil, fmt.Errorf("register SQLite global: %w", err)
	}
	return owner, nil
}

func (s *SQLiteRuntime) open(call goja.FunctionCall) (value goja.Value) {
	promise, resolve, reject := s.runtime.NewPromise()
	promiseValue := s.runtime.ToValue(promise)
	rejectWith := func(err error) goja.Value {
		_ = reject(sqliteJSError(s.runtime, err))
		return promiseValue
	}
	defer func() {
		if recover() != nil {
			_ = reject(sqliteJSError(s.runtime, sqliteError(SQLiteInvalidArgument, "SQLite.open", "could not read open options", sqliteWriteNotApplicable, nil, nil)))
			value = promiseValue
		}
	}()
	if s == nil || s.loop == nil {
		return rejectWith(sqliteError(SQLiteInternal, "SQLite.open", "SQLite requires an event-loop-owned Runtime", sqliteWriteNotApplicable, nil, nil))
	}
	if s.closing.Load() {
		return rejectWith(sqliteError(SQLiteCanceled, "SQLite.open", "SQLite Runtime is closing", sqliteWriteNotApplicable, nil, nil))
	}
	if len(call.Arguments) == 0 || goja.IsUndefined(call.Argument(0)) {
		return rejectWith(sqliteError(SQLiteInvalidArgument, "SQLite.open", "options are required", sqliteWriteNotApplicable, nil, nil))
	}
	for index := 1; index < len(call.Arguments); index++ {
		if !goja.IsUndefined(call.Argument(index)) {
			return rejectWith(sqliteError(SQLiteInvalidArgument, "SQLite.open", "too many arguments", sqliteWriteNotApplicable, nil, nil))
		}
	}
	spec, pending, err := s.openSpec(call.Argument(0), resolve, reject)
	if err != nil {
		return rejectWith(err)
	}
	s.nextID++
	db := &SQLiteDatabase{
		owner:   s,
		id:      s.nextID,
		path:    spec.path,
		mode:    spec.mode,
		jobs:    make(chan *sqliteJob, sqliteMaxQueue+1), // one reserved close slot
		stop:    make(chan struct{}),
		pending: make(map[uint64]*sqlitePending),
	}
	object, err := s.databaseObject(db)
	if err != nil {
		pending.cleanupAbort()
		pending.cancel()
		return rejectWith(sqliteError(SQLiteInternal, "SQLite.open", "could not create database handle", sqliteWriteNotApplicable, nil, err))
	}
	db.object = object
	openJob := &sqliteJob{id: 0, kind: sqliteJobOpen, operation: "SQLite.open", context: spec.context, open: spec}
	openJob.state.Store(sqliteJobQueued)
	pending.job = openJob
	pending.stopContextWatch = context.AfterFunc(spec.context, func() {
		s.queue(func() { db.cancelQueued(0) })
	})
	db.pending[0] = pending
	s.handles[db.id] = db
	s.workerWG.Add(1)
	go db.run(openJob)
	return promiseValue
}

func (s *SQLiteRuntime) databaseObject(db *SQLiteDatabase) (*goja.Object, error) {
	object := s.runtime.NewObject()
	for name, method := range map[string]interface{}{
		"exec":  func(call goja.FunctionCall) goja.Value { return db.exec(call) },
		"query": func(call goja.FunctionCall) goja.Value { return db.query(call) },
		"batch": func(call goja.FunctionCall) goja.Value { return db.batch(call) },
		"close": func(call goja.FunctionCall) goja.Value { return db.close(call) },
	} {
		if err := object.Set(name, method); err != nil {
			return nil, err
		}
	}
	return object, nil
}

func (s *SQLiteRuntime) openSpec(value goja.Value, resolve, reject func(interface{}) error) (sqliteOpenSpec, *sqlitePending, error) {
	const operation = "SQLite.open"
	options, err := sqliteOptionsObject(s.runtime, value, operation, map[string]bool{"path": true, "mode": true, "timeoutMs": true, "signal": true})
	if err != nil {
		return sqliteOpenSpec{}, nil, err
	}
	pathValue := options.Get("path")
	path, ok := sqliteStrictString(pathValue)
	if !ok || path == "" {
		return sqliteOpenSpec{}, nil, sqliteError(SQLiteInvalidArgument, operation, "options.path must be a non-empty string", sqliteWriteNotApplicable, nil, nil)
	}
	mode := "rw"
	if raw := options.Get("mode"); raw != nil && !goja.IsUndefined(raw) && !goja.IsNull(raw) {
		var valid bool
		mode, valid = sqliteStrictString(raw)
		if !valid {
			return sqliteOpenSpec{}, nil, sqliteError(SQLiteInvalidArgument, operation, "options.mode must be rw, rwc, or ro", sqliteWriteNotApplicable, nil, nil)
		}
	}
	if mode != "rw" && mode != "rwc" && mode != "ro" {
		return sqliteOpenSpec{}, nil, sqliteError(SQLiteInvalidArgument, operation, "options.mode must be rw, rwc, or ro", sqliteWriteNotApplicable, nil, nil)
	}
	if path == ":memory:" && mode == "ro" {
		// An unnamed memory database has no pre-existing file to open. Silently
		// creating one here would violate the documented real-connection ro
		// guarantee, so make the impossible combination explicit.
		return sqliteOpenSpec{}, nil, sqliteError(SQLiteInvalidArgument, operation, "mode ro is not supported with :memory:", sqliteWriteNotApplicable, nil, nil)
	}
	resolved := path
	if path != ":memory:" {
		resolved, err = s.fs.Path(path)
		if err != nil {
			return sqliteOpenSpec{}, nil, sqliteError(SQLiteInvalidArgument, operation, "could not resolve options.path", sqliteWriteNotApplicable, nil, err)
		}
		resolved = filepath.Clean(resolved)
		if s.isProtectedPath(resolved) {
			return sqliteOpenSpec{}, nil, sqliteError(SQLiteProtectedPath, operation, "this database path is reserved for an internal Runtime owner", sqliteWriteNotApplicable, nil, nil)
		}
	}
	ctx, cancel, cleanupAbort, err := s.operationContext(options, operation)
	if err != nil {
		return sqliteOpenSpec{}, nil, err
	}
	if err := ctx.Err(); err != nil {
		cleanupAbort()
		cancel()
		return sqliteOpenSpec{}, nil, sqliteContextError(err, operation, sqliteWriteNotStarted)
	}
	return sqliteOpenSpec{context: ctx, dsn: sqliteDSN(resolved, mode), path: resolved, mode: mode}, &sqlitePending{
		operation:    operation,
		resolve:      resolve,
		reject:       reject,
		cancel:       cancel,
		cleanupAbort: cleanupAbort,
	}, nil
}

func sqliteDSN(path, mode string) string {
	return sqliteDSNForOS(path, mode, runtime.GOOS)
}

// sqliteDSNForOS keeps file-name semantics faithful to File.path on the host
// platform. In particular, a backslash is an ordinary POSIX filename byte and
// must not be silently reinterpreted as a Windows path separator. The separate
// helper also gives the native seam tests a way to pin Windows URI construction
// without pretending a macOS/Linux process can open a Windows path.
func sqliteDSNForOS(path, mode, goos string) string {
	if path == ":memory:" {
		return ":memory:"
	}
	query := url.Values{}
	query.Set("mode", mode)
	// modernc applies this driver pragma before normal statements. A long busy
	// timeout lets the operation context, rather than an arbitrary short SQLite
	// default, govern lock wait cancellation.
	query.Add("_pragma", fmt.Sprintf("busy_timeout(%d)", sqliteBusyTimeout.Milliseconds()))
	host := ""
	uriPath := path
	if goos == "windows" {
		// filepath.ToSlash alone is insufficient for a Windows drive path: with
		// `Path: "C:/..."`, net/url serializes the drive as a file URI authority
		// (`file://C:/...`) rather than the required local path
		// (`file:///C:/...`). Normalize drive and UNC forms only on Windows,
		// while still letting net/url escape spaces, Unicode, #, and ? safely.
		normalized := strings.ReplaceAll(path, "\\", "/")
		uriPath = normalized
		if len(normalized) >= 3 && isSQLiteDriveLetter(normalized[0]) && normalized[1] == ':' && normalized[2] == '/' {
			uriPath = "/" + normalized
		} else if strings.HasPrefix(normalized, "//") {
			unc := strings.TrimPrefix(normalized, "//")
			if slash := strings.IndexByte(unc, '/'); slash > 0 {
				host = unc[:slash]
				uriPath = unc[slash:]
			}
		}
	}
	uri := &url.URL{Scheme: "file", Host: host, Path: uriPath, RawQuery: query.Encode()}
	return uri.String()
}

func isSQLiteDriveLetter(value byte) bool {
	return value >= 'A' && value <= 'Z' || value >= 'a' && value <= 'z'
}

func sqliteProtectedPathSet(fs *FileSystem, configured []string) (map[string]struct{}, error) {
	paths := append([]string{}, sqliteDefaultProtectedPaths()...)
	paths = append(paths, configured...)
	result := make(map[string]struct{}, len(paths))
	for _, path := range paths {
		path = strings.TrimSpace(path)
		if path == "" || path == ":memory:" {
			continue
		}
		resolved, err := fs.Path(path)
		if err != nil {
			return nil, fmt.Errorf("resolve protected path %q: %w", path, err)
		}
		for _, key := range sqlitePathKeys(resolved) {
			result[key] = struct{}{}
		}
	}
	return result, nil
}

func sqliteDefaultProtectedPaths() []string {
	home, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(home) == "" {
		return nil
	}
	// Keep Scheduler's private storage off the public Runtime boundary without
	// importing pkg/scheduler here (that package already depends transitively on
	// execution/automation). Hosts may additionally provide a configured path.
	return []string{filepath.Join(home, ".opendesk", "opendesk", "scheduler.db")}
}

func (s *SQLiteRuntime) isProtectedPath(path string) bool {
	if s == nil || len(s.protectedPaths) == 0 {
		return false
	}
	for _, key := range sqlitePathKeys(path) {
		if _, exists := s.protectedPaths[key]; exists {
			return true
		}
	}
	return false
}

func sqlitePathKeys(path string) []string {
	path = filepath.Clean(path)
	keys := []string{sqlitePathKey(path)}
	// Resolve an existing parent as well as the final entry. The parent route
	// blocks a symlink alias to a protected database even when a new requested
	// leaf does not yet exist; resolving the final entry covers an existing
	// database symlink directly.
	if parent, err := filepath.EvalSymlinks(filepath.Dir(path)); err == nil {
		keys = append(keys, sqlitePathKey(filepath.Join(parent, filepath.Base(path))))
	}
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		keys = append(keys, sqlitePathKey(resolved))
	}
	return keys
}

func sqlitePathKey(path string) string {
	path = filepath.Clean(path)
	if runtime.GOOS == "windows" {
		return strings.ToLower(path)
	}
	return path
}

func (db *SQLiteDatabase) exec(call goja.FunctionCall) (value goja.Value) {
	return db.operation(call, sqliteJobExec)
}

func (db *SQLiteDatabase) query(call goja.FunctionCall) (value goja.Value) {
	return db.operation(call, sqliteJobQuery)
}

func (db *SQLiteDatabase) operation(call goja.FunctionCall, kind sqliteJobKind) (value goja.Value) {
	operation := "SQLiteDatabase.exec"
	if kind == sqliteJobQuery {
		operation = "SQLiteDatabase.query"
	}
	promise, resolve, reject := db.owner.runtime.NewPromise()
	promiseValue := db.owner.runtime.ToValue(promise)
	rejectWith := func(err error) goja.Value {
		_ = reject(sqliteJSError(db.owner.runtime, err))
		return promiseValue
	}
	defer func() {
		if recover() != nil {
			_ = reject(sqliteJSError(db.owner.runtime, sqliteError(SQLiteInvalidArgument, operation, "could not read operation arguments", sqliteWriteNotApplicable, nil, nil)))
			value = promiseValue
		}
	}()
	if err := db.available(operation); err != nil {
		return rejectWith(err)
	}
	spec, pending, err := db.operationSpec(call, kind, resolve, reject)
	if err != nil {
		return rejectWith(err)
	}
	job := &sqliteJob{kind: kind, operation: operation}
	if kind == sqliteJobExec {
		job.context = spec.exec.context
		job.exec = spec.exec
	} else {
		job.context = spec.query.context
		job.query = spec.query
	}
	job.state.Store(sqliteJobQueued)
	if err := db.enqueue(job, pending); err != nil {
		pending.cleanupAbort()
		pending.cancel()
		return rejectWith(err)
	}
	return promiseValue
}

type sqliteOperationSpec struct {
	exec  sqliteExecSpec
	query sqliteQuerySpec
}

func (db *SQLiteDatabase) operationSpec(call goja.FunctionCall, kind sqliteJobKind, resolve, reject func(interface{}) error) (sqliteOperationSpec, *sqlitePending, error) {
	operation := "SQLiteDatabase.exec"
	if kind == sqliteJobQuery {
		operation = "SQLiteDatabase.query"
	}
	if len(call.Arguments) == 0 {
		return sqliteOperationSpec{}, nil, sqliteError(SQLiteInvalidArgument, operation, "sql must be a non-empty string", sqliteWriteNotApplicable, nil, nil)
	}
	for index := 3; index < len(call.Arguments); index++ {
		if !goja.IsUndefined(call.Argument(index)) {
			return sqliteOperationSpec{}, nil, sqliteError(SQLiteInvalidArgument, operation, "too many arguments", sqliteWriteNotApplicable, nil, nil)
		}
	}
	sqlText, ok := sqliteStrictString(call.Argument(0))
	if !ok || strings.TrimSpace(sqlText) == "" {
		return sqliteOperationSpec{}, nil, sqliteError(SQLiteInvalidArgument, operation, "sql must be a non-empty string", sqliteWriteNotApplicable, nil, nil)
	}
	analysis, err := analyzeSQLiteSQL(sqlText, operation)
	if err != nil {
		return sqliteOperationSpec{}, nil, err
	}
	paramsValue := call.Argument(1)
	optionsValue := call.Argument(2)
	if (optionsValue == nil || goja.IsUndefined(optionsValue)) && sqliteLooksLikeOptions(db.owner.runtime, paramsValue, kind == sqliteJobQuery) && len(analysis.named) == 0 {
		optionsValue = paramsValue
		paramsValue = goja.Undefined()
	}
	args, err := sqliteBoundArgs(db.owner, paramsValue, analysis, operation)
	if err != nil {
		return sqliteOperationSpec{}, nil, err
	}
	allowed := map[string]bool{"timeoutMs": true, "signal": true}
	if kind == sqliteJobQuery {
		allowed["maxRows"] = true
		allowed["maxBytes"] = true
	}
	options, err := sqliteOptionsObject(db.owner.runtime, optionsValue, operation, allowed)
	if err != nil {
		return sqliteOperationSpec{}, nil, err
	}
	ctx, cancel, cleanupAbort, err := db.owner.operationContext(options, operation)
	if err != nil {
		return sqliteOperationSpec{}, nil, err
	}
	if ctxErr := ctx.Err(); ctxErr != nil {
		cleanupAbort()
		cancel()
		return sqliteOperationSpec{}, nil, sqliteContextError(ctxErr, operation, sqliteWriteNotStarted)
	}
	pending := &sqlitePending{
		operation:    operation,
		resolve:      resolve,
		reject:       reject,
		cancel:       cancel,
		cleanupAbort: cleanupAbort,
	}
	if kind == sqliteJobExec {
		return sqliteOperationSpec{exec: sqliteExecSpec{context: ctx, sql: sqlText, args: args}}, pending, nil
	}
	maxRows, err := sqliteLimitOption(options, "maxRows", sqliteDefaultMaxRows, sqliteMaxRows, operation)
	if err != nil {
		cleanupAbort()
		cancel()
		return sqliteOperationSpec{}, nil, err
	}
	maxBytes, err := sqliteLimitOption(options, "maxBytes", sqliteDefaultMaxBytes, sqliteMaxBytes, operation)
	if err != nil {
		cleanupAbort()
		cancel()
		return sqliteOperationSpec{}, nil, err
	}
	return sqliteOperationSpec{query: sqliteQuerySpec{
		context:           ctx,
		sql:               sqlText,
		statementSQL:      sqliteStatementWithoutTerminator(sqlText, analysis),
		args:              args,
		maxRows:           maxRows,
		maxBytes:          maxBytes,
		materializeSelect: analysis.materializeSelect,
		mayWrite:          !analysis.readOnlyResult,
	}}, pending, nil
}

func (db *SQLiteDatabase) batch(call goja.FunctionCall) (value goja.Value) {
	const operation = "SQLiteDatabase.batch"
	promise, resolve, reject := db.owner.runtime.NewPromise()
	promiseValue := db.owner.runtime.ToValue(promise)
	rejectWith := func(err error) goja.Value {
		_ = reject(sqliteJSError(db.owner.runtime, err))
		return promiseValue
	}
	defer func() {
		if recover() != nil {
			_ = reject(sqliteJSError(db.owner.runtime, sqliteError(SQLiteInvalidArgument, operation, "could not read batch arguments", sqliteWriteNotApplicable, nil, nil)))
			value = promiseValue
		}
	}()
	if err := db.available(operation); err != nil {
		return rejectWith(err)
	}
	for index := 2; index < len(call.Arguments); index++ {
		if !goja.IsUndefined(call.Argument(index)) {
			return rejectWith(sqliteError(SQLiteInvalidArgument, operation, "too many arguments", sqliteWriteNotApplicable, nil, nil))
		}
	}
	statements, err := db.batchStatements(call.Argument(0))
	if err != nil {
		return rejectWith(err)
	}
	options, err := sqliteOptionsObject(db.owner.runtime, call.Argument(1), operation, map[string]bool{"timeoutMs": true, "signal": true})
	if err != nil {
		return rejectWith(err)
	}
	ctx, cancel, cleanupAbort, err := db.owner.operationContext(options, operation)
	if err != nil {
		return rejectWith(err)
	}
	if ctxErr := ctx.Err(); ctxErr != nil {
		cleanupAbort()
		cancel()
		return rejectWith(sqliteContextError(ctxErr, operation, sqliteWriteNotStarted))
	}
	pending := &sqlitePending{operation: operation, resolve: resolve, reject: reject, cancel: cancel, cleanupAbort: cleanupAbort}
	job := &sqliteJob{kind: sqliteJobBatch, operation: operation, context: ctx, batch: sqliteBatchSpec{context: ctx, statements: statements}}
	job.state.Store(sqliteJobQueued)
	if err := db.enqueue(job, pending); err != nil {
		cleanupAbort()
		cancel()
		return rejectWith(err)
	}
	return promiseValue
}

func (db *SQLiteDatabase) batchStatements(value goja.Value) ([]sqliteStatementSpec, error) {
	const operation = "SQLiteDatabase.batch"
	array, ok := sqliteArray(value)
	if !ok || len(array) == 0 {
		return nil, sqliteError(SQLiteInvalidArgument, operation, "statements must be a non-empty array", sqliteWriteNotApplicable, nil, nil)
	}
	if len(array) > sqliteMaxBatch {
		return nil, sqliteError(SQLiteInvalidArgument, operation, fmt.Sprintf("statements may contain at most %d entries", sqliteMaxBatch), sqliteWriteNotApplicable, nil, nil)
	}
	result := make([]sqliteStatementSpec, 0, len(array))
	for index, value := range array {
		statement, err := sqliteOptionsObject(db.owner.runtime, value, operation, map[string]bool{"sql": true, "params": true})
		if err != nil {
			return nil, sqliteError(SQLiteInvalidArgument, operation, fmt.Sprintf("statements[%d] must be an object with sql and optional params", index), sqliteWriteNotApplicable, nil, err)
		}
		sqlText, ok := sqliteStrictString(statement.Get("sql"))
		if !ok || strings.TrimSpace(sqlText) == "" {
			return nil, sqliteError(SQLiteInvalidArgument, operation, fmt.Sprintf("statements[%d].sql must be a non-empty string", index), sqliteWriteNotApplicable, nil, nil)
		}
		analysis, err := analyzeSQLiteSQL(sqlText, operation)
		if err != nil {
			return nil, err
		}
		args, err := sqliteBoundArgs(db.owner, statement.Get("params"), analysis, operation)
		if err != nil {
			return nil, err
		}
		result = append(result, sqliteStatementSpec{sql: sqlText, args: args})
	}
	return result, nil
}

func (db *SQLiteDatabase) close(call goja.FunctionCall) (value goja.Value) {
	const operation = "SQLiteDatabase.close"
	promise, resolve, reject := db.owner.runtime.NewPromise()
	promiseValue := db.owner.runtime.ToValue(promise)
	rejectWith := func(err error) goja.Value {
		_ = reject(sqliteJSError(db.owner.runtime, err))
		return promiseValue
	}
	defer func() {
		if recover() != nil {
			_ = reject(sqliteJSError(db.owner.runtime, sqliteError(SQLiteInternal, operation, "could not close database", sqliteWriteUnknown, nil, nil)))
			value = promiseValue
		}
	}()
	for index := 0; index < len(call.Arguments); index++ {
		if !goja.IsUndefined(call.Argument(index)) {
			return rejectWith(sqliteError(SQLiteInvalidArgument, operation, "close accepts no arguments", sqliteWriteNotApplicable, nil, nil))
		}
	}
	if db.owner.closing.Load() {
		return rejectWith(sqliteError(SQLiteCanceled, operation, "SQLite Runtime is closing", sqliteWriteUnknown, nil, nil))
	}
	if db.closed {
		_ = resolve(goja.Undefined())
		return promiseValue
	}
	if db.closing {
		if db.closePromise != nil {
			return db.closePromise
		}
		return rejectWith(sqliteError(SQLiteClosed, operation, "database is closing", sqliteWriteUnknown, nil, nil))
	}
	if !db.opened {
		return rejectWith(sqliteError(SQLiteClosed, operation, "database is not open", sqliteWriteNotStarted, sqliteBool(false), nil))
	}
	db.closing = true // Fence new operations before adding the FIFO close sentinel.
	ctx, cancel := context.WithCancel(db.owner.context)
	pending := &sqlitePending{operation: operation, resolve: resolve, reject: reject, cancel: cancel, cleanupAbort: func() {}}
	job := &sqliteJob{kind: sqliteJobClose, operation: operation, context: ctx}
	job.state.Store(sqliteJobQueued)
	if err := db.enqueueClose(job, pending); err != nil {
		db.closing = false
		cancel()
		return rejectWith(err)
	}
	db.closePromise = promiseValue
	return promiseValue
}

func (db *SQLiteDatabase) available(operation string) error {
	if db == nil || db.owner == nil || db.owner.loop == nil {
		return sqliteError(SQLiteInternal, operation, "SQLite requires an event-loop-owned Runtime", sqliteWriteNotApplicable, nil, nil)
	}
	if db.owner.closing.Load() {
		return sqliteError(SQLiteCanceled, operation, "SQLite Runtime is closing", sqliteWriteUnknown, nil, nil)
	}
	if !db.opened || db.closed || db.closing {
		return sqliteError(SQLiteClosed, operation, "database is closed or closing", sqliteWriteNotApplicable, nil, nil)
	}
	return nil
}

func (db *SQLiteDatabase) enqueue(job *sqliteJob, pending *sqlitePending) error {
	if db.owner.closing.Load() || db.closed || db.closing || !db.opened {
		return sqliteError(SQLiteClosed, pending.operation, "database is closed or closing", sqliteWriteNotApplicable, nil, nil)
	}
	if len(db.jobs) >= sqliteMaxQueue {
		return sqliteError(SQLiteQueueFull, pending.operation, fmt.Sprintf("database queue permits at most %d waiting operations", sqliteMaxQueue), sqliteWriteNotApplicable, nil, nil)
	}
	db.nextOperation++
	job.id = db.nextOperation
	pending.job = job
	pending.stopContextWatch = context.AfterFunc(job.context, func() {
		db.owner.queue(func() { db.cancelQueued(job.id) })
	})
	db.pending[job.id] = pending
	select {
	case db.jobs <- job:
		return nil
	default:
		delete(db.pending, job.id)
		if pending.stopContextWatch != nil {
			pending.stopContextWatch()
		}
		return sqliteError(SQLiteQueueFull, pending.operation, fmt.Sprintf("database queue permits at most %d waiting operations", sqliteMaxQueue), sqliteWriteNotApplicable, nil, nil)
	}
}

func (db *SQLiteDatabase) enqueueClose(job *sqliteJob, pending *sqlitePending) error {
	// Operational jobs only fill sqliteMaxQueue slots. The channel has one
	// additional slot, so close can always be placed after accepted work without
	// blocking the EventLoop.
	db.nextOperation++
	job.id = db.nextOperation
	pending.job = job
	db.pending[job.id] = pending
	select {
	case db.jobs <- job:
		return nil
	default:
		delete(db.pending, job.id)
		return sqliteError(SQLiteInternal, pending.operation, "could not schedule database close", sqliteWriteUnknown, nil, nil)
	}
}

func (db *SQLiteDatabase) cancelQueued(id uint64) {
	pending, exists := db.pending[id]
	if !exists || pending.job == nil {
		return
	}
	if pending.job.state.CompareAndSwap(sqliteJobQueued, sqliteJobAbandoned) {
		delete(db.pending, id)
		db.cleanupPending(pending)
		err := sqliteContextError(pending.job.context.Err(), pending.operation, sqliteWriteNotStarted)
		db.reject(pending, err)
		return
	}
	if id != 0 || pending.job.state.Load() != sqliteJobRunning {
		return
	}
	// Opening can be blocked in database.Conn while a remote/locked filesystem
	// is slow. Once its context is canceled, settle the public Promise promptly
	// and fence the provisional handle. The worker retains ownership of any
	// partially-opened connection and will close it before it exits; finishOpen
	// observes the missing pending entry and performs the same final cleanup.
	delete(db.pending, id)
	db.cleanupPending(pending)
	db.closed = true
	db.closing = true
	delete(db.owner.handles, db.id)
	db.stopOnce.Do(func() { close(db.stop) })
	err := sqliteContextError(pending.job.context.Err(), pending.operation, sqliteWriteNotStarted)
	db.reject(pending, err)
}

func (db *SQLiteDatabase) cleanupPending(pending *sqlitePending) {
	if pending == nil {
		return
	}
	if pending.stopContextWatch != nil {
		pending.stopContextWatch()
	}
	if pending.cleanupAbort != nil {
		pending.cleanupAbort()
	}
	if pending.cancel != nil {
		pending.cancel()
	}
}

func (s *SQLiteRuntime) operationContext(options *goja.Object, operation string) (context.Context, context.CancelFunc, func(), error) {
	timeout, err := sqliteTimeoutOption(options, operation)
	if err != nil {
		return nil, nil, nil, err
	}
	ctx, cancel := context.WithTimeout(s.context, timeout)
	cleanupAbort, err := s.bindAbortSignal(options.Get("signal"), cancel, operation)
	if err != nil {
		cancel()
		return nil, nil, nil, err
	}
	return ctx, cancel, cleanupAbort, nil
}

func (s *SQLiteRuntime) bindAbortSignal(value goja.Value, cancel context.CancelFunc, operation string) (func(), error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return func() {}, nil
	}
	signal, ok := value.(*goja.Object)
	if !ok {
		return nil, sqliteError(SQLiteInvalidArgument, operation, "options.signal must be an AbortSignal", sqliteWriteNotApplicable, nil, nil)
	}
	if signal.Get("aborted").ToBoolean() {
		cancel()
		return func() {}, nil
	}
	listener := s.runtime.ToValue(func(goja.FunctionCall) goja.Value {
		cancel()
		return goja.Undefined()
	})
	add, addOK := goja.AssertFunction(signal.Get("addEventListener"))
	// Capture the remover before a script can replace the public property while
	// the SQLite job is queued. Teardown must never execute a late user getter
	// from an EventLoop settlement callback.
	remove, removeOK := goja.AssertFunction(signal.Get("removeEventListener"))
	if addOK && removeOK {
		if _, err := add(signal, s.runtime.ToValue("abort"), listener); err == nil {
			return func() {
				defer func() { _ = recover() }()
				_, _ = remove(signal, s.runtime.ToValue("abort"), listener)
			}, nil
		}
	}
	return nil, sqliteError(SQLiteInvalidArgument, operation, "options.signal must be an AbortSignal", sqliteWriteNotApplicable, nil, nil)
}

func sqliteTimeoutOption(options *goja.Object, operation string) (time.Duration, error) {
	value := options.Get("timeoutMs")
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return sqliteDefaultTimeout, nil
	}
	milliseconds, ok := sqliteStrictPositiveInt(value)
	if !ok || milliseconds > int(sqliteMaxTimeout/time.Millisecond) {
		return 0, sqliteError(SQLiteInvalidArgument, operation, fmt.Sprintf("options.timeoutMs must be an integer between 1 and %d", int(sqliteMaxTimeout/time.Millisecond)), sqliteWriteNotApplicable, nil, nil)
	}
	return time.Duration(milliseconds) * time.Millisecond, nil
}

func sqliteLimitOption(options *goja.Object, name string, fallback, maximum int, operation string) (int, error) {
	value := options.Get(name)
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return fallback, nil
	}
	limit, ok := sqliteStrictPositiveInt(value)
	if !ok || limit > maximum {
		return 0, sqliteError(SQLiteInvalidArgument, operation, fmt.Sprintf("options.%s must be an integer between 1 and %d", name, maximum), sqliteWriteNotApplicable, nil, nil)
	}
	return limit, nil
}

func sqliteStrictPositiveInt(value goja.Value) (int, bool) {
	exported := value.Export()
	var number float64
	switch typed := exported.(type) {
	case int:
		number = float64(typed)
	case int64:
		number = float64(typed)
	case int32:
		number = float64(typed)
	case float64:
		number = typed
	default:
		return 0, false
	}
	if math.IsNaN(number) || math.IsInf(number, 0) || math.Trunc(number) != number || number < 1 || number > float64(math.MaxInt) {
		return 0, false
	}
	return int(number), true
}

func sqliteOptionsObject(runtimeValue *goja.Runtime, value goja.Value, operation string, allowed map[string]bool) (*goja.Object, error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return runtimeValue.NewObject(), nil
	}
	object, ok := value.(*goja.Object)
	if !ok || object.ClassName() != "Object" {
		return nil, sqliteError(SQLiteInvalidArgument, operation, "options must be an object", sqliteWriteNotApplicable, nil, nil)
	}
	for _, key := range object.Keys() {
		if !allowed[key] {
			return nil, sqliteError(SQLiteInvalidArgument, operation, fmt.Sprintf("options.%s is not supported", key), sqliteWriteNotApplicable, nil, nil)
		}
	}
	return object, nil
}

func sqliteLooksLikeOptions(runtimeValue *goja.Runtime, value goja.Value, query bool) bool {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return false
	}
	object, ok := value.(*goja.Object)
	if !ok || object.ClassName() != "Object" {
		return false
	}
	keys := object.Keys()
	if len(keys) == 0 {
		return false
	}
	for _, key := range keys {
		if key == "timeoutMs" || key == "signal" {
			continue
		}
		if query && (key == "maxRows" || key == "maxBytes") {
			continue
		}
		return false
	}
	return true
}

func sqliteStrictString(value goja.Value) (string, bool) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return "", false
	}
	text, ok := value.Export().(string)
	return text, ok
}

func sqliteArray(value goja.Value) ([]goja.Value, bool) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return nil, false
	}
	object, ok := value.(*goja.Object)
	if !ok || object.ClassName() != "Array" {
		return nil, false
	}
	lengthValue := object.Get("length")
	length, ok := sqliteStrictPositiveOrZeroInt(lengthValue)
	if !ok {
		return nil, false
	}
	values := make([]goja.Value, length)
	for index := 0; index < length; index++ {
		values[index] = object.Get(strconv.Itoa(index))
	}
	return values, true
}

func sqliteStrictPositiveOrZeroInt(value goja.Value) (int, bool) {
	exported := value.Export()
	var number float64
	switch typed := exported.(type) {
	case int:
		number = float64(typed)
	case int64:
		number = float64(typed)
	case int32:
		number = float64(typed)
	case float64:
		number = typed
	default:
		return 0, false
	}
	if math.IsNaN(number) || math.IsInf(number, 0) || math.Trunc(number) != number || number < 0 || number > float64(math.MaxInt) {
		return 0, false
	}
	return int(number), true
}

type sqliteSQLAnalysis struct {
	positional        int
	named             []string
	firstKeyword      string
	terminalIndex     int
	materializeSelect bool
	readOnlyResult    bool
}

// analyzeSQLiteSQL is a deliberately small lexical scanner, not a splitter.
// It recognizes SQLite string/comment quoting before treating a semicolon as
// top-level, so semicolons in literals and comments remain valid. A semicolon
// followed by another token is rejected before any native I/O can begin.
func analyzeSQLiteSQL(sqlText, operation string) (sqliteSQLAnalysis, error) {
	analysis := sqliteSQLAnalysis{terminalIndex: -1}
	firstKeyword := ""
	inSingle := false
	inDouble := false
	inBacktick := false
	inBracket := false
	inLineComment := false
	inBlockComment := false
	afterTerminator := false
	createHead := make([]string, 0, 3)
	createTrigger := false
	triggerBody := false
	triggerCaseDepth := 0
	triggerEndPending := false
	parenDepth := 0
	withAwaitingBody := false
	withBodyDepth := 0
	withFinishedBody := false
	withOuterKeyword := ""

	for index := 0; index < len(sqlText); {
		current := sqlText[index]
		if inLineComment {
			if current == '\n' || current == '\r' {
				inLineComment = false
			}
			index++
			continue
		}
		if inBlockComment {
			if current == '*' && index+1 < len(sqlText) && sqlText[index+1] == '/' {
				inBlockComment = false
				index += 2
				continue
			}
			index++
			continue
		}
		if inSingle {
			if current == '\'' {
				if index+1 < len(sqlText) && sqlText[index+1] == '\'' {
					index += 2
					continue
				}
				inSingle = false
			}
			index++
			continue
		}
		if inDouble {
			if current == '"' {
				if index+1 < len(sqlText) && sqlText[index+1] == '"' {
					index += 2
					continue
				}
				inDouble = false
			}
			index++
			continue
		}
		if inBacktick {
			if current == '`' {
				inBacktick = false
			}
			index++
			continue
		}
		if inBracket {
			if current == ']' {
				inBracket = false
			}
			index++
			continue
		}
		// After a real top-level terminator, only whitespace and comments are
		// legal. Check this before recognizing quotes: otherwise a second token
		// beginning with a string literal could bypass the guard and let the
		// driver execute the first write before reporting trailing SQL.
		if afterTerminator {
			if unicode.IsSpace(rune(current)) {
				index++
				continue
			}
			if current == '-' && index+1 < len(sqlText) && sqlText[index+1] == '-' {
				inLineComment = true
				index += 2
				continue
			}
			if current == '/' && index+1 < len(sqlText) && sqlText[index+1] == '*' {
				inBlockComment = true
				index += 2
				continue
			}
			return sqliteSQLAnalysis{}, sqliteError(SQLiteMultipleStatements, operation, "only one top-level SQL statement is allowed", sqliteWriteNotApplicable, nil, nil)
		}
		// SQLite CREATE TRIGGER is one top-level statement whose BEGIN…END
		// program legitimately contains statement separators. Recognize the
		// outer END conservatively (including CASE…END in a trigger body) so we
		// neither split a valid trigger nor allow a second statement after it.
		if triggerEndPending {
			if unicode.IsSpace(rune(current)) {
				index++
				continue
			}
			if current == '-' && index+1 < len(sqlText) && sqlText[index+1] == '-' {
				inLineComment = true
				index += 2
				continue
			}
			if current == '/' && index+1 < len(sqlText) && sqlText[index+1] == '*' {
				inBlockComment = true
				index += 2
				continue
			}
			if current != ';' {
				return sqliteSQLAnalysis{}, sqliteError(SQLiteMultipleStatements, operation, "only one top-level SQL statement is allowed", sqliteWriteNotApplicable, nil, nil)
			}
			triggerEndPending = false
			triggerBody = false
			afterTerminator = true
			index++
			continue
		}

		switch current {
		case '-':
			if index+1 < len(sqlText) && sqlText[index+1] == '-' {
				inLineComment = true
				index += 2
				continue
			}
		case '/':
			if index+1 < len(sqlText) && sqlText[index+1] == '*' {
				inBlockComment = true
				index += 2
				continue
			}
		case '\'':
			inSingle = true
			index++
			continue
		case '"':
			inDouble = true
			index++
			continue
		case '`':
			inBacktick = true
			index++
			continue
		case '[':
			inBracket = true
			index++
			continue
		case '(':
			parenDepth++
			if firstKeyword == "WITH" && withOuterKeyword == "" && withAwaitingBody {
				withBodyDepth = parenDepth
				withAwaitingBody = false
			}
			index++
			continue
		case ')':
			if parenDepth > 0 {
				parenDepth--
			}
			if withBodyDepth > 0 && parenDepth < withBodyDepth {
				withBodyDepth = 0
				withFinishedBody = true
			}
			index++
			continue
		case ';':
			if createTrigger && triggerBody {
				// Semicolons within the trigger program separate its DML
				// statements, not top-level Runtime API statements.
				index++
				continue
			}
			analysis.terminalIndex = index
			afterTerminator = true
			index++
			continue
		}

		if unicode.IsSpace(rune(current)) {
			index++
			continue
		}
		if isSQLiteIdentifierStart(current) {
			start := index
			index++
			for index < len(sqlText) && isSQLiteIdentifierPart(sqlText[index]) {
				index++
			}
			keyword := strings.ToUpper(sqlText[start:index])
			if firstKeyword == "" {
				firstKeyword = keyword
			}
			if firstKeyword == "WITH" && parenDepth == 0 && withOuterKeyword == "" {
				if keyword == "AS" {
					withAwaitingBody = true
				} else if withFinishedBody {
					switch keyword {
					case "SELECT", "INSERT", "UPDATE", "DELETE", "VALUES":
						withOuterKeyword = keyword
					}
				}
			}
			if len(createHead) < cap(createHead) {
				createHead = append(createHead, keyword)
				if len(createHead) == 2 && createHead[0] == "CREATE" && createHead[1] == "TRIGGER" {
					createTrigger = true
				}
				if len(createHead) == 3 && createHead[0] == "CREATE" && (createHead[1] == "TEMP" || createHead[1] == "TEMPORARY") && createHead[2] == "TRIGGER" {
					createTrigger = true
				}
			}
			if createTrigger {
				switch {
				case !triggerBody && keyword == "BEGIN":
					triggerBody = true
				case triggerBody && keyword == "CASE":
					triggerCaseDepth++
				case triggerBody && keyword == "END":
					if triggerCaseDepth > 0 {
						triggerCaseDepth--
					} else {
						triggerEndPending = true
					}
				}
			}
			continue
		}
		if current == '?' {
			analysis.positional++
			index++
			if index < len(sqlText) && sqlText[index] >= '0' && sqlText[index] <= '9' {
				return sqliteSQLAnalysis{}, sqliteError(SQLiteInvalidArgument, operation, "numbered SQL parameters (?NNN) are not supported; use sequential ? parameters", sqliteWriteNotApplicable, nil, nil)
			}
			for index < len(sqlText) && sqlText[index] >= '0' && sqlText[index] <= '9' {
				index++
			}
			continue
		}
		if current == ':' || current == '@' || current == '$' {
			start := index + 1
			if start < len(sqlText) && isSQLiteIdentifierStart(sqlText[start]) {
				index = start + 1
				for index < len(sqlText) && isSQLiteIdentifierPart(sqlText[index]) {
					index++
				}
				analysis.named = append(analysis.named, sqlText[start:index])
				continue
			}
		}
		index++
	}
	if inSingle || inDouble || inBacktick || inBracket || inBlockComment {
		return sqliteSQLAnalysis{}, sqliteError(SQLiteInvalidArgument, operation, "SQL contains an unterminated literal or comment", sqliteWriteNotApplicable, nil, nil)
	}
	if firstKeyword == "" {
		return sqliteSQLAnalysis{}, sqliteError(SQLiteInvalidArgument, operation, "sql must contain a statement", sqliteWriteNotApplicable, nil, nil)
	}
	analysis.firstKeyword = firstKeyword
	// SELECT and VALUES are read-only result-producing statements that can be
	// safely embedded in the internal MATERIALIZED CTE. Doing so keeps their
	// expensive result production inside QueryContext's cancellation window
	// instead of allowing a later Rows.Next call to outlive timeoutMs.
	analysis.materializeSelect = firstKeyword == "SELECT" || firstKeyword == "VALUES" ||
		firstKeyword == "WITH" && (withOuterKeyword == "SELECT" || withOuterKeyword == "VALUES")
	analysis.readOnlyResult = analysis.materializeSelect || firstKeyword == "EXPLAIN"
	switch firstKeyword {
	case "BEGIN", "COMMIT", "END", "ROLLBACK", "SAVEPOINT", "RELEASE":
		return sqliteSQLAnalysis{}, sqliteError(SQLiteTransactionControlForbidden, operation, "transaction control statements are managed by SQLite.batch", sqliteWriteNotApplicable, nil, nil)
	case "ATTACH", "DETACH", "VACUUM":
		return sqliteSQLAnalysis{}, sqliteError(SQLiteConnectionControlForbidden, operation, "connection-changing SQL is not supported by this handle", sqliteWriteNotApplicable, nil, nil)
	}
	if analysis.positional != 0 && len(analysis.named) != 0 {
		return sqliteSQLAnalysis{}, sqliteError(SQLiteInvalidArgument, operation, "do not mix positional and named SQL parameters", sqliteWriteNotApplicable, nil, nil)
	}
	return analysis, nil
}

// sqliteStatementWithoutTerminator returns the one SQL statement accepted by
// analyzeSQLiteSQL without a trailing top-level semicolon/comments. It is used
// only for an internal SELECT wrapper; it never attempts to split SQL text.
func sqliteStatementWithoutTerminator(sqlText string, analysis sqliteSQLAnalysis) string {
	if analysis.terminalIndex >= 0 && analysis.terminalIndex <= len(sqlText) {
		return strings.TrimSpace(sqlText[:analysis.terminalIndex])
	}
	return strings.TrimSpace(sqlText)
}

func isSQLiteIdentifierStart(value byte) bool {
	return value == '_' || value >= 'A' && value <= 'Z' || value >= 'a' && value <= 'z' || value >= 0x80
}

func isSQLiteIdentifierPart(value byte) bool {
	return isSQLiteIdentifierStart(value) || value >= '0' && value <= '9'
}

func sqliteBoundArgs(owner *SQLiteRuntime, value goja.Value, analysis sqliteSQLAnalysis, operation string) ([]any, error) {
	if owner == nil || owner.runtime == nil || owner.uint8ArrayObject == nil {
		return nil, sqliteError(SQLiteInternal, operation, "SQLite parameter binding is unavailable", sqliteWriteNotApplicable, nil, nil)
	}
	if analysis.positional != 0 {
		values, ok := sqliteArray(value)
		if !ok {
			if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
				values = nil
			} else {
				return nil, sqliteError(SQLiteInvalidArgument, operation, "positional SQL parameters must be an array", sqliteWriteNotApplicable, nil, nil)
			}
		}
		if len(values) != analysis.positional {
			return nil, sqliteError(SQLiteInvalidArgument, operation, fmt.Sprintf("SQL expects %d positional parameters, received %d", analysis.positional, len(values)), sqliteWriteNotApplicable, nil, nil)
		}
		args := make([]any, len(values))
		for index, item := range values {
			converted, err := sqliteParameterValue(owner, item, operation)
			if err != nil {
				return nil, err
			}
			args[index] = converted
		}
		return args, nil
	}
	if len(analysis.named) != 0 {
		object, ok := value.(*goja.Object)
		if !ok || object.ClassName() != "Object" {
			return nil, sqliteError(SQLiteInvalidArgument, operation, "named SQL parameters must be an object", sqliteWriteNotApplicable, nil, nil)
		}
		required := make(map[string]struct{}, len(analysis.named))
		for _, name := range analysis.named {
			required[name] = struct{}{}
		}
		keys := object.Keys()
		if len(keys) != len(required) {
			return nil, sqliteError(SQLiteInvalidArgument, operation, "named SQL parameter names must match the statement exactly", sqliteWriteNotApplicable, nil, nil)
		}
		for _, key := range keys {
			if _, exists := required[key]; !exists || !sqliteDatabaseSQLName(key) {
				return nil, sqliteError(SQLiteInvalidArgument, operation, "named SQL parameter names must match the statement exactly", sqliteWriteNotApplicable, nil, nil)
			}
		}
		keys = keys[:0]
		for name := range required {
			keys = append(keys, name)
		}
		sort.Strings(keys)
		args := make([]any, 0, len(keys))
		for _, name := range keys {
			converted, err := sqliteParameterValue(owner, object.Get(name), operation)
			if err != nil {
				return nil, err
			}
			args = append(args, sql.Named(name, converted))
		}
		return args, nil
	}
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return nil, nil
	}
	values, isArray := sqliteArray(value)
	if isArray && len(values) == 0 {
		return nil, nil
	}
	if object, ok := value.(*goja.Object); ok && object.ClassName() != "Array" && len(object.Keys()) == 0 {
		return nil, nil
	}
	return nil, sqliteError(SQLiteInvalidArgument, operation, "SQL has no parameters", sqliteWriteNotApplicable, nil, nil)
}

func sqliteDatabaseSQLName(name string) bool {
	if name == "" || !utf8.ValidString(name) {
		return false
	}
	for index, char := range name {
		if index == 0 {
			// database/sql validates sql.Named identifiers with this same
			// letter-first rule before modernc receives them. Keep preflight
			// validation aligned so an unsupported leading underscore cannot
			// escape to the worker as a generic driver error.
			if !unicode.IsLetter(char) {
				return false
			}
			continue
		}
		if !unicode.IsLetter(char) && !unicode.IsDigit(char) && char != '_' {
			return false
		}
	}
	return true
}

func sqliteParameterValue(owner *SQLiteRuntime, value goja.Value, operation string) (any, error) {
	runtimeValue := owner.runtime
	if value == nil || goja.IsUndefined(value) {
		return nil, sqliteError(SQLiteInvalidArgument, operation, "SQL parameters may not be undefined", sqliteWriteNotApplicable, nil, nil)
	}
	if goja.IsNull(value) {
		return nil, nil
	}
	if object, ok := value.(*goja.Object); ok {
		if owner.uint8ArrayObject != nil && runtimeValue.InstanceOf(object, owner.uint8ArrayObject) {
			bytes, ok := object.Export().([]byte)
			if !ok {
				return nil, sqliteError(SQLiteInvalidArgument, operation, "Uint8Array parameter could not be copied", sqliteWriteNotApplicable, nil, nil)
			}
			return append([]byte(nil), bytes...), nil
		}
	}
	exported := value.Export()
	switch typed := exported.(type) {
	case string:
		return typed, nil
	case bool:
		return typed, nil
	case int64:
		if typed < -sqliteSafeInteger || typed > sqliteSafeInteger {
			return nil, sqliteError(SQLiteInvalidArgument, operation, "unsafe integer Number parameters are not accepted; use BigInt within SQLite INTEGER range", sqliteWriteNotApplicable, nil, nil)
		}
		return typed, nil
	case int:
		if int64(typed) < -sqliteSafeInteger || int64(typed) > sqliteSafeInteger {
			return nil, sqliteError(SQLiteInvalidArgument, operation, "unsafe integer Number parameters are not accepted; use BigInt within SQLite INTEGER range", sqliteWriteNotApplicable, nil, nil)
		}
		return int64(typed), nil
	case int32:
		return int64(typed), nil
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			return nil, sqliteError(SQLiteInvalidArgument, operation, "number parameters must be finite", sqliteWriteNotApplicable, nil, nil)
		}
		if math.Trunc(typed) == typed && (typed < float64(-sqliteSafeInteger) || typed > float64(sqliteSafeInteger)) {
			return nil, sqliteError(SQLiteInvalidArgument, operation, "unsafe integer Number parameters are not accepted; use BigInt within SQLite INTEGER range", sqliteWriteNotApplicable, nil, nil)
		}
		return typed, nil
	case *big.Int:
		if !typed.IsInt64() {
			return nil, sqliteError(SQLiteInvalidArgument, operation, "BigInt parameter is outside SQLite INTEGER range", sqliteWriteNotApplicable, nil, nil)
		}
		return typed.Int64(), nil
	default:
		return nil, sqliteError(SQLiteInvalidArgument, operation, "SQL parameters must be null, boolean, finite number, BigInt, string, or Uint8Array", sqliteWriteNotApplicable, nil, nil)
	}
}

// run owns the physical connection for exactly one JavaScript database handle.
// A pinned *sql.Conn is required for independent :memory: databases, FIFO
// serialization, and a real batch transaction on one physical connection.
func (db *SQLiteDatabase) run(openJob *sqliteJob) {
	defer db.owner.workerWG.Done()

	// Treat opening as a first-class queued job. This closes the cancellation
	// race where an AbortSignal could reject a provisional open while the
	// worker nevertheless went on to keep an idle pinned connection alive.
	if !openJob.state.CompareAndSwap(sqliteJobQueued, sqliteJobRunning) {
		// cancelQueued() already settled the Promise on the EventLoop. Schedule
		// the common owner-side cleanup to remove its provisional handle entry.
		_ = db.owner.queue(func() { db.finishOpen(openJob, sqliteWorkerResult{}) })
		return
	}
	database, connection, openResult := db.openConnection(openJob)
	// A close job normally closes the connection before resolving close(). This
	// defer is the unconditional backstop for cancellation while opening, a
	// canceled close job, and every worker early return.
	defer func() { _ = db.closePhysical(connection, database) }()
	openJob.state.Store(sqliteJobDone)
	if !db.owner.queue(func() { db.finishOpen(openJob, openResult) }) {
		_ = db.closePhysical(connection, database)
		return
	}
	if openResult.err != nil {
		return
	}

	for {
		select {
		case <-db.stop:
			db.closePhysical(connection, database)
			return
		default:
		}
		select {
		case <-db.stop:
			db.closePhysical(connection, database)
			return
		case job := <-db.jobs:
			if job == nil {
				continue
			}
			if !job.state.CompareAndSwap(sqliteJobQueued, sqliteJobRunning) {
				// A queued timeout/cancel was already settled on the EventLoop.
				continue
			}
			result := db.runJob(connection, database, job)
			job.state.Store(sqliteJobDone)
			if job.kind == sqliteJobClose {
				if !db.owner.queue(func() { db.finishClose(job.id, result) }) {
					db.closePhysical(connection, database)
				}
				return
			}
			if result.poisonConnection {
				// A transaction boundary is unresolved. Do not let a later FIFO job
				// accidentally run on this connection. Physically close it before the
				// EventLoop settles a previously accepted close() Promise, so that
				// Promise remains FIFO/idempotent and never reports release before the
				// pinned native connection has actually been fenced.
				result.physicalCloseErr = db.closePhysical(connection, database)
				_ = db.owner.queue(func() { db.finishJob(job.id, result) })
				return
			}
			_ = db.owner.queue(func() { db.finishJob(job.id, result) })
		}
	}
}

func (db *SQLiteDatabase) openConnection(job *sqliteJob) (*sql.DB, *sql.Conn, sqliteWorkerResult) {
	db.owner.beginWorker()
	defer db.owner.endWorker()
	if err := job.context.Err(); err != nil {
		return nil, nil, sqliteWorkerResult{err: sqliteContextError(err, job.operation, sqliteWriteNotStarted)}
	}
	database, err := sql.Open("sqlite", job.open.dsn)
	if err != nil {
		return nil, nil, sqliteWorkerResult{err: sqliteError(SQLiteOpenFailed, job.operation, "could not open database", sqliteWriteNotStarted, sqliteBool(false), err)}
	}
	database.SetMaxOpenConns(1)
	database.SetMaxIdleConns(1)
	connection, err := database.Conn(job.context)
	if err != nil {
		_ = database.Close()
		if contextErr := job.context.Err(); contextErr != nil {
			return nil, nil, sqliteWorkerResult{err: sqliteContextError(contextErr, job.operation, sqliteWriteNotStarted)}
		}
		return nil, nil, sqliteWorkerResult{err: sqliteError(SQLiteOpenFailed, job.operation, "could not open database", sqliteWriteNotStarted, sqliteBool(false), err)}
	}
	if err := job.context.Err(); err != nil {
		_ = connection.Close()
		_ = database.Close()
		return nil, nil, sqliteWorkerResult{err: sqliteContextError(err, job.operation, sqliteWriteNotStarted)}
	}
	return database, connection, sqliteWorkerResult{}
}

func (db *SQLiteDatabase) runJob(connection *sql.Conn, database *sql.DB, job *sqliteJob) sqliteWorkerResult {
	db.owner.beginWorker()
	defer db.owner.endWorker()
	if err := job.context.Err(); err != nil {
		return sqliteWorkerResult{err: sqliteContextError(err, job.operation, sqliteWriteNotStarted)}
	}
	switch job.kind {
	case sqliteJobExec:
		if err := sqliteApplyBusyTimeout(connection, job.context); err != nil {
			return sqliteWorkerResult{err: sqliteOperationFailure(job.context, job.operation, err, sqliteWriteNotStarted)}
		}
		result, err := sqliteExecConnection(connection, job.exec)
		if err != nil {
			return sqliteWorkerResult{err: sqliteOperationFailure(job.context, job.operation, err, sqliteWriteUnknown), startedSQL: true}
		}
		return sqliteWorkerResult{exec: result, startedSQL: true}
	case sqliteJobQuery:
		if err := sqliteApplyBusyTimeout(connection, job.context); err != nil {
			return sqliteWorkerResult{err: sqliteOperationFailure(job.context, job.operation, err, sqliteWriteNotStarted)}
		}
		result, err := sqliteQueryConnection(connection, job.query)
		if err != nil {
			writeState := sqliteWriteNotApplicable
			if job.query.mayWrite {
				// query() can intentionally execute DML RETURNING. Before all
				// rows are finalized, an error/limit/cancel cannot prove whether
				// that implicit statement commit occurred.
				writeState = sqliteWriteUnknown
			}
			return sqliteWorkerResult{err: sqliteOperationFailure(job.context, job.operation, err, writeState), startedSQL: true}
		}
		return sqliteWorkerResult{query: result, startedSQL: true, queryMayWrite: job.query.mayWrite}
	case sqliteJobBatch:
		if err := sqliteApplyBusyTimeout(connection, job.context); err != nil {
			return sqliteWorkerResult{err: sqliteOperationFailure(job.context, job.operation, err, sqliteWriteNotStarted)}
		}
		result, err, poison := sqliteBatchConnection(connection, job.batch, job.operation)
		if err != nil {
			return sqliteWorkerResult{err: err, startedSQL: true, poisonConnection: poison}
		}
		return sqliteWorkerResult{batch: result, startedSQL: true}
	case sqliteJobClose:
		err := db.closePhysical(connection, database)
		if err != nil {
			return sqliteWorkerResult{err: sqliteError(SQLiteCloseFailed, job.operation, "could not close database", sqliteWriteUnknown, nil, err)}
		}
		return sqliteWorkerResult{}
	default:
		return sqliteWorkerResult{err: sqliteError(SQLiteInternal, job.operation, "unknown SQLite worker operation", sqliteWriteUnknown, nil, nil)}
	}
}

func sqliteApplyBusyTimeout(connection *sql.Conn, ctx context.Context) error {
	if connection == nil {
		return nil
	}
	timeout := sqliteBusyTimeout
	if deadline, ok := ctx.Deadline(); ok {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return ctx.Err()
		}
		timeout = remaining + time.Millisecond
	}
	milliseconds := timeout.Milliseconds()
	if milliseconds < 1 {
		milliseconds = 1
	}
	if milliseconds > sqliteBusyTimeout.Milliseconds() {
		milliseconds = sqliteBusyTimeout.Milliseconds()
	}
	_, err := connection.ExecContext(ctx, fmt.Sprintf("PRAGMA busy_timeout = %d", milliseconds))
	return err
}

func (db *SQLiteDatabase) closePhysical(connection *sql.Conn, database *sql.DB) error {
	if db == nil {
		return nil
	}
	db.physicalCloseOnce.Do(func() {
		var joined error
		if connection != nil {
			joined = errors.Join(joined, connection.Close())
		}
		if database != nil {
			joined = errors.Join(joined, database.Close())
		}
		db.physicalCloseErr = joined
	})
	return db.physicalCloseErr
}

func sqliteExecConnection(connection *sql.Conn, spec sqliteExecSpec) (sqliteExecResult, error) {
	result, err := connection.ExecContext(spec.context, spec.sql, spec.args...)
	if err != nil {
		return sqliteExecResult{}, err
	}
	changes, err := result.RowsAffected()
	if err != nil {
		return sqliteExecResult{}, err
	}
	return sqliteExecResult{changes: changes}, nil
}

func sqliteQueryConnection(connection *sql.Conn, spec sqliteQuerySpec) (sqliteQueryResult, error) {
	if spec.materializeSelect {
		return sqliteMaterializedQueryConnection(connection, spec)
	}
	return sqliteDirectQueryConnection(connection, spec)
}

// sqliteDirectQueryConnection is retained for result-producing statements
// that cannot be safely embedded in a SELECT, notably DML RETURNING, PRAGMA,
// and EXPLAIN. Read-only SELECT/WITH…SELECT/VALUES calls take the materialized
// route below so modernc's context-aware Exec path covers expensive result
// production before any Rows.Next iteration is exposed to the worker.
func sqliteDirectQueryConnection(connection *sql.Conn, spec sqliteQuerySpec) (sqliteQueryResult, error) {
	return sqliteReadQueryRows(connection, spec, spec.sql, nil)
}

// sqliteReadQueryRows is the one place that turns database/sql rows into
// public row objects. expectedColumns preserves a pure SELECT's original
// labels when its internal cancellation wrapper introduces CTE aliases.
func sqliteReadQueryRows(connection *sql.Conn, spec sqliteQuerySpec, sqlText string, expectedColumns []string) (sqliteQueryResult, error) {
	rows, err := connection.QueryContext(spec.context, sqlText, spec.args...)
	if err != nil {
		return sqliteQueryResult{}, err
	}
	defer rows.Close()
	actualColumns, err := rows.Columns()
	if err != nil {
		return sqliteQueryResult{}, err
	}
	columns := actualColumns
	if expectedColumns != nil {
		if len(expectedColumns) != len(actualColumns) {
			return sqliteQueryResult{}, sqliteError(SQLiteInternal, "SQLiteDatabase.query", "internal query wrapper changed the result column count", sqliteWriteNotApplicable, nil, nil)
		}
		columns = expectedColumns
	}
	result := sqliteQueryResult{columns: append([]string(nil), columns...)}
	bytesRead := 0
	for _, name := range columns {
		bytesRead += len(name)
	}
	for rows.Next() {
		if err := spec.context.Err(); err != nil {
			return sqliteQueryResult{}, err
		}
		if len(result.rows) >= spec.maxRows {
			return sqliteQueryResult{}, sqliteError(SQLiteResultLimit, "SQLiteDatabase.query", fmt.Sprintf("query result exceeds maxRows (%d)", spec.maxRows), sqliteWriteNotApplicable, nil, nil)
		}
		values := make([]any, len(columns))
		targets := make([]any, len(columns))
		for index := range values {
			targets[index] = &values[index]
		}
		if err := rows.Scan(targets...); err != nil {
			return sqliteQueryResult{}, err
		}
		row := make([]any, len(columns))
		for index, raw := range values {
			normalized, size, err := sqliteResultValue(raw)
			if err != nil {
				return sqliteQueryResult{}, err
			}
			bytesRead += len(columns[index]) + size
			if bytesRead > spec.maxBytes {
				return sqliteQueryResult{}, sqliteError(SQLiteResultLimit, "SQLiteDatabase.query", fmt.Sprintf("query result exceeds maxBytes (%d)", spec.maxBytes), sqliteWriteNotApplicable, nil, nil)
			}
			row[index] = normalized
		}
		result.rows = append(result.rows, row)
	}
	if err := rows.Err(); err != nil {
		return sqliteQueryResult{}, err
	}
	if err := rows.Close(); err != nil {
		return sqliteQueryResult{}, err
	}
	return result, nil
}

// sqliteMaterializedQueryConnection forces a bounded read-only SELECT or
// VALUES result into an ephemeral MATERIALIZED CTE. Unlike a visible TEMP
// table, this leaves sqlite_temp_master, pragma_table_list, connection
// changes(), and result affinity untouched. The force CTE is the left side of
// a CROSS JOIN, so its count must exhaust the bounded source before SQLite
// returns the first row; that work occurs in QueryContext's first sqlite step
// while modernc's cancellation watcher is still installed.
func sqliteMaterializedQueryConnection(connection *sql.Conn, spec sqliteQuerySpec) (sqliteQueryResult, error) {
	if strings.TrimSpace(spec.statementSQL) == "" {
		return sqliteQueryResult{}, sqliteError(SQLiteInternal, "SQLiteDatabase.query", "could not materialize an empty SELECT statement", sqliteWriteNotApplicable, nil, nil)
	}
	columns, err := sqliteMaterializedQueryColumns(connection, spec)
	if err != nil {
		return sqliteQueryResult{}, err
	}
	if len(columns) == 0 {
		return sqliteQueryResult{}, sqliteError(SQLiteInternal, "SQLiteDatabase.query", "SQLite SELECT returned no columns", sqliteWriteNotApplicable, nil, nil)
	}

	suffix := sqliteMaterializedCTESuffix()
	sourceName := sqliteQuoteIdentifier("__opendesk_query_source_" + suffix)
	forceName := sqliteQuoteIdentifier("__opendesk_query_force_" + suffix)
	countName := sqliteQuoteIdentifier("__opendesk_query_count_" + suffix)
	innerName := sqliteQuoteIdentifier("__opendesk_query_inner_" + suffix)
	wrappedSQL := fmt.Sprintf(
		"WITH %s AS MATERIALIZED (\nSELECT * FROM (\n%s\n) AS %s LIMIT %d\n), %s AS (SELECT count(*) AS %s FROM %s)\nSELECT %s.* FROM %s CROSS JOIN %s WHERE %s.%s >= 0",
		sourceName,
		spec.statementSQL,
		innerName,
		spec.maxRows+1,
		forceName,
		countName,
		sourceName,
		sourceName,
		forceName,
		sourceName,
		forceName,
		countName,
	)
	return sqliteReadQueryRows(connection, spec, wrappedSQL, columns)
}

func sqliteMaterializedQueryColumns(connection *sql.Conn, spec sqliteQuerySpec) ([]string, error) {
	// QueryContext prepares this original read-only statement but does not call
	// Rows.Next, so it lets us capture exact SQLite column labels without
	// executing its potentially expensive result program. Wrapping metadata in
	// SELECT * FROM (...) is observably wrong for labels that differ only by
	// case: SQLite rewrites the later name (for example x -> x:1) before the
	// public row object can be constructed.
	rows, err := connection.QueryContext(spec.context, spec.statementSQL, spec.args...)
	if err != nil {
		return nil, err
	}
	columns, columnErr := rows.Columns()
	closeErr := rows.Close()
	if columnErr != nil {
		return nil, columnErr
	}
	if closeErr != nil {
		return nil, closeErr
	}
	return append([]string(nil), columns...), nil
}

var sqliteMaterializedCTESequence atomic.Uint64

func sqliteMaterializedCTESuffix() string {
	return fmt.Sprintf("%d_%d", time.Now().UnixNano(), sqliteMaterializedCTESequence.Add(1))
}

func sqliteQuoteIdentifier(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}

func sqliteResultValue(raw any) (any, int, error) {
	switch value := raw.(type) {
	case nil:
		return nil, 0, nil
	case int64:
		if value < -sqliteSafeInteger || value > sqliteSafeInteger {
			text := strconv.FormatInt(value, 10)
			return text, len(text), nil
		}
		return value, len(strconv.FormatInt(value, 10)), nil
	case int:
		return sqliteResultValue(int64(value))
	case int32:
		return sqliteResultValue(int64(value))
	case uint64:
		if value > uint64(sqliteSafeInteger) {
			text := strconv.FormatUint(value, 10)
			return text, len(text), nil
		}
		return int64(value), len(strconv.FormatUint(value, 10)), nil
	case float64:
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return nil, 0, sqliteError(SQLiteSQLError, "SQLiteDatabase.query", "SQLite returned a non-finite REAL value", sqliteWriteNotApplicable, nil, nil)
		}
		return value, len(strconv.FormatFloat(value, 'g', -1, 64)), nil
	case bool:
		return value, 1, nil
	case string:
		if !utf8.ValidString(value) {
			return nil, 0, sqliteError(SQLiteSQLError, "SQLiteDatabase.query", "SQLite returned invalid UTF-8 text", sqliteWriteNotApplicable, nil, nil)
		}
		return value, len(value), nil
	case []byte:
		copyValue := append([]byte(nil), value...)
		return copyValue, len(copyValue), nil
	case time.Time:
		text := value.Format(time.RFC3339Nano)
		return text, len(text), nil
	default:
		return nil, 0, sqliteError(SQLiteSQLError, "SQLiteDatabase.query", "SQLite returned an unsupported column value", sqliteWriteNotApplicable, nil, nil)
	}
}

func sqliteBatchConnection(connection *sql.Conn, spec sqliteBatchSpec, operation string) (sqliteBatchResult, *SQLiteError, bool) {
	if err := spec.context.Err(); err != nil {
		return sqliteBatchResult{}, sqliteContextError(err, operation, sqliteWriteNotStarted), false
	}
	// The owner deliberately controls the transaction boundary on this one
	// pinned connection instead of using sql.Tx. database/sql implements
	// Tx.Commit with context.Background(), which would let a COMMIT lock wait
	// outlive AbortSignal/timeout. Every BEGIN, statement, and COMMIT below is
	// therefore interruptible through the real operation context.
	if _, err := connection.ExecContext(spec.context, "BEGIN DEFERRED"); err != nil {
		return sqliteBatchResult{}, sqliteOperationFailure(spec.context, operation, err, sqliteWriteNotStarted), false
	}
	results := make([]sqliteExecResult, 0, len(spec.statements))
	rollback := func(original error, noTransactionMeansRolledBack bool) (*SQLiteError, bool) {
		// The operation context may be canceled already. Rollback uses a short,
		// independent cleanup deadline so a canceled batch can still establish a
		// confirmed rollback rather than relying on database/sql auto-cleanup.
		rollbackContext, cancel := context.WithTimeout(context.Background(), sqliteRollbackTimeout)
		defer cancel()
		_, rollbackErr := connection.ExecContext(rollbackContext, "ROLLBACK")
		if rollbackErr == nil || noTransactionMeansRolledBack && sqliteNoActiveTransaction(rollbackErr) {
			if original == nil {
				original = errors.New("batch rolled back")
			}
			return sqliteOperationFailure(spec.context, operation, original, sqliteWriteRolledBack), false
		}
		if original == nil {
			original = rollbackErr
		}
		return sqliteOperationFailure(spec.context, operation, original, sqliteWriteUnknown), true
	}
	for _, statement := range spec.statements {
		if err := spec.context.Err(); err != nil {
			failure, poison := rollback(err, true)
			return sqliteBatchResult{}, failure, poison
		}
		result, err := connection.ExecContext(spec.context, statement.sql, statement.args...)
		if err != nil {
			failure, poison := rollback(err, true)
			return sqliteBatchResult{}, failure, poison
		}
		changes, err := result.RowsAffected()
		if err != nil {
			failure, poison := rollback(err, true)
			return sqliteBatchResult{}, failure, poison
		}
		results = append(results, sqliteExecResult{changes: changes})
	}
	if err := spec.context.Err(); err != nil {
		failure, poison := rollback(err, true)
		return sqliteBatchResult{}, failure, poison
	}
	// Commit is the only point after which batch writes are confirmed durable.
	// If it races cancellation and reports an error, we retain unknown rather
	// than falsely claiming the batch was rolled back.
	if _, err := connection.ExecContext(spec.context, "COMMIT"); err != nil {
		// A canceled/failed COMMIT may or may not have crossed SQLite's durable
		// commit point. Try to settle the transaction; only a successful explicit
		// rollback lets us report rolled_back, otherwise quarantine the handle.
		failure, poison := rollback(err, false)
		return sqliteBatchResult{}, failure, poison
	}
	if err := spec.context.Err(); err != nil {
		// Commit did succeed, but a caller cancellation raced it. Do not resolve
		// normal success and make the cancellation look like it prevented the
		// write; surface the confirmed committed state instead.
		return sqliteBatchResult{}, sqliteContextError(err, operation, sqliteWriteCommitted), false
	}
	return sqliteBatchResult{results: results}, nil, false
}

func sqliteNoActiveTransaction(err error) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "no transaction is active") || strings.Contains(lower, "cannot rollback") && strings.Contains(lower, "transaction")
}

func sqliteOperationFailure(ctx context.Context, operation string, err error, writeState string) *SQLiteError {
	if typed := (*SQLiteError)(nil); errors.As(err, &typed) {
		if typed.Operation == "" {
			typed.Operation = operation
		}
		// A worker may have already classified a limit/conversion error as a
		// normal query (`not_applicable`). If this invocation was a possible
		// DML RETURNING statement, retain that stable code but do not falsely
		// claim there was no write outcome to report.
		if writeState != sqliteWriteNotApplicable && typed.WriteState == sqliteWriteNotApplicable {
			typed.WriteState = writeState
			typed.Committed = sqliteCommittedForState(writeState)
		}
		return typed
	}
	if ctx != nil && ctx.Err() != nil {
		return sqliteContextError(ctx.Err(), operation, writeState)
	}
	code := SQLiteSQLError
	lower := strings.ToLower(err.Error())
	if strings.Contains(lower, "readonly") || strings.Contains(lower, "read-only") {
		code = SQLiteReadOnly
	}
	return sqliteError(code, operation, "SQLite returned an error", writeState, sqliteCommittedForState(writeState), err)
}

func sqliteContextError(err error, operation, writeState string) *SQLiteError {
	code := SQLiteCanceled
	message := "SQLite operation was canceled"
	if errors.Is(err, context.DeadlineExceeded) {
		code = SQLiteTimeout
		message = "SQLite operation timed out"
	}
	return sqliteError(code, operation, message, writeState, sqliteCommittedForState(writeState), err)
}

func sqliteCommittedForState(writeState string) *bool {
	switch writeState {
	case sqliteWriteNotStarted, sqliteWriteRolledBack:
		return sqliteBool(false)
	case sqliteWriteCommitted:
		return sqliteBool(true)
	default:
		return nil
	}
}

func (db *SQLiteDatabase) finishOpen(job *sqliteJob, result sqliteWorkerResult) {
	pending, exists := db.pending[0]
	if !exists {
		// A timeout or AbortSignal can win after the physical connection was
		// acquired but before this EventLoop settlement ran. The Promise has
		// already been rejected by cancelQueued(), yet the pinned worker still
		// owns a connection. Fence it and remove the provisional handle so it
		// cannot remain alive until unrelated execution teardown.
		delete(db.owner.handles, db.id)
		db.closed = true
		db.closing = true
		db.stopOnce.Do(func() { close(db.stop) })
		return
	}
	var contextErr error
	if job != nil {
		contextErr = job.context.Err()
	}
	delete(db.pending, 0)
	db.cleanupPending(pending)
	if result.err == nil && contextErr != nil {
		// Re-check at the owner boundary. A cancellation can arrive in the
		// small window after database.Conn() succeeds and before the Promise is
		// resolved; accepting that handle would violate open cancellation.
		result.err = sqliteContextError(contextErr, pending.operation, sqliteWriteNotStarted)
	}
	if result.err != nil {
		delete(db.owner.handles, db.id)
		db.closed = true
		db.closing = true
		db.stopOnce.Do(func() { close(db.stop) })
		db.reject(pending, result.err)
		return
	}
	db.opened = true
	if err := pending.resolve(db.object); err != nil {
		db.owner.reportAsyncError(err)
	}
}

func (db *SQLiteDatabase) finishJob(id uint64, result sqliteWorkerResult) {
	var pending *sqlitePending
	var exists bool
	defer func() {
		if recovered := recover(); recovered != nil {
			if pending != nil {
				db.reject(pending, sqliteError(SQLiteInternal, pending.operation, "could not settle SQLite operation result", sqliteWriteUnknown, nil, fmt.Errorf("panic while settling result: %v", recovered)))
				return
			}
			db.owner.reportAsyncError(fmt.Errorf("panic while settling SQLite operation result: %v", recovered))
		}
	}()
	pending, exists = db.pending[id]
	if !exists {
		return
	}
	delete(db.pending, id)
	db.cleanupPending(pending)
	if result.poisonConnection {
		db.poisonAfterUncertainTransaction(id, result.physicalCloseErr)
	}
	if result.err != nil {
		db.reject(pending, result.err)
		return
	}
	var value goja.Value
	switch pending.operation {
	case "SQLiteDatabase.exec":
		value = db.owner.execValue(result.exec)
	case "SQLiteDatabase.query":
		var err error
		value, err = db.owner.queryValue(result.query)
		if err != nil {
			writeState := sqliteWriteNotApplicable
			if result.queryMayWrite {
				// sqliteQueryConnection reached rows.Err and rows.Close before
				// returning, so a DML RETURNING statement has finished and its
				// implicit statement commit is confirmed even if JavaScript value
				// construction subsequently fails on the EventLoop.
				writeState = sqliteWriteCommitted
			}
			db.reject(pending, sqliteError(SQLiteInternal, pending.operation, "could not construct query result", writeState, sqliteCommittedForState(writeState), err))
			return
		}
	case "SQLiteDatabase.batch":
		value = db.owner.batchValue(result.batch)
	default:
		db.reject(pending, sqliteError(SQLiteInternal, pending.operation, "unknown SQLite Promise result", sqliteWriteUnknown, nil, nil))
		return
	}
	if err := pending.resolve(value); err != nil {
		db.owner.reportAsyncError(err)
	}
}

func (db *SQLiteDatabase) poisonAfterUncertainTransaction(completedID uint64, physicalCloseErr error) {
	if db == nil {
		return
	}
	db.closed = true
	db.closing = true
	delete(db.owner.handles, db.id)
	db.stopOnce.Do(func() { close(db.stop) })
	for id, pending := range db.pending {
		if id == completedID {
			continue
		}
		delete(db.pending, id)
		if pending.job != nil {
			pending.job.state.CompareAndSwap(sqliteJobQueued, sqliteJobAbandoned)
		}
		db.cleanupPending(pending)
		if pending.operation == "SQLiteDatabase.close" {
			// close() was accepted in FIFO order before the uncertain batch. Its
			// only job is to release this handle; do not convert that idempotent
			// release request into a CLOSED rejection merely because an earlier
			// transaction could not determine its commit outcome.
			if physicalCloseErr != nil {
				db.reject(pending, sqliteError(SQLiteCloseFailed, pending.operation, "could not close database after an unresolved batch transaction", sqliteWriteUnknown, nil, physicalCloseErr))
			} else if err := pending.resolve(goja.Undefined()); err != nil {
				db.owner.reportAsyncError(err)
			}
			continue
		}
		db.reject(pending, sqliteError(SQLiteClosed, pending.operation, "database connection was closed after an unresolved batch transaction", sqliteWriteUnknown, nil, nil))
	}
}

func (db *SQLiteDatabase) finishClose(id uint64, result sqliteWorkerResult) {
	pending, exists := db.pending[id]
	if exists {
		delete(db.pending, id)
		db.cleanupPending(pending)
	}
	db.closed = true
	db.closing = true
	delete(db.owner.handles, db.id)
	if !exists {
		return
	}
	if result.err != nil {
		db.reject(pending, result.err)
		return
	}
	if err := pending.resolve(goja.Undefined()); err != nil {
		db.owner.reportAsyncError(err)
	}
}

func (s *SQLiteRuntime) execValue(result sqliteExecResult) goja.Value {
	object := s.runtime.NewObject()
	// The public contract deliberately keeps changes as a JavaScript number.
	// SQLite's sqlite3_changes() counter is bounded by the native engine rather
	// than being a table INTEGER read through query(), so its value is not part
	// of the exact-integer string conversion rule used for result columns.
	_ = object.Set("changes", result.changes)
	return object
}

func (s *SQLiteRuntime) batchValue(result sqliteBatchResult) goja.Value {
	items := make([]interface{}, len(result.results))
	for index, item := range result.results {
		items[index] = s.execValue(item)
	}
	object := s.runtime.NewObject()
	_ = object.Set("results", s.runtime.NewArray(items...))
	return object
}

func (s *SQLiteRuntime) queryValue(result sqliteQueryResult) (goja.Value, error) {
	rows := make([]interface{}, 0, len(result.rows))
	for _, rawRow := range result.rows {
		row := s.runtime.NewObject()
		for index, rawValue := range rawRow {
			if index >= len(result.columns) {
				return nil, fmt.Errorf("query row has more values than columns")
			}
			value, err := s.queryCellValue(rawValue)
			if err != nil {
				return nil, err
			}
			// Define a data property rather than calling Set so a SQL alias such as
			// "__proto__" cannot invoke JavaScript's legacy prototype setter.
			if err := row.DefineDataProperty(result.columns[index], value, goja.FLAG_TRUE, goja.FLAG_TRUE, goja.FLAG_TRUE); err != nil {
				return nil, err
			}
		}
		rows = append(rows, row)
	}
	return s.runtime.NewArray(rows...), nil
}

func (s *SQLiteRuntime) queryCellValue(value any) (goja.Value, error) {
	if bytes, ok := value.([]byte); ok {
		if s == nil || s.runtime == nil || s.uint8ArrayConstructor == nil {
			return nil, fmt.Errorf("Uint8Array constructor is unavailable")
		}
		object, err := s.uint8ArrayConstructor(nil, s.runtime.ToValue(s.runtime.NewArrayBuffer(bytes)))
		if err != nil {
			return nil, err
		}
		return object, nil
	}
	return s.runtime.ToValue(value), nil
}

func (db *SQLiteDatabase) reject(pending *sqlitePending, err error) {
	if pending == nil || pending.reject == nil {
		return
	}
	if rejectErr := pending.reject(sqliteJSError(db.owner.runtime, err)); rejectErr != nil {
		db.owner.reportAsyncError(rejectErr)
	}
}

func sqliteJSError(runtimeValue *goja.Runtime, err error) *goja.Object {
	typed := (*SQLiteError)(nil)
	if !errors.As(err, &typed) {
		typed = sqliteError(SQLiteInternal, "SQLite", "SQLite operation failed", sqliteWriteUnknown, nil, err)
	}
	object := runtimeValue.NewGoError(typed)
	_ = object.Set("name", "SQLiteError")
	_ = object.Set("code", string(typed.Code))
	_ = object.Set("operation", typed.Operation)
	_ = object.Set("writeState", typed.WriteState)
	if typed.Committed == nil {
		_ = object.Set("committed", goja.Null())
	} else {
		_ = object.Set("committed", *typed.Committed)
	}
	return object
}

func (s *SQLiteRuntime) queue(callback func()) bool {
	if s == nil || callback == nil || s.loop == nil {
		return false
	}
	s.queueMu.Lock()
	defer s.queueMu.Unlock()
	if s.closing.Load() {
		return false
	}
	return s.loop.RunOnLoop(func(*goja.Runtime) {
		defer func() {
			if recovered := recover(); recovered != nil {
				s.reportAsyncError(fmt.Errorf("panic in SQLite EventLoop callback: %v", recovered))
			}
		}()
		if !s.closing.Load() {
			callback()
		}
	})
}

func (s *SQLiteRuntime) beginWorker() {
	if s != nil {
		s.workers.Add(1)
	}
}

func (s *SQLiteRuntime) endWorker() {
	if s != nil {
		s.workers.Add(-1)
	}
}

// CancelPending is called by RuntimeLifecycle on the EventLoop owner. It
// fences callbacks, cancels all contexts, rejects retained Promises with an
// explicit write state, and asks every pinned worker to close its connection.
func (s *SQLiteRuntime) CancelPending() {
	if s == nil || !s.closing.CompareAndSwap(false, true) {
		return
	}
	// Serialize against a worker trying to queue a Goja callback. From here on
	// no callback is admitted after EventLoop teardown begins.
	s.queueMu.Lock()
	s.queueMu.Unlock()
	for id, db := range s.handles {
		delete(s.handles, id)
		db.forceCloseForRuntime()
	}
}

func (db *SQLiteDatabase) forceCloseForRuntime() {
	if db == nil {
		return
	}
	db.closed = true
	db.closing = true
	for id, pending := range db.pending {
		delete(db.pending, id)
		if pending.job != nil {
			pending.job.state.CompareAndSwap(sqliteJobQueued, sqliteJobAbandoned)
		}
		db.cleanupPending(pending)
		state := sqliteWriteUnknown
		if pending.job != nil && pending.job.state.Load() == sqliteJobAbandoned {
			state = sqliteWriteNotStarted
		}
		db.reject(pending, sqliteError(SQLiteCanceled, pending.operation, "operation canceled during execution teardown", state, sqliteCommittedForState(state), nil))
	}
	db.stopOnce.Do(func() { close(db.stop) })
}

// Wait joins all persistent per-handle workers after CancelPending closed
// their stop channels. It does not access Goja and is safe after termination.
func (s *SQLiteRuntime) Wait() {
	if s != nil {
		s.workerWG.Wait()
	}
}

func (s *SQLiteRuntime) ResourceCounts() (workers int64, callbacks int, handles int) {
	if s == nil {
		return 0, 0, 0
	}
	callbacks = 0
	for _, db := range s.handles {
		callbacks += len(db.pending)
	}
	return s.workers.Load(), callbacks, len(s.handles)
}

func (s *SQLiteRuntime) reportAsyncError(err error) {
	if err != nil && s != nil && s.onAsyncError != nil {
		s.onAsyncError(err)
	}
}
