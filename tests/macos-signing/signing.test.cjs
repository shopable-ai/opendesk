'use strict';

// Unit tests only: security, codesign and file are isolated command mocks.
// Setup runs only against an existing fixture config. Never creates a
// certificate or accesses the user's keychains/TCC.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const policy = path.join(root, 'scripts/macos_signing.sh');
const continuity = path.join(root, 'scripts/check_macos_signing_continuity.sh');
const builder = path.join(root, 'scripts/build_macos_app.sh');
const setup = path.join(root, 'scripts/setup_macos_signing.sh');
const sha = '0123456789ABCDEF0123456789ABCDEF01234567';
const otherSha = '89ABCDEF0123456789ABCDEF0123456789ABCDEF';
const bundle = 'com.opendesk.signing-unit';
const supported = process.platform === 'darwin' && fs.existsSync('/usr/bin/plutil');

function fixture(t) {
  const output = path.join(root, '.runtime/tests/macos-signing-unit');
  fs.mkdirSync(output, { recursive: true });
  const dir = fs.mkdtempSync(path.join(output, 'fixture-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');
  const log = path.join(dir, 'commands.jsonl');
  const keychain = path.join(dir, 'private fixture.keychain-db');
  const config = path.join(home, 'Library/Application Support/OpenDesk/development-signing/config.json');
  const app = path.join(dir, 'Fixture App.app');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.mkdirSync(path.join(app, 'Contents/MacOS'), { recursive: true });
  fs.mkdirSync(path.join(app, 'Contents/Frameworks'), { recursive: true });
  fs.writeFileSync(keychain, 'mock keychain; no real signing material');
  fs.writeFileSync(path.join(app, 'Contents/MacOS/opendesk'), 'mock main');
  fs.writeFileSync(path.join(app, 'Contents/Frameworks/helper tool'), 'mock Mach-O');
  fs.writeFileSync(path.join(app, 'Contents/Info.plist'), 'mock data');
  const mock = `#!${process.execPath}
const fs = require('node:fs');
const name = require('node:path').basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify({ name, args }) + '\\n');
if (name === 'security') {
  if (JSON.stringify(args) === JSON.stringify(['list-keychains', '-d', 'user'])) {
    if (process.env.MOCK_LIST_FAIL === '1') process.exit(36);
    console.log(process.env.MOCK_KEYCHAINS || '');
    process.exit(0);
  }
  if (args[0] !== 'find-identity' && args[0] !== 'unlock-keychain') process.exit(97);
  if (process.env.MOCK_SECURITY_FAIL === '1') process.exit(31);
  if (args[0] === 'find-identity') console.log(process.env.MOCK_IDENTITIES);
} else if (name === 'file') {
  console.log((args.at(-1).includes('helper tool') || args.at(-1).endsWith('/opendesk-ui-host')) ? 'Mach-O 64-bit bundle arm64' : 'ASCII text');
} else if (name === 'codesign') {
  if (process.env.MOCK_SIGNATURES) {
    const signatures = JSON.parse(fs.readFileSync(process.env.MOCK_SIGNATURES, 'utf8'));
    const signature = signatures[args.at(-1)];
    if (!signature) process.exit(34);
    if (args.includes('-d') && args.includes('--verbose=4')) {
      // Synthetic CodeDirectory content excludes our fixture's CMS suffix.
      // A new CMS timestamp changes file SHA but must not change this CDHash.
      const owner = require('node:path').join(args.at(-1), 'Contents/MacOS/opendesk');
      const code = fs.readFileSync(owner, 'utf8').split('\\nCMS=')[0];
      const cdhash = require('node:crypto').createHash('sha256').update(code).digest('hex').slice(0, 40);
      console.error('CDHash=' + cdhash);
    }
    // Self verification accepts either fixture certificate. Only an external
    // requirement can detect that B no longer satisfies A's certificate pin.
    if (args.includes('-r-')) console.error('designated => ' + signature);
    if (args.includes('-R') && args[args.indexOf('-R') + 1] !== '=' + signature) {
      console.error('mock external requirement mismatch');
      process.exit(35);
    }
  }
  if (process.env.MOCK_CODESIGN_FAIL === 'all' ||
      (process.env.MOCK_CODESIGN_FAIL === 'requirement' && args.includes('-R')) ||
      (process.env.MOCK_CODESIGN_FAIL === 'sign' && args.includes('--sign'))) process.exit(32);
  if (args.includes('-dv')) console.error(process.env.MOCK_AUTHORITY);
} else if (name === 'mkdir' && process.env.MOCK_BUILD_STAGE &&
    JSON.stringify(args) === JSON.stringify(['-p', process.env.MOCK_BUILD_PARENT])) {
  // Simulate staging-parent setup without writing outside this fixture.
} else if (name === 'mktemp' && process.env.MOCK_BUILD_STAGE &&
    JSON.stringify(args) === JSON.stringify(['-d', process.env.MOCK_BUILD_PARENT + '/macos-app.XXXXXX'])) {
  console.log(process.env.MOCK_BUILD_STAGE);
} else if (name === 'chmod' && process.env.MOCK_BUILD_STAGE &&
    JSON.stringify(args) === JSON.stringify(['-R', 'u+w', process.env.MOCK_BUILD_STAGE])) {
  // The builder may clean its own stage on policy failure, never old artifacts.
} else if (name === 'rm' && process.env.MOCK_BUILD_STAGE &&
    JSON.stringify(args) === JSON.stringify(['-rf', process.env.MOCK_BUILD_STAGE])) {
  // Cleanup is simulated; fixture teardown owns the actual directory removal.
} else process.exit(98);
`;
  for (const name of ['security', 'codesign', 'file', 'go', 'mkdir', 'mktemp', 'rm', 'chmod', 'cp', 'mv']) {
    fs.writeFileSync(path.join(bin, name), mock, { mode: 0o755 });
  }
  const env = {
    HOME: home, PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
    MOCK_LOG: log, MOCK_IDENTITIES: `  1) ${sha} "Developer ID Application: Fixture (UNIT)"`,
    MOCK_AUTHORITY: 'Authority=Developer ID Application: Fixture (UNIT)',
    POLICY: policy, APP: app, BUNDLE: bundle, CONTINUITY: continuity, BUILDER: builder,
  };
  return {
    dir, home, config, keychain, app,
    configWrite(values = {}) {
      fs.writeFileSync(config, JSON.stringify({ identity: sha, keychain, ...values }));
    },
    run(body = 'macos_signing_load', overrides = {}) {
      // Deliberately do not inherit signing settings, BASH_ENV or shell functions.
      const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-c',
        'set -euo pipefail\nsource "$POLICY"\n' + body], {
        cwd: dir, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 10000,
      });
      assert.ifError(result.error);
      const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
      return { ...result, calls };
    },
  };
}

