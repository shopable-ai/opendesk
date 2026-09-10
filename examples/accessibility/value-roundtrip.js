// Human-readable UI.getValue/UI.setValue demonstration.
// Run from the repository root:
// ./dist/opendesk -script examples/accessibility/value-roundtrip.js -console-mode script -log-dir .runtime/tests/accessibility/public-value-roundtrip
//
// The example only uses the repository-owned macOS Accessibility fixture. It
// never selects an arbitrary foreground window or prints protected content.

const EXAMPLE_TIMEOUT_MS = 3000;
const STATE_WAIT_MS = 2000;
const exampleRoot = String(Execution.workdir || File.cwd());
const fixtureTarget = (0, eval)(File.read(File.join(
  exampleRoot, 'examples', 'accessibility', 'lib', 'fixture-target.js')));

function requireTextValueAccessibility() {
  const capabilities = Accessibility.getCapabilities();
  if (!capabilities.hostAuthorization.enabled) {
    throw new Error('当前 execution 没有启用 Accessibility');
  }
  if (!capabilities.implementation.available) {
    throw new Error('当前平台没有可用的原生 Accessibility backend');
  }
  if (!capabilities.permission.granted) {
    throw new Error('OpenDesk 尚未取得系统 Accessibility 权限');
  }
  return capabilities;
}

function visibleText(value) {
  return value.replace(/ /g, '·').replace(/\n/g, '↵\n');
}

function valueOptions(within) {
  return {
    within,
    timeout: EXAMPLE_TIMEOUT_MS,
    maxDepth: 8,
    maxNodes: 1000,
  };
}

async function fixtureState() {
  return File.readJSON(fixtureTarget.paths().state);
}

async function waitForFixtureState(expectedCount, expectedValue) {
  const deadline = Date.now() + STATE_WAIT_MS;
  while (Date.now() <= deadline) {
    const state = await fixtureState();
    if (state.setValueCount === expectedCount && state.editableValue === expectedValue) return state;
    await sleep(50);
  }
  throw new Error('独立 fixture 状态没有在时限内确认这次写入');
}

async function main() {
  let session = null;
  let failure = null;
  console.log('=== UI 原生文本值演示 ===');
  console.log('提示：显示中的 · 代表空格，↵ 代表换行。');

  try {
    const capabilities = requireTextValueAccessibility();
    session = await fixtureTarget.window({ autoLaunch: true });
    const within = session.window;
    const editable = { role: 'textField', identifier: 'fixture.text.editable' };
    const readonly = { role: 'textField', identifier: 'fixture.text.readonly' };
    const beforeState = await fixtureState();

    console.log(`1/5 已连接仓库测试窗口；platform=${capabilities.platform}，backend=${capabilities.backend}`);

    const before = await UI.getValue(editable, valueOptions(within));
    const readonlyValue = await UI.getValue(readonly, valueOptions(within));
    console.log(`2/5 可编辑字段原值：${visibleText(before)}`);
    console.log(`    只读字段也能读取：${visibleText(readonlyValue)}`);

    const expected = ' 00123 中文\n第二行 ';
    const receipt = await UI.setValue(editable, expected, valueOptions(within));
    console.log(`3/5 原生写入完成；actionState=${receipt.actionState}，verified=${receipt.verified}`);

    const readback = await UI.getValue(editable, valueOptions(within));
    if (readback !== expected) throw new Error('UI.getValue 回读值与写入值不一致');
    console.log(`4/5 严格回读一致：${visibleText(readback)}`);

    const state = await waitForFixtureState(beforeState.setValueCount + 1, expected);
    console.log(`5/5 独立 fixture 计数确认：本次原生提交数=${state.setValueCount - beforeState.setValueCount}`);
    console.log('✅ PASS：字符串、前导零、中文、空格和换行均保持，且只提交一次。');
  } catch (error) {
    failure = error;
    console.log(`❌ FAIL：${error && error.code ? error.code + ' - ' : ''}${error.message || error}`);
    throw error;
  } finally {
    if (session && session.startedByExample) {
      try {
        await fixtureTarget.stopFixture();
        console.log('清理：已停止本示例自动启动的测试窗口。');
      } catch (error) {
        if (!failure) throw error;
      }
    }
  }
}

await main();
