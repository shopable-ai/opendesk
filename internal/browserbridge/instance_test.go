//go:build darwin || linux

package browserbridge

import (
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func isolatedInstanceHome(t *testing.T) string {
	t.Helper()
	home, err := os.MkdirTemp("/tmp", "od-inst-instance-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(home) })
	if err = os.Chmod(home, 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)
	return home
}

func unsetNativeInstance(t *testing.T) {
	t.Helper()
	old, ok := os.LookupEnv("OPENDESK_NATIVE_INSTANCE")
	if err := os.Unsetenv("OPENDESK_NATIVE_INSTANCE"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if ok {
			_ = os.Setenv("OPENDESK_NATIVE_INSTANCE", old)
		} else {
			_ = os.Unsetenv("OPENDESK_NATIVE_INSTANCE")
		}
	})
}

func cftProfile(t *testing.T, home, name string) string {
	t.Helper()
	profile := filepath.Join(home, name)
	if err := os.MkdirAll(profile, 0700); err != nil {
		t.Fatal(err)
	}
	return profile
}

func fakeExecutable(t *testing.T, home string) string {
	t.Helper()
	out := filepath.Join(home, "launcher-instance.txt")
	exe := filepath.Join(home, "fake-opendesk")
	body := "#!/bin/sh\nprintf '%s' \"${OPENDESK_NATIVE_INSTANCE-}\" > " + shellQuote(out) + "\n"
	if err := os.WriteFile(exe, []byte(body), 0700); err != nil {
		t.Fatal(err)
	}
	return exe
}

func fakeExecutableAt(t *testing.T, path string) string {
	t.Helper()
	body := "#!/bin/sh\nexit 0\n"
	if err := os.WriteFile(path, []byte(body), 0700); err != nil {
		t.Fatal(err)
	}
	realPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		t.Fatal(err)
	}
	return realPath
}

func TestNativeInstanceValidationAndRoots(t *testing.T) {
	home := isolatedInstanceHome(t)
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("OPENDESK_NATIVE_INSTANCE", "alpha-1")
	profile := cftProfile(t, home, "alpha-profile")
	if _, err = Setup(testExtensionID, "cft", profile, binary); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	wantRoot := filepath.Join(home, ".opendesk-browser", "native-agent-instances", "alpha-1")
	if cfg.InstallRoot != wantRoot || cfg.SocketPath != filepath.Join(wantRoot, "agent.sock") {
		t.Fatalf("wrong instance root: %#v", cfg)
	}

	for _, bad := range []string{"", "Alpha", "a_b", "a/../b", "a" + strings.Repeat("b", 32), "-bad", "."} {
		t.Setenv("OPENDESK_NATIVE_INSTANCE", bad)
		if _, err = Setup(testExtensionID, "cft", profile, binary); err == nil || err.Error() != "E_INSTALL_INSTANCE" {
			t.Fatalf("invalid instance %q did not fail closed: %v", bad, err)
		}
		if _, err = Load(); err == nil || err.Error() != "E_INSTALL_INSTANCE" {
			t.Fatalf("invalid instance %q did not block load: %v", bad, err)
		}
	}
}

func TestNativeInstanceRequiresExplicitCFTProfile(t *testing.T) {
	home := isolatedInstanceHome(t)
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("OPENDESK_NATIVE_INSTANCE", "work")
	profile := cftProfile(t, home, "work-profile")
	if _, err = Setup(testExtensionID, "chrome", profile, binary); err == nil || err.Error() != "E_INSTANCE_PROFILE" {
		t.Fatalf("named chrome install must fail closed: %v", err)
	}
	if _, err = Setup(testExtensionID, "cft", "", binary); err == nil || err.Error() != "E_INSTANCE_PROFILE" {
		t.Fatalf("named install without explicit profile must fail closed: %v", err)
	}
	if _, err = SetupAutomatic(testExtensionID, "cft", "", binary); err == nil || err.Error() != "E_INSTANCE_PROFILE" {
		t.Fatalf("named automatic setup without explicit profile must fail closed: %v", err)
	}
}

