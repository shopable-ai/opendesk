//go:build !darwin && !linux

package browsercli

import (
    "errors"
    "io"
)

// Keep the pre-existing Windows build working while R17 initially targets
// the tested macOS/Unix Native host. Do not silently fall back to shell or
// an untrusted project-local Node executable on unsupported platforms.
const devHelp = "用法: opendesk browser [dev [目录] | help | --version]\n" +
    "R17 本地目录直连当前仅在已配对的 macOS/Linux Go Native Host 上受支持。\n"

func runBrowserDev(rest []string, stdout, stderr io.Writer) int {
    if len(rest)==1 && (rest[0]=="--help"||rest[0]=="-h"||rest[0]=="help") {
        _,_ = io.WriteString(stdout,devHelp)
        return 0
    }
    return exitError(stderr,errors.New("E_PLATFORM: R17 local directory CLI requires a supported macOS/Linux Native Host"))
}
