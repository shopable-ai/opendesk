//go:build darwin && cgo

package nativeextension

import (
	"os/exec"
	"path/filepath"
	"testing"
)

func TestValidatePlatformACLRejectsMissingPath(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "missing")
	if err := validatePlatformACL(missing); err == nil {
		t.Fatalf("missing path passed extended ACL validation")
	}
}

func TestDiscoverRejectsExtendedACLAllowEntry(t *testing.T) {
	root := secureTestRoot(t)
	writeTestBundle(t, root, "com.example.acl-allow", "aclAllow", "bin/ext", "#!/bin/sh\nexit 0\n")
	if err := validatePlatformACL(root); err != nil {
		t.Fatalf("baseline ACL inspection: %v", err)
	}
	setDarwinACL(t, root, "everyone allow write,add_file,delete_child")

	registry, err := Discover(DiscoveryOptions{Roots: []DiscoveryRoot{{Kind: RootTest, Path: root}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(registry.Plugins()) != 0 {
		t.Fatalf("ACL-writable root was discovered: %#v", registry.Plugins())
	}
	diagnostics := registry.Diagnostics()
	if len(diagnostics) != 1 || diagnostics[0].Status != "rejected" || diagnostics[0].ErrorCode != "unsafe_root" {
		t.Fatalf("ACL rejection diagnostic = %#v", diagnostics)
	}
}

func TestDiscoverAllowsDenyOnlyExtendedACL(t *testing.T) {
	root := secureTestRoot(t)
	writeTestBundle(t, root, "com.example.acl-deny", "aclDeny", "bin/ext", "#!/bin/sh\nexit 0\n")
	setDarwinACL(t, root, "everyone deny delete")
	if err := validatePlatformACL(root); err != nil {
		t.Fatalf("deny-only ACL inspection: %v", err)
	}

	registry, err := Discover(DiscoveryOptions{Roots: []DiscoveryRoot{{Kind: RootTest, Path: root}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := registry.Lookup("com.example.acl-deny"); !ok {
		t.Fatalf("deny-only ACL was rejected: %#v", registry.Diagnostics())
	}
}

func TestDiscoverRejectsExtendedACLAllowEntryAtEveryTrustedPath(t *testing.T) {
	for _, location := range []string{"ancestor", "root", "bundle", "manifest", "bin", "executable"} {
		t.Run(location, func(t *testing.T) {
			root := secureTestRoot(t)
			plugin := writeTestBundle(t, root, "com.example.acl-"+location, "acl"+location, "bin/ext", "#!/bin/sh\nexit 0\n")
			bundle := plugin.BundlePath
			var target string
			switch location {
			case "ancestor":
				target = filepath.Dir(root)
			case "root":
				target = root
			case "bundle":
				target = bundle
			case "manifest":
				target = filepath.Join(bundle, "extension.json")
			case "bin":
				target = filepath.Dir(plugin.ExecutablePath)
			case "executable":
				target = plugin.ExecutablePath
			}
			setDarwinACL(t, target, "everyone allow write,add_file,delete_child")

			registry, err := Discover(DiscoveryOptions{Roots: []DiscoveryRoot{{Kind: RootTest, Path: root}}})
			if err != nil {
				t.Fatal(err)
			}
			if len(registry.Plugins()) != 0 {
				t.Fatalf("ACL-writable %s was discovered: %#v", location, registry.Plugins())
			}
		})
	}
}

func TestValidateArtifactRejectsACLAllowEntryAddedAfterDiscovery(t *testing.T) {
	root := secureTestRoot(t)
	plugin := writeTestBundle(t, root, "com.example.acl-replacement", "aclReplacement", "bin/ext", "#!/bin/sh\nexit 0\n")
	registry, err := Discover(DiscoveryOptions{Roots: []DiscoveryRoot{{Kind: RootTest, Path: root}}})
	if err != nil {
		t.Fatal(err)
	}
	setDarwinACL(t, plugin.ExecutablePath, "everyone allow write,add_file,delete_child")
	if _, err := registry.ValidateArtifact(plugin.ID); err == nil {
		t.Fatal("artifact accepted after its executable gained an ACL allow entry")
	}
}

func setDarwinACL(t *testing.T, path, entry string) {
	t.Helper()
	if output, err := exec.Command("/bin/chmod", "+a", entry, path).CombinedOutput(); err != nil {
		t.Fatalf("add test ACL: %v: %s", err, output)
	}
	t.Cleanup(func() {
		_ = exec.Command("/bin/chmod", "-N", path).Run()
	})
}
