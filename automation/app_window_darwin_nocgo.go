//go:build darwin && !cgo

package automation

func appHasWindowPlatform(pid int64) (bool, error) {
	return appHasWindowFromFacade(pid)
}
