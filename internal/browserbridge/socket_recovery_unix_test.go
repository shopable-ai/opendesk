//go:build darwin || linux

package browserbridge

import (
	"bytes"
	"context"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
)

func recoveryFixture(t *testing.T) (Installation, SocketRecoveryOptions) {
	t.Helper()
	home := isolatedInstanceHome(t)
	unsetNativeInstance(t)
	if _, err := Setup(testExtensionID, "chrome", "", fakeExecutable(t, home)); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	workspace := filepath.Join(home, "workspace")
	if err = os.Mkdir(workspace, 0700); err != nil {
		t.Fatal(err)
	}
	workspace, err = filepath.EvalSymlinks(workspace)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = WorkspaceAdd(workspace, "read-only"); err != nil {
		t.Fatal(err)
	}
	listener, err := net.ListenUnix("unix", &net.UnixAddr{Name: cfg.SocketPath, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	listener.SetUnlinkOnClose(false)
	if err = os.Chmod(cfg.SocketPath, 0600); err != nil {
		t.Fatal(err)
	}
	if err = listener.Close(); err != nil {
		t.Fatal(err)
	}
	info, err := os.Lstat(cfg.SocketPath)
	if err != nil {
		t.Fatal(err)
	}
	s := info.Sys().(*syscall.Stat_t)
	return cfg, SocketRecoveryOptions{ExtensionID: cfg.ExtensionID, ExpectedDevice: uint64(s.Dev), ExpectedInode: s.Ino, LegacyQuiesced: true}
}

func preservedInstallation(t *testing.T, cfg Installation) func() {
	t.Helper()
	manifest, err := ManifestFor(cfg.Browser, cfg.UserDataDir)
	if err != nil {
		t.Fatal(err)
	}
	paths := []string{configPath(), filepath.Join(cfg.InstallRoot, "native-host"), manifest, workspaceStorePath(cfg)}
	before := make(map[string][]byte)
	for _, p := range paths {
		before[p], err = os.ReadFile(p)
		if err != nil {
			t.Fatal(err)
		}
	}
	return func() {
		for _, p := range paths {
			after, err := os.ReadFile(p)
			if err != nil || !bytes.Equal(before[p], after) {
				t.Fatalf("installation or grant bytes changed: %s: %v", p, err)
			}
		}
	}
}

func TestRecoverSocketDryRunThenExactOrphan(t *testing.T) {
	cfg, options := recoveryFixture(t)
	unchanged := preservedInstallation(t, cfg)
	before, _ := os.Lstat(cfg.SocketPath)
	options.DryRun = true
	preview, err := RecoverSocketContext(context.Background(), options)
	if err != nil || preview["changed"] != false || preview["legacyQuiescenceRequired"] != true {
		t.Fatalf("preview: %v %v", preview, err)
	}
	after, _ := os.Lstat(cfg.SocketPath)
	if !os.SameFile(before, after) {
		t.Fatal("dry run replaced socket")
	}
	unchanged()
	options.DryRun = false
	receipt, err := RecoverSocketContext(context.Background(), options)
	if err != nil || receipt["changed"] != true || receipt["requestReconciled"] != false {
		t.Fatalf("recovery: %v %v", receipt, err)
	}
	if _, err = os.Lstat(cfg.SocketPath); !os.IsNotExist(err) {
		t.Fatalf("orphan remains: %v", err)
	}
	unchanged()
	if _, err = RecoverSocketContext(context.Background(), options); err == nil {
		t.Fatal("old identity silently accepted after recovery")
	}
	// A later normal Host can bind the original path; recovery never runs it.
	h, err := NewHost(cfg, "chrome-extension://"+cfg.ExtensionID+"/", strings.NewReader(""), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer h.Close()
	if err = h.startSocket(); err != nil {
		t.Fatal(err)
	}
}

func TestRecoverSocketRejectsUnprovenOrChangedIdentity(t *testing.T) {
	for _, kind := range []string{"quiescence", "device", "inode", "extension", "cancelled"} {
		t.Run(kind, func(t *testing.T) {
			cfg, options := recoveryFixture(t)
			unchanged := preservedInstallation(t, cfg)
			before, _ := os.Lstat(cfg.SocketPath)
			ctx := context.Background()
			switch kind {
			case "quiescence":
				options.LegacyQuiesced = false
			case "device":
				options.ExpectedDevice++
			case "inode":
				options.ExpectedInode++
			case "extension":
				options.ExtensionID = strings.Repeat("b", 32)
			case "cancelled":
				var cancel context.CancelFunc
				ctx, cancel = context.WithCancel(ctx)
				cancel()
			}
			if _, err := RecoverSocketContext(ctx, options); err == nil {
				t.Fatal("unsafe recovery accepted")
			}
			after, _ := os.Lstat(cfg.SocketPath)
			if !os.SameFile(before, after) {
				t.Fatal("refusal changed socket")
			}
			unchanged()
		})
	}
}

func TestRecoverSocketRejectsActiveOrNotReadyHost(t *testing.T) {
	for _, kind := range []string{"legacy-listener", "lifecycle-lock", "host-before-welcome"} {
		t.Run(kind, func(t *testing.T) {
			cfg, options := recoveryFixture(t)
			unchanged := preservedInstallation(t, cfg)
			if kind == "legacy-listener" {
				if err := os.Remove(cfg.SocketPath); err != nil {
					t.Fatal(err)
				}
				ln, err := net.ListenUnix("unix", &net.UnixAddr{Name: cfg.SocketPath, Net: "unix"})
				if err != nil {
					t.Fatal(err)
				}
				defer ln.Close()
				if err = os.Chmod(cfg.SocketPath, 0600); err != nil {
					t.Fatal(err)
				}
				s, _ := os.Lstat(cfg.SocketPath)
				st := s.Sys().(*syscall.Stat_t)
				options.ExpectedDevice = uint64(st.Dev)
				options.ExpectedInode = st.Ino
			} else if kind == "lifecycle-lock" {
				release, err := lockSocketLifecycle(cfg.InstallRoot)
				if err != nil {
					t.Fatal(err)
				}
				defer release()
			} else {
				if err := os.Remove(cfg.SocketPath); err != nil {
					t.Fatal(err)
				}
				h, err := NewHost(cfg, "chrome-extension://"+cfg.ExtensionID+"/", strings.NewReader(""), io.Discard)
				if err != nil {
					t.Fatal(err)
				}
				defer h.Close()
				if err = h.startSocket(); err != nil {
					t.Fatal(err)
				}
				s, _ := os.Lstat(cfg.SocketPath)
				st := s.Sys().(*syscall.Stat_t)
				options.ExpectedDevice = uint64(st.Dev)
				options.ExpectedInode = st.Ino
				if _, err = Setup(cfg.ExtensionID, cfg.Browser, cfg.UserDataDir, cfg.Executable); err == nil {
					t.Fatal("update raced active Host")
				}
			}
			before, _ := os.Lstat(cfg.SocketPath)
			if _, err := RecoverSocketContext(context.Background(), options); err == nil {
				t.Fatal("active or starting Host accepted")
			}
			after, _ := os.Lstat(cfg.SocketPath)
			if !os.SameFile(before, after) {
				t.Fatal("live socket replaced")
			}
			unchanged()
		})
	}
}

func TestRecoverSocketRejectsUnsafeObjectsAndJournalWithoutRollback(t *testing.T) {
	for _, kind := range []string{"regular", "symlink", "permissions", "journal"} {
		t.Run(kind, func(t *testing.T) {
			cfg, options := recoveryFixture(t)
			unchanged := preservedInstallation(t, cfg)
			switch kind {
			case "regular":
				os.Remove(cfg.SocketPath)
				if err := os.WriteFile(cfg.SocketPath, []byte("foreign"), 0600); err != nil {
					t.Fatal(err)
				}
			case "symlink":
				os.Remove(cfg.SocketPath)
				if err := os.Symlink(configPath(), cfg.SocketPath); err != nil {
					t.Fatal(err)
				}
			case "permissions":
				if err := os.Chmod(cfg.SocketPath, 0666); err != nil {
					t.Fatal(err)
				}
			case "journal":
				dir, _ := installTransactionDir()
				if err := os.WriteFile(filepath.Join(dir, "journal.json"), []byte("{}"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			before, _ := os.Lstat(cfg.SocketPath)
			if _, err := RecoverSocketContext(context.Background(), options); err == nil {
				t.Fatal("unsafe object accepted")
			}
			after, _ := os.Lstat(cfg.SocketPath)
			if !os.SameFile(before, after) {
				t.Fatal("unsafe socket changed")
			}
			unchanged()
			if kind == "journal" {
				dir, _ := installTransactionDir()
				b, err := os.ReadFile(filepath.Join(dir, "journal.json"))
				if err != nil || string(b) != "{}" {
					t.Fatal("socket-only recovery changed install journal")
				}
			}
		})
	}
}

func TestRecoverSocketConcurrentAttemptsRetireOnlyOnce(t *testing.T) {
	cfg, options := recoveryFixture(t)
	unchanged := preservedInstallation(t, cfg)
	start := make(chan struct{})
	answers := make(chan error, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := RecoverSocketContext(context.Background(), options)
			answers <- err
		}()
	}
	close(start)
	wg.Wait()
	close(answers)
	success := 0
	for err := range answers {
		if err == nil {
			success++
		}
	}
	if success != 1 {
		t.Fatalf("retired socket %d times", success)
	}
	if _, err := os.Lstat(cfg.SocketPath); !os.IsNotExist(err) {
		t.Fatalf("orphan remains: %v", err)
	}
	unchanged()
}

func TestRecoverSocketRejectsDirectoryAndSocketReplacement(t *testing.T) {
	for _, kind := range []string{"directory", "socket", "lock-symlink"} {
		t.Run(kind, func(t *testing.T) {
			cfg, _ := recoveryFixture(t)
			before, err := os.Lstat(cfg.SocketPath)
			if err != nil {
				t.Fatal(err)
			}
			if kind == "lock-symlink" {
				lock := filepath.Join(cfg.InstallRoot, socketLifecycleLockName)
				if err = os.Symlink(configPath(), lock); err != nil {
					t.Fatal(err)
				}
				if release, err := lockSocketLifecycle(cfg.InstallRoot); err == nil {
					release()
					t.Fatal("symlink lifecycle lock accepted")
				}
				return
			}
			directory, err := os.Open(cfg.InstallRoot)
			if err != nil {
				t.Fatal(err)
			}
			defer directory.Close()
			if kind == "directory" {
				if err = os.Rename(cfg.InstallRoot, cfg.InstallRoot+"-original"); err != nil {
					t.Fatal(err)
				}
				if err = os.Mkdir(cfg.InstallRoot, 0700); err != nil {
					t.Fatal(err)
				}
			} else {
				if err = os.Remove(cfg.SocketPath); err != nil {
					t.Fatal(err)
				}
				if err = os.WriteFile(cfg.SocketPath, []byte("foreign"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			if err = recoverySocketStillMatches(cfg, directory, before); err == nil {
				t.Fatal("replacement accepted")
			}
		})
	}
}
