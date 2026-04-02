import AppKit
import AVFoundation
import Foundation

private enum Config {
    static let actionFileName = "action.txt"
    static let kAvatarPath = "avatarPath"
    static let kWanderEnabled = "wanderEnabled"
    static let kPanelWidth: CGFloat = 140
    static let kPanelHeight: CGFloat = 160
    static let wanderSpeed: CGFloat = 25
    static let wanderInterval: TimeInterval = 0.04
    static let idleFrameInterval: TimeInterval = 0.2
    // Job Search — нативная панель, данные с API (браузер не запускается)
    static let jobSearchPanelWidth: CGFloat = 420
    static let jobSearchPanelHeight: CGFloat = 480
    static let jobSearchAPIURL = "http://127.0.0.1:8766/api/status"
    static let jobSearchRefreshInterval: TimeInterval = 15
}

@main
struct DexAssistantApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = AssistantAppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
    }
}

func assistantSupportDir() -> URL {
    let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        .appendingPathComponent("DexAssistant", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
}

func actionFileURL() -> URL {
    assistantSupportDir().appendingPathComponent(Config.actionFileName)
}

final class AssistantAppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem?
    var avatarPanel: AvatarPanelController?
    var jobSearchPanel: JobSearchPanelController?
    var fileSource: DispatchSourceFileSystemObject?
    var synth: NSSpeechSynthesizer?
    var isSpeaking = false
    var queue: [String] = []
    var workItem: DispatchWorkItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        ensureActionFileExists()
        setupMenuBar()
        showAvatarPanel()
        startWatchingActionFile()
    }

    func applicationWillTerminate(_ notification: Notification) {
        fileSource?.cancel()
    }

    private func ensureActionFileExists() {
        let url = actionFileURL()
        if !FileManager.default.fileExists(atPath: url.path) {
            try? "".write(to: url, atomically: true, encoding: .utf8)
        }
    }

    private func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let img = NSImage(systemSymbolName: "person.crop.circle.fill", accessibilityDescription: "Dex Assistant")
        img?.isTemplate = true
        statusItem?.button?.image = img
        statusItem?.button?.toolTip = "Dex Assistant — клик: меню (Выбрать аватар, Сказать…)"
        let menu = NSMenu()
        let speakItem = NSMenuItem(title: "Сказать…", action: #selector(promptAndSpeak), keyEquivalent: "s")
        speakItem.target = self
        menu.addItem(speakItem)
        menu.addItem(NSMenuItem.separator())
        let chooseAvatar = NSMenuItem(title: "Выбрать аватар…", action: #selector(chooseAvatar), keyEquivalent: "")
        chooseAvatar.target = self
        menu.addItem(chooseAvatar)
        let resetAvatar = NSMenuItem(title: "Сбросить аватар", action: #selector(resetAvatar), keyEquivalent: "")
        resetAvatar.target = self
        menu.addItem(resetAvatar)
        let wanderItem = NSMenuItem(title: "Движение по экрану (wander)", action: #selector(toggleWander), keyEquivalent: "")
        wanderItem.target = self
        wanderItem.state = UserDefaults.standard.bool(forKey: Config.kWanderEnabled) ? .on : .off
        menu.addItem(wanderItem)
        menu.addItem(NSMenuItem.separator())
        let jobSearchItem = NSMenuItem(title: "Виджет Job Search", action: #selector(toggleJobSearchPanel), keyEquivalent: "j")
        jobSearchItem.target = self
        jobSearchItem.state = .off
        menu.addItem(jobSearchItem)
        menu.addItem(NSMenuItem.separator())
        let quit = NSMenuItem(title: "Выход", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        statusItem?.menu = menu
    }

    private func showAvatarPanel() {
        avatarPanel = AvatarPanelController()
        avatarPanel?.menuTarget = self
        avatarPanel?.avatarPath = UserDefaults.standard.string(forKey: Config.kAvatarPath)
        avatarPanel?.wanderEnabled = UserDefaults.standard.bool(forKey: Config.kWanderEnabled)
        avatarPanel?.show()
    }

    @objc private func toggleWander() {
        let current = UserDefaults.standard.bool(forKey: Config.kWanderEnabled)
        UserDefaults.standard.set(!current, forKey: Config.kWanderEnabled)
        avatarPanel?.wanderEnabled = !current
        if let item = statusItem?.menu?.items.first(where: { $0.title.contains("wander") }) {
            item.state = (!current) ? .on : .off
        }
    }

    private func startWatchingActionFile() {
        let url = actionFileURL()
        let fd = open(url.path, O_EVTONLY)
        guard fd >= 0 else { return }
        fileSource = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: .write, queue: .main)
        fileSource?.setEventHandler { [weak self] in
            self?.readAndSpeakAction()
        }
        fileSource?.setCancelHandler { close(fd) }
        fileSource?.resume()
    }

    private func readAndSpeakAction() {
        let url = actionFileURL()
        guard let content = try? String(contentsOf: url, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
              !content.isEmpty else { return }
        try? "".write(to: url, atomically: true, encoding: .utf8)
        speak(text: content)
    }

    func speak(text: String) {
        if isSpeaking {
            queue.append(text)
            return
        }
        isSpeaking = true
        avatarPanel?.setSpeaking(true)
        let voice = NSSpeechSynthesizer.availableVoices.first {
            (NSSpeechSynthesizer.attributes(forVoice: $0)[NSSpeechSynthesizer.VoiceAttributeKey.localeIdentifier] as? String) == "ru_RU"
        } ?? NSSpeechSynthesizer.defaultVoice
        synth = NSSpeechSynthesizer()
        synth?.setVoice(voice)
        synth?.delegate = self
        synth?.startSpeaking(text)
    }

    @objc private func promptAndSpeak() {
        let alert = NSAlert()
        alert.messageText = "Что сказать?"
        alert.informativeText = "Текст будет озвучен голосом ассистента."
        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 22))
        input.stringValue = ""
        input.placeholderString = "Например: Проверяю календарь..."
        alert.accessoryView = input
        alert.addButton(withTitle: "Озвучить")
        alert.addButton(withTitle: "Отмена")
        alert.window.initialFirstResponder = input
        let response = alert.runModal()
        if response == .alertFirstButtonReturn, !input.stringValue.trimmingCharacters(in: .whitespaces).isEmpty {
            speak(text: input.stringValue.trimmingCharacters(in: .whitespaces))
        }
    }

    @objc private func chooseAvatar() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = true
        panel.canChooseFiles = true
        panel.allowedContentTypes = [.png, .jpeg, .gif, .mpeg4Movie, .movie]
        panel.message = "Выберите изображение, видео (MOV/MP4) или папку с кадрами"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let path = url.resolvingSymlinksInPath().path
        UserDefaults.standard.set(path, forKey: Config.kAvatarPath)
        avatarPanel?.avatarPath = path
        avatarPanel?.reloadAvatar()
        if avatarPanel?.currentImageIsPlaceholder == true {
            let alert = NSAlert()
            alert.messageText = "Не удалось загрузить изображение"
            alert.informativeText = "Проверьте путь и формат файла (PNG, JPG, GIF). Для папки нужны файлы с расширением .png, .jpg или .gif."
            alert.alertStyle = .warning
            alert.addButton(withTitle: "OK")
            alert.runModal()
        }
    }

    @objc private func resetAvatar() {
        UserDefaults.standard.removeObject(forKey: Config.kAvatarPath)
        avatarPanel?.avatarPath = nil
        avatarPanel?.reloadAvatar()
    }

    @objc private func toggleJobSearchPanel() {
        if jobSearchPanel == nil {
            jobSearchPanel = JobSearchPanelController()
            jobSearchPanel?.show(avatarPanel: avatarPanel)
            statusItem?.menu?.items.first { $0.title == "Виджет Job Search" }?.state = .on
            return
        }
        guard let panel = jobSearchPanel else { return }
        if panel.panel?.isVisible == true {
            panel.panel?.orderOut(nil)
            statusItem?.menu?.items.first { $0.title == "Виджет Job Search" }?.state = .off
        } else {
            panel.panel?.orderFrontRegardless()
            statusItem?.menu?.items.first { $0.title == "Виджет Job Search" }?.state = .on
        }
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}

extension AssistantAppDelegate: NSSpeechSynthesizerDelegate {
    func speechSynthesizer(_ sender: NSSpeechSynthesizer, didFinishSpeaking finishedSpeaking: Bool) {
        DispatchQueue.main.async { [weak self] in
            self?.avatarPanel?.setSpeaking(false)
            self?.isSpeaking = false
            self?.synth = nil
            if let next = self?.queue.first, !(next.isEmpty) {
                self?.queue.removeFirst()
                self?.speak(text: next)
            }
        }
    }
}

// MARK: - Avatar Panel

final class AvatarPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

final class AvatarPanelController: NSObject, NSMenuDelegate {
    var panel: AvatarPanel!
    var imageView: NSImageView!
    var avatarPath: String?
    weak var menuTarget: AnyObject?
    /// true если сейчас показана заглушка (иконка человечка)
    var currentImageIsPlaceholder: Bool = true
    var wanderEnabled: Bool = false {
        didSet {
            if wanderEnabled { startWander() } else { stopWander() }
        }
    }
    private var pulseTimer: Timer?
    private var wanderTimer: Timer?
    private var idleFrameTimer: Timer?
    private var idleFrames: [NSImage] = []
    private var idleFrameIndex: Int = 0
    private var wanderDirection: CGFloat = -1
    private var videoPlayer: AVPlayer?
    private var videoLayer: AVPlayerLayer?
    private var videoLoopObserver: NSObjectProtocol?

    func show() {
        panel = AvatarPanel(
            contentRect: NSRect(x: 0, y: 0, width: Config.kPanelWidth, height: Config.kPanelHeight),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.isMovableByWindowBackground = true
        panel.hasShadow = true

        let effect = NSVisualEffectView()
        effect.material = .hudWindow
        effect.state = .active
        effect.blendingMode = .behindWindow
        effect.frame = NSRect(x: 0, y: 0, width: Config.kPanelWidth, height: Config.kPanelHeight)
        effect.wantsLayer = true
        effect.layer?.cornerRadius = 14
        effect.layer?.masksToBounds = true
        panel.contentView = effect

        let contentView = panel.contentView!
        imageView = NSImageView(frame: NSRect(x: 10, y: 36, width: 120, height: 120))
        imageView.imageScaling = .scaleProportionallyUpOrDown
        imageView.wantsLayer = true
        imageView.layer?.cornerRadius = 10
        imageView.layer?.masksToBounds = true
        contentView.addSubview(imageView)
        contentView.menu = buildContextMenu()
        reloadAvatar()

        if let screen = NSScreen.main {
            let x = screen.visibleFrame.maxX - Config.kPanelWidth - 24
            let y = screen.visibleFrame.minY + 24
            panel.setFrameOrigin(NSPoint(x: x, y: y))
        }
        panel.orderFrontRegardless()
        if wanderEnabled { startWander() }
    }

    private func buildContextMenu() -> NSMenu {
        let menu = NSMenu()
        menu.delegate = self
        let choose = NSMenuItem(title: "Выбрать аватар…", action: Selector(("chooseAvatar")), keyEquivalent: "")
        choose.target = menuTarget
        menu.addItem(choose)
        let speak = NSMenuItem(title: "Сказать…", action: Selector(("promptAndSpeak")), keyEquivalent: "s")
        speak.target = menuTarget
        menu.addItem(speak)
        menu.addItem(NSMenuItem.separator())
        let reset = NSMenuItem(title: "Сбросить аватар", action: Selector(("resetAvatar")), keyEquivalent: "")
        reset.target = menuTarget
        menu.addItem(reset)
        let wander = NSMenuItem(title: "Движение по экрану (wander)", action: Selector(("toggleWander")), keyEquivalent: "")
        wander.target = menuTarget
        wander.tag = 1
        menu.addItem(wander)
        menu.addItem(NSMenuItem.separator())
        let quit = NSMenuItem(title: "Выход", action: Selector(("quit")), keyEquivalent: "q")
        quit.target = menuTarget
        menu.addItem(quit)
        return menu
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.items.first { $0.tag == 1 }?.state = UserDefaults.standard.bool(forKey: Config.kWanderEnabled) ? .on : .off
    }

    func reloadAvatar() {
        guard let path = avatarPath else {
            currentImageIsPlaceholder = true
            idleFrames = []
            stopIdleFrames()
            stopVideoAvatar()
            imageView?.image = NSImage(systemSymbolName: "person.crop.circle.fill", accessibilityDescription: "Avatar")
            imageView?.contentTintColor = .systemTeal
            return
        }
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: path, isDirectory: &isDir) else {
            currentImageIsPlaceholder = true
            idleFrames = []
            stopIdleFrames()
            stopVideoAvatar()
            avatarPath = nil
            UserDefaults.standard.removeObject(forKey: Config.kAvatarPath)
            imageView?.image = NSImage(systemSymbolName: "person.crop.circle.fill", accessibilityDescription: "Avatar")
            imageView?.contentTintColor = .systemTeal
            return
        }
        if isDir.boolValue {
            stopVideoAvatar()
            let url = URL(fileURLWithPath: path)
            let ext: Set<String> = ["png", "jpg", "jpeg", "gif"]
            let files = (try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil))?
                .filter { ext.contains($0.pathExtension.lowercased()) }
                .sorted(by: { $0.lastPathComponent < $1.lastPathComponent })
                ?? []
            idleFrames = files.compactMap { NSImage(contentsOf: $0) }
            if idleFrames.isEmpty {
                currentImageIsPlaceholder = true
                imageView?.image = NSImage(systemSymbolName: "person.crop.circle.fill", accessibilityDescription: "Avatar")
                imageView?.contentTintColor = .systemTeal
            } else {
                currentImageIsPlaceholder = false
                imageView?.contentTintColor = nil
                imageView?.image = idleFrames[0]
                startIdleFrames()
            }
        } else {
            idleFrames = []
            stopIdleFrames()
            imageView?.contentTintColor = nil
            stopVideoAvatar()
            let url = URL(fileURLWithPath: path)
            let ext = (path as NSString).pathExtension.lowercased()
            if ["mov", "mp4", "m4v"].contains(ext) {
                startVideoAvatar(url: url)
            } else if let img = NSImage(contentsOf: url) {
                stopVideoAvatar()
                currentImageIsPlaceholder = false
                imageView?.image = img
            } else {
                stopVideoAvatar()
                currentImageIsPlaceholder = true
                imageView?.image = NSImage(systemSymbolName: "person.crop.circle.fill", accessibilityDescription: "Avatar")
                imageView?.contentTintColor = .systemTeal
            }
        }
    }

    private static let videoExtensions: Set<String> = ["mov", "mp4", "m4v"]

    private func startVideoAvatar(url: URL) {
        stopVideoAvatar()
        let player = AVPlayer(url: url)
        player.isMuted = true
        player.actionAtItemEnd = .none
        videoLoopObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: player.currentItem,
            queue: .main
        ) { [weak player] _ in
            player?.seek(to: .zero)
            player?.play()
        }
        let layer = AVPlayerLayer(player: player)
        layer.videoGravity = .resizeAspect
        layer.frame = CGRect(origin: .zero, size: imageView?.bounds.size ?? CGSize(width: 120, height: 120))
        layer.cornerRadius = 10
        layer.masksToBounds = true
        imageView?.layer?.addSublayer(layer)
        imageView?.image = nil
        videoLayer = layer
        videoPlayer = player
        currentImageIsPlaceholder = false
        player.play()
    }

    private func stopVideoAvatar() {
        videoLoopObserver.map { NotificationCenter.default.removeObserver($0) }
        videoLoopObserver = nil
        videoPlayer?.pause()
        videoPlayer = nil
        videoLayer?.removeFromSuperlayer()
        videoLayer = nil
    }

    private func startWander() {
        stopWander()
        wanderTimer = Timer.scheduledTimer(withTimeInterval: Config.wanderInterval, repeats: true) { [weak self] _ in
            self?.stepWander()
        }
        RunLoop.main.add(wanderTimer!, forMode: .common)
    }

    private func stopWander() {
        wanderTimer?.invalidate()
        wanderTimer = nil
    }

    private func stepWander() {
        guard let screen = NSScreen.main, let p = panel else { return }
        let vf = screen.visibleFrame
        let w = Config.kPanelWidth
        var x = p.frame.origin.x
        let y = vf.minY + 24
        x += Config.wanderSpeed * wanderDirection * CGFloat(Config.wanderInterval)
        if x <= vf.minX + 12 {
            x = vf.minX + 12
            wanderDirection = 1
        } else if x >= vf.maxX - w - 12 {
            x = vf.maxX - w - 12
            wanderDirection = -1
        }
        p.setFrameOrigin(NSPoint(x: x, y: y))
    }

    private func startIdleFrames() {
        stopIdleFrames()
        guard idleFrames.count > 1 else { return }
        idleFrameTimer = Timer.scheduledTimer(withTimeInterval: Config.idleFrameInterval, repeats: true) { [weak self] _ in
            self?.advanceIdleFrame()
        }
        RunLoop.main.add(idleFrameTimer!, forMode: .common)
    }

    private func stopIdleFrames() {
        idleFrameTimer?.invalidate()
        idleFrameTimer = nil
    }

    private func advanceIdleFrame() {
        guard !idleFrames.isEmpty, idleFrames.count > 1 else { return }
        idleFrameIndex = (idleFrameIndex + 1) % idleFrames.count
        imageView?.image = idleFrames[idleFrameIndex]
    }

    func setSpeaking(_ speaking: Bool) {
        if speaking {
            startPulse()
        } else {
            stopPulse()
        }
    }

    private func startPulse() {
        stopPulse()
        pulseTimer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { [weak self] _ in
            self?.pulseAvatar()
        }
        RunLoop.main.add(pulseTimer!, forMode: .common)
    }

    private func stopPulse() {
        pulseTimer?.invalidate()
        pulseTimer = nil
        imageView?.layer?.opacity = 1.0
    }

    private func pulseAvatar() {
        let t = CACurrentMediaTime()
        let opacity = Float(0.85 + 0.15 * sin(t * 6))
        imageView?.layer?.opacity = opacity
    }

    deinit {
        stopWander()
        stopIdleFrames()
        stopPulse()
        stopVideoAvatar()
    }
}

