(function createFlowPackageHarness(options) {
'use strict';
const { assert, binary, root, sentinel, sourceToken } = options;
// Deterministic non-production test vectors. Secret-shaped files are materialized
// only inside the run-scoped .runtime tree; none of these values are production keys.
const keyRoot = File.join(root, 'keys');
File.ensureDir(keyRoot);
const publisherPrivate = File.join(keyRoot, 'publisher-private.pem');
const publisherPublic = File.join(keyRoot, 'publisher-public.pem');
const licenseIssuerPublic = File.join(keyRoot, 'license-issuer-public.pem');
const contentKey = File.join(keyRoot, 'content-key.hex');
File.write(publisherPrivate, '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIAABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4f\n-----END PRIVATE KEY-----\n');
File.write(publisherPublic, '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAA6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg=\n-----END PUBLIC KEY-----\n');
File.write(licenseIssuerPublic, '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAKay64UG8yvCyLhqU000LxzYeUm0L/hLIl5S8kyKWbdc=\n-----END PUBLIC KEY-----\n');
File.write(contentKey, '404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f\n');

  async function cli(args, expectSuccess = true, environment = null) {
    const runOptions = {
      cwd: Execution.workdir,
      emitOutput: false,
      timeout: 30_000,
      maxOutputBytes: 4 * 1024 * 1024,
    };
    if (environment) runOptions.env = environment;
    try {
      const result = await Command.run(binary, args, runOptions);
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
    assert(!File.exists(sentinel), 'Flow package operation executed packaged business JavaScript');
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

  function writeU32LE(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
  }

  function asciiAt(bytes, offset, length) {
    let value = '';
    for (let index = 0; index < length; index += 1) value += String.fromCharCode(bytes[offset + index]);
    return value;
  }

  function writeASCIIAt(bytes, offset, value) {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  }

  function localEntryData(bytes, wantedName) {
    for (let offset = 0; offset + 30 <= bytes.length; offset += 1) {
      if (readU32LE(bytes, offset) !== 0x04034b50) continue;
      const nameLength = readU16LE(bytes, offset + 26);
      const extraLength = readU16LE(bytes, offset + 28);
      if (offset + 30 + nameLength + extraLength >= bytes.length) continue;
      const name = asciiAt(bytes, offset + 30, nameLength);
      if (name === wantedName) return { headerOffset: offset, nameOffset: offset + 30, nameLength, dataOffset: offset + 30 + nameLength + extraLength };
    }
    return null;
  }

  function centralEntryData(bytes, wantedName) {
    for (let offset = 0; offset + 46 <= bytes.length; offset += 1) {
      if (readU32LE(bytes, offset) !== 0x02014b50) continue;
      const nameLength = readU16LE(bytes, offset + 28);
      const extraLength = readU16LE(bytes, offset + 30);
      const commentLength = readU16LE(bytes, offset + 32);
      if (offset + 46 + nameLength + extraLength + commentLength > bytes.length) continue;
      const name = asciiAt(bytes, offset + 46, nameLength);
      if (name === wantedName) return { headerOffset: offset, nameOffset: offset + 46, nameLength };
    }
    return null;
  }

  function tamperEntryByte(source, target, entryName) {
    const bytes = File.readBytes(source);
    const entry = localEntryData(bytes, entryName);
    assert(entry, 'ZIP local entry not found: ' + entryName);
    bytes[entry.dataOffset] ^= 1;
    File.writeBytes(target, bytes);
  }

  function rewriteZipEntryNameSameLength(source, target, fromName, toName) {
    assert(fromName.length === toName.length, 'ZIP test rename must preserve byte length');
    const bytes = File.readBytes(source);
    const local = localEntryData(bytes, fromName);
    const central = centralEntryData(bytes, fromName);
    assert(local && central, 'ZIP entry not found for rename: ' + fromName);
    writeASCIIAt(bytes, local.nameOffset, toName);
    writeASCIIAt(bytes, central.nameOffset, toName);
    File.writeBytes(target, bytes);
  }

  function markZipEntrySymlink(source, target, entryName) {
    const bytes = File.readBytes(source);
    const central = centralEntryData(bytes, entryName);
    assert(central, 'ZIP central entry not found: ' + entryName);
    // Creator system = Unix and external mode = symlink (0120777). The payload
    // bytes and CRC remain untouched; only the archive entry type changes.
    bytes[central.headerOffset + 5] = 3;
    writeU32LE(bytes, central.headerOffset + 38, (0xA1FF << 16) >>> 0);
    File.writeBytes(target, bytes);
  }

return Object.freeze({
  cli, assertNeverExecuted, setupTrust, tamperStoredASCII, tamperEntryByte,
  rewriteZipEntryNameSameLength, markZipEntrySymlink,
  publisherPrivate, publisherPublic, licenseIssuerPublic, contentKey,
});
})
