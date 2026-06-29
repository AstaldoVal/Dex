import AppKit
import Foundation

// MARK: - Board JSON

struct HandoffEntry: Codable {
    let id: String
    var agent: String
    var assigned: String
    var waiting: String
    var whereField: String
    let ts: String

    enum CodingKeys: String, CodingKey {
        case id, agent, assigned, waiting, ts
        case whereField = "where"
    }
}

struct HandoffBoard: Codable {
    var active: [HandoffEntry]
    var max: Int
}

enum BoardStore {
    static var boardPath: String = {
        if let env = ProcessInfo.processInfo.environment["DEX_AGENT_HANDOFF_BOARD"], !env.isEmpty {
            return env
        }
        return (FileManager.default.homeDirectoryForCurrentUser.path as NSString)
            .appendingPathComponent("Development/DEX/System/Pomodoro/agent-handoff-board.json")
    }()

    static func load() -> HandoffBoard {
        let url = URL(fileURLWithPath: boardPath)
        guard FileManager.default.fileExists(atPath: boardPath),
              let data = try? Data(contentsOf: url),
              let board = try? JSONDecoder().decode(HandoffBoard.self, from: data) else {
            return HandoffBoard(active: [], max: 5)
        }
        return board
    }

    static func save(_ board: HandoffBoard) {
        let url = URL(fileURLWithPath: boardPath)
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(board) {
            try? data.write(to: url)
        }
    }

    static func add(agent: String, assigned: String, waiting: String, whereField: String) {
        var board = load()
        let entry = HandoffEntry(
            id: String(UUID().uuidString.prefix(8)),
            agent: agent,
            assigned: assigned,
            waiting: waiting,
            whereField: whereField,
            ts: ISO8601DateFormatter().string(from: Date())
        )
        board.active.insert(entry, at: 0)
        if board.active.count > board.max {
            board.active = Array(board.active.prefix(board.max))
        }
        save(board)
    }

    static func remove(id: String) {
        var board = load()
        board.active.removeAll { $0.id == id }
        save(board)
    }
}

// MARK: - Floating panel

final class HandoffPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class PanelController: NSObject {
    var panel: HandoffPanel!
    var scrollView: NSScrollView!
    var listStack: NSStackView!
    var agentField = NSTextField()
    var assignedField = NSTextField()
    var waitingField = NSTextField()
    var whereField = NSTextField()
    var refreshTimer: Timer?

