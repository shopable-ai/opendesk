(() => {
  const { assert, equal, expectThrow, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('path');

  test({
    name: 'path follows native Node-compatible string semantics from Execution.workdir',
    tier: 'unit',
    covers: [
      'path.join', 'path.resolve', 'path.normalize', 'path.dirname', 'path.basename',
      'path.extname', 'path.relative', 'path.isAbsolute', 'path.sep', 'path.delimiter',
    ],
  }, async () => {
    const sep = path.sep;
    equal(typeof sep, 'string');
    equal(sep.length, 1);
    assert(path.delimiter === ':' || path.delimiter === ';', `delimiter=${path.delimiter}`);
    equal(path.join(), '.');
    equal(path.join('', ''), '.');
    equal(path.join('alpha', '', 'beta'), `alpha${sep}beta`);
    equal(path.join(`${sep}foo`, `${sep}bar`, 'baz'), `${sep}foo${sep}bar${sep}baz`);
    equal(path.join('foo', `bar${sep}`), `foo${sep}bar${sep}`);
    equal(path.normalize(''), '.');
    equal(path.normalize(`alpha${sep}nested${sep}..${sep}`), `alpha${sep}`);
    equal(path.dirname(`alpha${sep}beta.txt`), 'alpha');
    equal(path.dirname(`foo${sep}`), '.');
    equal(path.basename(`${sep}alpha${sep}beta.txt${sep}`, '.txt'), 'beta');
    equal(path.basename('same', 'same'), '');
    equal(path.extname('.index'), '');
    equal(path.extname('..index'), '.index');
    equal(path.extname('...'), '.');
    equal(path.resolve(), Execution.workdir);
    equal(path.resolve('asset'), path.join(Execution.workdir, 'asset'));
    equal(path.relative(path.resolve('same'), path.resolve('same')), '');
    equal(path.relative(path.resolve('from'), path.resolve('to')), `..${sep}to`);
    equal(path.isAbsolute(''), false);
    equal(path.isAbsolute(Execution.workdir), true);
    await expectThrow(() => path.join('alpha', 1), 'requires string arguments');
    await expectThrow(() => path.basename('alpha', null), 'requires string arguments');
  });
})();