func TestNamedAutomaticSetupInheritsExistingCFTProfileBeforeValidation(t *testing.T) {
	home := isolatedInstanceHome(t)
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("OPENDESK_NATIVE_INSTANCE", "work")
	profile := cftProfile(t, home, "work-profile")
	if _, err = Setup(testExtensionID, "cft", profile, binary); err != nil {
		t.Fatal(err)
	}
	original, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = SetupAutomatic("", "", "", binary); err != nil {
		t.Fatalf("named automatic setup did not inherit saved cft profile: %v", err)
	}
	after, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if after.Browser != "cft" || after.UserDataDir != original.UserDataDir || after.ClientCredential != original.ClientCredential {
		t.Fatalf("automatic setup drifted saved binding: before=%#v after=%#v", original, after)
	}
}

func TestNativeInstanceDefaultAndNamedInstallationsAreIsolated(t *testing.T) {
	home := isolatedInstanceHome(t)
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	unsetNativeInstance(t)
	if _, err = Setup(testExtensionID, "chrome", "", binary); err != nil {
		t.Fatal(err)
	}
	defaultCfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if defaultCfg.InstallRoot != filepath.Join(home, ".opendesk-browser", "native-agent-r1") {
		t.Fatalf("default root migrated: %#v", defaultCfg)
	}

	t.Setenv("OPENDESK_NATIVE_INSTANCE", "work")
	profile := cftProfile(t, home, "cft-profile")
	if _, err = Setup(testExtensionID, "cft", profile, binary); err != nil {
		t.Fatal(err)
	}
	instanceCfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if instanceCfg.InstallRoot == defaultCfg.InstallRoot || instanceCfg.SocketPath == defaultCfg.SocketPath {
		t.Fatalf("instance reused default paths: default=%#v instance=%#v", defaultCfg, instanceCfg)
	}
	if _, err = os.Stat(filepath.Join(defaultCfg.InstallRoot, "install.json")); err != nil {
		t.Fatalf("default install missing after instance setup: %v", err)
	}
}

