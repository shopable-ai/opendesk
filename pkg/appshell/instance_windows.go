//go:build windows

package appshell

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

type windowsInstanceLease struct {
	mutex      windows.Handle
	pipeName   string
	security   *windows.SecurityAttributes
	activate   func() bool
	closing    atomic.Bool
	mu         sync.Mutex
	activePipe windows.Handle
	closeOnce  sync.Once
	wg         sync.WaitGroup
}

func acquirePlatformSingleInstance(ctx context.Context, key string, activate func() bool) (InstanceLease, bool, error) {
	security, err := currentUserSecurityAttributes()
	if err != nil {
		return nil, false, err
	}
	mutexName := windows.StringToUTF16Ptr(`Local\OpenDesk.App.` + key)
	// The mutex object lifetime, not thread ownership, is the instance lease.
	// App Mode bootstrap is free to move between Go-managed OS threads, so an
	// initially-owned mutex could only be released reliably by pinning the
	// creating thread for the full application lifetime.
	mutex, mutexErr := windows.CreateMutex(security, false, mutexName)
	if errors.Is(mutexErr, windows.ERROR_ALREADY_EXISTS) {
		_ = windows.CloseHandle(mutex)
		accepted, err := requestWindowsActivation(ctx, `\\.\pipe\OpenDesk.App.`+key)
		if err != nil {
			return nil, false, err
		}
		if !accepted {
			return nil, false, ErrInstanceQuitting
		}
		return nil, false, nil
	}
	if mutexErr != nil {
		if mutex != 0 {
			_ = windows.CloseHandle(mutex)
		}
		return nil, false, fmt.Errorf("acquire App Mode named mutex: %w", mutexErr)
	}
	lease := &windowsInstanceLease{
		mutex: mutex, pipeName: `\\.\pipe\OpenDesk.App.` + key,
		security: security, activate: activate,
	}
	pipe, err := lease.createPipe(true)
	if err != nil {
		_ = windows.CloseHandle(mutex)
		return nil, false, err
	}
	lease.activePipe = pipe
	lease.wg.Add(1)
	go lease.serve(pipe)
	return lease, true, nil
}

func currentUserSecurityAttributes() (*windows.SecurityAttributes, error) {
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return nil, fmt.Errorf("resolve current Windows user SID: %w", err)
	}
	sddl := "D:P(A;;GA;;;" + user.User.Sid.String() + ")"
	descriptor, err := windows.SecurityDescriptorFromString(sddl)
	if err != nil {
		return nil, fmt.Errorf("build current-user App Mode ACL: %w", err)
	}
	return &windows.SecurityAttributes{
		Length: uint32(unsafe.Sizeof(windows.SecurityAttributes{})), SecurityDescriptor: descriptor,
	}, nil
}

func (l *windowsInstanceLease) createPipe(first bool) (windows.Handle, error) {
	flags := uint32(windows.PIPE_ACCESS_DUPLEX)
	if first {
		flags |= windows.FILE_FLAG_FIRST_PIPE_INSTANCE
	}
	name, err := windows.UTF16PtrFromString(l.pipeName)
	if err != nil {
		return 0, err
	}
	pipe, err := windows.CreateNamedPipe(name, flags,
		windows.PIPE_TYPE_MESSAGE|windows.PIPE_READMODE_MESSAGE|windows.PIPE_WAIT,
		1, 4096, 4096, 1000, l.security)
	if err != nil {
		return 0, fmt.Errorf("create current-user App Mode named pipe: %w", err)
	}
	return pipe, nil
}

// detachActivePipe transfers close ownership for the current pipe exactly
// once. expected==0 is the shutdown path; the server supplies the handle it
// just finished serving so it cannot clear a newer replacement pipe.
func (l *windowsInstanceLease) detachActivePipe(expected windows.Handle) windows.Handle {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.activePipe == 0 || (expected != 0 && l.activePipe != expected) {
		return 0
	}
	pipe := l.activePipe
	l.activePipe = 0
	return pipe
}

