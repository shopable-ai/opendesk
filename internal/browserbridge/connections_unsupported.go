//go:build !darwin && !linux

package browserbridge

import "io"

const ConnectionEnvironment = "OPENDESK_NATIVE_CONNECTION"

func LoadClient() (Installation, error)           { return Installation{}, errPlatform }
func LoadConnection(string) (Installation, error) { return Installation{}, errPlatform }
func Connections() (map[string]any, error)        { return nil, errPlatform }
func NewConnectionHost(Installation, string, io.Reader, io.Writer) (*Host, error) {
	return nil, errPlatform
}
func ExtensionList() (map[string]any, error)          { return nil, errPlatform }
func ExtensionApprove(string) (map[string]any, error) { return nil, errPlatform }
func ExtensionRevoke(string) (map[string]any, error)  { return nil, errPlatform }
func verifyClientInstallation(Installation) error     { return errPlatform }
