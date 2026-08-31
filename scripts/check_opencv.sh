#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

if ! command -v go >/dev/null 2>&1; then
	echo "OpenCV check failed: Go is not installed." >&2
	exit 1
fi

if [[ "$(go env CGO_ENABLED)" != "1" ]]; then
	echo "OpenCV check failed: CGO_ENABLED must be 1." >&2
	exit 1
fi

if ! command -v pkg-config >/dev/null 2>&1; then
	echo "OpenCV check failed: pkg-config is not installed." >&2
	exit 1
fi

if ! pkg-config --exists opencv4; then
	echo "OpenCV check failed: pkg-config cannot find opencv4." >&2
	exit 1
fi

gocv_version="$(go list -m -f '{{.Version}}' gocv.io/x/gocv)"
if [[ "$gocv_version" != "v0.43.0" ]]; then
	echo "OpenCV check failed: expected GoCV v0.43.0, found $gocv_version." >&2
	exit 1
fi

opencv_version="$(pkg-config --modversion opencv4)"
case "$opencv_version" in
	4.13.*) ;;
	*)
		echo "OpenCV check failed: GoCV $gocv_version expects OpenCV 4.13.x, found $opencv_version." >&2
		exit 1
		;;
esac

echo "GoCV module version: $gocv_version"
echo "pkg-config version: $(pkg-config --version)"
echo "opencv4 pkg-config version: $opencv_version"
go run -tags opencv ./cmd/opencv-healthcheck
go test -tags opencv ./automation -run '^TestImageColorFindPosUsesOpenCVBackend$' -count=1
go run -tags opencv ./cmd/clawdesk \
	-script tests/opencv/image_color_opencv_test.js \
	-timeout 1 \
	-console-mode script \
	-log-dir /tmp/clawdesk-opencv-js-test
