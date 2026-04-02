import AVFoundation
import AppKit
import Foundation

final class PlaybackManager: NSObject {
    var player: AVPlayer?
    var pauseFlagPath: String = ""
    var stopFlagPath: String = ""
    var checkTimer: Timer?
    var wasPaused = false
    var onFinished: (() -> Void)?

    func play(fileURL: URL, pauseFlag: String, stopFlag: String) {
        pauseFlagPath = pauseFlag
        stopFlagPath = stopFlag
        player = AVPlayer(url: fileURL)
        checkTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.checkFlags()
        }
        RunLoop.current.add(checkTimer!, forMode: .common)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(didFinish),
            name: .AVPlayerItemDidPlayToEndTime,
            object: player?.currentItem
        )
        player?.play()
    }

    @objc private func checkFlags() {
        if FileManager.default.fileExists(atPath: stopFlagPath) {
            try? FileManager.default.removeItem(atPath: stopFlagPath)
            checkTimer?.invalidate()
            player?.pause()
            onFinished?()
            return
        }
        let shouldPause = FileManager.default.fileExists(atPath: pauseFlagPath)
        if shouldPause, player?.rate != 0 {
            player?.pause()
            wasPaused = true
        } else if !shouldPause, wasPaused, player?.rate == 0 {
            player?.play()
            wasPaused = false
        }
    }

    @objc private func didFinish() {
        checkTimer?.invalidate()
        onFinished?()
    }

    func stop() {
        checkTimer?.invalidate()
        player?.pause()
    }
}
