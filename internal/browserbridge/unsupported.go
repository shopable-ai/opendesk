//go:build !darwin && !linux

package browserbridge

import (
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
func Doctor() map[string]any {return map[string]any{"installed":false,"socketExists":false,"error":"E_PLATFORM"}}
func Cleanup() (map[string]any,error) {return nil,errPlatform}
func ManifestFor(string,string) (string,error) {return "",errPlatform}
type Host struct{}
func NewHost(Installation,string,io.Reader,io.Writer) (*Host,error) {return nil,errPlatform}
func (*Host) Run() error {return errPlatform}
