//go:build darwin || linux

package browserbridge

import (
	"context"
	"errors"
	"net"
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

const socketLifecycleLockName = "host-lifecycle.lock"

// Host holds this lock from before bind until after its owned socket cleanup.
// Installers take their global lock first, then this instance lock. Host never
// acquires the global installation lock while holding its lifetime lock.
// Never unlink the lock file: replacing it would split the exclusion domain.
func lockSocketLifecycle(root string) (func(), error) {
	if err := requireDir(root); err != nil {
		return nil, err
	}
	path := filepath.Join(root, socketLifecycleLockName)
	fd, err := syscall.Open(path, syscall.O_CREAT|syscall.O_RDWR|syscall.O_CLOEXEC|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0600)
	if err != nil {
		return nil, err
	}
	f := os.NewFile(uintptr(fd), path)
	fail := func(err error) (func(), error) { _ = f.Close(); return nil, err }
	opened, err := f.Stat()
	if err != nil {
		return fail(err)
	}
	current, err := requireRegular(path, 0600)
	if err != nil {
		return fail(err)
	}
	stat, ok := opened.Sys().(*syscall.Stat_t)
	if !ok || stat.Nlink != 1 || !os.SameFile(opened, current) {
		return fail(errors.New("E_SOCKET_LOCK_INVALID"))
	}
	if err = syscall.Flock(fd, syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		return fail(errors.New("E_SOCKET_IN_USE"))
	}
	current, err = os.Lstat(path)
	if err != nil || !os.SameFile(opened, current) {
		return fail(errors.New("E_SOCKET_LOCK_INVALID"))
	}
	var once sync.Once
	return func() { once.Do(func() { _ = syscall.Flock(fd, syscall.LOCK_UN); _ = f.Close() }) }, nil
}

func recoverySocketStillMatches(cfg Installation, directory *os.File, socket os.FileInfo) error {
	opened, err := directory.Stat()
	if err != nil {
		return err
	}
	current, err := os.Lstat(cfg.InstallRoot)
	if err != nil || !os.SameFile(opened, current) || requireDir(cfg.InstallRoot) != nil {
		return errors.New("E_SOCKET_CHANGED")
	}
	want, ok := socket.Sys().(*syscall.Stat_t)
	var now unix.Stat_t
	if !ok || unix.Fstatat(int(directory.Fd()), "agent.sock", &now, unix.AT_SYMLINK_NOFOLLOW) != nil ||
		uint64(now.Dev) != uint64(want.Dev) || now.Ino != want.Ino || now.Mode&unix.S_IFMT != unix.S_IFSOCK ||
		now.Mode&0777 != 0600 || int(now.Uid) != os.Getuid() {
		return errors.New("E_SOCKET_CHANGED")
	}
	return nil
}

// RecoverSocketContext never performs setup, cleanup, connection registration,
// grant writes or AI operations. LegacyQuiesced is an explicit administrator
// assertion that the old Host AND its launching side were safely quiesced.
// Refused connection / no listener alone cannot supply that assertion.
func RecoverSocketContext(ctx context.Context, options SocketRecoveryOptions) (map[string]any, error) {
	if !ExtensionIDValid(options.ExtensionID) {
		return nil, errors.New("E_EXTENSION_ID")
	}
	if !options.DryRun && (!options.LegacyQuiesced || options.ExpectedDevice == 0 || options.ExpectedInode == 0) {
		return nil, errors.New("E_SOCKET_RECOVERY_PRECONDITION")
	}
	// Socket-only recovery must reject, not automatically roll back, an
	// installation journal. Identity/grant files remain the exact same bytes.
	return withInstallLockPolicy(ctx, true, false, func() (map[string]any, error) {
		cfg, err := loadInstallation()
		if err != nil {
			return nil, err
		}
		if cfg.ExtensionID != options.ExtensionID {
			return nil, errors.New("E_EXTENSION_ID_CONFLICT")
		}
		info, err := os.Lstat(cfg.SocketPath)
		if err != nil {
			return nil, err
		}
		stat, ok := info.Sys().(*syscall.Stat_t)
		if !ok || info.Mode()&os.ModeSocket == 0 || !userOwned(info) || info.Mode().Perm() != 0600 {
			return nil, errors.New("E_SOCKET_INVALID")
		}
		if options.ExpectedDevice != 0 && options.ExpectedDevice != uint64(stat.Dev) ||
			options.ExpectedInode != 0 && options.ExpectedInode != stat.Ino {
			return nil, errors.New("E_SOCKET_CHANGED")
		}
		fd, err := syscall.Open(cfg.InstallRoot, syscall.O_RDONLY|syscall.O_DIRECTORY|syscall.O_CLOEXEC|syscall.O_NOFOLLOW, 0)
		if err != nil {
			return nil, err
		}
		directory := os.NewFile(uintptr(fd), cfg.InstallRoot)
		defer directory.Close()
		if err = recoverySocketStillMatches(cfg, directory, info); err != nil {
			return nil, err
		}
		dialer := net.Dialer{Timeout: 250 * time.Millisecond}
		connection, err := dialer.DialContext(ctx, "unix", cfg.SocketPath)
		if err == nil {
			_ = connection.Close()
			return nil, errors.New("E_SOCKET_IN_USE")
		}
		if !errors.Is(err, syscall.ECONNREFUSED) {
			return nil, errors.New("E_SOCKET_RECOVERY_UNCERTAIN")
		}
		if err = ctx.Err(); err != nil {
			return nil, err
		}
		if err = recoverySocketStillMatches(cfg, directory, info); err != nil {
			return nil, err
		}
		receipt := map[string]any{"changed": false, "extensionId": cfg.ExtensionID, "browser": cfg.Browser,
			"device": uint64(stat.Dev), "inode": stat.Ino, "legacyQuiescenceRequired": true, "requestReconciled": false}
		if options.DryRun {
			receipt["state"] = "orphan-candidate"
			return receipt, nil
		}
		// Relative unlink stays anchored to the checked directory even if its
		// pathname is replaced. Exclusion covers cooperating owners; it does
		// not claim protection against arbitrary same-UID filesystem mutation.
		if err = unix.Unlinkat(fd, "agent.sock", 0); err != nil {
			return nil, err
		}
		if err = directory.Sync(); err != nil {
			return nil, &CallError{Code: "E_SOCKET_RECOVERY_UNKNOWN", Outcome: "OUTCOME_UNKNOWN"}
		}
		receipt["state"] = "socket-retired"
		receipt["changed"] = true
		return receipt, nil
	})
}
