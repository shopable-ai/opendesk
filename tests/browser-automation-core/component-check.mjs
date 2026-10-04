import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { sourceSnapshot } from '../../lab/browser-automation-core/candidate.mjs';
import { ROOT, SOURCE, EVIDENCE } from '../../lab/browser-automation-core/config.mjs';

export function provenance() {
  const files = fs.readdirSync(SOURCE).filter(name => name.endsWith('.mjs')).map(name => `${SOURCE}/${name}`);
  for (const name of fs.readdirSync(`${SOURCE}/extension`)) files.push(`${SOURCE}/extension/${name}`);
  const testDirectory = `${ROOT}/tests/browser-automation-core`;
  for (const name of fs.readdirSync(testDirectory, {recursive: true})) if (name.endsWith('.mjs') || name.endsWith('.js') || name.endsWith('.html')) files.push(`${testDirectory}/${name}`);
  files.push(`${ROOT}/docs/quality/browser-automation/core-demo-acceptance.json`);
  return {...sourceSnapshot(), gitSha: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).trim(),
    pushed: 'not pushed by this task', files: files.map(file => ({file: path.relative(ROOT, file),
      sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}))};
}
export async function checkComponents() {
  const directory = path.join(EVIDENCE, `components-${Date.now()}`); fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const report = {level: 'components', liveBrowser: 'NOT_RUN', directory, provenance: provenance(), results: []};
  for (const [level, files] of [['unit-deterministic', ['protocol.test.mjs', 'installation.test.mjs', 'locator.test.mjs', 'verifier.test.mjs', 'worker-limits.test.mjs']], ['integration', ['integration.test.mjs', 'process-control.test.mjs', 'native-installation.test.mjs', 'resources.test.mjs']]]) {
    const log = fs.openSync(path.join(directory, `${level}.log`), 'ax', 0o600);
    const child = spawn(process.execPath, ['--test', ...files.map(file => `${ROOT}/tests/browser-automation-core/${file}`)], {cwd: ROOT, stdio: ['ignore', log, log]});
    const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
    fs.closeSync(log); report.results.push({level, status: code === 0 ? 'PASS' : 'FAIL', exitCode: code});
    if (code !== 0) break;
  }
  fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2)); return report;
}
