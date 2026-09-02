//go:build !darwin
// +build !darwin

package automation

import "fmt"

func listDisplaysPlatform() ([]DisplayInfo, error) {
	return nil, fmt.Errorf("display enumeration is not implemented on this platform")
}