function unit(name, fn) {
  test(name, { skip: supported ? false : 'requires macOS /usr/bin/plutil', timeout: 15000 }, t => fn(fixture(t)));
}
function rejected(result, message) {
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  if (message) assert.match(result.stderr, message);
  assert.equal(result.calls.filter(c => c.name === 'codesign').length, 0);
}
function ok(result) { assert.equal(result.status, 0, result.stdout + result.stderr); }
const loadAndSign = 'macos_signing_load\nmacos_signing_sign_app "$APP" "$BUNDLE"';

unit('sourcing the policy has no command side effects', f => {
  const r = f.run(':');
  ok(r);
  assert.deepEqual(r.calls, []);
  assert.equal(r.stderr, '');
});

unit('default development fails closed without its config', f => {
  const r = f.run(loadAndSign);
  rejected(r, /not configured/);
  assert.deepEqual(r.calls, []);
});

unit('default development loads the default HOME config and pins its keychain', f => {
  f.configWrite();
  const r = f.run('macos_signing_load\nprintf "%s\\n" "$MACOS_SIGNING_MODE" "$CODESIGN_IDENTITY" "$CODESIGN_KEYCHAIN"');
  ok(r);
  assert.deepEqual(r.stdout.trim().split('\n'), ['development', sha, f.keychain]);
  assert.deepEqual(r.calls, [{ name: 'security', args: ['find-identity', '-p', 'codesigning', f.keychain] }]);
});

unit('an explicit config path is honored', f => {
  f.configWrite();
  const alternate = path.join(f.dir, 'alternate config.json');
  fs.renameSync(f.config, alternate);
  ok(f.run('macos_signing_load', { MACOS_SIGNING_CONFIG: alternate }));
});

unit('invalid and malformed configuration fails before signing', f => {
  fs.writeFileSync(f.config, '{ invalid json');
  rejected(f.run(loadAndSign));
});

