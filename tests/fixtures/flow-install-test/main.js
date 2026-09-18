'use strict';

const message = 'OpenDesk Install Test: explicit run succeeded';
const resource = File.read(Flow.resolve('assets/value.txt'));
const record = {
  message,
  root: Flow.root,
  dataDir: Flow.dataDir,
  cwd: Execution.workdir,
  resource,
};

File.write(File.join(Flow.dataDir, 'install-test.marker'), message + '\n');
File.write(File.join(Flow.dataDir, 'result.json'), JSON.stringify(record));
File.write(File.join(Flow.dataDir, 'run.json'), JSON.stringify(record));
