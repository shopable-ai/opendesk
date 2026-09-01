//go:build !windows

package nativeextension

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

func validateTrustedAncestorDirectories(path string) error {
	for current := filepath.Dir(filepath.Clean(path)); ; current = filepath.Dir(current) {
		info, err := os.Lstat(current)
		if err != nil {
			return err
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("%s must be a real ancestor directory", current)
		}
		stat, ok := info.Sys().(*syscall.Stat_t)
		if !ok {
			return fmt.Errorf("%s ownership is unavailable", current)
		}
		uid := uint32(os.Geteuid())
		if stat.Uid != uid && stat.Uid != 0 {
			return fmt.Errorf("%s ancestor is not owned by the current user or root", current)
		}
		if info.Mode().Perm()&0o022 != 0 {
			rootOwnedSticky := stat.Uid == 0 && info.Mode()&os.ModeSticky != 0
			if !rootOwnedSticky {
				return fmt.Errorf("%s ancestor is group/world writable without root-owned sticky protection", current)
			}
		}
		if err := validatePlatformACL(current); err != nil {
			return err
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
	}
	return nil
}

func validateSecureDirectory(path string, info os.FileInfo) error {
	if info == nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("%s must be a real directory", path)
	}
	return validateSecureOwnershipAndMode(path, info, false)
}

func validateSecureRegularFile(path string, info os.FileInfo, executable bool) error {
	if info == nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("%s must be a real regular file", path)
	}
	if err := validateSecureOwnershipAndMode(path, info, executable); err != nil {
		return err
	}
	if executable && info.Mode().Perm()&0o111 == 0 {
		return fmt.Errorf("%s is not executable", path)
	}
	return nil
}

func validateSecureOwnershipAndMode(path string, info os.FileInfo, executable bool) error {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return fmt.Errorf("%s ownership is unavailable", path)
	}
	uid := uint32(os.Geteuid())
	if stat.Uid != uid && stat.Uid != 0 {
		return fmt.Errorf("%s is not owned by the current user or root", path)
	}
	if info.Mode().Perm()&0o022 != 0 {
		return fmt.Errorf("%s is group/world writable", path)
	}
	if info.Mode()&(os.ModeSetuid|os.ModeSetgid) != 0 {
		return fmt.Errorf("%s has setuid/setgid bits", path)
	}
	if err := validatePlatformACL(path); err != nil {
		return err
	}
	return nil
}
