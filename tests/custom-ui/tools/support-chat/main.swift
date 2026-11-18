import AppKit

// An independent, local-only test client: simulated sends never use a network or
// represent WeChat delivery. Oracle output is for the independent test only.
// BEGIN HEADLESS FIXTURE MODEL (also exercised without launching AppKit)
enum FixtureSendMode: String, CaseIterable {
    case success, failure, unknownDelivered = "unknown-delivered", unknownNotDelivered = "unknown-not-delivered"
}
struct FixtureMessage {
    let id: String
    let text: String
    let who: String
    var oracle: [String: Any] { ["id": id, "text": text, "who": who] }
    var axIdentifier: String { "support.message.\(id).\(who)" }
    var axValue: String { "\(who == "customer" ? "客户" : "客服") · \(id)\n\(text)" }
}
struct FixtureSendResult {
    let action: Int
    let session: String
    let status: String
    let mode: FixtureSendMode
    let delivered: Bool
    let messageID: String?
    let reason: String
    // The visible receipt deliberately omits delivery truth for unknown results.
    var receipt: String { "action=\(action) session=\(session) result=\(status) reason=\(reason)" }
    var oracle: [String: Any] {
        ["action": action, "session": session, "status": status, "mode": mode.rawValue, "delivered": delivered,
         "messageId": messageID as Any? ?? NSNull(), "reason": reason]
    }
}
final class SupportChatFixture {
    private var serial = 0
    private(set) var messages: [[FixtureMessage]] = [[], [], []]
    private(set) var sendActions = 0
    private(set) var sendResults: [FixtureSendResult] = []
    @discardableResult func append(_ text: String, who: String, selected: Int) -> FixtureMessage {
        serial += 1
        let message = FixtureMessage(id: "t\(selected+1)-m\(serial)", text: text, who: who)
        messages[selected].append(message)
        if messages[selected].count > 30 { messages[selected].removeFirst() }
        return message
    }
    // One local UI event publishes the controller's maximum bounded batch.
    // No timers, observation injection or automatic send is involved.
    @discardableResult func customerBurst(_ text: String, selected: Int) -> [FixtureMessage] {
        (0..<8).map { _ in append(text, who: "customer", selected: selected) }
    }
    func send(_ text: String, selected: Int, mode: FixtureSendMode) -> FixtureSendResult {
        sendActions += 1
        let valid = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && text.utf16.count <= 4000
        let delivered = valid && (mode == .success || mode == .unknownDelivered)
        let message = delivered ? append(text, who: "agent", selected: selected) : nil
        let status = !valid || mode == .failure ? "failed" : mode == .success ? "sent" : "unknown"
        let result = FixtureSendResult(action: sendActions, session: "t\(selected+1)", status: status, mode: mode,
            delivered: delivered, messageID: message?.id,
            reason: !valid ? "invalid-draft" : mode == .failure ? "injected-failure" : status == "unknown" ? "receipt-unavailable" : "local-only")
        sendResults.append(result)
        return result
    }
}
// END HEADLESS FIXTURE MODEL
final class SupportChat: NSObject, NSApplicationDelegate, NSWindowDelegate, NSTextViewDelegate {
    var window: NSWindow!
    let names = ["林女士", "陈先生", "周女士"]
    var selected = 0
    let fixture = SupportChatFixture()
    let sendMode = NSPopUpButton(frame: .zero, pullsDown: false)
    let sendResult = NSTextField(labelWithString: "尚无本地模拟发送")
    var drafts = ["", "", ""]
    let session = NSTextField(labelWithString: "")
    let transcript = NSStackView()
    // A reference never changes customer ownership. Detaching an editor makes
    // its AX window mapping stale, rather than redirecting it to another chat.
    let draftViews = [NSTextView(), NSTextView(), NSTextView()]
    var draft: NSTextView { draftViews[selected] }
    let draftScroll = NSScrollView()
    let input = NSTextField()
    var timer: Timer?