func (l *windowsInstanceLease) serve(initial windows.Handle) {
	defer l.wg.Done()
	pipe := initial
	for {
		err := windows.ConnectNamedPipe(pipe, nil)
		if err != nil && !errors.Is(err, windows.ERROR_PIPE_CONNECTED) {
			if owned := l.detachActivePipe(pipe); owned != 0 {
				_ = windows.CloseHandle(owned)
			}
			return
		}
		l.handle(pipe)
		if owned := l.detachActivePipe(pipe); owned != 0 {
			_ = windows.FlushFileBuffers(owned)
			_ = windows.DisconnectNamedPipe(owned)
			_ = windows.CloseHandle(owned)
		}
		if l.closing.Load() {
			return
		}
		next, err := l.createPipe(false)
		if err != nil {
			return
		}
		l.mu.Lock()
		if l.closing.Load() {
			l.mu.Unlock()
			_ = windows.CloseHandle(next)
			return
		}
		l.activePipe = next
		l.mu.Unlock()
		pipe = next
	}
}

func (l *windowsInstanceLease) handle(pipe windows.Handle) {
	buffer := make([]byte, 4096)
	var read uint32
	if err := windows.ReadFile(pipe, buffer, &read, nil); err != nil || read == 0 {
		return
	}
	var request appInstanceRequest
	if err := json.Unmarshal(bytes.TrimSpace(buffer[:read]), &request); err != nil || request.Command != "activate" {
		return
	}
	accepted := !l.closing.Load() && l.activate()
	state := "RUNNING"
	if !accepted {
		state = "QUITTING"
	}
	data, _ := json.Marshal(appInstanceResponse{Accepted: accepted, State: state})
	var written uint32
	_ = windows.WriteFile(pipe, append(data, '\n'), &written, nil)
}

func requestWindowsActivation(parent context.Context, pipeName string) (bool, error) {
	ctx, cancel := context.WithTimeout(parent, appInstanceActivationTimeout)
	defer cancel()
	name, err := windows.UTF16PtrFromString(pipeName)
	if err != nil {
		return false, err
	}
	var pipe windows.Handle
	for {
		pipe, err = windows.CreateFile(name, windows.GENERIC_READ|windows.GENERIC_WRITE, 0, nil, windows.OPEN_EXISTING, 0, 0)
		if err == nil {
			break
		}
		select {
		case <-ctx.Done():
			return false, fmt.Errorf("connect to primary App Mode named pipe: %w", ctx.Err())
		case <-time.After(25 * time.Millisecond):
		}
	}
	var closePipeOnce sync.Once
	closePipe := func() { closePipeOnce.Do(func() { _ = windows.CloseHandle(pipe) }) }
	defer closePipe()
	stop := context.AfterFunc(ctx, closePipe)
	defer stop()
	data, _ := json.Marshal(appInstanceRequest{Command: "activate"})
	var written uint32
	if err := windows.WriteFile(pipe, append(data, '\n'), &written, nil); err != nil {
		return false, err
	}
	buffer := make([]byte, 4096)
	var read uint32
	if err := windows.ReadFile(pipe, buffer, &read, nil); err != nil {
		return false, err
	}
	var response appInstanceResponse
	if err := json.Unmarshal(bytes.TrimSpace(buffer[:read]), &response); err != nil {
		return false, err
	}
	return response.Accepted, nil
}

func (l *windowsInstanceLease) Close() error {
	if l == nil {
		return nil
	}
	var closeErr error
	l.closeOnce.Do(func() {
		l.closing.Store(true)
		pipe := l.detachActivePipe(0)
		if pipe != 0 {
			_ = windows.CancelIoEx(pipe, nil)
			_ = windows.CloseHandle(pipe)
		}
		if l.mutex != 0 {
			closeErr = windows.CloseHandle(l.mutex)
			l.mutex = 0
		}
	})
	return closeErr
}

func (l *windowsInstanceLease) Wait() {
	if l != nil {
		l.wg.Wait()
	}
}
