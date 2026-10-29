import AppKit

// An independent, local-only test client. There is deliberately no send action,
// server, script interpreter, or IPC that supplies observations to the assistant.
final class SupportChat: NSObject, NSApplicationDelegate, NSWindowDelegate, NSTextViewDelegate {
    var window: NSWindow!
    let names = ["林女士", "陈先生", "周女士"]
    var selected = 0
    var serial = 0
    var messages: [[(String, String)]] = [[], [], []]
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
        root.addArrangedSubview(label("独立测试聊天 · 仅本地消息和草稿", size: 19))
        root.addArrangedSubview(label("在下方输入客户消息并添加，助手通过 Accessibility 读取真实窗口。没有发送按钮。", size: 12))
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
        root.addArrangedSubview(button("添加客户消息", id: "support.add-message", action: #selector(addMessage)))
        root.addArrangedSubview(label("客服草稿 · 只写入，不发送", size: 13))
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
        for (id, text) in messages[selected] {
            let row = label("客户 · \(id)\n\(text)")
            row.setAccessibilityIdentifier("support.message.\(id).customer")
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
        serial += 1
        messages[selected].append(("t\(selected+1)-m\(serial)", text))
        if messages[selected].count > 30 { messages[selected].removeFirst() }
        input.stringValue = ""
        render()
    }
    @objc func clearDraft() { draft.string = ""; drafts[selected] = ""; recordOracle() }
    func textDidChange(_ notification: Notification) { drafts[selected] = draft.string; recordOracle() }
    func recordOracle() {
        guard let path = ProcessInfo.processInfo.environment["OPENDESK_SUPPORT_CHAT_ORACLE"], window != nil else { return }
        let record: [String: Any] = ["pid": ProcessInfo.processInfo.processIdentifier,
            "windowNumber": window.windowNumber, "session": "t\(selected+1)", "draft": draft.string,
            "messages": messages[selected].map { ["id": $0.0, "text": $0.1] },
            "sendActions": 0, "at": Date().timeIntervalSince1970]
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
