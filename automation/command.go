package automation

import (
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

const (
	commandDefaultMaxOutput = 4 * 1024 * 1024
	commandMaxOutput        = 64 * 1024 * 1024
	commandMaxTimeout       = 24 * time.Hour
	commandKillGrace        = 250 * time.Millisecond
)

type CommandErrorCode string

const (
	CommandDisabled    CommandErrorCode = "COMMAND_DISABLED"
	CommandInvalidArg  CommandErrorCode = "INVALID_ARGUMENT"
	CommandStartFailed CommandErrorCode = "START_FAILED"
	CommandExitNonZero CommandErrorCode = "EXIT_NONZERO"
	CommandTimeout     CommandErrorCode = "TIMEOUT"
	CommandOutputLimit CommandErrorCode = "OUTPUT_LIMIT"
	CommandIOFailed    CommandErrorCode = "IO_FAILED"
	CommandCanceled    CommandErrorCode = "CANCELED"
)

type CommandError struct {
	Code     CommandErrorCode
	ExitCode *int
	Stdout   string
	Stderr   string
	Message  string
	Cause    error
}

func (e *CommandError) Error() string {
	if e == nil {
		return "command error"
	}
	message := e.Message
	if message == "" {
		message = "command execution failed"
	}
	if e.Cause != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, message, e.Cause)
	}
	return fmt.Sprintf("%s: %s", e.Code, message)
}

func (e *CommandError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

type commandSpec struct {
	command        string
	args           []string
	cwd            string
	env            []string
	timeout        time.Duration
	maxOutputBytes int
	input          *string
}

type commandWaiter struct {
	resolve func(interface{}) error
	reject  func(interface{}) error
}

// CommandRuntime owns commands started by one JavaScript execution. Workers
// never access Goja directly, and teardown terminates every surviving process.
type CommandRuntime struct {
	runtime *goja.Runtime
	loop    *eventloop.EventLoop
	enabled bool

	closing   atomic.Bool
	workers   atomic.Int64
	callbacks atomic.Int64

	mu        sync.Mutex
	processes map[*commandProcess]struct{}
	wg        sync.WaitGroup
	queueMu   sync.Mutex
}

type commandProcess struct {
	owner     *CommandRuntime
	spec      commandSpec
	cmd       *exec.Cmd
	stdin     io.WriteCloser
	waiter    commandWaiter
	inputDone chan struct{}

	mu          sync.Mutex
	stdout      []byte
	stderr      []byte
	totalOutput int
	exitCode    *int
	finished    bool
	settled     bool
	timedOut    bool
	canceled    bool
	overflow    bool
	ioErr       error
	waitErr     error
	timer       *time.Timer
	stdinOnce   sync.Once
}

type commandOutputWriter struct {
	process *commandProcess
	stderr  bool
}

func registerCommand(runtimeValue *goja.Runtime, opts InitJSOptions) *CommandRuntime {
	manager := &CommandRuntime{
		runtime:   runtimeValue,
		loop:      opts.EventLoop,
		enabled:   opts.EnableCommand,
		processes: make(map[*commandProcess]struct{}),
	}
	object := runtimeValue.NewObject()
	_ = object.Set("getCapabilities", func(goja.FunctionCall) goja.Value {
		return runtimeValue.ToValue(map[string]interface{}{
			"schemaVersion":   1,
			"enabled":         manager.enabled,
			"supported":       manager.loop != nil,
			"executionScoped": true,
		})
	})
	_ = object.Set("run", func(call goja.FunctionCall) goja.Value { return manager.run(call) })
	_ = runtimeValue.Set("Command", object)
	return manager
}

func (c *CommandRuntime) run(call goja.FunctionCall) goja.Value {
	promise, resolve, reject := c.runtime.NewPromise()
	rejectWith := func(err error) goja.Value {
		_ = reject(commandJSError(c.runtime, err))
		return c.runtime.ToValue(promise)
	}
	if err := c.available(); err != nil {
		return rejectWith(err)
	}
	spec, err := parseCommandInvocation(call)
	if err != nil {
		return rejectWith(err)
	}
	if _, err := c.launch(spec, commandWaiter{resolve: resolve, reject: reject}); err != nil {
		return rejectWith(err)
	}
	return c.runtime.ToValue(promise)
}

func (c *CommandRuntime) available() error {
	if !c.enabled {
		return commandOperationError(CommandDisabled, "command execution is unavailable from this Runtime entrypoint", nil)
	}
	if c.loop == nil {
		return commandOperationError(CommandDisabled, "command execution requires an event-loop-owned Runtime", nil)
	}
	if c.closing.Load() {
		return commandOperationError(CommandCanceled, "Command Runtime is closing", nil)
	}
	return nil
}

func (c *CommandRuntime) launch(spec commandSpec, waiter commandWaiter) (*commandProcess, error) {
	cmd := exec.Command(spec.command, spec.args...)
	cmd.Dir = spec.cwd
	cmd.Env = spec.env
	configureCommand(cmd)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, commandStartError(spec, err)
	}

	c.mu.Lock()
	if c.closing.Load() {
		c.mu.Unlock()
		_ = stdin.Close()
		return nil, commandOperationError(CommandCanceled, "Command Runtime is closing", nil)
	}
	process := &commandProcess{
		owner:     c,
		spec:      spec,
		cmd:       cmd,
		stdin:     stdin,
		waiter:    waiter,
		inputDone: make(chan struct{}),
	}
	cmd.Stdout = &commandOutputWriter{process: process}
	cmd.Stderr = &commandOutputWriter{process: process, stderr: true}
	if err := cmd.Start(); err != nil {
		c.mu.Unlock()
		_ = stdin.Close()
		return nil, commandStartError(spec, err)
	}
	c.processes[process] = struct{}{}
	c.callbacks.Add(1)
	c.mu.Unlock()

	if spec.timeout > 0 {
		process.timer = time.AfterFunc(spec.timeout, process.timeout)
	}
	if spec.input != nil {
		c.workers.Add(1)
		c.wg.Add(1)
		go process.writeInput(*spec.input)
	} else {
		_ = process.closeStdin()
		close(process.inputDone)
	}
	c.workers.Add(1)
	c.wg.Add(1)
	go process.wait()
	return process, nil
}

