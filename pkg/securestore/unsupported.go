//go:build !darwin && !windows

package securestore

func newPlatformStore(string) (Store, error) {
	return nil, ErrUnavailable
}
