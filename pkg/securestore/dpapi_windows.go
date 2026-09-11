//go:build windows

package securestore

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	cryptprotectUIForbidden = 0x1
)

type dpapiStore struct {
	namespace string
	directory string
}

func newPlatformStore(namespace string) (Store, error) {
	root, err := windows.KnownFolderPath(windows.FOLDERID_LocalAppData, 0)
	if err != nil {
		return nil, fmt.Errorf("locate Windows LocalAppData: %w", err)
	}
	return &dpapiStore{
		namespace: namespace,
		directory: filepath.Join(root, "OpenDesk", "secure-store", namespace),
	}, nil
}

func (store *dpapiStore) Load(ctx context.Context, name string) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := validateName(name); err != nil {
		return nil, err
	}
	itemPath := store.path(name)
	info, err := os.Lstat(itemPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("stat DPAPI item: %w", err)
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > MaxValueSize+1024 {
		return nil, fmt.Errorf("DPAPI item must be a bounded regular file")
	}
	file, err := os.Open(itemPath)
	if err != nil {
		return nil, fmt.Errorf("open DPAPI item: %w", err)
	}
	defer file.Close()
	openedInfo, err := file.Stat()
	if err != nil || !openedInfo.Mode().IsRegular() || openedInfo.Size() != info.Size() {
		return nil, fmt.Errorf("DPAPI item changed during secure read")
	}
	ciphertext, err := io.ReadAll(io.LimitReader(file, MaxValueSize+1025))
	if err != nil {
		return nil, fmt.Errorf("read bounded DPAPI item: %w", err)
	}
	if len(ciphertext) == 0 || len(ciphertext) > MaxValueSize+1024 {
		return nil, fmt.Errorf("DPAPI item size is invalid")
	}
	defer zero(ciphertext)
	plaintext, err := dpapiUnprotect(ciphertext, []byte(store.namespace+"\x00"+name))
	if err != nil {
		return nil, fmt.Errorf("unprotect DPAPI item: %w", err)
	}
	return plaintext, nil
}

func (store *dpapiStore) Create(ctx context.Context, name string, value []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := validateName(name); err != nil {
		return err
	}
	if len(value) == 0 || len(value) > MaxValueSize {
		return fmt.Errorf("secure store value size is invalid")
	}
	ciphertext, err := dpapiProtect(value, []byte(store.namespace+"\x00"+name))
	if err != nil {
		return fmt.Errorf("protect DPAPI item: %w", err)
	}
	defer zero(ciphertext)
	if err := os.MkdirAll(store.directory, 0o700); err != nil {
		return fmt.Errorf("create DPAPI store directory: %w", err)
	}
	file, err := os.OpenFile(store.path(name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if errors.Is(err, os.ErrExist) {
		return ErrAlreadyExists
	}
	if err != nil {
		return fmt.Errorf("create DPAPI item: %w", err)
	}
	remove := true
	defer func() {
		_ = file.Close()
		if remove {
			_ = os.Remove(store.path(name))
		}
	}()
	if _, err := file.Write(ciphertext); err != nil {
		return fmt.Errorf("write DPAPI item: %w", err)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync DPAPI item: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close DPAPI item: %w", err)
	}
	remove = false
	return nil
}

func (store *dpapiStore) Save(ctx context.Context, name string, value []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := validateName(name); err != nil {
		return err
	}
	if len(value) == 0 || len(value) > MaxValueSize {
		return fmt.Errorf("secure store value size is invalid")
	}
	ciphertext, err := dpapiProtect(value, []byte(store.namespace+"\x00"+name))
	if err != nil {
		return fmt.Errorf("protect DPAPI item: %w", err)
	}
	defer zero(ciphertext)
	if err := os.MkdirAll(store.directory, 0o700); err != nil {
		return fmt.Errorf("create DPAPI store directory: %w", err)
	}
	temporary, err := os.CreateTemp(store.directory, ".save-*")
	if err != nil {
		return fmt.Errorf("create temporary DPAPI item: %w", err)
	}
	temporaryPath := temporary.Name()
	remove := true
	defer func() {
		_ = temporary.Close()
		if remove {
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return fmt.Errorf("protect temporary DPAPI item: %w", err)
	}
	if _, err := temporary.Write(ciphertext); err != nil {
		return fmt.Errorf("write temporary DPAPI item: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return fmt.Errorf("sync temporary DPAPI item: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close temporary DPAPI item: %w", err)
	}
	if err := os.Rename(temporaryPath, store.path(name)); err != nil {
		return fmt.Errorf("replace DPAPI item: %w", err)
	}
	remove = false
	return nil
}

func (store *dpapiStore) path(name string) string {
	return filepath.Join(store.directory, name+".bin")
}

func dpapiProtect(plaintext, entropy []byte) ([]byte, error) {
	in := blob(plaintext)
	extra := blob(entropy)
	var out windows.DataBlob
	// Omit CRYPTPROTECT_LOCAL_MACHINE: device private material remains bound
	// to both this Windows installation and the current user profile.
	if err := windows.CryptProtectData(&in, nil, &extra, 0, nil, cryptprotectUIForbidden, &out); err != nil {
		return nil, err
	}
	defer freeDataBlob(&out)
	return windowsBytes(out), nil
}

func dpapiUnprotect(ciphertext, entropy []byte) ([]byte, error) {
	in := blob(ciphertext)
	extra := blob(entropy)
	var out windows.DataBlob
	if err := windows.CryptUnprotectData(&in, nil, &extra, 0, nil, cryptprotectUIForbidden, &out); err != nil {
		return nil, err
	}
	defer freeDataBlob(&out)
	return windowsBytes(out), nil
}

func freeDataBlob(value *windows.DataBlob) {
	if value == nil || value.Data == nil {
		return
	}
	zero(unsafe.Slice(value.Data, int(value.Size)))
	_, _ = windows.LocalFree(windows.Handle(unsafe.Pointer(value.Data)))
	value.Data = nil
	value.Size = 0
}

func blob(value []byte) windows.DataBlob {
	result := windows.DataBlob{Size: uint32(len(value))}
	if len(value) > 0 {
		result.Data = &value[0]
	}
	return result
}

func windowsBytes(value windows.DataBlob) []byte {
	if value.Size == 0 || value.Data == nil {
		return nil
	}
	return append([]byte(nil), unsafe.Slice(value.Data, int(value.Size))...)
}

func zero(value []byte) {
	for index := range value {
		value[index] = 0
	}
}