func (p *commandProcess) writeInput(input string) {
	defer p.owner.workers.Add(-1)
	defer p.owner.wg.Done()
	defer close(p.inputDone)
	_, writeErr := io.WriteString(p.stdin, input)
	closeErr := p.closeStdin()
	if writeErr != nil && p.shouldRecordIOError() {
		p.setIOError(fmt.Errorf("write stdin: %w", writeErr))
		p.forceKill()
	} else if closeErr != nil && p.shouldRecordIOError() {
		p.setIOError(fmt.Errorf("close stdin: %w", closeErr))
		p.forceKill()
	}
}

func (w *commandOutputWriter) Write(value []byte) (int, error) {
	if len(value) == 0 {
		return 0, nil
	}
	if !w.process.appendOutput(value, w.stderr) {
		w.process.forceKill()
	}
	// OUTPUT_LIMIT owns the final error. Returning a writer error here would
	// incorrectly replace it with IO_FAILED.
	return len(value), nil
}

func (p *commandProcess) appendOutput(value []byte, stderr bool) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.overflow {
		return false
	}
	if p.totalOutput+len(value) > p.spec.maxOutputBytes {
		p.overflow = true
		return false
	}
	p.totalOutput += len(value)
	if stderr {
		p.stderr = append(p.stderr, value...)
	} else {
		p.stdout = append(p.stdout, value...)
	}
	return true
}

func (p *commandProcess) wait() {
	defer p.owner.workers.Add(-1)
	defer p.owner.wg.Done()
	waitErr := p.cmd.Wait()
	<-p.inputDone
	if p.timer != nil {
		p.timer.Stop()
	}
	p.mu.Lock()
	p.finished = true
	p.waitErr = waitErr
	if p.cmd.ProcessState != nil {
		code := p.cmd.ProcessState.ExitCode()
		p.exitCode = &code
	}
	p.mu.Unlock()
	_ = p.closeStdin()
	p.owner.queue(func() { p.finishOnLoop() })
}

func (p *commandProcess) finishOnLoop() {
	p.owner.mu.Lock()
	delete(p.owner.processes, p)
	p.owner.mu.Unlock()
	waiter, ok := p.takeWaiter()
	if !ok {
		return
	}
	if err := p.operationError(); err != nil {
		_ = waiter.reject(commandJSError(p.owner.runtime, err))
		return
	}
	_ = waiter.resolve(p.result())
}

func (p *commandProcess) takeWaiter() (commandWaiter, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.settled {
		return commandWaiter{}, false
	}
	p.settled = true
	p.owner.callbacks.Add(-1)
	return p.waiter, true
}

func (p *commandProcess) result() map[string]interface{} {
	p.mu.Lock()
	defer p.mu.Unlock()
	exitCode := 0
	if p.exitCode != nil {
		exitCode = *p.exitCode
	}
	return map[string]interface{}{
		"exitCode": exitCode,
		"stdout":   validCommandOutput(p.stdout),
		"stderr":   validCommandOutput(p.stderr),
	}
}

