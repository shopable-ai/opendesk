//go:build darwin

package main

func isOpenDeskAppBundle() bool {
	_, _, ok := openDeskAppPaths()
	return ok
}
