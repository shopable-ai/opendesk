//go:build darwin && !cgo

package automation

import "context"

func terminateApplicationPlatform(ctx context.Context, pid int64, force bool) error {
	return terminateApplicationProcess(ctx, pid, force)
}

func applicationBundleIdentifierPlatform(string) string { return "" }

func applicationNativeIdentityAvailable() bool { return false }