for (const mode of ['development', 'release']) {
  for (const override of [{ SKIP_CODESIGN: '1' }, { CODESIGN_IDENTITY: '-' }]) {
    unit(`${mode} rejects explicit ${Object.keys(override)[0]} opt-out`, f => {
      f.configWrite();
      const r = f.run(loadAndSign, { MACOS_SIGNING_MODE: mode, ...override });
      rejected(r, /cannot skip signing or use ad-hoc/);
      assert.deepEqual(r.calls, []);
    });
  }
}

unit('unknown mode fails closed', f => rejected(f.run(loadAndSign, { MACOS_SIGNING_MODE: 'typo' }), /must be/));

for (const [label, setting, mode] of [
  ['legacy skip', { SKIP_CODESIGN: '1' }, 'unsigned'],
  ['legacy dash identity', { CODESIGN_IDENTITY: '-' }, 'adhoc'],
  ['explicit unsigned', { MACOS_SIGNING_MODE: 'unsigned' }, 'unsigned'],
  ['explicit adhoc', { MACOS_SIGNING_MODE: 'adhoc' }, 'adhoc'],
]) {
  unit(`${label} is experimental and warns about TCC`, f => {
    const r = f.run(loadAndSign + '\nprintf "%s" "$MACOS_SIGNING_MODE"', setting);
    ok(r);
    assert.equal(r.stdout, mode);
    assert.match(r.stderr, /WARNING:.*experimental.*no persistent TCC identity/);
    if (mode === 'unsigned') assert.deepEqual(r.calls, []);
    else assert.deepEqual(r.calls, [
      { name: 'codesign', args: ['--force', '--deep', '--sign', '-', f.app] },
      { name: 'codesign', args: ['--verify', '--deep', '--strict', f.app] },
    ]);
  });
}

unit('development refuses an override that differs from the pinned fingerprint', f => {
  f.configWrite();
  const r = f.run(loadAndSign, { CODESIGN_IDENTITY: otherSha });
  rejected(r, /differs from the pinned/);
  assert.deepEqual(r.calls, []);
});

for (const identity of ['', 'Developer ID Application: Fixture', sha.slice(1), sha + '0', 'G'.repeat(40)]) {
  unit(`development rejects non-exact fingerprint ${JSON.stringify(identity)}`, f => {
    f.configWrite({ identity });
    rejected(f.run(loadAndSign), /exact 40-digit/);
  });
}

for (const keychain of ['missing', 'relative']) {
  unit(`development rejects ${keychain} keychain`, f => {
    f.configWrite({ keychain: keychain === 'missing' ? path.join(f.dir, 'absent.keychain-db') : 'relative.keychain-db' });
    const r = f.run(loadAndSign);
    rejected(r, /keychain is missing or not absolute/);
    assert.deepEqual(r.calls, []);
  });
}

unit('development refuses unavailable pinned identity/private key', f => {
  f.configWrite();
  rejected(f.run(loadAndSign, { MOCK_IDENTITIES: `1) ${otherSha} "Other"` }), /private key is unavailable/);
});

unit('identity lookup failure propagates without signing', f => {
  f.configWrite();
  rejected(f.run(loadAndSign, { MOCK_SECURITY_FAIL: '1' }));
});

for (const field of ['identity', 'keychain']) {
  unit(`development rejects a config without ${field}`, f => {
    const config = { identity: sha, keychain: f.keychain };
    delete config[field];
    fs.writeFileSync(f.config, JSON.stringify(config));
    const r = f.run(loadAndSign);
    rejected(r);
    assert.deepEqual(r.calls, []);
  });
}

unit('lowercase exact SHA-1 is accepted and found case-insensitively', f => {
  f.configWrite({ identity: sha.toLowerCase() });
  ok(f.run());
});

for (const kind of ['missing', 'permissive', 'symlink']) {
  unit(`development refuses a ${kind} password file before unlocking`, f => {
    const passwordFile = path.join(f.dir, 'keychain-password');
    if (kind === 'permissive') fs.writeFileSync(passwordFile, 'fixture secret', { mode: 0o644 });
    if (kind === 'symlink') {
      const target = path.join(f.dir, 'password-target');
      fs.writeFileSync(target, 'fixture secret', { mode: 0o600 });
      fs.symlinkSync(target, passwordFile);
    }
    f.configWrite({ passwordFile });
    const r = f.run(loadAndSign);
    rejected(r, /password file must be owned by this user with mode 600/);
    assert.deepEqual(r.calls, []);
  });
}

