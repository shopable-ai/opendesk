const fixture = (0, eval)(File.read(File.join(Execution.workdir, 'tests', 'accessibility', 'fixtures', 'macos', 'fixture-lib.js')));
fixture.assertDarwin();
fixture.assertCommand();
const paths = fixture.root();
const existingPid = await fixture.findOwnedPid(paths);
if (existingPid) throw new Error(`fixture executable is already running as pid ${existingPid}; stop it before rebuilding`);
const app = await fixture.build(paths);
console.log(JSON.stringify({ status: 'built', app, log: paths.log }));