// MARK: - Job Search Panel (native, как терминал — без браузера)

final class JobSearchPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class JobSearchPanelController: NSObject {
    var panel: JobSearchPanel?
    private var textView: NSTextView?
    private var refreshTimer: Timer?

    func show(avatarPanel: AvatarPanelController?) {
        panel = JobSearchPanel(
            contentRect: NSRect(x: 0, y: 0, width: Config.jobSearchPanelWidth, height: Config.jobSearchPanelHeight),
            styleMask: [.titled, .closable, .resizable, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        guard let panel = panel else { return }
        panel.title = "Job Search"
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isOpaque = true
        panel.backgroundColor = NSColor(white: 0.12, alpha: 1)
        panel.isMovableByWindowBackground = true
        panel.minSize = NSSize(width: 320, height: 240)

        let scrollView = NSScrollView(frame: NSRect(x: 8, y: 8, width: Config.jobSearchPanelWidth - 16, height: Config.jobSearchPanelHeight - 16))
        scrollView.autoresizingMask = [.width, .height]
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.borderType = .noBorder
        scrollView.drawsBackground = false

        let textView = NSTextView(frame: scrollView.bounds)
        textView.isEditable = false
        textView.isSelectable = true
        textView.drawsBackground = false
        textView.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        textView.textColor = NSColor(white: 0.88, alpha: 1)
        textView.autoresizingMask = [.width]
        textView.textContainer?.containerSize = NSSize(width: scrollView.contentSize.width, height: .greatestFiniteMagnitude)
        textView.textContainer?.widthTracksTextView = true
        scrollView.documentView = textView
        self.textView = textView
        panel.contentView?.addSubview(scrollView)

        if let screen = NSScreen.main {
            let vf = screen.visibleFrame
            let x = vf.maxX - Config.jobSearchPanelWidth - Config.kPanelWidth - 24 - 12
            let y = vf.minY + 24
            panel.setFrameOrigin(NSPoint(x: x, y: y))
        }
        panel.orderFrontRegardless()
        loadStatus()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: Config.jobSearchRefreshInterval, repeats: true) { [weak self] _ in
            self?.loadStatus()
        }
        RunLoop.main.add(refreshTimer!, forMode: .common)
    }

    private func loadStatus() {
        guard let url = URL(string: Config.jobSearchAPIURL) else { return }
        var req = URLRequest(url: url)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: req) { [weak self] data, _, error in
            DispatchQueue.main.async {
                self?.applyStatus(data: data, error: error)
            }
        }.resume()
    }