    func label(_ text: String, size: CGFloat = 14) -> NSTextField {
        let v = NSTextField(wrappingLabelWithString: text)
        v.font = .systemFont(ofSize: size)
        return v
    }
    func button(_ title: String, id: String, action: Selector) -> NSButton {
        let b = NSButton(title: title, target: self, action: action)
        b.bezelStyle = .rounded
        b.setAccessibilityIdentifier(id)
        return b
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        let menu = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关闭测试窗口", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        appMenu.addItem(withTitle: "退出测试聊天", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        menu.addItem(appItem)
        NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 100, y: 180, width: 620, height: 680),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "OpenDesk R2.3 Test Chat"
        window.isRestorable = false
        window.animationBehavior = .none
        window.identifier = NSUserInterfaceItemIdentifier("opendesk-support-test-chat")
        window.minSize = NSSize(width: 500, height: 520)
        window.delegate = self
        window.standardWindowButton(.closeButton)?.setAccessibilityIdentifier("support.close-window")
        window.isReleasedWhenClosed = false
        let root = NSStackView()
        root.orientation = .vertical
        root.alignment = .leading
        root.spacing = 12
        root.edgeInsets = NSEdgeInsets(top: 18, left: 18, bottom: 18, right: 18)
        root.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(root)
        NSLayoutConstraint.activate([
            root.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor),
            root.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor),
            root.topAnchor.constraint(equalTo: window.contentView!.topAnchor),
            root.bottomAnchor.constraint(equalTo: window.contentView!.bottomAnchor)
        ])
        root.addArrangedSubview(label("独立测试聊天 · 本地模拟发送", size: 19))
        root.addArrangedSubview(label("仅测试 fixture：模拟发送不联网，结果不代表微信。未知结果请由独立 oracle 核验，勿盲目重发。", size: 12))
        let contacts = NSStackView()
        contacts.spacing = 8
        for i in 0..<3 {
            let b = button(names[i], id: "support.contact.t\(i+1)", action: #selector(selectContact(_:)))
            b.tag = i
            contacts.addArrangedSubview(b)
        }
        root.addArrangedSubview(contacts)
        session.setAccessibilityIdentifier("support.session")
        session.setAccessibilityLabel("当前测试会话")
        root.addArrangedSubview(session)
        transcript.orientation = .vertical
        transcript.alignment = .leading
        transcript.spacing = 8
        transcript.edgeInsets = NSEdgeInsets(top: 10, left: 10, bottom: 10, right: 10)
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.borderType = .bezelBorder
        scroll.documentView = transcript
        transcript.translatesAutoresizingMaskIntoConstraints = false
        root.addArrangedSubview(scroll)
        NSLayoutConstraint.activate([
            scroll.widthAnchor.constraint(equalTo: root.widthAnchor, constant: -36),
            scroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 140),
            transcript.widthAnchor.constraint(equalTo: scroll.contentView.widthAnchor),
            transcript.topAnchor.constraint(equalTo: scroll.contentView.topAnchor),
            transcript.leadingAnchor.constraint(equalTo: scroll.contentView.leadingAnchor)
        ])
        scroll.setContentHuggingPriority(.defaultLow, for: .vertical)
        input.placeholderString = "输入一条客户消息…"
        input.setAccessibilityIdentifier("support.customer-input")
        input.setAccessibilityLabel("客户消息输入")
        input.font = .systemFont(ofSize: 14)
        root.addArrangedSubview(input)
        input.widthAnchor.constraint(equalTo: root.widthAnchor, constant: -36).isActive = true
        let messageControls = NSStackView()
        messageControls.spacing = 8
        messageControls.addArrangedSubview(button("添加客户消息", id: "support.add-message", action: #selector(addMessage)))
        messageControls.addArrangedSubview(button("突发 8 条（测试）", id: "support.add-burst", action: #selector(addBurst)))
        root.addArrangedSubview(messageControls)
        root.addArrangedSubview(label("客服草稿 · 点击测试按钮才本地模拟发送", size: 13))
        draftScroll.hasVerticalScroller = true
        draftScroll.borderType = .bezelBorder
        for (i, editor) in draftViews.enumerated() {
            editor.isRichText = false
            editor.font = .systemFont(ofSize: 14)
            editor.isVerticallyResizable = true
            editor.isHorizontallyResizable = false
            editor.autoresizingMask = [.width]
            editor.textContainer?.widthTracksTextView = true
            editor.setAccessibilityLabel("测试聊天草稿")
            editor.setAccessibilityIdentifier("support.draft.t\(i+1)")
            editor.delegate = self
        }
        draftScroll.documentView = draft
        root.addArrangedSubview(draftScroll)
        draftScroll.widthAnchor.constraint(equalTo: root.widthAnchor, constant: -36).isActive = true
        draftScroll.heightAnchor.constraint(equalToConstant: 108).isActive = true
        root.addArrangedSubview(button("清空当前草稿（测试）", id: "support.clear-draft", action: #selector(clearDraft)))
        let sendControls = NSStackView()
        sendControls.spacing = 8
        sendMode.addItems(withTitles: ["正常（仅本地）", "确定失败", "未知（本地已落入）", "未知（本地未落入）"])
        sendMode.selectItem(at: 0)
        sendMode.setAccessibilityIdentifier("support.fixture.send-mode")
        sendMode.setAccessibilityLabel("测试专用发送故障注入；默认正常")
        sendControls.addArrangedSubview(sendMode)
        sendControls.addArrangedSubview(button("切换模式（测试）", id: "support.fixture.cycle-send-mode", action: #selector(cycleSendMode)))
        sendControls.addArrangedSubview(button("模拟发送（仅本地测试）", id: "support.fixture.send", action: #selector(sendDraft)))
        root.addArrangedSubview(sendControls)
        sendResult.setAccessibilityIdentifier("support.fixture.send-result")
        sendResult.setAccessibilityLabel("本地模拟发送回执；unknown 不表示成功或失败")
        sendResult.font = .monospacedSystemFont(ofSize: 10, weight: .regular)
        sendResult.lineBreakMode = .byWordWrapping
        sendResult.maximumNumberOfLines = 0
        root.addArrangedSubview(sendResult)
        sendResult.widthAnchor.constraint(equalTo: root.widthAnchor, constant: -36).isActive = true
        render()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        // Diagnostic output belongs to the independent test oracle only. The
        // observation adapter never reads this file or the process stdout.
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in self?.recordOracle() }
        recordOracle()
    }
    func render() {
        session.stringValue = "t\(selected+1) · \(names[selected])"
        transcript.arrangedSubviews.forEach { transcript.removeArrangedSubview($0); $0.removeFromSuperview() }
        for message in fixture.messages[selected] {
            let row = label(message.axValue)
            row.setAccessibilityIdentifier(message.axIdentifier)
            transcript.addArrangedSubview(row)
            row.widthAnchor.constraint(equalTo: transcript.widthAnchor, constant: -20).isActive = true
        }
        draftScroll.documentView = draft
        draft.string = drafts[selected]
        NSAccessibility.post(element: session, notification: .valueChanged)
        NSAccessibility.post(element: window!, notification: .layoutChanged)
        recordOracle()
    }
    @objc func selectContact(_ sender: NSButton) {
        drafts[selected] = draft.string
        selected = sender.tag
        render()
    }
    @objc func addMessage() {
        let text = String(input.stringValue.trimmingCharacters(in: .whitespacesAndNewlines).prefix(400))
        guard !text.isEmpty else { return }
        drafts[selected] = draft.string
        fixture.append(text, who: "customer", selected: selected)
        input.stringValue = ""
        render()
    }
    @objc func addBurst() {
        let text = String(input.stringValue.trimmingCharacters(in: .whitespacesAndNewlines).prefix(400))
        guard !text.isEmpty else { return }
        drafts[selected] = draft.string
        fixture.customerBurst(text, selected: selected)
        input.stringValue = ""
        render()
    }
    @objc func sendDraft() {
        drafts[selected] = draft.string
        let mode = FixtureSendMode.allCases[sendMode.indexOfSelectedItem]
        let result = fixture.send(draft.string, selected: selected, mode: mode)
        // Preserve drafts on failed/unknown receipts. An unknown receipt must
        // never encourage an automatic retry, even if the local message exists.
        if result.status == "sent" { drafts[selected] = "" }
        sendResult.stringValue = result.receipt
        render()
        NSAccessibility.post(element: sendResult, notification: .valueChanged)
    }
    @objc func cycleSendMode() {
        sendMode.selectItem(at: (sendMode.indexOfSelectedItem + 1) % FixtureSendMode.allCases.count)
        NSAccessibility.post(element: sendMode, notification: .valueChanged)
        recordOracle()
    }
    @objc func clearDraft() { draft.string = ""; drafts[selected] = ""; recordOracle() }
    func textDidChange(_ notification: Notification) { drafts[selected] = draft.string; recordOracle() }
    func recordOracle() {
        guard let path = ProcessInfo.processInfo.environment["OPENDESK_SUPPORT_CHAT_ORACLE"], window != nil else { return }
        let record: [String: Any] = ["pid": ProcessInfo.processInfo.processIdentifier,
            "windowNumber": window.windowNumber, "session": "t\(selected+1)", "draft": draft.string,
            "messages": fixture.messages[selected].map { $0.oracle },
            "fixture": "local-only-not-wechat", "sendMode": FixtureSendMode.allCases[sendMode.indexOfSelectedItem].rawValue,
            "sendActions": fixture.sendActions, "sendResults": fixture.sendResults.map { $0.oracle },
            "sessions": (0..<names.count).map { i in
                ["session": "t\(i+1)", "messages": fixture.messages[i].map { $0.oracle },
                 "draft": i == selected ? draft.string : drafts[i]] as [String: Any]
            }, "at": Date().timeIntervalSince1970]
        if let data = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]) {
            try? data.write(to: URL(fileURLWithPath: path), options: .atomic)
        }
    }
    func windowWillClose(_ notification: Notification) { timer?.invalidate(); NSApp.terminate(nil) }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.deminiaturize(nil)
        window.makeKeyAndOrderFront(nil)
        return true
    }
}
let app = NSApplication.shared
let delegate = SupportChat()
app.delegate = delegate
app.run()
