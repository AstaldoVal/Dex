import AppKit
import Foundation
import Darwin

// Small floating widget: animated indicator + pause + stop buttons
// Args: pidFile, stopFlagFile, pauseFlagFile, [cwd for npm], [parentPid to auto-close when speak process exits]

final class WidgetPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class WaveformView: NSView {
    var bars: [NSView] = []
    var animationTimer: Timer?
    
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
        
        // Create 5 bars for waveform
        let barWidth: CGFloat = 3
        let spacing: CGFloat = 2
        let totalWidth = CGFloat(5) * barWidth + CGFloat(4) * spacing
        let startX = (frameRect.width - totalWidth) / 2
        
        for i in 0..<5 {
            let bar = NSView(frame: NSRect(
                x: startX + CGFloat(i) * (barWidth + spacing),
                y: 0,
                width: barWidth,
                height: frameRect.height
            ))
            bar.wantsLayer = true
            bar.layer?.backgroundColor = NSColor.systemBlue.cgColor
            bar.layer?.cornerRadius = barWidth / 2
            bars.append(bar)
            addSubview(bar)
        }
        
        startAnimation()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    func startAnimation() {
        animationTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.animateBars()
        }
        RunLoop.current.add(animationTimer!, forMode: .common)
    }
    
    func stopAnimation() {
        animationTimer?.invalidate()
        animationTimer = nil
    }
    
    private func animateBars() {
        // Animate bars with different heights (waveform effect)
        let baseHeights: [CGFloat] = [0.3, 0.7, 1.0, 0.6, 0.4]
        let variation = sin(Date().timeIntervalSince1970 * 8) * 0.2 + 0.8
        
        for (i, bar) in bars.enumerated() {
            let targetHeight = bounds.height * baseHeights[i] * variation
            let currentHeight = bar.frame.height
            let newHeight = currentHeight * 0.7 + targetHeight * 0.3 // Smooth transition
            
            bar.frame = NSRect(
                x: bar.frame.origin.x,
                y: (bounds.height - newHeight) / 2,
                width: bar.frame.width,
                height: max(newHeight, 4)
            )
        }
    }
    
    deinit {
        stopAnimation()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var panel: WidgetPanel!
    var stopFlagPath: String = ""
    var pauseFlagPath: String = ""
    var workDir: String = FileManager.default.currentDirectoryPath
    var parentPid: Int32 = -1
    var checkParentTimer: Timer?
    var waveformView: WaveformView!
    var pauseBtn: NSButton!
    var isPaused: Bool = false
    var startTime: Date = Date() // Grace period: don't auto-close for first N seconds

    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = CommandLine.arguments
        guard args.count >= 4 else { NSApp.terminate(nil); return }
        _ = args[1] // pidFile
        stopFlagPath = args[2]
        pauseFlagPath = args[3]
        if args.count >= 5 { workDir = args[4] }
        if args.count >= 6, let p = Int32(args[5]) { parentPid = p }

        // Panel: compact width (waveform + 2 buttons, no extra space)
        let panelWidth: CGFloat = 118
        let panelHeight: CGFloat = 44
        panel = WidgetPanel(
            contentRect: NSRect(x: 0, y: 0, width: panelWidth, height: panelHeight),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isOpaque = false
        panel.isMovableByWindowBackground = true
        // Blur effect background
        let visualEffect = NSVisualEffectView()
        visualEffect.material = .hudWindow
        visualEffect.state = .active
        visualEffect.blendingMode = .behindWindow
        visualEffect.frame = NSRect(x: 0, y: 0, width: panelWidth, height: panelHeight)
        panel.contentView = visualEffect
        panel.hasShadow = true
        panel.hidesOnDeactivate = false
        panel.backgroundColor = .clear

        // Position bottom-right of main screen
        if let screen = NSScreen.main {
            let x = screen.visibleFrame.maxX - panel.frame.width - 20
            let y = screen.visibleFrame.minY + 20
            panel.setFrameOrigin(NSPoint(x: x, y: y))
        }

        let contentView = panel.contentView!
        contentView.wantsLayer = true

        // Animated waveform indicator
        waveformView = WaveformView(frame: NSRect(x: 8, y: 8, width: 25, height: 28))
        contentView.addSubview(waveformView)

        // Pause button - same size as stop (32×28), same font, gray background so both align
        pauseBtn = NSButton(title: "⏸", target: self, action: #selector(pauseClicked))
        pauseBtn.bezelStyle = .rounded
        pauseBtn.frame = NSRect(x: 40, y: 8, width: 32, height: 28)
        pauseBtn.font = NSFont.systemFont(ofSize: 16)
        pauseBtn.alignment = .center
        pauseBtn.contentTintColor = .white
        pauseBtn.wantsLayer = true
        pauseBtn.layer?.backgroundColor = NSColor(white: 0.35, alpha: 1.0).cgColor
        pauseBtn.layer?.cornerRadius = 6
        pauseBtn.layer?.masksToBounds = true
        contentView.addSubview(pauseBtn)

        // Stop button - square icon ⏹, red background (layer)
        let stopBtn = NSButton(title: "⏹", target: self, action: #selector(stopClicked))
        stopBtn.bezelStyle = .rounded
        stopBtn.frame = NSRect(x: 78, y: 8, width: 32, height: 28)
        stopBtn.font = NSFont.systemFont(ofSize: 16)
        stopBtn.alignment = .center
        stopBtn.contentTintColor = .white
        stopBtn.wantsLayer = true
        stopBtn.layer?.backgroundColor = NSColor.systemRed.cgColor
        stopBtn.layer?.cornerRadius = 6
        stopBtn.layer?.masksToBounds = true
        contentView.addSubview(stopBtn)

        // Check for audio player processes instead of parent process
        // This way widget stays open even if Node.js process exits (when using DexAudioPlayer)
        checkParentTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.checkAudioProcessRunning()
        }
        RunLoop.current.add(checkParentTimer!, forMode: .common)

        panel.orderFrontRegardless()
    }

    private func isPidFileAlive() -> Bool {
        // Check if PID file exists and the process is still running
        let pidPath = CommandLine.arguments.count >= 2 ? CommandLine.arguments[1] : ""
        guard !pidPath.isEmpty,
              let pidStr = try? String(contentsOfFile: pidPath, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
              let pid = Int32(pidStr) else {
            return false
        }
        // kill(pid, 0) checks if process exists without sending a signal
        return kill(pid, 0) == 0
    }
    
    private func isAudioRunning() -> Bool {
        // Method 1: Check PID file (most reliable - speak-report writes this)
        if isPidFileAlive() { return true }
        
        // Method 2: Check for audio processes via pgrep
        // Use separate pgrep calls to avoid regex issues and self-matching
        let patterns = [
            "DexAudioPlayer",
            "afplay.*dex-speak",
            "say -f.*dex-speak"
        ]
        
        for pattern in patterns {
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/bin/pgrep")
            task.arguments = ["-f", pattern]
            task.standardOutput = Pipe()
            task.standardError = FileHandle.nullDevice
            
            do {
                try task.run()
                task.waitUntilExit()
                if task.terminationStatus == 0 { return true }
            } catch {}
        }
        
        return false
    }
    
    private var noProcessCount: Int = 0  // Track consecutive "no process" checks
    
    private func checkAudioProcessRunning() {
        // Grace period: don't auto-close for the first 20 seconds after startup
        // This ensures npm/node have time to start the audio process
        let elapsed = Date().timeIntervalSince(startTime)
        if elapsed < 20.0 {
            return // Still in grace period, keep widget open
        }
        
        // After grace period, check if audio processes are still running
        if isAudioRunning() {
            noProcessCount = 0  // Reset counter
            return
        }
        
        // No audio processes found — require 3 consecutive checks (3 seconds) before closing
        noProcessCount += 1
        if noProcessCount < 3 { return }
        
        // No processes for 3 seconds — check if stop flag exists (user stopped)
        if !FileManager.default.fileExists(atPath: stopFlagPath) {
            checkParentTimer?.invalidate()
            waveformView?.stopAnimation()
            panel?.orderOut(nil)
            NSApp.terminate(nil)
        }
    }

    @objc private func pauseClicked() {
        isPaused.toggle()
        
        if isPaused {
            // Create pause flag file
            FileManager.default.createFile(atPath: pauseFlagPath, contents: nil)
            pauseBtn.title = "▶"
            waveformView?.stopAnimation()
        } else {
            // Remove pause flag file
            try? FileManager.default.removeItem(atPath: pauseFlagPath)
            pauseBtn.title = "⏸"
            waveformView?.startAnimation()
        }
    }

    @objc private func stopClicked() {
        waveformView?.stopAnimation()

        // Create stop flag file
        FileManager.default.createFile(atPath: stopFlagPath, contents: nil)

        // Run npm run speak-stop in project dir
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        task.arguments = ["npm", "run", "speak-stop"]
        task.currentDirectoryURL = URL(fileURLWithPath: workDir)
        task.standardOutput = FileHandle.nullDevice
        task.standardError = FileHandle.nullDevice
        try? task.run()
        task.waitUntilExit()

        panel?.orderOut(nil)
        NSApp.terminate(nil)
    }

    func applicationWillTerminate(_ notification: Notification) {
        waveformView?.stopAnimation()
        checkParentTimer?.invalidate()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
