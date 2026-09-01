#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ICON="${SOURCE_ICON:-${ROOT_DIR}/public/logo.png}"
RUNTIME_DIR="${RUNTIME_DIR:-${ROOT_DIR}/.runtime/icon-build}"
CANONICAL_LOGO="${ROOT_DIR}/public/logo.png"
MACOS_ICON="${ROOT_DIR}/public/icons/opendesk.icns"
WINDOWS_ICON="${ROOT_DIR}/public/icons/opendesk.ico"
NOTIFICATION_ICON="${ROOT_DIR}/public/icons/opendesk-notification.png"

if command -v magick >/dev/null 2>&1; then
  USE_MAGICK=1
else
  USE_MAGICK=0
  if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'from PIL import Image, ImageOps' >/dev/null 2>&1; then
    printf 'Required icon tools are unavailable: magick or python3 with Pillow\n' >&2
    exit 1
  fi
fi
if ! command -v iconutil >/dev/null 2>&1; then
  printf 'Required icon tool is unavailable: iconutil\n' >&2
  exit 1
fi

if [[ ! -f "${SOURCE_ICON}" ]]; then
  printf 'App icon source is missing: %s\n' "${SOURCE_ICON}" >&2
  exit 1
fi

if [[ "${USE_MAGICK}" -eq 1 ]]; then
  read -r source_width source_height < <(magick identify -format '%w %h\n' "${SOURCE_ICON}")
else
  read -r source_width source_height < <(python3 - "${SOURCE_ICON}" <<'PY'
from PIL import Image
import sys
with Image.open(sys.argv[1]) as image:
    print(image.width, image.height)
PY
)
fi
if [[ "${source_width}" != "${source_height}" ]]; then
  printf 'App icon source must be square, got %sx%s: %s\n' \
    "${source_width}" "${source_height}" "${SOURCE_ICON}" >&2
  exit 1
fi

WORK_DIR="${RUNTIME_DIR}/work"
ICONSET_DIR="${WORK_DIR}/OpenDesk.iconset"
WINDOWS_DIR="${WORK_DIR}/windows"
CANONICAL_TMP="${WORK_DIR}/opendesk-1024.png"

rm -rf "${WORK_DIR}"
mkdir -p \
  "${ICONSET_DIR}" \
  "${WINDOWS_DIR}" \
  "$(dirname "${CANONICAL_LOGO}")" \
  "$(dirname "${MACOS_ICON}")" \
  "$(dirname "${WINDOWS_ICON}")" \
  "$(dirname "${NOTIFICATION_ICON}")"

# Keep the authored canvas and transparent margin intact. The source is square,
# so normalization is a pure high-quality resample rather than an implicit crop.
if [[ "${USE_MAGICK}" -eq 1 ]]; then
  magick "${SOURCE_ICON}" \
    -auto-orient \
    -colorspace sRGB \
    -filter Lanczos \
    -resize 1024x1024 \
    -strip \
    -define png:exclude-chunk=date,time \
    -define png:color-type=6 \
    "${CANONICAL_TMP}"
else
  python3 - "${SOURCE_ICON}" "${CANONICAL_TMP}" <<'PY'
from PIL import Image, ImageOps
import sys
with Image.open(sys.argv[1]) as image:
    image = ImageOps.exif_transpose(image).convert("RGBA")
    image = image.resize((1024, 1024), Image.Resampling.LANCZOS)
    image.save(sys.argv[2], format="PNG", optimize=False, compress_level=9)
PY
fi
install -m 0644 "${CANONICAL_TMP}" "${CANONICAL_LOGO}"

make_png() {
  local size="$1"
  local output="$2"
  if [[ "${USE_MAGICK}" -eq 1 ]]; then
    magick "${CANONICAL_TMP}" \
      -filter Lanczos \
      -resize "${size}x${size}" \
      -strip \
      -define png:exclude-chunk=date,time \
      -define png:color-type=6 \
      "${output}"
  else
    python3 - "${CANONICAL_TMP}" "${size}" "${output}" <<'PY'
from PIL import Image
import sys
with Image.open(sys.argv[1]) as image:
    image.convert("RGBA").resize((int(sys.argv[2]), int(sys.argv[2])), Image.Resampling.LANCZOS).save(
        sys.argv[3], format="PNG", optimize=False, compress_level=9
    )
PY
  fi
}

