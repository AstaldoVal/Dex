import AppKit
import Foundation

final class SpeakWidgetPanel: NSPanel {
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
        let barWidth: CGFloat = 3
        let spacing: CGFloat = 2
        let totalWidth = CGFloat(5) * barWidth + CGFloat(4) * spacing
        let startX = (frameRect.width - totalWidth) / 2
        for i in 0..<5 {
            let bar = NSView(frame: NSRect(
                x: startX + CGFloat(i) * (barWidth + spacing),
                y: 0, width: barWidth, height: frameRect.height
            ))
            bar.wantsLayer = true
            bar.layer?.backgroundColor = NSColor.systemBlue.cgColor
            bar.layer?.cornerRadius = barWidth / 2
            bars.append(bar)
            addSubview(bar)
        }
        startAnimation()
    }

    required init?(coder: NSCoder) { fatalError() }

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
        let baseHeights: [CGFloat] = [0.3, 0.7, 1.0, 0.6, 0.4]
        let variation = sin(Date().timeIntervalSince1970 * 8) * 0.2 + 0.8
        for (i, bar) in bars.enumerated() {
            let targetHeight = bounds.height * baseHeights[i] * variation
            let currentHeight = bar.frame.height
            let newHeight = currentHeight * 0.7 + targetHeight * 0.3
            bar.frame = NSRect(
                x: bar.frame.origin.x,
                y: (bounds.height - newHeight) / 2,
                width: bar.frame.width,
                height: max(newHeight, 4)
            )
        }
    }

    deinit { stopAnimation() }
}

final class SpeakWidgetController: NSObject {
    var panel: SpeakWidgetPanel!
    var waveformView: WaveformView!
    var stopFlagPath: String = ""
    var pauseFlagPath: String = ""
    var onStop: (() -> Void)?
    var onPause: ((Bool) -> Void)?
    private var pauseButton: NSButton?

    func show(stopFlag: String, pauseFlag: String) {
        stopFlagPath = stopFlag
        pauseFlagPath = pauseFlag
        let panelWidth: CGFloat = 118
        let panelHeight: CGFloat = 44
        panel = SpeakWidgetPanel(
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
        let visualEffect = NSVisualEffectView()
        visualEffect.material = .hudWindow
        visualEffect.state = .active
        visualEffect.blendingMode = .behindWindow
        visualEffect.frame = NSRect(x: 0, y: 0, width: panelWidth, height: panelHeight)
        panel.contentView = visualEffect
        panel.hasShadow = true
        panel.backgroundColor = .clear
        if let screen = NSScreen.main {
            let x = screen.visibleFrame.maxX - panel.frame.width - 20
            let y = screen.visibleFrame.minY + 20
            panel.setFrameOrigin(NSPoint(x: x, y: y))
        }
        let contentView = panel.contentView!
        contentView.wantsLayer = true
        waveformView = WaveformView(frame: NSRect(x: 8, y: 8, width: 25, height: 28))
        contentView.addSubview(waveformView)
        let pauseButton = NSButton(title: "⏸", target: self, action: #selector(pauseClicked))
        pauseButton.bezelStyle = .rounded
        pauseButton.frame = NSRect(x: 40, y: 8, width: 32, height: 28)
        pauseButton.font = NSFont.systemFont(ofSize: 16)
        pauseButton.contentTintColor = .white
        pauseButton.wantsLayer = true
        pauseButton.layer?.backgroundColor = NSColor(white: 0.35, alpha: 1.0).cgColor
        pauseButton.layer?.cornerRadius = 6
        pauseButton.layer?.masksToBounds = true
        contentView.addSubview(pauseButton)
        self.pauseButton = pauseButton
        let stopBtn = NSButton(title: "⏹", target: self, action: #selector(stopClicked))
        stopBtn.bezelStyle = .rounded
        stopBtn.frame = NSRect(x: 78, y: 8, width: 32, height: 28)
        stopBtn.font = NSFont.systemFont(ofSize: 16)
        stopBtn.contentTintColor = .white
        stopBtn.wantsLayer = true
        stopBtn.layer?.backgroundColor = NSColor.systemRed.cgColor
        stopBtn.layer?.cornerRadius = 6
        stopBtn.layer?.masksToBounds = true
        contentView.addSubview(stopBtn)
        panel.orderFrontRegardless()
    }

    @objc private func pauseClicked() {
        let exists = FileManager.default.fileExists(atPath: pauseFlagPath)
        if exists {
            try? FileManager.default.removeItem(atPath: pauseFlagPath)
            pauseButton?.title = "⏸"
            onPause?(false)
        } else {
            FileManager.default.createFile(atPath: pauseFlagPath, contents: nil)
            pauseButton?.title = "▶"
            onPause?(true)
        }
    }

    @objc private func stopClicked() {
        waveformView?.stopAnimation()
        FileManager.default.createFile(atPath: stopFlagPath, contents: nil)
        onStop?()
        panel?.orderOut(nil)
    }

    func hide() {
        waveformView?.stopAnimation()
        panel?.orderOut(nil)
    }
}
