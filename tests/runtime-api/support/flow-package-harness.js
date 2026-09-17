(function createFlowPackageHarness(options) {
'use strict';
const { assert, binary, root, fixtures, sentinel, sourceToken } = options;
const publisherPrivate = File.join(fixtures, 'publisher-private.pem');
const publisherPublic = File.join(fixtures, 'publisher-public.pem');
const licenseIssuerPublic = File.join(fixtures, 'license-issuer-public.pem');
const contentKey = File.join(fixtures, 'content-key.hex');

  async function cli(args, expectSuccess = true) {
    try {
      const result = await Command.run(binary, args, {
        cwd: Execution.workdir,
        emitOutput: false,
        timeout: 30_000,
        maxOutputBytes: 4 * 1024 * 1024,
      });
      const body = JSON.parse(result.stdout);
      if (!expectSuccess) throw new Error('command unexpectedly succeeded: ' + JSON.stringify(args));
      assert(body && body.ok === true, result.stdout);
      return body;
    } catch (error) {
      if (expectSuccess) throw error;
      assert(error && error.code === 'EXIT_NONZERO', String(error));
      const body = JSON.parse(String(error.stdout || ''));
      assert(body && body.ok === false && body.error && body.error.code, String(error.stdout));
      return body;
    }
  }

  function assertNeverExecuted() {
    assert(!File.exists(sentinel), 'pack/inspect/verify executed packaged business JavaScript');
  }

  function setupTrust(flowRoot, includeIssuer = false) {
    const trust = File.join(flowRoot, 'trust');
    File.ensureDir(trust);
    File.copy(publisherPublic, File.join(trust, 'publisher.pub'));
    if (includeIssuer) File.copy(licenseIssuerPublic, File.join(trust, 'license-issuer.pub'));
  }

  function findASCII(bytes, text) {
    for (let index = 0; index <= bytes.length - text.length; index += 1) {
      let matched = true;
      for (let offset = 0; offset < text.length; offset += 1) {
        if (bytes[index + offset] !== text.charCodeAt(offset)) { matched = false; break; }
      }
      if (matched) return index;
    }
    return -1;
  }

  function tamperStoredASCII(source, target, text) {
    const bytes = File.readBytes(source);
    const index = findASCII(bytes, text);
    assert(index >= 0, 'tamper target was not stored verbatim in .odflow');
    bytes[index] ^= 1;
    File.writeBytes(target, bytes);
  }

  function readU16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readU32LE(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function localEntryData(bytes, wantedName) {
    for (let offset = 0; offset + 30 <= bytes.length; offset += 1) {
      if (readU32LE(bytes, offset) !== 0x04034b50) continue;
      const nameLength = readU16LE(bytes, offset + 26);
      const extraLength = readU16LE(bytes, offset + 28);
      if (offset + 30 + nameLength + extraLength >= bytes.length) continue;
      let name = '';
      for (let index = 0; index < nameLength; index += 1) name += String.fromCharCode(bytes[offset + 30 + index]);
      if (name === wantedName) return { offset: offset + 30 + nameLength + extraLength };
    }
    return null;
  }

  function tamperEntryByte(source, target, entryName) {
    const bytes = File.readBytes(source);
    const entry = localEntryData(bytes, entryName);
    assert(entry, 'ZIP local entry not found: ' + entryName);
    bytes[entry.offset] ^= 1;
    File.writeBytes(target, bytes);
  }


return Object.freeze({
  cli, assertNeverExecuted, setupTrust, tamperStoredASCII, tamperEntryByte,
  publisherPrivate, publisherPublic, licenseIssuerPublic, contentKey,
});
})
