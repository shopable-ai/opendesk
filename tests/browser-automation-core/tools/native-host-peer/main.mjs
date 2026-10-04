import fs from 'node:fs';
import path from 'node:path';
import { runNativeHost } from '../../../../lab/browser-automation-core/native-host.mjs';

// Thin entry adapter only. The production Host owns all framing, authentication and bridge behavior.
const stateDirectory = process.argv[3];
runNativeHost({origin: process.argv[2], socketPath: path.join(stateDirectory, 'b.sock'),
  install: JSON.parse(fs.readFileSync(path.join(stateDirectory, 'install.json')))});
