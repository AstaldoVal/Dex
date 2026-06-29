import AVFoundation
import AppKit
import Foundation

// Audio player with pause/resume support (preserves position)
// Args: audioFilePath, pauseFlagPath, stopFlagPath
// Monitors pause/stop flags and plays audio with position tracking

final class AudioPlayerDelegate: NSObject, NSApplicationDelegate {
    var player: AVPlayer?
    var pauseFlagPath: String = ""
    var stopFlagPath: String = ""
    var checkTimer: Timer?
    var wasPaused = false
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = CommandLine.arguments
        guard args.count >= 4 else {
            print("Usage: DexAudioPlayer <audioFile> <pauseFlagPath> <stopFlagPath>")
            NSApp.terminate(nil)
            return
        }
        
        let audioFilePath = args[1]
        pauseFlagPath = args[2]
        stopFlagPath = args[3]
        
        guard FileManager.default.fileExists(atPath: audioFilePath) else {
            print("Audio file not found: \(audioFilePath)")
            NSApp.terminate(nil)
            return
        }
        
        // Setup AVPlayer
        let url = URL(fileURLWithPath: audioFilePath)
        player = AVPlayer(url: url)
        
        // Monitor pause/stop flags every 100ms
        checkTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.checkFlags()
        }
        RunLoop.current.add(checkTimer!, forMode: .common)
        
        // Start playing
        player?.play()
        
        // Monitor playback end
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(playerDidFinish),
            name: .AVPlayerItemDidPlayToEndTime,
            object: player?.currentItem
        )
    }
    
    @objc private func checkFlags() {
        // Check stop flag
        if FileManager.default.fileExists(atPath: stopFlagPath) {
            // Stop flag detected - stop playback and exit
            player?.pause()
            checkTimer?.invalidate()
            // Remove stop flag so we don't trigger again
            try? FileManager.default.removeItem(atPath: stopFlagPath)
            NSApp.terminate(nil)
            return
        }
        
        // Check pause flag
        let shouldPause = FileManager.default.fileExists(atPath: pauseFlagPath)
        
        if shouldPause && player?.rate != 0 {
            // Pause: save position is automatic (AVPlayer maintains it)
            player?.pause()
            wasPaused = true
        } else if !shouldPause && wasPaused && player?.rate == 0 {
            // Resume: continue from saved position
            player?.play()
            wasPaused = false
        }
    }
    
    @objc private func playerDidFinish() {
        checkTimer?.invalidate()
        // Small delay to ensure cleanup
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            NSApp.terminate(nil)
        }
    }
    
    func applicationWillTerminate(_ notification: Notification) {
        player?.pause()
        checkTimer?.invalidate()
    }
}

let app = NSApplication.shared
let delegate = AudioPlayerDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
