#!/usr/bin/env python3
"""Verify saved real Mac mini-placement evidence, without desktop input.

From the repository root, with Pillow installed:
python3 examples/desktop-reset-clock/tests/r27_mini_placement_check.py
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
DEFAULT = ROOT / '.runtime/tests/desktop-reset-clock/r27/mini-fix'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(evidence, name):
    return json.loads((evidence / name).read_text())


def mini(observation):
    assert len(observation['apps']) == 1, 'client identity is ambiguous'
    candidates = [w for w in observation['windows']
                  if w['kCGWindowBounds']['Width'] == 88]
    assert len(candidates) == 1, 'mini is absent or ambiguous'
    window = candidates[0]
    assert window['kCGWindowOwnerPID'] == observation['apps'][0]['pid']
    assert window['kCGWindowIsOnscreen']
    assert window['kCGWindowBounds']['Height'] == 44
    return window['kCGWindowBounds']


def check(evidence):
    manifest = read(evidence, 'mini-acceptance-manifest.json')
    for name, expected in manifest['files'].items():
        assert digest(evidence / name) == expected, f'evidence changed: {name}'
    source_hash = digest(ROOT / 'examples/desktop-reset-clock/internal/desktop/native_darwin.m')
    assert manifest['native_source_sha256'] == source_hash, 'different native source'
    bundle = Path(manifest['bundle']).resolve()
    bundle.relative_to(ROOT / '.runtime')
    provenance = (bundle / 'Contents/Resources/build-provenance.txt').read_text()
    assert f'{source_hash}  internal/desktop/native_darwin.m' in provenance

    default = read(evidence, 'default06-observer.json')
    bounds = mini(default)
    frame = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', default['screens'][0]['frame'])]
    visible = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', default['screens'][0]['visible_frame'])]
    max_y = frame[1] + frame[3]
    assert bounds['X'] == frame[0] + 4
    assert max_y - bounds['Y'] - bounds['Height'] == frame[1] + 20
    assert frame[1] + 20 < visible[1], 'default is above the Dock band'

    bottom = mini(read(evidence, 'bottom-observer.json'))
    assert max_y - bottom['Y'] - bottom['Height'] == frame[1], 'drag cannot reach bottom'
    locked = mini(read(evidence, 'main-locked-observer.json'))
    assert abs(max_y - locked['Y'] - locked['Height'] - (frame[1] + 20)) <= 1

    before = read(evidence, 'restart2-before.json')
    after = read(evidence, 'restart2-after.json')
    assert before['apps'][0]['pid'] != after['apps'][0]['pid'], 'client was not restarted'
    assert mini(before) == mini(after), 'position changed on controlled restart'
    saved = read(evidence, 'restart2-before-state.json')['config']
    assert saved['locked'], 'main-card lock was not tested'
    assert mini(before)['X'] == saved['mini_x']
    assert max_y - mini(before)['Y'] - 44 == saved['mini_y']

    # This launch had no state file or seeded config: prove the macOS default
    # actually enables the mini, rather than relying on a test-only preference.
    launch = read(evidence, 'fresh-profile-launch.json')
    assert not launch['state_preexisted'] and not launch['seeded_config']
    fresh = read(evidence, 'fresh-profile-observer.json')
    assert mini(fresh) == bounds
    assert read(evidence, 'fresh-profile-state-capture.json')['config']['mini_show']
    settings_hash = digest(ROOT / 'examples/desktop-reset-clock/internal/settings/settings.go')
    assert manifest['fresh_profile']['settings_sha256'] == settings_hash
    fresh_bundle = Path(manifest['fresh_profile']['bundle']).resolve()
    fresh_bundle.relative_to(ROOT / '.runtime')
    fresh_provenance = (fresh_bundle / 'Contents/Resources/build-provenance.txt').read_text()
    assert f'{settings_hash}  internal/settings/settings.go' in fresh_provenance

    # The complete pill must be painted in the actual desktop composite. This
    # catches a Dock overlay which a window-only capture would miss.
    scale = default['screens'][0]['scale']
    image = Image.open(evidence / 'default06-desktop.png').convert('RGB')
    assert image.size == (int(frame[2] * scale), int(frame[3] * scale))
    y = round((bounds['Y'] + 22) * scale)
    for x in (bounds['X'] + 3, bounds['X'] + 85):
        r, g, b = image.getpixel((round(x * scale), y))
        assert g > r + 12 and g >= b, 'mini edge is occluded in the desktop composite'
    return {'status': 'passed', 'default_origin_appkit': [4, 20],
            'size_pt': [88, 44], 'bottom_drag': True,
            'main_lock_mini_drag': True, 'controlled_restart': True,
            'macos_fresh_profile_enabled': True,
            'native_source_sha256': source_hash,
            'scope': manifest['scope'], 'long_run': 'NOT_QUALIFIED'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence-dir', type=Path, default=DEFAULT)
    evidence = parser.parse_args().evidence_dir.resolve()
    evidence.relative_to(ROOT / '.runtime')
    result = check(evidence)
    (evidence / 'mini-placement-check.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
