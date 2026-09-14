//go:build !darwin
// +build !darwin

package automation

func ensureMouseInputPermission() error { return nil }