make_png 16 "${ICONSET_DIR}/icon_16x16.png"
make_png 32 "${ICONSET_DIR}/icon_16x16@2x.png"
make_png 32 "${ICONSET_DIR}/icon_32x32.png"
make_png 64 "${ICONSET_DIR}/icon_32x32@2x.png"
make_png 128 "${ICONSET_DIR}/icon_128x128.png"
make_png 256 "${ICONSET_DIR}/icon_128x128@2x.png"
make_png 256 "${ICONSET_DIR}/icon_256x256.png"
make_png 512 "${ICONSET_DIR}/icon_256x256@2x.png"
make_png 512 "${ICONSET_DIR}/icon_512x512.png"
make_png 1024 "${ICONSET_DIR}/icon_512x512@2x.png"
iconutil -c icns "${ICONSET_DIR}" -o "${MACOS_ICON}"

windows_sizes=(16 24 32 48 64 128 256)
windows_frames=()
for size in "${windows_sizes[@]}"; do
  frame="${WINDOWS_DIR}/opendesk-${size}.png"
  make_png "${size}" "${frame}"
  windows_frames+=("${frame}")
done
if [[ "${USE_MAGICK}" -eq 1 ]]; then
  magick "${windows_frames[@]}" "${WINDOWS_ICON}"
else
  python3 - "${WINDOWS_ICON}" "${windows_frames[@]}" <<'PY'
from pathlib import Path
import struct
import sys

output = Path(sys.argv[1])
frames = [Path(item) for item in sys.argv[2:]]
payloads = [item.read_bytes() for item in frames]
header = struct.pack("<HHH", 0, 1, len(payloads))
offset = 6 + 16 * len(payloads)
entries = []
for frame, payload in zip(frames, payloads):
    from PIL import Image
    with Image.open(frame) as image:
        width, height = image.size
    entries.append(struct.pack(
        "<BBBBHHII", 0 if width == 256 else width, 0 if height == 256 else height,
        0, 0, 1, 32, len(payload), offset
    ))
    offset += len(payload)
output.write_bytes(header + b"".join(entries) + b"".join(payloads))
PY
fi

make_png 256 "${NOTIFICATION_ICON}"

# Produce a disposable QA strip without changing any shipped asset.
preview_cells=()
for size in 16 32 48 64 128 256; do
  frame="${WORK_DIR}/preview-${size}.png"
  cell="${WORK_DIR}/preview-cell-${size}.png"
  make_png "${size}" "${frame}"
  if [[ "${USE_MAGICK}" -eq 1 ]]; then
    magick "${frame}" -background '#d9d9d9' -gravity center -extent 280x280 "${cell}"
  else
    python3 - "${frame}" "${cell}" <<'PY'
from PIL import Image
import sys
with Image.open(sys.argv[1]) as image:
    image = image.convert("RGBA")
    canvas = Image.new("RGBA", (280, 280), "#d9d9d9")
    canvas.alpha_composite(image, ((280 - image.width) // 2, (280 - image.height) // 2))
    canvas.save(sys.argv[2], format="PNG", optimize=False, compress_level=9)
PY
  fi
  preview_cells+=("${cell}")
done
if [[ "${USE_MAGICK}" -eq 1 ]]; then
  magick "${preview_cells[@]}" +append "${RUNTIME_DIR}/size-preview.png"
else
  python3 - "${RUNTIME_DIR}/size-preview.png" "${preview_cells[@]}" <<'PY'
from PIL import Image
import sys
cells = [Image.open(path).convert("RGBA") for path in sys.argv[2:]]
canvas = Image.new("RGBA", (sum(item.width for item in cells), max(item.height for item in cells)))
offset = 0
for item in cells:
    canvas.paste(item, (offset, 0))
    offset += item.width
canvas.save(sys.argv[1], format="PNG", optimize=False, compress_level=9)
PY
fi

printf 'Canonical logo: %s\n' "${CANONICAL_LOGO}"
printf 'macOS icon: %s\n' "${MACOS_ICON}"
printf 'Windows icon: %s\n' "${WINDOWS_ICON}"
printf 'Notification icon: %s\n' "${NOTIFICATION_ICON}"
printf 'QA preview: %s\n' "${RUNTIME_DIR}/size-preview.png"
