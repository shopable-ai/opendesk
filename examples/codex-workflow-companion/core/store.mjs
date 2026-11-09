import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Single-process, single-writer store. Never force-unlock or rewrite a corrupt state. */
export class Store {
  constructor(dir) {
    this.dir = path.resolve(dir);
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(this.dir).isSymbolicLink()) throw Error('SYMLINK_DIR');
    fs.chmodSync(this.dir, 0o700);
    this.lockFile = path.join(this.dir, 'owner.lock');
    this.file = path.join(this.dir, 'state.json');
    this.fd = fs.openSync(this.lockFile, 'wx', 0o600);
    fs.writeSync(this.fd, JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }));
  }
  load() {
    if (!fs.existsSync(this.file)) return null;
    const st = fs.lstatSync(this.file);
    if (!st.isFile() || st.isSymbolicLink() || st.size > 1_048_576) throw Error('STATE_FILE_UNSAFE');
    const value = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (value?.schemaVersion !== 1 || !Array.isArray(value.tasks) || !Array.isArray(value.history)) throw Error('STATE_SCHEMA_UNSUPPORTED');
    return value;
  }
  save(value) {
    const name = path.join(this.dir, '.state-' + randomUUID() + '.tmp');
    let fd;
    try {
      fd = fs.openSync(name, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n');
      fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
      if (fs.existsSync(this.file) && fs.lstatSync(this.file).isSymbolicLink()) throw Error('STATE_SYMLINK');
      fs.renameSync(name, this.file);
      const dirFd = fs.openSync(this.dir, 'r');
      try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      if (fs.existsSync(name)) fs.unlinkSync(name);
    }
  }
  close() {
    if (this.fd === undefined) return;
    fs.closeSync(this.fd); this.fd = undefined;
    fs.unlinkSync(this.lockFile);
  }
}
