"""Fixture tests for release-file checks; these are NOT desktop Runtime tests."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

TOOL = Path(__file__).resolve().parents[2] / "scripts" / "verify_platform_payload.py"
SPEC = importlib.util.spec_from_file_location("platform_payload", TOOL)
payload = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(payload)


class PayloadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def write(self, root, name, value=b"fixture"):
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(value)
        return path

    def fixture(self, target, name="runtime"):
        root = self.root / name
        layout = payload.LAYOUT[target]
        for path in layout["files"]:
            self.write(root, path)
        for directory in layout["js"]:
            self.write(root, directory + "/example.js", b"// fixture\n")
        marker = {"schemaVersion": 1, "kind": "opendesk-app-builder-template", "target": target}
        self.write(root, layout["marker"], json.dumps(marker).encode())
        return root

    def app(self, target):
        source = self.fixture(target)
        dest = self.root / "app"
        shutil.copytree(source, dest)
        layout = payload.LAYOUT[target]
        self.write(dest, layout["package"] + "/opendesk.app.json", b'{"schemaVersion":1}')
        self.write(dest, layout["provenance"], b"{}")
        return source, dest

    def test_structural_fixtures_are_explicitly_not_live_evidence(self):
        for target in payload.LAYOUT:
            with self.subTest(target=target):
                result = payload.verify(self.fixture(target, target), target)
                self.assertTrue(result["ok"], result)
                self.assertEqual(result["validationLevel"], "structural")
                self.assertTrue(any("NOT verified" in item for item in result["warnings"]))

    def test_missing_native_host_both_platforms(self):
        for target, host in (("macos", "Contents/Helpers/opendesk-ui-host"),
                             ("windows", "ui-host/opendesk-ui-host.exe")):
            root = self.fixture(target, target)
            (root / host).unlink()
            self.assertFalse(payload.verify(root, target)["ok"])

    def test_empty_required_file(self):
        root = self.fixture("windows")
        (root / "opendesk.exe").write_bytes(b"")
        self.assertFalse(payload.verify(root, "windows")["ok"])

    def test_empty_js_payload(self):
        root = self.fixture("macos")
        (root / "Contents/MacOS/polyfills/example.js").unlink()
        self.assertFalse(payload.verify(root, "macos")["ok"])

    def test_marker_mismatch_and_utf8_bom(self):
        root = self.fixture("windows")
        marker = root / payload.LAYOUT["windows"]["marker"]
        marker.write_bytes(b"\xef\xbb\xbf" + marker.read_bytes())
        self.assertTrue(payload.verify(root, "windows")["ok"])
        marker.write_text('{"target":"macos"}', encoding="utf-8")
        self.assertFalse(payload.verify(root, "windows")["ok"])

    def test_wrong_platform_owned_files(self):
        for target, filename in (("macos", "Contents/Helpers/opendesk-ui-host.exe"),
                                 ("windows", "resources/OpenDesk.icns")):
            root = self.fixture(target, target)
            self.write(root, filename)
            self.assertFalse(payload.verify(root, target)["ok"])

    def test_dual_platform_package_icons_are_not_filtered(self):
        for target in payload.LAYOUT:
            root = self.fixture(target, target)
            app = payload.LAYOUT[target]["package"]
            for filename in ("mac.icns", "win.ico", "sample.exe", "sample.dylib"):
                self.write(root, app + "/assets/" + filename)
            self.assertTrue(payload.verify(root, target)["ok"])

    def test_windows_single_file_publish_needs_no_imagined_dlls(self):
        root = self.fixture("windows")
        self.assertTrue(payload.verify(root, "windows")["ok"])
        self.assertFalse((root / "ui-host/coreclr.dll").exists())

    def test_reference_preserves_every_actual_host_file(self):
        source, dest = self.app("windows")
        for name in ("ui-host/native/loader.dll", "ui-host/config.json"):
            self.write(source, name)
            self.write(dest, name)
        result = payload.verify(dest, "windows", "app", source, True)
        self.assertTrue(result["ok"], result)
        (dest / "ui-host/native/loader.dll").unlink()
        result = payload.verify(dest, "windows", "app", source, True)
        self.assertFalse(result["ok"])
        self.assertIn("lost Runtime reference file: ui-host/native/loader.dll", result["errors"])

    def test_reference_detects_changed_host(self):
        source, dest = self.app("windows")
        (dest / "ui-host/opendesk-ui-host.exe").write_bytes(b"changed")
        self.assertFalse(payload.verify(dest, "windows", "app", source)["ok"])

    def test_macos_identity_and_user_package_may_change(self):
        source, dest = self.app("macos")
        (dest / "Contents/Info.plist").write_bytes(b"new publisher identity")
        self.write(source, "Contents/Resources/AppMode/old.js")
        self.write(source, "Contents/_CodeSignature/CodeResources")
        self.assertTrue(payload.verify(dest, "macos", "app", source)["ok"])

    def test_preserves_optional_providers_and_inspector_when_present(self):
        source, dest = self.app("macos")
        for name in ("Contents/Resources/inspector_web/index.html",
                     "Contents/Resources/NativeExtensions/provider/bin/provider"):
            self.write(source, name)
            self.write(dest, name)
        self.assertTrue(payload.verify(dest, "macos", "app", source)["ok"])
        (dest / "Contents/Resources/inspector_web/index.html").unlink()
        self.assertFalse(payload.verify(dest, "macos", "app", source)["ok"])

    def test_reference_must_be_independent_and_required_when_requested(self):
        root = self.fixture("windows")
        self.assertFalse(payload.verify(root, "windows", reference=root)["ok"])
        self.assertFalse(payload.verify(root, "windows", require_reference=True)["ok"])
        self.assertFalse(payload.verify(root, "windows", reference=self.root)["ok"])

    def test_invalid_reference_is_not_accepted(self):
        source, dest = self.app("windows")
        (source / "opendesk.exe").unlink()
        self.assertFalse(payload.verify(dest, "windows", "app", source)["ok"])

    def test_artifact_requires_staged_package_and_build_provenance(self):
        root = self.fixture("windows")
        self.assertFalse(payload.verify(root, "windows", "app")["ok"])

    def test_directory_symlink_does_not_escape_scan(self):
        root = self.fixture("windows")
        try:
            (root / "linked").symlink_to(self.root, target_is_directory=True)
        except OSError as error:
            self.skipTest(f"symlink privilege unavailable: {error}")
        self.assertFalse(payload.verify(root, "windows")["ok"])

    def test_windows_case_only_names_cannot_represent_two_binaries(self):
        self.assertTrue(payload.windows_path_collisions(["opendesk.exe", "OpenDesk.exe"]))
        self.assertTrue(payload.windows_path_collisions(["UI-host/a.dll", "ui-host/b.dll"]))
        self.assertFalse(payload.windows_path_collisions(["opendesk.exe", "opendesk-desktop.exe"]))

    def test_provenance_detects_collapsed_cli_gui_entry_on_windows(self):
        root = self.fixture("windows")
        document = {"layout": {"cliEntry": "opendesk.exe", "desktopEntry": "OpenDesk.exe"}}
        self.write(root, "distribution-provenance.json", json.dumps(document).encode())
        result = payload.verify(root, "windows")
        self.assertFalse(result["ok"])
        self.assertTrue(any("entry roles" in message for message in result["errors"]))
        document["layout"]["desktopEntry"] = "opendesk-desktop.exe"
        self.write(root, "distribution-provenance.json", json.dumps(document).encode())
        self.assertTrue(payload.verify(root, "windows")["ok"])

    def test_cli_exit_and_no_writes(self):
        root = self.fixture("windows")
        before = {str(p): p.read_bytes() for p in root.rglob("*") if p.is_file()}
        command = [sys.executable, str(TOOL), "--root", str(root), "--target", "windows"]
        success = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(success.returncode, 0, success.stderr)
        self.assertTrue(json.loads(success.stdout)["ok"])
        failure = subprocess.run(command + ["--require-reference"], capture_output=True, text=True)
        self.assertEqual(failure.returncode, 1)
        after = {str(p): p.read_bytes() for p in root.rglob("*") if p.is_file()}
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