    func show() {
        let w: CGFloat = 380
        let h: CGFloat = 520
        panel = HandoffPanel(
            contentRect: NSRect(x: 100, y: 200, width: w, height: h),
            styleMask: [.titled, .closable, .resizable, .utilityWindow, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.title = "Агенты — карта"
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovableByWindowBackground = true
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = false

        if let screen = NSScreen.main {
            let vf = screen.visibleFrame
            panel.setFrameOrigin(NSPoint(x: vf.minX + 16, y: vf.maxY - h - 48))
        }

        let root = NSStackView()
        root.orientation = .vertical
        root.spacing = 8
        root.edgeInsets = NSEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
        root.translatesAutoresizingMaskIntoConstraints = false

        let hint = NSTextField(labelWithString: "Перед сменой агента — одна строка. A→B не считаем; фиксируем поручение и где смотреть ответ.")
        hint.lineBreakMode = .byWordWrapping
        hint.maximumNumberOfLines = 3
        hint.font = NSFont.systemFont(ofSize: 11)
        hint.textColor = .secondaryLabelColor
        root.addArrangedSubview(hint)

        scrollView = NSScrollView()
        scrollView.hasVerticalScroller = true
        scrollView.borderType = .bezelBorder
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.heightAnchor.constraint(equalToConstant: 220).isActive = true

        listStack = NSStackView()
        listStack.orientation = .vertical
        listStack.alignment = .leading
        listStack.spacing = 6
        let docView = NSView()
        docView.translatesAutoresizingMaskIntoConstraints = false
        listStack.translatesAutoresizingMaskIntoConstraints = false
        docView.addSubview(listStack)
        NSLayoutConstraint.activate([
            listStack.topAnchor.constraint(equalTo: docView.topAnchor, constant: 6),
            listStack.leadingAnchor.constraint(equalTo: docView.leadingAnchor, constant: 6),
            listStack.trailingAnchor.constraint(equalTo: docView.trailingAnchor, constant: -6),
            listStack.bottomAnchor.constraint(equalTo: docView.bottomAnchor, constant: -6),
        ])
        scrollView.documentView = docView
        root.addArrangedSubview(scrollView)

        func labeled(_ title: String, field: NSTextField) -> NSView {
            let col = NSStackView()
            col.orientation = .vertical
            col.spacing = 2
            let lab = NSTextField(labelWithString: title)
            lab.font = NSFont.systemFont(ofSize: 11)
            lab.textColor = .secondaryLabelColor
            field.placeholderString = title
            col.addArrangedSubview(lab)
            col.addArrangedSubview(field)
            return col
        }

        root.addArrangedSubview(labeled("Агент", field: agentField))
        root.addArrangedSubview(labeled("Поручил", field: assignedField))
        root.addArrangedSubview(labeled("Жду", field: waitingField))
        root.addArrangedSubview(labeled("Смотреть", field: whereField))

        let btnRow = NSStackView()
        btnRow.orientation = .horizontal
        btnRow.spacing = 8
        let addBtn = NSButton(title: "Добавить", target: self, action: #selector(addClicked))
        addBtn.bezelStyle = .rounded
        addBtn.keyEquivalent = "\r"
        let pasteBtn = NSButton(title: "Из буфера", target: self, action: #selector(pasteClicked))
        pasteBtn.bezelStyle = .rounded
        let refreshBtn = NSButton(title: "Обновить", target: self, action: #selector(reloadList))
        refreshBtn.bezelStyle = .rounded
        btnRow.addArrangedSubview(addBtn)
        btnRow.addArrangedSubview(pasteBtn)
        btnRow.addArrangedSubview(refreshBtn)
        root.addArrangedSubview(btnRow)

        let pathLabel = NSTextField(labelWithString: "Файл: " + BoardStore.boardPath)
        pathLabel.font = NSFont.systemFont(ofSize: 9)
        pathLabel.textColor = .tertiaryLabelColor
        pathLabel.lineBreakMode = .byTruncatingMiddle
        root.addArrangedSubview(pathLabel)

        let container = NSView(frame: NSRect(x: 0, y: 0, width: w, height: h))
        container.addSubview(root)
        NSLayoutConstraint.activate([
            root.topAnchor.constraint(equalTo: container.topAnchor),
            root.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            root.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            root.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
        panel.contentView = container
        panel.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)

        reloadList()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.reloadList()
        }
    }

    func hide() {
        refreshTimer?.invalidate()
        panel?.orderOut(nil)
    }

    @objc func reloadList() {
        listStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let board = BoardStore.load()
        if board.active.isEmpty {
            let empty = NSTextField(labelWithString: "Пока пусто — добавь строку перед сменой агента.")
            empty.font = NSFont.systemFont(ofSize: 12)
            empty.textColor = .secondaryLabelColor
            listStack.addArrangedSubview(empty)
            return
        }
        for e in board.active {
            listStack.addArrangedSubview(cardView(for: e))
        }
        listStack.layoutSubtreeIfNeeded()
        scrollView.documentView?.layoutSubtreeIfNeeded()
        if let doc = scrollView.documentView {
            doc.setFrameSize(NSSize(width: scrollView.contentSize.width, height: listStack.fittingSize.height + 16))
        }
    }

    func cardView(for e: HandoffEntry) -> NSView {
        let box = NSBox()
        box.boxType = .custom
        box.fillColor = NSColor.controlBackgroundColor
        box.cornerRadius = 6
        box.translatesAutoresizingMaskIntoConstraints = false
        box.widthAnchor.constraint(greaterThanOrEqualToConstant: 320).isActive = true

        let col = NSStackView()
        col.orientation = .vertical
        col.alignment = .leading
        col.spacing = 4
        col.edgeInsets = NSEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)

        let line1 = NSTextField(labelWithString: "\(e.agent) | \(e.assigned)")
        line1.font = NSFont.boldSystemFont(ofSize: 12)
        let line2 = NSTextField(labelWithString: "жду: \(e.waiting) · смотреть: \(e.whereField)")
        line2.font = NSFont.systemFont(ofSize: 11)
        line2.textColor = .secondaryLabelColor
        col.addArrangedSubview(line1)
        col.addArrangedSubview(line2)

        let done = NSButton(title: "Готово", target: self, action: #selector(doneClicked(_:)))
        done.bezelStyle = .rounded
        done.identifier = NSUserInterfaceItemIdentifier(e.id)
        col.addArrangedSubview(done)

        box.addSubview(col)
        col.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            col.topAnchor.constraint(equalTo: box.topAnchor),
            col.leadingAnchor.constraint(equalTo: box.leadingAnchor),
            col.trailingAnchor.constraint(equalTo: box.trailingAnchor),
            col.bottomAnchor.constraint(equalTo: box.bottomAnchor),
        ])
        return box
    }

    @objc func addClicked() {
        let a = agentField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        let b = assignedField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        let c = waitingField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        let d = whereField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !a.isEmpty, !b.isEmpty else { return }
        BoardStore.add(agent: a, assigned: b, waiting: c.isEmpty ? "—" : c, whereField: d.isEmpty ? "—" : d)
        agentField.stringValue = ""
        assignedField.stringValue = ""
        waitingField.stringValue = ""
        whereField.stringValue = ""
        reloadList()
    }

    @objc func pasteClicked() {
        guard let raw = NSPasteboard.general.string(forType: .string) else { return }
        let parts = raw.split(separator: "|", omittingEmptySubsequences: false).map {
            String($0).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard parts.count >= 4 else {
            alert("Нужно: Агент | поручил | жду | смотреть")
            return
        }
        BoardStore.add(agent: parts[0], assigned: parts[1], waiting: parts[2], whereField: parts[3])
        reloadList()
    }

    @objc func doneClicked(_ sender: NSButton) {
        guard let id = sender.identifier?.rawValue else { return }
        BoardStore.remove(id: id)
        reloadList()
    }

    func alert(_ message: String) {
        let a = NSAlert()
        a.messageText = message
        a.runModal()
    }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem?
    let panelController = PanelController()

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem?.button?.title = "AG"
        statusItem?.button?.toolTip = "Dex — карта агентов"
        let menu = NSMenu()
        let show = NSMenuItem(title: "Показать панель", action: #selector(showPanel), keyEquivalent: "")
        show.target = self
        menu.addItem(show)
        let hide = NSMenuItem(title: "Скрыть панель", action: #selector(hidePanel), keyEquivalent: "")
        hide.target = self
        menu.addItem(hide)
        menu.addItem(NSMenuItem.separator())
        let quit = NSMenuItem(title: "Выход", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        statusItem?.menu = menu
        panelController.show()
    }

    @objc func showPanel() { panelController.show() }
    @objc func hidePanel() { panelController.hide() }
    @objc func quit() { NSApp.terminate(nil) }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