unit('a private fixture password unlocks only the pinned fixture keychain', f => {
  const passwordFile = path.join(f.dir, 'keychain-password');
  fs.writeFileSync(passwordFile, 'fixture secret', { mode: 0o600 });
  f.configWrite({ passwordFile });
  const r = f.run();
  ok(r);
  assert.deepEqual(r.calls, [
    { name: 'security', args: ['unlock-keychain', '-p', 'fixture secret', f.keychain] },
    { name: 'security', args: ['find-identity', '-p', 'codesigning', f.keychain] },
  ]);
});

unit('release requires an identity', f => rejected(f.run(loadAndSign, { MACOS_SIGNING_MODE: 'release' }), /release requires/));

unit('release rejects a display name instead of a fingerprint', f => {
  rejected(f.run(loadAndSign, { MACOS_SIGNING_MODE: 'release', CODESIGN_IDENTITY: 'Developer ID Application: Fixture' }), /exact 40-digit/);
});

unit('release refuses a matching certificate without Developer ID Application authority', f => {
  rejected(f.run(loadAndSign, {
    MACOS_SIGNING_MODE: 'release', CODESIGN_IDENTITY: sha, CODESIGN_KEYCHAIN: f.keychain,
    MOCK_IDENTITIES: `1) ${sha} "OpenDesk Local Development"`,
  }), /valid Developer ID Application/);
});

unit('development embeds designated requirements when signing and uses -R only to verify', f => {
  f.configWrite();
  const r = f.run(loadAndSign);
  ok(r);
  const calls = r.calls.filter(c => c.name === 'codesign').map(c => c.args);
  const helper = path.join(f.app, 'Contents/Frameworks/helper tool');
  const helperId = `${bundle}.Frameworks.helper.tool`;
  const requirement = id => `identifier "${id}" and certificate leaf = H"${sha}"`;
  const signing = (target, id) => ['--force', '--sign', sha, '--identifier', id, '--keychain', f.keychain,
    '--timestamp=none', '--requirements', `=designated => ${requirement(id)}`, target];
  assert.deepEqual(calls, [
    signing(helper, helperId),
    ['--verify', '--strict', helper],
    ['--verify', '-R', `=${requirement(helperId)}`, helper],
    signing(f.app, bundle),
    ['--verify', '--deep', '--strict', f.app],
    ['--verify', '-R', `=${requirement(bundle)}`, f.app],
  ]);
});

unit('release signs without custom DR, then verifies exact leaf and identifier before authority', f => {
  const r = f.run(loadAndSign, { MACOS_SIGNING_MODE: 'release', CODESIGN_IDENTITY: sha, CODESIGN_KEYCHAIN: f.keychain });
  ok(r);
  assert.deepEqual(r.calls[0], { name: 'security', args: ['find-identity', '-v', '-p', 'codesigning', f.keychain] });
  const signing = r.calls.filter(c => c.name === 'codesign' && c.args.includes('--sign'));
  assert.equal(signing.length, 2);
  for (const { args } of signing) {
    assert.ok(args.includes('--timestamp'));
    assert.equal(args[args.indexOf('--options') + 1], 'runtime');
    assert.ok(!args.includes('--requirements') && !args.includes('-R') && !args.includes('--deep'));
  }
  assert.deepEqual(r.calls.filter(c => c.name === 'codesign' && !c.args.includes('--sign')), [
    { name: 'codesign', args: ['--verify', '--strict', path.join(f.app, 'Contents/Frameworks/helper tool')] },
    { name: 'codesign', args: ['--verify', '--deep', '--strict', f.app] },
    { name: 'codesign', args: ['--verify', '-R', `=identifier "${bundle}" and certificate leaf = H"${sha}"`, f.app] },
    { name: 'codesign', args: ['-dv', f.app] },
  ]);
});

for (const failure of ['sign', 'requirement']) {
  unit(`development stops on ${failure} failure before signing the outer app`, f => {
    f.configWrite();
    const r = f.run(loadAndSign, { MOCK_CODESIGN_FAIL: failure });
    assert.notEqual(r.status, 0);
    assert.equal(r.calls.filter(c => c.name === 'codesign' && c.args.includes('--sign') && c.args.at(-1) === f.app).length, 0);
    assert.equal(r.calls.at(-1).args.includes(failure === 'sign' ? '--sign' : '-R'), true);
  });
}

unit('release verification rejects incorrect authority after signing succeeds', f => {
  const r = f.run(loadAndSign, { MACOS_SIGNING_MODE: 'release', CODESIGN_IDENTITY: sha, CODESIGN_KEYCHAIN: f.keychain, MOCK_AUTHORITY: 'Authority=Other' });
  assert.notEqual(r.status, 0);
  assert.deepEqual(r.calls.at(-1), { name: 'codesign', args: ['-dv', f.app] });
});