func (p *commandProcess) operationError() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if !p.finished {
		return nil
	}
	code := CommandExitNonZero
	message := "command exited with a non-zero status"
	switch {
	case p.canceled:
		code, message = CommandCanceled, "command was canceled during execution teardown"
	case p.timedOut:
		code, message = CommandTimeout, "command exceeded timeout"
	case p.overflow:
		code, message = CommandOutputLimit, "command output exceeded maxOutputBytes"
	case p.ioErr != nil:
		code, message = CommandIOFailed, "command standard I/O failed"
	case p.exitCode != nil && *p.exitCode == 0 && p.waitErr == nil:
		return nil
	}
	return &CommandError{
		Code:     code,
		ExitCode: cloneCommandInt(p.exitCode),
		Stdout:   validCommandOutput(p.stdout),
		Stderr:   validCommandOutput(p.stderr),
		Message:  message,
		Cause:    p.ioErr,
	}
}

func (p *commandProcess) timeout() {
	p.mu.Lock()
	if p.finished {
		p.mu.Unlock()
		return
	}
	p.timedOut = true
	p.mu.Unlock()
	_ = terminateCommand(p.cmd, false)
	time.AfterFunc(commandKillGrace, p.forceKill)
}

func (p *commandProcess) forceKill() {
	p.mu.Lock()
	if p.finished {
		p.mu.Unlock()
		return
	}
	p.mu.Unlock()
	_ = terminateCommand(p.cmd, true)
}

func (p *commandProcess) cancel() {
	p.mu.Lock()
	if p.finished {
		p.mu.Unlock()
		return
	}
	p.canceled = true
	p.mu.Unlock()
	_ = terminateCommand(p.cmd, false)
	time.AfterFunc(commandKillGrace, p.forceKill)
	_ = p.closeStdin()
}

func (p *commandProcess) closeStdin() error {
	var err error
	p.stdinOnce.Do(func() {
		if p.stdin != nil {
			err = p.stdin.Close()
		}
	})
	return err
}

func (p *commandProcess) shouldRecordIOError() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return !p.finished && !p.timedOut && !p.canceled && !p.overflow
}

func (p *commandProcess) setIOError(err error) {
	p.mu.Lock()
	if p.ioErr == nil {
		p.ioErr = err
	}
	p.mu.Unlock()
}

func (c *CommandRuntime) queue(callback func()) bool {
	if callback == nil || c.loop == nil {
		return false
	}
	c.queueMu.Lock()
	defer c.queueMu.Unlock()
	if c.closing.Load() {
		return false
	}
	return c.loop.RunOnLoop(func(*goja.Runtime) {
		if !c.closing.Load() {
			callback()
		}
	})
}

func (c *CommandRuntime) Close() {
	if c == nil || !c.closing.CompareAndSwap(false, true) {
		return
	}
	c.queueMu.Lock()
	c.queueMu.Unlock()
	c.mu.Lock()
	processes := make([]*commandProcess, 0, len(c.processes))
	for process := range c.processes {
		processes = append(processes, process)
	}
	c.processes = make(map[*commandProcess]struct{})
	c.mu.Unlock()
	for _, process := range processes {
		if waiter, ok := process.takeWaiter(); ok {
			_ = waiter.reject(commandJSError(c.runtime, &CommandError{
				Code:    CommandCanceled,
				Message: "command canceled during execution teardown",
			}))
		}
		process.cancel()
	}
}

func (c *CommandRuntime) Wait() {
	if c != nil {
		c.wg.Wait()
	}
}

func (c *CommandRuntime) ResourceCounts() (workers int64, callbacks int64, processes int) {
	if c == nil {
		return 0, 0, 0
	}
	c.mu.Lock()
	processes = len(c.processes)
	c.mu.Unlock()
	return c.workers.Load(), c.callbacks.Load(), processes
}

func parseCommandInvocation(call goja.FunctionCall) (commandSpec, error) {
	spec := commandSpec{env: os.Environ(), maxOutputBytes: commandDefaultMaxOutput}
	command, ok := call.Argument(0).Export().(string)
	if !ok || strings.TrimSpace(command) == "" || strings.ContainsRune(command, '\x00') {
		return spec, commandOperationError(CommandInvalidArg, "command must be a non-empty string without NUL", nil)
	}
	spec.command = command
	optionsIndex := 1
	if args, isArray, err := commandArguments(call.Argument(1)); err != nil {
		return spec, err
	} else if isArray {
		spec.args = args
		optionsIndex = 2
	}
	if err := parseCommandOptions(call.Argument(optionsIndex), &spec); err != nil {
		return spec, err
	}
	for index := optionsIndex + 1; index < len(call.Arguments); index++ {
		if !goja.IsUndefined(call.Argument(index)) {
			return spec, commandOperationError(CommandInvalidArg, "too many arguments", nil)
		}
	}
	return spec, nil
}

func commandArguments(value goja.Value) ([]string, bool, error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return nil, false, nil
	}
	values, ok := value.Export().([]interface{})
	if !ok {
		return nil, false, nil
	}
	arguments := make([]string, len(values))
	for index, raw := range values {
		argument, ok := raw.(string)
		if !ok || strings.ContainsRune(argument, '\x00') {
			return nil, true, commandOperationError(CommandInvalidArg, fmt.Sprintf("args[%d] must be a string without NUL", index), nil)
		}
		arguments[index] = argument
	}
	return arguments, true, nil
}

