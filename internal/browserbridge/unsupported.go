//go:build !darwin && !linux

package browserbridge

import (
	"context"
	"errors"
	"io"
)

type Installation struct {
	Name string
	ExtensionID string
	Browser string
	UserDataDir string
	SocketPath string
	ClientCredential string
	InstallRoot string
	Provider string
	Executable string
	CreatedAt string
	InstalledAt string
}
var errPlatform=errors.New("E_PLATFORM: OpenDesk Browser Native Host is currently enabled for macOS/Linux")
func Load() (Installation,error) {return Installation{},errPlatform}
func Setup(string,string,string,string) (map[string]any,error) {return nil,errPlatform}
func SetupAutomatic(string,string,string,string) (map[string]any,error) {return nil,errPlatform}
// Keep the same context-aware signatures as install_unix.go. Unsupported
// platforms reject registration rather than creating an incomplete Native host.
func SetupAutomaticContext(context.Context,string,string,string,string) (map[string]any,error) {return nil,errPlatform}
func SetupContext(context.Context,string,string,string,string) (map[string]any,error) {return nil,errPlatform}
func Doctor() map[string]any {return map[string]any{"installed":false,"socketExists":false,"error":"E_PLATFORM"}}
func Cleanup() (map[string]any,error) {return nil,errPlatform}
func ManifestFor(string,string) (string,error) {return "",errPlatform}
type Host struct{}
func NewHost(Installation,string,io.Reader,io.Writer) (*Host,error) {return nil,errPlatform}
func (*Host) Run() error {return errPlatform}
// Unsupported platforms still satisfy the Host lifecycle API used by CLI shutdown.
// NewHost always rejects them, so there is no native resource to release.
func (*Host) Close() {}

// The Windows Native Messaging provider has not been implemented.
func ProjectAdd(string,string,string,string) (map[string]any,error) {return nil,errPlatform}
func ProjectList() (map[string]any,error) {return nil,errPlatform}
func ProjectRevoke(string) (map[string]any,error) {return nil,errPlatform}
func ResolveProject(string) (map[string]any,error) {return nil,errPlatform}
func WorkspaceAdd(string,string) (map[string]any,error) {return nil,errPlatform}
func WorkspaceList() (map[string]any,error) {return nil,errPlatform}
func WorkspaceRevoke(string) (map[string]any,error) {return nil,errPlatform}
