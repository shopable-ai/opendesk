//go:build darwin && !cgo

package securestore

func newPlatformStore(string) (Store, error) {
	return nil, ErrUnavailable
}
