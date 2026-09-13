#!/usr/bin/env python3
"""Read-only checks for the current full Runtime / installed-builder payload.

This is a maintainer tool, not a Runtime API or a capability dependency solver.
A structural pass is not a native launch qualification. --reference compares
all invariant Runtime files before publisher re-signing; package assets are
intentionally excluded from platform filtering.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any

LAYOUT = {
    "macos": {
        "files": (
            "Contents/Info.plist", "Contents/MacOS/opendesk",
            "Contents/Helpers/opendesk-ui-host",
        ),
        "js": ("Contents/MacOS/polyfills", "Contents/MacOS/jslibs"),
        "marker": "Contents/Resources/OpenDeskAppBuilder/template.json",
        "package": "Contents/Resources/AppMode",
        "provenance": "Contents/Resources/OpenDeskAppBuilder/build-provenance.json",
        "owned": ("Contents/MacOS", "Contents/Helpers", "Contents/Resources"),
        "mutable": ("Contents/Info.plist", "Contents/_CodeSignature",
                    "Contents/Resources/AppMode",
                    "Contents/Resources/OpenDeskAppBuilder/build-provenance.json"),
        "wrong_suffixes": (".exe", ".dll", ".pdb"),
        "wrong_paths": ("ui-host", "opendesk.exe", "app-builder-template.json"),
        "inspector": ("Contents/Resources/inspector_web/index.html",
                      "Contents/Resources/inspector_web/assets/app.css",
                      "Contents/Resources/inspector_web/assets/app.js",
                      "Contents/Resources/inspector_web/assets/model.js"),
    },
    "windows": {
        "files": (
            "opendesk.exe", "opendesk-desktop.exe",
            "ui-host/opendesk-ui-host.exe",
            "resources/opendesk-notification.png",
            "sounds/public/done.mp3", "sounds/public/fail.mp3",
            "sounds/public/warn.mp3", "sounds/public/captcha.mp3",
        ),
        "js": ("polyfills", "jslibs"),
        "marker": "app-builder-template.json",
        "package": "app-mode",
        "provenance": "app-build-provenance.json",
        "owned": ("ui-host", "polyfills", "jslibs", "resources", "sounds", "inspector_web"),
        "mutable": ("app-mode", "distribution-provenance.json", "app-build-provenance.json"),
        "wrong_suffixes": (".dylib", ".icns"),
        "wrong_paths": ("Contents", "OpenDesk.app", "opendesk-status",
                        "resources/NativeExtensions/com.example.macos-vision"),
        "inspector": ("inspector_web/index.html", "inspector_web/assets/app.css",
                      "inspector_web/assets/app.js", "inspector_web/assets/model.js"),
    },
}


def under(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(prefix + "/")


def windows_path_collisions(names: list[str]) -> list[str]:
    """Conservatively reject case-only aliases, including directory prefixes."""
    seen: dict[str, str] = {}
    errors: set[str] = set()
    for name in sorted(names):
        pieces = name.replace("\\", "/").split("/")
        for count in range(1, len(pieces) + 1):
            prefix = "/".join(pieces[:count])
            key = prefix.casefold()
            previous = seen.setdefault(key, prefix)
            if previous != prefix:
                errors.add(f"Windows case-insensitive path collision: {previous} / {prefix}")
    return sorted(errors)


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def inventory(root: Path, errors: list[str]) -> dict[str, Path]:
    """Do not follow links (including directory links) out of an artifact."""
    result: dict[str, Path] = {}
    def walk_error(error: OSError) -> None:
        errors.append(f"cannot inspect payload: {error}")
    for directory, dirs, files in os.walk(root, followlinks=False, onerror=walk_error):
        for name in list(dirs):
            path = Path(directory) / name
            if path.is_symlink():
                errors.append(f"symlink directory in payload: {path.relative_to(root).as_posix()}")
                dirs.remove(name)
        for name in files:
            path = Path(directory) / name
            relative = path.relative_to(root).as_posix()
            if path.is_symlink() or not path.is_file():
                errors.append(f"non-regular payload file: {relative}")
            else:
                result[relative] = path
    return result


def verify(root: Path, target: str, kind: str = "runtime",
           reference: Path | None = None, require_reference: bool = False) -> dict[str, Any]:
    if target not in LAYOUT or kind not in ("runtime", "app"):
        raise ValueError("unsupported target or artifact kind")
    root = root.absolute()
    layout = LAYOUT[target]
    errors: list[str] = []
    warnings = ["Static file checks do not prove UI launch, permissions, signing, OCR, audio or WebView2 readiness."]
    report: dict[str, Any] = {
        "target": target, "kind": kind, "root": str(root),
        "validationLevel": "structural", "referenceComparedFiles": 0,
        "errors": errors, "warnings": warnings,
    }
    if root.is_symlink() or not root.is_dir():
        errors.append("artifact root must be a real directory, not a symlink")
        report["ok"] = False
        return report
    files = inventory(root, errors)
    if target == "windows":
        errors.extend(windows_path_collisions(list(files)))
        provenance = files.get("distribution-provenance.json")
        if provenance is not None:
            try:
                document = json.loads(provenance.read_text(encoding="utf-8-sig"))
                entries = document.get("layout", {}) if isinstance(document, dict) else {}
                cli = entries.get("cliEntry") if isinstance(entries, dict) else None
                desktop = entries.get("desktopEntry") if isinstance(entries, dict) else None
                if isinstance(cli, str) and isinstance(desktop, str):
                    if cli.replace("\\", "/").casefold() == desktop.replace("\\", "/").casefold():
                        errors.append("Windows CLI and GUI entry roles resolve to the same case-insensitive path")
                    if cli.replace("\\", "/") != "opendesk.exe":
                        errors.append("Windows provenance cliEntry must be opendesk.exe")
                    if desktop.replace("\\", "/") != "opendesk-desktop.exe":
                        errors.append("Windows provenance desktopEntry must be opendesk-desktop.exe")
            except (ValueError, UnicodeError, OSError) as exc:
                errors.append(f"invalid distribution provenance: {exc}")
    required = list(layout["files"])
    if kind == "runtime":
        required.append(layout["marker"])
    else:
        required.extend((layout["package"] + "/opendesk.app.json", layout["provenance"]))
        manifest = files.get(layout["package"] + "/opendesk.app.json")
        if manifest is not None:
            try:
                package = json.loads(manifest.read_text(encoding="utf-8-sig"))
                if isinstance(package, dict) and package.get("id") == "com.opendesk.desktop":
                    required.extend(layout["inspector"])
            except (ValueError, UnicodeError, OSError) as exc:
                errors.append(f"invalid App Mode manifest: {exc}")
    for relative in required:
        if relative not in files:
            errors.append(f"missing required file: {relative}")
        elif files[relative].stat().st_size == 0:
            errors.append(f"empty required file: {relative}")
    for directory in layout["js"]:
        if not any(under(name, directory) and name.endswith(".js") for name in files):
            errors.append(f"missing JavaScript payload: {directory}")
    marker = files.get(layout["marker"])
    if marker is not None:
        try:
            data = json.loads(marker.read_text(encoding="utf-8-sig"))
            expected = {"schemaVersion": 1, "kind": "opendesk-app-builder-template", "target": target}
            if not isinstance(data, dict) or any(data.get(k) != v for k, v in expected.items()):
                errors.append("Builder template marker does not match the target/schema/kind")
        except (ValueError, UnicodeError, OSError) as exc:
            errors.append(f"invalid Builder template marker: {exc}")
    for relative in layout["wrong_paths"]:
        if (root / relative).exists() or (root / relative).is_symlink():
            errors.append(f"wrong-platform Runtime path: {relative}")
    for relative in sorted(files):
        # App Mode can legally carry both Windows/macOS icons or business data.
        if under(relative, layout["package"]):
            continue
        if any(under(relative, prefix) for prefix in layout["owned"]):
            if relative.lower().endswith(layout["wrong_suffixes"]):
                errors.append(f"wrong-platform Runtime file: {relative}")
    if reference is None:
        warnings.append("No independent Runtime reference: complete native-host/payload preservation is NOT verified.")
        if require_reference:
            errors.append("an independent --reference Runtime is required")
    else:
        reference = reference.absolute()
        a, b = root.resolve(), reference.resolve()
        if reference.is_symlink() or not reference.is_dir():
            errors.append("reference must be a real Runtime directory")
        elif a == b or a in b.parents or b in a.parents:
            errors.append("reference and artifact must be independent, non-overlapping directories")
        else:
            # Validate the reference structurally first. A reference is an
            # explicit trusted input, not proof that its producer was correct.
            baseline = verify(reference, target, "runtime")
            if not baseline["ok"]:
                errors.extend("reference: " + message for message in baseline["errors"])
            else:
                source_files = inventory(reference, errors)
                for relative, source in sorted(source_files.items()):
                    if any(under(relative, prefix) for prefix in layout["mutable"]):
                        continue
                    destination = files.get(relative)
                    if destination is None:
                        errors.append(f"lost Runtime reference file: {relative}")
                    elif digest(source) != digest(destination):
                        errors.append(f"changed Runtime reference file: {relative}")
                    elif target == "macos" and (source.stat().st_mode & 0o111) != (destination.stat().st_mode & 0o111):
                        errors.append(f"changed executable bits: {relative}")
                    report["referenceComparedFiles"] += 1
                report["validationLevel"] = "reference-preservation"
                warnings.append("Reference byte comparison applies BEFORE publisher re-signing; the reference must already be qualified.")
    report["ok"] = not errors
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--target", choices=tuple(LAYOUT), required=True)
    parser.add_argument("--kind", choices=("runtime", "app"), default="runtime")
    parser.add_argument("--reference", type=Path, help="independent trusted full Runtime; compare before re-signing")
    parser.add_argument("--require-reference", action="store_true")
    args = parser.parse_args()
    try:
        result = verify(args.root, args.target, args.kind, args.reference, args.require_reference)
    except (OSError, ValueError) as exc:
        result = {"ok": False, "errors": [str(exc)]}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
