package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const scriptInstanceTakeoverTimeout = 5 * time.Second

var errScriptInstanceReplaced = errors.New("script execution replaced by a newer invocation")

// scriptInstanceInfo is intentionally local-only state. The random token
// prevents an unrelated local client from canceling a running script just by
// guessing its loopback port.
type scriptInstanceInfo struct {
	Version uint8  `json:"version"`
	Script  string `json:"script"`
	Port    int    `json:"port"`
	Token   string `json:"token"`
}

type scriptInstanceControlRequest struct {
	Command string `json:"command"`
	Token   string `json:"token"`
}

type scriptInstanceControlResponse struct {
	Accepted bool `json:"accepted"`
}

// scriptInstanceLease makes one file-backed direct CLI script active at a
// time. A new invocation asks the old one to cancel through its authenticated
// loopback control channel, then waits for the old runtime to release its
// native resources before taking the lock itself.
type scriptInstanceLease struct {
	file     *os.File
	listener net.Listener
	cancel   func()
	token    []byte
	replaced atomic.Bool

	closeOnce sync.Once
}

func acquireReplacingScriptInstance(scriptPath string, cancel func()) (*scriptInstanceLease, error) {
	stateDir, err := scriptInstanceStateDir()
	if err != nil {
		return nil, err
	}
	return acquireScriptInstance(stateDir, scriptPath, cancel)
}

func scriptInstanceStateDir() (string, error) {
	base, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("resolve OpenDesk script-instance directory: %w", err)
	}
	dir := filepath.Join(base, "opendesk", "script-instances")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("create OpenDesk script-instance directory: %w", err)
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		return "", fmt.Errorf("secure OpenDesk script-instance directory: %w", err)
	}
	return dir, nil
}

func acquireScriptInstance(stateDir, scriptPath string, cancel func()) (*scriptInstanceLease, error) {
	identity, err := canonicalScriptInstanceIdentity(scriptPath)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(stateDir, 0o700); err != nil {
		return nil, fmt.Errorf("create script-instance test directory: %w", err)
	}
	if err := os.Chmod(stateDir, 0o700); err != nil {
		return nil, fmt.Errorf("secure script-instance directory: %w", err)
	}
	key := sha256.Sum256([]byte(identity))
	leasePath := filepath.Join(stateDir, hex.EncodeToString(key[:])+".lock")

	deadline := time.Now().Add(scriptInstanceTakeoverTimeout)
	takeoverRequested := false
	for {
		file, err := os.OpenFile(leasePath, os.O_CREATE|os.O_RDWR, 0o600)
		if err != nil {
			return nil, fmt.Errorf("open script-instance lease: %w", err)
		}
		if err := os.Chmod(leasePath, 0o600); err != nil {
			_ = file.Close()
			return nil, fmt.Errorf("secure script-instance lease: %w", err)
		}
		locked, err := tryScriptInstanceFileLock(file)
		if err != nil {
			_ = file.Close()
			return nil, fmt.Errorf("lock script-instance lease: %w", err)
		}
		if locked {
			lease, err := startScriptInstanceLease(file, identity, cancel)
			if err != nil {
				unlockScriptInstanceFile(file)
				_ = file.Close()
				return nil, err
			}
			return lease, nil
		}

		info, readErr := readScriptInstanceInfo(file)
		_ = file.Close()
		if readErr == nil && !takeoverRequested {
			takeoverRequested = requestScriptInstanceTakeover(info)
		}
		if time.Now().After(deadline) {
			if takeoverRequested {
				return nil, fmt.Errorf("the previous invocation of %s did not release its runtime within %s", identity, scriptInstanceTakeoverTimeout)
			}
			return nil, fmt.Errorf("another invocation of %s is active but cannot accept a safe takeover; stop that invocation and run this command again", identity)
		}
		time.Sleep(25 * time.Millisecond)
	}
}

func canonicalScriptInstanceIdentity(scriptPath string) (string, error) {
	path := strings.TrimSpace(scriptPath)
	if path == "" {
		return "", errors.New("script path is required for single-instance coordination")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("resolve script path for single-instance coordination: %w", err)
	}
	if resolved, err := filepath.EvalSymlinks(abs); err == nil {
		abs = resolved
	}
	return filepath.Clean(abs), nil
}

