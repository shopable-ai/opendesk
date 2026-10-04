import fs from 'node:fs';
import path from 'node:path';
import { Broker } from '../../../../lab/browser-automation-core/broker.mjs';

// Thin lifecycle test entry. The production Broker owns its implementation and state format.
const stateDirectory = process.argv[2];
const install = JSON.parse(fs.readFileSync(path.join(stateDirectory, 'install.json')));
const broker = await new Broker(install, {stateDirectory, socketPath: path.join(stateDirectory, 'b.sock')}).start();
console.log(JSON.stringify(broker.status()));
process.on('SIGTERM', async () => { await broker.stop(); process.exit(0); });