unit('release stops at failed exact leaf and identifier verification before checking authority', f => {
  const r = f.run(loadAndSign, {
    MACOS_SIGNING_MODE: 'release', CODESIGN_IDENTITY: sha, MOCK_CODESIGN_FAIL: 'requirement',
  });
  assert.notEqual(r.status, 0);
  assert.equal(r.calls.filter(c => c.name === 'codesign' && c.args.includes('--sign')).length, 2);
  assert.deepEqual(r.calls.at(-1), {
    name: 'codesign', args: ['--verify', '-R', `=identifier "${bundle}" and certificate leaf = H"${sha}"`, f.app],
  });
  assert.equal(r.calls.some(c => c.name === 'codesign' && c.args.includes('-dv')), false);
});

unit('release without a keychain works under system Bash nounset', f => {
  const r = f.run(loadAndSign, { MACOS_SIGNING_MODE: 'release', CODESIGN_IDENTITY: sha });
  ok(r);
  assert.deepEqual(r.calls[0], { name: 'security', args: ['find-identity', '-v', '-p', 'codesigning'] });
  const signing = r.calls.filter(c => c.name === 'codesign' && c.args.includes('--sign'));
  assert.equal(signing.length, 2);
  for (const { args } of signing) {
    assert.equal(args[args.indexOf('--sign') + 1], sha);
    assert.ok(!args.includes('--keychain'));
    assert.ok(!args.includes('--requirements'));
  }
  assert.deepEqual(r.calls.slice(-2), [
    { name: 'codesign', args: ['--verify', '-R', `=identifier "${bundle}" and certificate leaf = H"${sha}"`, f.app] },
    { name: 'codesign', args: ['-dv', f.app] },
  ]);
});

unit('development verify needs no private material, while default sign still rejects missing material', f => {
  fs.unlinkSync(f.keychain);
  const passwordFile = path.join(f.dir, 'absent-password');
  f.configWrite({ passwordFile });
  assert.equal(fs.existsSync(f.keychain), false);
  assert.equal(fs.existsSync(passwordFile), false);
  const signing = f.run(loadAndSign);
  rejected(signing, /password file must be owned by this user with mode 600/);
  assert.deepEqual(signing.calls, []);

  const r = f.run('macos_signing_load verify\nmacos_signing_verify_app "$APP" "$BUNDLE"', {
    MOCK_SECURITY_FAIL: '1', MOCK_IDENTITIES: '',
  });
  ok(r);
  assert.deepEqual(r.calls, [
    { name: 'codesign', args: ['--verify', '--deep', '--strict', f.app] },
    { name: 'codesign', args: ['--verify', '-R', `=identifier "${bundle}" and certificate leaf = H"${sha}"`, f.app] },
  ]);
});

unit('development verify accepts a public-pin-only config but propagates failed -R validation', f => {
  fs.unlinkSync(f.keychain);
  fs.writeFileSync(f.config, JSON.stringify({ identity: sha }));
  const r = f.run('macos_signing_load verify\nmacos_signing_verify_app "$APP" "$BUNDLE"\nprintf "UNEXPECTED_SUCCESS"', {
    MOCK_SECURITY_FAIL: '1', MOCK_IDENTITIES: '', MOCK_CODESIGN_FAIL: 'requirement',
  });
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stdout, /UNEXPECTED_SUCCESS/);
  assert.deepEqual(r.calls, [
    { name: 'codesign', args: ['--verify', '--deep', '--strict', f.app] },
    { name: 'codesign', args: ['--verify', '-R', `=identifier "${bundle}" and certificate leaf = H"${sha}"`, f.app] },
  ]);
});

unit('release verify skips missing keychain and identity lookup while checking pin and authority', f => {
  fs.unlinkSync(f.keychain);
  const r = f.run('macos_signing_load verify\nmacos_signing_verify_app "$APP" "$BUNDLE"', {
    MACOS_SIGNING_MODE: 'release', CODESIGN_IDENTITY: sha, CODESIGN_KEYCHAIN: f.keychain,
    MOCK_SECURITY_FAIL: '1', MOCK_IDENTITIES: '',
  });
  ok(r);
  assert.deepEqual(r.calls, [
    { name: 'codesign', args: ['--verify', '--deep', '--strict', f.app] },
    { name: 'codesign', args: ['--verify', '-R', `=identifier "${bundle}" and certificate leaf = H"${sha}"`, f.app] },
    { name: 'codesign', args: ['-dv', f.app] },
  ]);
});