func parseCommandOptions(value goja.Value, spec *commandSpec) error {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return nil
	}
	options, ok := value.Export().(map[string]interface{})
	if !ok {
		return commandOperationError(CommandInvalidArg, "options must be an object", nil)
	}
	allowed := map[string]bool{"cwd": true, "env": true, "timeout": true, "maxOutputBytes": true, "input": true}
	for key := range options {
		if !allowed[key] {
			return commandOperationError(CommandInvalidArg, "options contains unknown field "+key, nil)
		}
	}
	if raw, exists := options["cwd"]; exists {
		cwd, ok := raw.(string)
		if !ok || cwd == "" || strings.ContainsRune(cwd, '\x00') {
			return commandOperationError(CommandInvalidArg, "cwd must be a non-empty string without NUL", nil)
		}
		info, err := os.Stat(cwd)
		if err != nil || !info.IsDir() {
			return commandOperationError(CommandInvalidArg, "cwd must reference an existing directory", err)
		}
		spec.cwd = cwd
	}
	if raw, exists := options["env"]; exists {
		envObject, ok := raw.(map[string]interface{})
		if !ok {
			return commandOperationError(CommandInvalidArg, "env must be an object of string values", nil)
		}
		env, err := mergeCommandEnv(spec.env, envObject)
		if err != nil {
			return commandOperationError(CommandInvalidArg, err.Error(), err)
		}
		spec.env = env
	}
	if raw, exists := options["timeout"]; exists {
		milliseconds, ok := commandInteger(raw)
		if !ok || milliseconds < 0 || int64(milliseconds) > int64(commandMaxTimeout/time.Millisecond) {
			return commandOperationError(CommandInvalidArg, "timeout must be an integer from 0 through 86400000", nil)
		}
		spec.timeout = time.Duration(milliseconds) * time.Millisecond
	}
	if raw, exists := options["maxOutputBytes"]; exists {
		maximum, ok := commandInteger(raw)
		if !ok || maximum < 1 || maximum > commandMaxOutput {
			return commandOperationError(CommandInvalidArg, fmt.Sprintf("maxOutputBytes must be an integer from 1 through %d", commandMaxOutput), nil)
		}
		spec.maxOutputBytes = maximum
	}
	if raw, exists := options["input"]; exists {
		input, ok := raw.(string)
		if !ok || len(input) > commandMaxOutput {
			return commandOperationError(CommandInvalidArg, fmt.Sprintf("input must be a string no larger than %d bytes", commandMaxOutput), nil)
		}
		spec.input = &input
	}
	return nil
}

func mergeCommandEnv(base []string, overrides map[string]interface{}) ([]string, error) {
	values := make(map[string]string, len(base)+len(overrides))
	for _, entry := range base {
		if index := strings.IndexByte(entry, '='); index >= 0 {
			values[entry[:index]] = entry[index+1:]
		}
	}
	for key, raw := range overrides {
		value, ok := raw.(string)
		if !ok || key == "" || strings.ContainsAny(key, "=\x00") || strings.ContainsRune(value, '\x00') {
			return nil, fmt.Errorf("env.%s must use a valid name and string value without NUL", key)
		}
		values[key] = value
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := make([]string, 0, len(keys))
	for _, key := range keys {
		result = append(result, key+"="+values[key])
	}
	return result, nil
}

func commandInteger(value interface{}) (int, bool) {
	var number float64
	switch typed := value.(type) {
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

func commandStartError(spec commandSpec, err error) error {
	return &CommandError{Code: CommandStartFailed, Message: "failed to start command " + spec.command, Cause: err}
}

func commandOperationError(code CommandErrorCode, message string, cause error) error {
	return &CommandError{Code: code, Message: message, Cause: cause}
}

func commandJSError(runtimeValue *goja.Runtime, err error) *goja.Object {
	var typed *CommandError
	if !errors.As(err, &typed) {
		typed = &CommandError{Code: CommandIOFailed, Message: "command execution failed", Cause: err}
	}
	object := runtimeValue.NewGoError(typed)
	_ = object.Set("name", "CommandError")
	_ = object.Set("code", string(typed.Code))
	_ = object.Set("exitCode", nil)
	if typed.ExitCode != nil {
		_ = object.Set("exitCode", *typed.ExitCode)
	}
	_ = object.Set("stdout", typed.Stdout)
	_ = object.Set("stderr", typed.Stderr)
	return object
}

func cloneCommandInt(value *int) *int {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func validCommandOutput(value []byte) string {
	return strings.ToValidUTF8(string(value), "\uFFFD")
}
