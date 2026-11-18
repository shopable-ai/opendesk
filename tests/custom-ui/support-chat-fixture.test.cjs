// Headless fixture contract tests. No app bundle, signing, AX interaction or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(__dirname, 'tools/support-chat/main.swift'), 'utf8');

test('real Swift fixture model: roles, unique IDs, send counts, failures and unknown delivery truth', {skip: process.platform !== 'darwin'}, () => {
  const model = source.split('// BEGIN HEADLESS FIXTURE MODEL (also exercised without launching AppKit)')[1]
    ?.split('// END HEADLESS FIXTURE MODEL')[0];
  assert.ok(model, 'test must execute the model from main.swift');
  const parent = path.join(root, '.runtime/tests/custom-ui');
  fs.mkdirSync(parent, {recursive: true});
  const dir = fs.mkdtempSync(path.join(parent, 'support-chat-fixture-'));
  try {
    const script = path.join(dir, 'contract.swift');
    fs.writeFileSync(script, 'import Foundation\n' + model + String.raw`
let boundary = SupportChatFixture()
precondition(boundary.send(String(repeating: "字", count: 4000), selected: 0, mode: .success).status == "sent")
precondition(boundary.send(String(repeating: "😀", count: 2001), selected: 0, mode: .success).status == "failed")
let burstFixture = SupportChatFixture()
let burst = burstFixture.customerBurst("同文突发", selected: 1)
precondition(burst.count == 8 && Set(burst.map { $0.id }).count == 8)
precondition(burst.map { $0.id } == (1...8).map { "t2-m\($0)" })
precondition(burst.allSatisfy { $0.who == "customer" && $0.text == "同文突发" })
precondition(burstFixture.messages[1].count == 8 && burstFixture.messages[0].isEmpty && burstFixture.messages[2].isEmpty)
precondition(burstFixture.sendActions == 0 && burstFixture.sendResults.isEmpty)
let afterBurst = burstFixture.send("合并一次", selected: 1, mode: .success)
precondition(afterBurst.messageID == "t2-m9" && burstFixture.sendActions == 1)
let fixture = SupportChatFixture()
precondition(fixture.sendActions == 0 && fixture.sendResults.isEmpty)
precondition(fixture.messages.allSatisfy { $0.isEmpty })
let customer = fixture.append("同文", who: "customer", selected: 0)
let first = fixture.send("同文", selected: 0, mode: .success)
let second = fixture.send("同文", selected: 0, mode: .success)
precondition(first.status == "sent" && first.delivered)
precondition(first.messageID != second.messageID && first.messageID != customer.id)
precondition(fixture.messages[0].map { $0.who } == ["customer", "agent", "agent"])
let before = fixture.messages[0].count
let failed = fixture.send("应失败", selected: 0, mode: .failure)
precondition(failed.status == "failed" && !failed.delivered && failed.messageID == nil)
precondition(fixture.messages[0].count == before)
let delivered = fixture.send("未知回复", selected: 1, mode: .unknownDelivered)
let absent = fixture.send("未知回复", selected: 2, mode: .unknownNotDelivered)
precondition(delivered.status == "unknown" && absent.status == "unknown")
precondition(delivered.delivered && !absent.delivered)
precondition(delivered.reason == absent.reason && delivered.reason == "receipt-unavailable")
precondition(!delivered.receipt.contains("delivered") && !absent.receipt.contains("not-delivered"))
precondition(fixture.messages[1].count == 1 && fixture.messages[1][0].id == delivered.messageID)
precondition(fixture.messages[2].isEmpty && absent.messageID == nil)
for mode in FixtureSendMode.allCases {
    let empty = fixture.send(" \n ", selected: 0, mode: mode)
    let long = fixture.send(String(repeating: "字", count: 4001), selected: 0, mode: mode)
    precondition(empty.status == "failed" && long.status == "failed")
    precondition(!empty.delivered && !long.delivered && empty.reason == "invalid-draft")
}
precondition(fixture.sendActions == 13)
precondition(fixture.sendResults.map { $0.action } == Array(1...13))
let snapshots: [[String: Any]] = (0..<3).map { i in
    ["session": "t\(i+1)", "messages": fixture.messages[i].map { $0.oracle },
     "nodes": fixture.messages[i].map { ["identifier": $0.axIdentifier, "value": $0.axValue] }]
}
for _ in 0..<35 { fixture.append("保留上限", who: "customer", selected: 0) }
precondition(fixture.messages[0].count == 30)
let final = fixture.send("同文", selected: 0, mode: .success)
precondition(final.messageID == "t1-m40")
let payload: [String: Any] = ["snapshots": snapshots, "sendResults": fixture.sendResults.map { $0.oracle }]
let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
`);
    const run = spawnSync('swift', [script], {cwd: root, encoding: 'utf8', timeout: 60000});
    assert.equal(run.error, undefined);
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const result = JSON.parse(run.stdout);
    const sends = result.sendResults;
    assert.equal(sends[2].messageId, null);
    assert.equal(sends[2].mode, 'failure');
    assert.equal(sends[3].status, 'unknown');
    assert.equal(sends[3].delivered, true);
    assert.equal(sends[4].status, 'unknown');
    assert.equal(sends[4].delivered, false);
    // Existing production parser reads the fixture's actual AX text/ID contract.
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(root, 'examples/ai-customer-support/desktop/native-adapter.js'), 'utf8'), context);
    for (const [i, snapshot] of result.snapshots.entries()) {
      const names = ['林女士', '陈先生', '周女士'];
      const parsed = context.OpenDeskSupportNative.parse({complete: true, truncated: false, root: {children: [
        {identifier: 'support.session', value: snapshot.session + ' · ' + names[i]},
        {identifier: 'support.draft.' + snapshot.session, value: ''}, ...snapshot.nodes,
      ]}});
      assert.deepEqual(JSON.parse(JSON.stringify(parsed.messages)), snapshot.messages);
    }
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('fixture UI preserves legacy entry points and clears drafts only on a confirmed local send', () => {
  for (const id of ['support.session', 'support.clear-draft', 'support.customer-input', 'support.add-message', 'support.add-burst',
    'support.fixture.send-mode', 'support.fixture.send', 'support.fixture.send-result']) {
    assert.ok(source.includes('"' + id + '"'), id);
  }
  assert.ok(source.includes(String.raw`support.draft.t\(i+1)`));
  assert.ok(source.includes(String.raw`support.contact.t\(i+1)`));
  assert.ok(source.includes('OpenDesk R2.3 Test Chat'));
  assert.ok(source.includes('opendesk-support-test-chat'));
  assert.ok(source.includes('let names = ["林女士", "陈先生", "周女士"]'));
  assert.ok(source.includes('if result.status == "sent" { drafts[selected] = "" }'));
  assert.ok(source.includes('"sendActions": fixture.sendActions'));
  assert.ok(source.includes('"sendResults": fixture.sendResults.map { $0.oracle }'));
  assert.ok(source.includes('"fixture": "local-only-not-wechat"'));
  assert.ok(source.includes('fixture.customerBurst(text, selected: selected)'));
});