unit('setup preserves existing config and search list when keychain enumeration fails', f => {
  f.configWrite();
  const before = outputSnapshot(f.home);
  const keychainBefore = fs.readFileSync(f.keychain);
  const r = f.run('/bin/bash "$SETUP"', { SETUP: setup, MOCK_LIST_FAIL: '1' });
  rejected(r, /Cannot read existing keychain search list; preserving it unchanged/);
  // Exact calls also exclude list -s, default-keychain changes, identity
  // lookup, unlock, import, and any filesystem/compilation/signing command.
  assert.deepEqual(r.calls, [{ name: 'security', args: ['list-keychains', '-d', 'user'] }]);
  assert.deepEqual(outputSnapshot(f.home), before);
  assert.deepEqual(fs.readFileSync(f.keychain), keychainBefore);
});

unit('setup reuses an already registered pinned keychain without generating keys or resetting search list', f => {
  f.configWrite();
  const before = outputSnapshot(f.home);
  const keychainBefore = fs.readFileSync(f.keychain);
  const r = f.run('/bin/bash "$SETUP"', {
    SETUP: setup,
    MOCK_KEYCHAINS: `    "${path.join(f.dir, 'other login.keychain-db')}"\n    "${f.keychain}"`,
  });
  ok(r);
  assert.equal(r.stdout.trim(), `Reusing pinned development identity: ${sha}`);
  assert.deepEqual(r.calls, [
    { name: 'security', args: ['list-keychains', '-d', 'user'] },
    { name: 'security', args: ['find-identity', '-p', 'codesigning', f.keychain] },
  ]);
  assert.deepEqual(outputSnapshot(f.home), before);
  assert.deepEqual(fs.readFileSync(f.keychain), keychainBefore);
});

function continuityFixture(f, { identical = false, cmsOnly = false, adhoc = false, changedCertificate = false, missingHelper = false } = {}) {
  const updated = path.join(f.dir, 'Updated App.app');
  fs.cpSync(f.app, updated, { recursive: true });
  if (!identical) fs.writeFileSync(path.join(updated, 'Contents/MacOS/opendesk'), 'changed mock owner binary');
  if (cmsOnly) {
    const code = fs.readFileSync(path.join(f.app, 'Contents/MacOS/opendesk'), 'utf8');
    fs.writeFileSync(path.join(updated, 'Contents/MacOS/opendesk'), code + '\nCMS=changed signing timestamp');
  }
  const relativeHelper = 'Contents/Frameworks/helper tool';
  if (missingHelper) fs.unlinkSync(path.join(updated, relativeHelper));
  const requirement = (id, certificate) => adhoc ? `identifier "${id}" and cdhash H"${certificate}"`
    : `identifier "${id}" and certificate leaf = H"${certificate}"`;
  const signatures = {};
  for (const [app, certificate] of [[f.app, sha], [updated, changedCertificate ? otherSha : sha]]) {
    signatures[app] = requirement(bundle, certificate);
    signatures[path.join(app, relativeHelper)] = requirement(`${bundle}.helper`, certificate);
  }
  const signatureFile = path.join(f.dir, 'signatures.json');
  fs.writeFileSync(signatureFile, JSON.stringify(signatures));
  return {
    updated, relativeHelper, signatures,
    run: () => f.run('/bin/bash "$CONTINUITY" "$APP" "$UPDATED_APP"', {
      UPDATED_APP: updated, MOCK_SIGNATURES: signatureFile,
    }),
  };
}

function assertSelfChecks(r, oldApp, newApp) {
  assert.deepEqual(r.calls.filter(c => c.name === 'codesign').slice(0, 4), [
    { name: 'codesign', args: ['--verify', '--deep', '--strict', oldApp] },
    { name: 'codesign', args: ['--verify', '--deep', '--strict', newApp] },
    { name: 'codesign', args: ['-d', '--verbose=4', oldApp] },
    { name: 'codesign', args: ['-d', '--verbose=4', newApp] },
  ]);
}

unit('continuity rejects identical owner binaries before codesign', f => {
  const pair = continuityFixture(f, { identical: true });
  const r = pair.run();
  rejected(r, /owner binaries are identical/);
  assert.doesNotMatch(r.stdout, /CONTINUITY_OK|continuity passed/);
});

