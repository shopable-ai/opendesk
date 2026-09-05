package automation

import "runtime"

const macOSCalculatorBundleID = "com.apple.calculator"

// normalizeAppTarget converts only documented macOS system-application aliases
// into a stable identity. It deliberately leaves explicit bundle IDs, paths,
// and PIDs untouched, and never guesses an identity for an unknown name.
func normalizeAppTarget(target appTarget) appTarget {
	return normalizeAppTargetForPlatform(runtime.GOOS, applicationNativeIdentityAvailable(), target)
}

// normalizeAppTargetForPlatform keeps the platform boundary explicit and gives
// the pure resolver a small seam for non-runtime tests. Alias matching requires
// the native macOS identity snapshot because the canonical target is a bundle
// ID that must also be observable during process and window readiness checks.
func normalizeAppTargetForPlatform(goos string, nativeIdentity bool, target appTarget) appTarget {
	if goos != "darwin" || !nativeIdentity || target.Kind != appTargetName {
		return target
	}
	bundleID, ok := macOSSystemApplicationBundleID(target.Value)
	if !ok {
		return target
	}
	return appTarget{Kind: appTargetBundleID, Value: bundleID}
}

// macOSSystemApplicationBundleID is intentionally a short, exact alias table;
// it is not a general application-name translator.
func macOSSystemApplicationBundleID(name string) (string, bool) {
	switch name {
	case "计算器", "Calculator":
		return macOSCalculatorBundleID, true
	default:
		return "", false
	}
}