    private func applyStatus(data: Data?, error: Error?) {
        guard let textView = textView else { return }
        if let error = error {
            textView.string = "Job Search — сервер недоступен\n\nЗапустите в репозитории Dex:\n  npm run job-search:widget\n\n(без флага --open, браузер не откроется)\n\nОшибка: \(error.localizedDescription)"
            return
        }
        guard let data = data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            textView.string = "Job Search — не удалось разобрать ответ сервера."
            return
        }
        let out = formatStatus(json)
        textView.string = out
        textView.scrollRangeToVisible(NSRange(location: 0, length: 0))
    }

    private func formatStatus(_ json: [String: Any]) -> String {
        let df = DateFormatter()
        df.dateFormat = "HH:mm:ss"
        let updated = df.string(from: Date())
        var lines: [String] = [
            "--- Job Search (обновлено \(updated)) ---",
            ""
        ]
        func section(_ name: String, _ block: [String: Any]?) {
            guard let b = block else { return }
            let status = (b["status"] as? String) ?? "—"
            let started = (b["startedAt"] as? String) ?? (b["lastUpdated"] as? String) ?? "—"
            lines.append("[\(name)]")
            lines.append("  Last run: \(started)  Status: \(status)")
            if let ex = b["export_total"] as? NSNumber { lines.append("  Export: \(ex)") }
            if let nj = b["new_jobs"] as? NSNumber { lines.append("  New jobs: \(nj)") }
            if let dc = b["digest_count"] as? NSNumber { lines.append("  Digest: \(dc)") }
            if let at = b["add_teal"] as? NSNumber { lines.append("  Add Teal: \(at)") }
            if let logLines = b["lastLogLines"] as? [String], !logLines.isEmpty {
                lines.append("  Last log:")
                for line in logLines { lines.append("    \(line)") }
            }
            lines.append("")
        }
        section("Incremental (Senior PM)", json["incremental"] as? [String: Any])
        section("iGaming (incremental)", json["incrementalIgaming"] as? [String: Any])
        section("Full flow", json["fullFlow"] as? [String: Any])
        return lines.joined(separator: "\n")
    }

    deinit {
        refreshTimer?.invalidate()
    }
}