unit('continuity rejects changed CMS bytes with identical CodeDirectory hashes', f => {
  const pair = continuityFixture(f, { cmsOnly: true });
  assert.notDeepEqual(fs.readFileSync(path.join(f.app, 'Contents/MacOS/opendesk')),
    fs.readFileSync(path.join(pair.updated, 'Contents/MacOS/opendesk')));
  const r = pair.run();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /CodeDirectory hashes must differ/);
  assertSelfChecks(r, f.app, pair.updated);
  assert.equal(r.calls.filter(c => c.name === 'codesign').length, 4);
  assert.equal(r.calls.some(c => c.args.includes('-r-') || c.args.includes('-R')), false);
  assert.doesNotMatch(r.stdout, /CONTINUITY_OK|continuity passed/);
});

unit('continuity rejects changed ad-hoc builds despite successful self verification', f => {
  const pair = continuityFixture(f, { adhoc: true });
  const r = pair.run();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /No persistent certificate-bound designated requirement/);
  assertSelfChecks(r, f.app, pair.updated);
  assert.deepEqual(r.calls.at(-1), { name: 'codesign', args: ['-d', '-r-', f.app] });
  assert.equal(r.calls.some(c => c.args.includes('-R')), false);
  assert.doesNotMatch(r.stdout, /CONTINUITY_OK|continuity passed/);
});

unit('continuity rejects certificate B using A external requirement, even though B self verifies', f => {
  const pair = continuityFixture(f, { changedCertificate: true });
  const r = pair.run();
  assert.notEqual(r.status, 0);
  assertSelfChecks(r, f.app, pair.updated);
  assert.match(r.stderr, /mock external requirement mismatch/);
  assert.deepEqual(r.calls.filter(c => c.name === 'codesign').slice(4), [
    { name: 'codesign', args: ['-d', '-r-', f.app] },
    { name: 'codesign', args: ['--verify', '--strict', '-R', `=${pair.signatures[f.app]}`, pair.updated] },
  ]);
  assert.doesNotMatch(r.stdout, /CONTINUITY_OK|continuity passed/);
});

unit('continuity rejects a missing updated helper after checking owner continuity', f => {
  const pair = continuityFixture(f, { missingHelper: true });
  const r = pair.run();
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Missing updated helper: Contents\/Frameworks\/helper tool/);
  assertSelfChecks(r, f.app, pair.updated);
  assert.match(r.stdout, /CONTINUITY_OK/);
  assert.doesNotMatch(r.stdout, /continuity passed/);
  assert.deepEqual(r.calls.filter(c => c.name === 'codesign' && c.args.includes('-R')), [
    { name: 'codesign', args: ['--verify', '--strict', '-R', `=${pair.signatures[f.app]}`, pair.updated] },
  ]);
});

unit('continuity accepts changed owner with same certificate and checks A requirements on B owner and helper', f => {
  const pair = continuityFixture(f);
  const r = pair.run();
  ok(r);
  assertSelfChecks(r, f.app, pair.updated);
  const oldHelper = path.join(f.app, pair.relativeHelper);
  const newHelper = path.join(pair.updated, pair.relativeHelper);
  assert.deepEqual(r.calls.filter(c => c.name === 'codesign').slice(4), [
    { name: 'codesign', args: ['-d', '-r-', f.app] },
    { name: 'codesign', args: ['--verify', '--strict', '-R', `=${pair.signatures[f.app]}`, pair.updated] },
    { name: 'codesign', args: ['-d', '-r-', oldHelper] },
    { name: 'codesign', args: ['--verify', '--strict', '-R', `=${pair.signatures[oldHelper]}`, newHelper] },
  ]);
  assert.deepEqual(r.stdout.split('\n').filter(line => line.startsWith('CONTINUITY_OK ')), [
    `CONTINUITY_OK ${pair.updated}`, `CONTINUITY_OK ${newHelper}`,
  ]);
  assert.match(r.stdout, /Changed-build certificate continuity passed/);
  assert.match(r.stdout, /TCC grants still require real App upgrade validation/);
});

// Include metadata as well as content so replacement with identical bytes is
// detected. Snapshot only fixture-owned output, never the real dist directory.
function outputSnapshot(dir) {
  const entries = [];
  function visit(target) {
    const stat = fs.lstatSync(target, { bigint: true });
    entries.push({ path: path.relative(dir, target), mode: stat.mode, ino: stat.ino,
      mtime: stat.mtimeNs, ctime: stat.ctimeNs,
      content: stat.isFile() ? fs.readFileSync(target).toString('base64') : null });
    if (stat.isDirectory()) for (const name of fs.readdirSync(target).sort()) visit(path.join(target, name));
  }
  visit(dir);
  return entries;
}

