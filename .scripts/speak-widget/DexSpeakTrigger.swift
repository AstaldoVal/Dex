import AppKit
import Foundation

// Clipboard monitor: shows a floating 🔊 button near the mouse cursor when text is copied.
// Works everywhere — editor, chat panel, terminal, even outside Cursor.
// Args: <workspace-path>
// When clicked, launches speak-report with clipboard text.

final class TriggerDelegate: NSObject, NSApplicationDelegate {
    var lastChangeCount: Int = 0
    var checkTimer: Timer?
    var panel: NSPanel?
    var hideTimer: Timer?
    var debounceTimer: Timer?  // Debounce: wait for clipboard to stabilize
    var workspacePath: String = ""
    var speakButton: NSButton?
    var isSpeaking = false
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory) // No dock icon
        
        let args = CommandLine.arguments
        guard args.count >= 2 else {
            NSLog("Usage: DexSpeakTrigger <workspace-path>")
            NSApp.terminate(nil)
            return
        }
        workspacePath = args[1]
        
        // Start clipboard polling (500ms interval)
        lastChangeCount = NSPasteboard.general.changeCount
        checkTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.checkClipboard()
        }
        RunLoop.current.add(checkTimer!, forMode: .common)
    }
    
    // MARK: - Clipboard monitoring
    
    /// Check if clipboard was set by a dictation tool (Superwhisper, etc.)
    /// Superwhisper sets only: ["public.utf8-plain-text", "NSStringPboardType"]
    /// Manual Cmd+C adds rich types: public.html, org.chromium.*, vscode-editor-data, etc.
    private func isDictationClipboard() -> Bool {
        let types = NSPasteboard.general.types ?? []
        
        // Plain-text-only types (set by Superwhisper and similar tools)
        let plainTextTypes: Set<String> = [
            "public.utf8-plain-text",
            "public.utf16-plain-text",
            "public.text",
            "NSStringPboardType",      // Legacy macOS plain text type
            "com.apple.traditional-mac-plain-text",
            "public.utf16-external-plain-text",
        ]
        
        // Check if ALL types are plain-text-only
        let hasRichType = types.contains { t in
            !plainTextTypes.contains(t.rawValue)
        }
        
        // No rich types → likely from Superwhisper / dictation tool
        return !hasRichType
    }
    
    private func checkClipboard() {
        let current = NSPasteboard.general.changeCount
        guard current != lastChangeCount else { return }
        lastChangeCount = current
        
        // Only trigger for text content
        guard let text = NSPasteboard.general.string(forType: .string),
              text.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3 else {
            return
        }
        
        // Don't show if TTS is already running
        if isSpeaking { return }
        
        // Skip clipboard changes from dictation tools (Superwhisper, etc.)
        // Superwhisper only puts plain text types; real Cmd+C adds HTML, chromium, vscode types
        if isDictationClipboard() { return }
        
        // Debounce: wait 1 second for clipboard to stabilize
        debounceTimer?.invalidate()
        debounceTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: false) { [weak self] _ in
            self?.showButton()
        }
    }
    
    // MARK: - Floating button UI
    
    private func showButton() {
        hideTimer?.invalidate()
        
        if panel == nil {
            createPanel()
        }
        
        // Position near mouse cursor
        let mouse = NSEvent.mouseLocation
        var x = mouse.x + 16
        var y = mouse.y - 16
        
        // Keep within screen bounds
        if let screen = NSScreen.screens.first(where: { NSMouseInRect(mouse, $0.frame, false) }) ?? NSScreen.main {
            let frame = screen.visibleFrame
            let size: CGFloat = 48
            if x + size > frame.maxX { x = mouse.x - size - 16 }
            if y - size < frame.minY { y = mouse.y + 16 }
        }
        
        panel?.setFrameOrigin(NSPoint(x: x, y: y - 48))
        panel?.alphaValue = 0.0
        panel?.orderFront(nil)
        
        // Fade in
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.15
            self.panel?.animator().alphaValue = 1.0
        }
        
        // Auto-hide after 5 seconds
        hideTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: false) { [weak self] _ in
            self?.hideButton()
        }
    }
    
    private func hideButton() {
        hideTimer?.invalidate()
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.3
            self.panel?.animator().alphaValue = 0.0
        }, completionHandler: { [weak self] in
            self?.panel?.orderOut(nil)
        })
    }
    
    private func createPanel() {
        let size: CGFloat = 48
        
        let p = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: size, height: size),
            styleMask: [.nonactivatingPanel, .borderless],
            backing: .buffered,
            defer: false
        )
        p.level = .floating
        p.isFloatingPanel = true
        p.hasShadow = true
        p.isOpaque = false
        p.backgroundColor = .clear
        p.hidesOnDeactivate = false
        p.collectionBehavior = [.canJoinAllSpaces, .transient]
        
        // Blurred background (vibrancy)
        let effect = NSVisualEffectView(frame: NSRect(x: 0, y: 0, width: size, height: size))
        effect.material = .hudWindow
        effect.state = .active
        effect.blendingMode = .behindWindow
        effect.wantsLayer = true
        effect.layer?.cornerRadius = size / 2
        effect.layer?.masksToBounds = true
        p.contentView = effect
        
        // Speaker button
        let btn = NSButton(frame: NSRect(x: 0, y: 0, width: size, height: size))
        btn.title = "🔊"
        btn.font = NSFont.systemFont(ofSize: 22)
        btn.isBordered = false
        btn.bezelStyle = .regularSquare
        btn.wantsLayer = true
        btn.layer?.cornerRadius = size / 2
        // Hover-like highlighting on mouseEnter (NSButton handles it)
        btn.target = self
        btn.action = #selector(speakClipboard)
        
        // Tracking area for hover effect
        let owner = HoverTracker(delegate: self)
        let trackingArea = NSTrackingArea(
            rect: btn.bounds,
            options: [.mouseEnteredAndExited, .activeAlways],
            owner: owner,
            userInfo: nil
        )
        btn.addTrackingArea(trackingArea)
        
        effect.addSubview(btn)
        speakButton = btn
        panel = p
    }
    
    // NSResponder mouse tracking (forwarded from tracking area)
    func handleMouseEntered() {
        speakButton?.layer?.backgroundColor = NSColor(white: 1.0, alpha: 0.15).cgColor
    }
    
    func handleMouseExited() {
        speakButton?.layer?.backgroundColor = NSColor.clear.cgColor
    }
    
    // MARK: - Launch TTS
    
    @objc private func speakClipboard() {
        hideButton()
        
        guard let text = NSPasteboard.general.string(forType: .string),
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return
        }
        
        isSpeaking = true
        
        // Launch speak-report via login shell (to get full PATH with node/npm)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        // Escape single quotes in workspace path
        let escapedPath = workspacePath.replacingOccurrences(of: "'", with: "'\\''")
        process.arguments = ["-lc", "cd '\(escapedPath)' && npm run speak-report -- --stdin"]
        process.currentDirectoryURL = URL(fileURLWithPath: workspacePath)
        
        let inputPipe = Pipe()
        process.standardInput = inputPipe
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        
        process.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                self?.isSpeaking = false
            }
        }
        
        do {
            try process.run()
            if let data = text.data(using: .utf8) {
                inputPipe.fileHandleForWriting.write(data)
            }
            inputPipe.fileHandleForWriting.closeFile()
        } catch {
            NSLog("Error launching speak-report: \(error)")
            isSpeaking = false
        }
    }
    
    // MARK: - Cleanup
    
    func applicationWillTerminate(_ notification: Notification) {
        checkTimer?.invalidate()
        hideTimer?.invalidate()
        debounceTimer?.invalidate()
    }
}

// Helper for tracking area hover events
final class HoverTracker: NSResponder {
    weak var triggerDelegate: TriggerDelegate?
    
    init(delegate: TriggerDelegate) {
        self.triggerDelegate = delegate
        super.init()
    }
    
    required init?(coder: NSCoder) { fatalError() }
    
    override func mouseEntered(with event: NSEvent) {
        triggerDelegate?.handleMouseEntered()
    }
    
    override func mouseExited(with event: NSEvent) {
        triggerDelegate?.handleMouseExited()
    }
}

// --- Entry point ---
let app = NSApplication.shared
let delegate = TriggerDelegate()
app.delegate = delegate
app.run()