func startScriptInstanceLease(file *os.File, identity string, cancel func()) (*scriptInstanceLease, error) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("listen for script-instance takeover: %w", err)
	}
	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok || address.Port <= 0 {
		_ = listener.Close()
		return nil, errors.New("script-instance takeover listener has no local TCP port")
	}
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		_ = listener.Close()
		return nil, fmt.Errorf("create script-instance takeover token: %w", err)
	}
	info := scriptInstanceInfo{Version: 1, Script: identity, Port: address.Port, Token: hex.EncodeToString(token)}
	if err := writeScriptInstanceInfo(file, info); err != nil {
		_ = listener.Close()
		return nil, err
	}
	lease := &scriptInstanceLease{file: file, listener: listener, cancel: cancel, token: token}
	go lease.serveTakeoverRequests()
	return lease, nil
}

func writeScriptInstanceInfo(file *os.File, info scriptInstanceInfo) error {
	encoded, err := json.Marshal(info)
	if err != nil {
		return fmt.Errorf("encode script-instance lease: %w", err)
	}
	if err := file.Truncate(0); err != nil {
		return fmt.Errorf("clear script-instance lease: %w", err)
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("seek script-instance lease: %w", err)
	}
	if _, err := file.Write(append(encoded, '\n')); err != nil {
		return fmt.Errorf("write script-instance lease: %w", err)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync script-instance lease: %w", err)
	}
	return nil
}

func readScriptInstanceInfo(file *os.File) (scriptInstanceInfo, error) {
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return scriptInstanceInfo{}, err
	}
	data, err := io.ReadAll(io.LimitReader(file, 4096))
	if err != nil {
		return scriptInstanceInfo{}, err
	}
	var info scriptInstanceInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return scriptInstanceInfo{}, err
	}
	if info.Version != 1 || info.Port <= 0 || len(info.Token) != 64 {
		return scriptInstanceInfo{}, errors.New("invalid script-instance lease")
	}
	return info, nil
}

func requestScriptInstanceTakeover(info scriptInstanceInfo) bool {
	token, err := hex.DecodeString(info.Token)
	if err != nil || len(token) != 32 || info.Port <= 0 {
		return false
	}
	connection, err := net.DialTimeout("tcp4", net.JoinHostPort("127.0.0.1", fmt.Sprint(info.Port)), 400*time.Millisecond)
	if err != nil {
		return false
	}
	defer connection.Close()
	if err := connection.SetDeadline(time.Now().Add(time.Second)); err != nil {
		return false
	}
	if err := json.NewEncoder(connection).Encode(scriptInstanceControlRequest{Command: "takeover", Token: hex.EncodeToString(token)}); err != nil {
		return false
	}
	var response scriptInstanceControlResponse
	if err := json.NewDecoder(io.LimitReader(connection, 4096)).Decode(&response); err != nil {
		return false
	}
	return response.Accepted
}

func (lease *scriptInstanceLease) serveTakeoverRequests() {
	for {
		connection, err := lease.listener.Accept()
		if err != nil {
			return
		}
		lease.handleTakeoverRequest(connection)
	}
}

func (lease *scriptInstanceLease) handleTakeoverRequest(connection net.Conn) {
	defer connection.Close()
	_ = connection.SetDeadline(time.Now().Add(time.Second))
	var request scriptInstanceControlRequest
	if err := json.NewDecoder(io.LimitReader(connection, 4096)).Decode(&request); err != nil {
		return
	}
	token, err := hex.DecodeString(request.Token)
	if err != nil || request.Command != "takeover" || !hmac.Equal(token, lease.token) {
		_ = json.NewEncoder(connection).Encode(scriptInstanceControlResponse{Accepted: false})
		return
	}
	_ = json.NewEncoder(connection).Encode(scriptInstanceControlResponse{Accepted: true})
	lease.replaced.Store(true)
	if lease.cancel != nil {
		lease.cancel()
	}
}

func (lease *scriptInstanceLease) WasReplaced() bool {
	return lease != nil && lease.replaced.Load()
}

func (lease *scriptInstanceLease) Close() {
	if lease == nil {
		return
	}
	lease.closeOnce.Do(func() {
		if lease.listener != nil {
			_ = lease.listener.Close()
		}
		if lease.file != nil {
			unlockScriptInstanceFile(lease.file)
			_ = lease.file.Close()
		}
	})
}