for (const [name, settings, message] of [
  ['missing default config', {}, /not configured/],
  ['unknown mode', { MACOS_SIGNING_MODE: 'typo' }, /must be/],
  ['release without identity', { MACOS_SIGNING_MODE: 'release' }, /release requires/],
  ['stable mode with skip', { MACOS_SIGNING_MODE: 'development', SKIP_CODESIGN: '1' }, /cannot skip/],
]) {
  unit(`source builder rejects ${name} before compilation or artifact mutation`, f => {
    const dist = path.join(f.dir, 'dist');
    const previousApp = path.join(dist, 'OpenDesk.app');
    fs.mkdirSync(dist);
    fs.cpSync(f.app, previousApp, { recursive: true });
    fs.writeFileSync(path.join(dist, 'opendesk'), 'previous launcher');
    const stage = path.join(f.dir, 'build-stage');
    fs.mkdirSync(stage);
    const before = outputSnapshot(dist);
    const stageBefore = outputSnapshot(stage);
    const r = f.run('source "$BUILDER"', {
      DIST_DIR: dist, VERSION: '1.2.3', GO_BIN: path.join(f.dir, 'bin/go'),
      MOCK_BUILD_STAGE: stage, MOCK_BUILD_PARENT: path.join(root, '.runtime/build'), ...settings,
    });
    rejected(r, message);
    // Staging allocation/cleanup is allowed, but compilation, publication and
    // mutation of existing artifacts must never be reached.
    assert.deepEqual(r.calls, [
      { name: 'mkdir', args: ['-p', path.join(root, '.runtime/build')] },
      { name: 'mktemp', args: ['-d', path.join(root, '.runtime/build/macos-app.XXXXXX')] },
      { name: 'chmod', args: ['-R', 'u+w', stage] },
      { name: 'rm', args: ['-rf', stage] },
    ]);
    assert.deepEqual(outputSnapshot(dist), before);
    assert.deepEqual(outputSnapshot(stage), stageBefore);
  });
}

unit('nested UI app is signed between Mach-O leaves and outer app using its pinned identity', f => {
  f.configWrite();
  const nested = path.join(f.app, 'Contents/Helpers/OpenDesk UI.app');
  const host = path.join(nested, 'Contents/MacOS/opendesk-ui-host');
  fs.mkdirSync(path.dirname(host), { recursive: true });
  fs.writeFileSync(host, 'mock Mach-O');
  fs.writeFileSync(path.join(nested, 'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundle}.ui-host</string></dict></plist>`);
  const r = f.run(loadAndSign);
  ok(r);
  const calls = r.calls.filter(c => c.name === 'codesign' && c.args.includes('--sign'));
  assert.deepEqual(calls.slice(-3).map(c => c.args.at(-1)), [host, nested, f.app]);
  for (const call of calls.slice(-3, -1)) {
    assert.equal(call.args[call.args.indexOf('--identifier') + 1], `${bundle}.ui-host`);
    assert.equal(call.args[call.args.indexOf('--requirements') + 1], `=designated => identifier "${bundle}.ui-host" and certificate leaf = H"${sha}"`);
  }
});

unit('continuity checks the nested UI app requirement as well as its executable', f => {
  const relative = 'Contents/Helpers/OpenDesk UI.app';
  const nested = path.join(f.app, relative);
  fs.mkdirSync(path.join(nested, 'Contents/MacOS'), { recursive: true });
  fs.writeFileSync(path.join(nested, 'Contents/MacOS/opendesk-ui-host'), 'fixture host');
  const pair = continuityFixture(f);
  for (const app of [f.app, pair.updated]) {
    pair.signatures[path.join(app, relative)] = `identifier "${bundle}.ui-host" and certificate leaf = H"${sha}"`;
    pair.signatures[path.join(app, relative, 'Contents/MacOS/opendesk-ui-host')] = pair.signatures[path.join(app, relative)];
  }
  fs.writeFileSync(path.join(f.dir, 'signatures.json'), JSON.stringify(pair.signatures));
  const r = pair.run();
  ok(r);
  assert.ok(r.calls.some(c => c.name === 'codesign' && c.args.includes('-R') && c.args.at(-1) === path.join(pair.updated, relative)));
});
