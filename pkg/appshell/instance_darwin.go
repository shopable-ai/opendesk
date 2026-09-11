//go:build darwin

package appshell

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

type appInstanceInfo struct {
	Version uint8  `json:"version"`
	Socket  string `json:"socket"`
	Token   string `json:"token"`
}

type darwinInstanceLease struct {
	file       *os.File
	listener   net.Listener
	socketPath string
	token      []byte
	activate   func() bool
	closing    atomic.Bool
	closeOnce  sync.Once
	wg         sync.WaitGroup
}

func acquirePlatformSingleInstance(ctx context.Context, key string, activate func() bool) (InstanceLease, bool, error) {
	dir, err := appInstanceStateDir()
	if err != nil {
		return nil, false, err
	}
	lockPath := filepath.Join(dir, key+".lock")
	file, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, false, fmt.Errorf("open App Mode instance lease: %w", err)
	}
	if err := os.Chmod(lockPath, 0o600); err != nil {
		_ = file.Close()
		return nil, false, fmt.Errorf("secure App Mode instance lease: %w", err)
	}
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err == nil {
		lease, startErr := startDarwinInstanceLease(file, dir, key, activate)
		if startErr != nil {
			_ = syscall.Flock(int(file.Fd()), syscall.LOCK_UN)
			_ = file.Close()
			return nil, false, startErr
		}
		return lease, true, nil
	} else if !errors.Is(err, syscall.EWOULDBLOCK) {
		_ = file.Close()
		return nil, false, fmt.Errorf("lock App Mode instance lease: %w", err)
	}
	activationContext, cancel := context.WithTimeout(ctx, appInstanceActivationTimeout)
	defer cancel()
	for {
		info, readErr := readDarwinInstanceInfo(file)
		if readErr == nil {
			_ = file.Close()
			accepted, activateErr := requestDarwinActivation(activationContext, info)
			if activateErr != nil {
				return nil, false, activateErr
			}
			if !accepted {
				return nil, false, ErrInstanceQuitting
			}
			return nil, false, nil
		}
		select {
		case <-activationContext.Done():
			_ = file.Close()
			return nil, false, fmt.Errorf("read primary App Mode instance: %w", activationContext.Err())
		case <-time.After(20 * time.Millisecond):
		}
	}
}

func appInstanceStateDir() (string, error) {
	cache, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("resolve App Mode instance directory: %w", err)
	}
	dir := filepath.Join(cache, "opendesk", "app-instances")
	if info, err := os.Lstat(dir); err == nil {
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return "", fmt.Errorf("App Mode instance path is not a private directory: %s", dir)
		}
	} else if !os.IsNotExist(err) {
		return "", err
	} else if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("create App Mode instance directory: %w", err)
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		return "", fmt.Errorf("secure App Mode instance directory: %w", err)
	}
	return dir, nil
}

func startDarwinInstanceLease(file *os.File, dir, key string, activate func() bool) (*darwinInstanceLease, error) {
	socketPath := filepath.Join(dir, key[:32]+".sock")
	_ = os.Remove(socketPath)
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		return nil, fmt.Errorf("listen for App Mode activation: %w", err)
	}
	if err := os.Chmod(socketPath, 0o600); err != nil {
		_ = listener.Close()
		_ = os.Remove(socketPath)
		return nil, fmt.Errorf("secure App Mode activation socket: %w", err)
	}
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		_ = listener.Close()
		_ = os.Remove(socketPath)
		return nil, fmt.Errorf("create App Mode activation token: %w", err)
	}
	info := appInstanceInfo{Version: 1, Socket: socketPath, Token: hex.EncodeToString(token)}
	if err := writeDarwinInstanceInfo(file, info); err != nil {
		_ = listener.Close()
		_ = os.Remove(socketPath)
		return nil, err
	}
	lease := &darwinInstanceLease{file: file, listener: listener, socketPath: socketPath, token: token, activate: activate}
	lease.wg.Add(1)
	go lease.serve()
	return lease, nil
}

func writeDarwinInstanceInfo(file *os.File, info appInstanceInfo) error {
	data, err := json.Marshal(info)
	if err != nil {
		return err
	}
	if err := file.Truncate(0); err != nil {
		return err
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return err
	}
	if _, err := file.Write(append(data, '\n')); err != nil {
		return err
	}
	return file.Sync()
}

func readDarwinInstanceInfo(file *os.File) (appInstanceInfo, error) {
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return appInstanceInfo{}, err
	}
	var info appInstanceInfo
	if err := json.NewDecoder(io.LimitReader(file, 4096)).Decode(&info); err != nil {
		return info, err
	}
	if info.Version != 1 || info.Socket == "" || len(info.Token) != 64 {
		return info, errors.New("invalid App Mode instance lease")
	}
	return info, nil
}

func requestDarwinActivation(parent context.Context, info appInstanceInfo) (bool, error) {
	ctx, cancel := context.WithTimeout(parent, appInstanceActivationTimeout)
	defer cancel()
	dialer := net.Dialer{}
	connection, err := dialer.DialContext(ctx, "unix", info.Socket)
	if err != nil {
		return false, fmt.Errorf("connect to primary App Mode instance: %w", err)
	}
	defer connection.Close()
	if deadline, ok := ctx.Deadline(); ok {
		_ = connection.SetDeadline(deadline)
	}
	if err := json.NewEncoder(connection).Encode(appInstanceRequest{Command: "activate", Token: info.Token}); err != nil {
		return false, err
	}
	var response appInstanceResponse
	if err := json.NewDecoder(io.LimitReader(connection, 4096)).Decode(&response); err != nil {
		return false, err
	}
	return response.Accepted, nil
}

func (l *darwinInstanceLease) serve() {
	defer l.wg.Done()
	for {
		connection, err := l.listener.Accept()
		if err != nil {
			return
		}
		l.handle(connection)
	}
}

func (l *darwinInstanceLease) handle(connection net.Conn) {
	defer connection.Close()
	_ = connection.SetDeadline(time.Now().Add(time.Second))
	var request appInstanceRequest
	if err := json.NewDecoder(io.LimitReader(connection, 4096)).Decode(&request); err != nil {
		return
	}
	provided, err := hex.DecodeString(request.Token)
	accepted := err == nil && request.Command == "activate" && hmac.Equal(provided, l.token) && !l.closing.Load() && l.activate()
	state := "RUNNING"
	if !accepted {
		state = "QUITTING"
	}
	_ = json.NewEncoder(connection).Encode(appInstanceResponse{Accepted: accepted, State: state})
}

func (l *darwinInstanceLease) Close() error {
	if l == nil {
		return nil
	}
	var closeErr error
	l.closeOnce.Do(func() {
		l.closing.Store(true)
		if l.listener != nil {
			if err := l.listener.Close(); err != nil && !errors.Is(err, net.ErrClosed) {
				closeErr = err
			}
		}
		_ = os.Remove(l.socketPath)
		if l.file != nil {
			_ = syscall.Flock(int(l.file.Fd()), syscall.LOCK_UN)
			if err := l.file.Close(); closeErr == nil {
				closeErr = err
			}
		}
	})
	return closeErr
}

func (l *darwinInstanceLease) Wait() {
	if l != nil {
		l.wg.Wait()
	}
}