func TestSetupUpdateValidatesExistingWrapperWithPriorExecutable(t *testing.T) {
	home := isolatedInstanceHome(t)
	unsetNativeInstance(t)
	exe1 := fakeExecutableAt(t, filepath.Join(home, "opendesk-old"))
	exe2 := fakeExecutableAt(t, filepath.Join(home, "opendesk-new"))
	if _, err := Setup(testExtensionID, "chrome", "", exe1); err != nil {
		t.Fatal(err)
	}
	before, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if before.Executable != exe1 {
		t.Fatalf("unexpected initial executable: %#v", before)
	}
	if _, err = Setup(testExtensionID, "chrome", "", exe2); err != nil {
		t.Fatalf("update rejected old wrapper before rewrite: %v", err)
	}
	after, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if after.Executable != exe2 || after.ClientCredential != before.ClientCredential {
		t.Fatalf("update did not preserve identity and rewrite executable: before=%#v after=%#v", before, after)
	}
	wrapperBytes, err := os.ReadFile(filepath.Join(after.InstallRoot, "native-host"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(wrapperBytes), shellQuote(exe2)) {
		t.Fatalf("wrapper was not rewritten to new executable:\n%s", wrapperBytes)
	}
}

func TestNativeHostLauncherPinsInstanceEnvironment(t *testing.T) {
	for _, tc := range []struct {
		name     string
		instance string
		want     string
		needle   string
	}{
		{name: "default", want: "", needle: "unset OPENDESK_NATIVE_INSTANCE"},
		{name: "named", instance: "qa-2", want: "qa-2", needle: "OPENDESK_NATIVE_INSTANCE='qa-2'"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			home := isolatedInstanceHome(t)
			exe := fakeExecutable(t, home)
			if tc.instance == "" {
				unsetNativeInstance(t)
			} else {
				t.Setenv("OPENDESK_NATIVE_INSTANCE", tc.instance)
			}
			browser := "chrome"
			profile := ""
			if tc.instance != "" {
				browser = "cft"
				profile = cftProfile(t, home, "launcher-profile")
			}
			if _, err := Setup(testExtensionID, browser, profile, exe); err != nil {
				t.Fatal(err)
			}
			wrapper := filepath.Join(installRoot(), "native-host")
			bytes, err := os.ReadFile(wrapper)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(string(bytes), tc.needle) {
				t.Fatalf("launcher missing fixed instance directive %q:\n%s", tc.needle, string(bytes))
			}
			cmd := exec.Command(wrapper, "chrome-extension://"+testExtensionID+"/")
			cmd.Env = append(os.Environ(), "OPENDESK_NATIVE_INSTANCE=polluted")
			if out, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("launcher failed: %v\n%s", err, out)
			}
			got, err := os.ReadFile(filepath.Join(home, "launcher-instance.txt"))
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != tc.want {
				t.Fatalf("launcher instance = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestNamedInstanceSetupPreservesDefaultNodeOwner(t *testing.T) {
	home := isolatedInstanceHome(t)
	defaultRoot := filepath.Join(home, ".opendesk-browser", "native-agent-r1")
	if err := os.MkdirAll(defaultRoot, 0700); err != nil {
		t.Fatal(err)
	}
	nodeInstall := filepath.Join(defaultRoot, "install.json")
	nodeBytes := []byte(`{"provider":"node","installRoot":"keep-me"}`)
	if err := os.WriteFile(nodeInstall, nodeBytes, 0600); err != nil {
		t.Fatal(err)
	}
	ln, err := net.ListenUnix("unix", &net.UnixAddr{Name: filepath.Join(defaultRoot, "agent.sock"), Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	ln.SetUnlinkOnClose(true)
	t.Cleanup(func() { _ = ln.Close() })
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("OPENDESK_NATIVE_INSTANCE", "agent-a")
	profile := cftProfile(t, home, "agent-profile")
	if _, err = Setup(testExtensionID, "cft", profile, binary); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(nodeInstall)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(nodeBytes) {
		t.Fatal("named instance setup mutated default Node installation")
	}
	if _, err = os.Stat(filepath.Join(home, ".opendesk-browser", "native-agent-instances", "agent-a", "install.json")); err != nil {
		t.Fatalf("named instance install missing: %v", err)
	}
}

func TestDefaultNodeSocketBlocksDefaultSetup(t *testing.T) {
	home := isolatedInstanceHome(t)
	unsetNativeInstance(t)
	defaultRoot := filepath.Join(home, ".opendesk-browser", "native-agent-r1")
	if err := os.MkdirAll(defaultRoot, 0700); err != nil {
		t.Fatal(err)
	}
	ln, err := net.ListenUnix("unix", &net.UnixAddr{Name: filepath.Join(defaultRoot, "agent.sock"), Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	ln.SetUnlinkOnClose(true)
	t.Cleanup(func() { _ = ln.Close() })
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = Setup(testExtensionID, "chrome", "", binary); err == nil || err.Error() != "E_SOCKET_IN_USE" {
		t.Fatalf("default Node socket was not protected: %v", err)
	}
}

func TestNativeInstallRejectsUnsafeBrowserBaseAncestor(t *testing.T) {
	home := isolatedInstanceHome(t)
	unsetNativeInstance(t)
	target := filepath.Join(home, "elsewhere")
	if err := os.Mkdir(target, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(home, ".opendesk-browser")); err != nil {
		t.Fatal(err)
	}
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = Setup(testExtensionID, "chrome", "", binary); err == nil || err.Error() != "E_INSTALL_PERMISSIONS" {
		t.Fatalf("unsafe browser base ancestor was not rejected: %v", err)
	}
}

func TestNativeInstallRejectsForgedWrapperButAcceptsDefaultLegacyWrapper(t *testing.T) {
	isolatedInstanceHome(t)
	unsetNativeInstance(t)
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = Setup(testExtensionID, "chrome", "", binary); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	wrapper := filepath.Join(cfg.InstallRoot, "native-host")
	legacy := "#!/bin/sh\nexec " + shellQuote(cfg.Executable) + " browser native-host \"$@\"\n"
	if err = os.WriteFile(wrapper, []byte(legacy), 0700); err != nil {
		t.Fatal(err)
	}
	if _, err = Load(); err != nil {
		t.Fatalf("default legacy wrapper rejected: %v", err)
	}
	if _, err = Setup(testExtensionID, "chrome", "", binary); err != nil {
		t.Fatalf("default legacy wrapper blocked update: %v", err)
	}
	forged := "#!/bin/sh\n# browser native-host \nexec /bin/false\n"
	if err = os.WriteFile(wrapper, []byte(forged), 0700); err != nil {
		t.Fatal(err)
	}
	if _, err = Load(); err == nil || err.Error() != "E_MIGRATION_REQUIRED" {
		t.Fatalf("forged wrapper accepted by Load: %v", err)
	}
	if _, err = Setup(testExtensionID, "chrome", "", binary); err == nil || err.Error() != "E_MIGRATION_REQUIRED" {
		t.Fatalf("forged wrapper accepted by Setup: %v", err)
	}
}
