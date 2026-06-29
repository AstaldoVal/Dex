import AppKit
import Foundation
import AVFoundation

private let stopFlagPath = FileManager.default.temporaryDirectory.path + "/dex-speak-app-stop"
private let pauseFlagPath = FileManager.default.temporaryDirectory.path + "/dex-speak-app-pause"

@main
struct DexSpeakApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem?
    var widgetController: SpeakWidgetController?
    var playbackManager: PlaybackManager?
    var isSpeaking = false
    var stopRequested = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        if KeychainHelper.load(key: KeychainHelper.account) == nil {
            showAPIKeyDialog(firstLaunch: true)
            return
        }
        setupMenuBar()
    }

    private func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem?.button?.title = "🔊"
        statusItem?.button?.toolTip = "DexSpeak — озвучка текста"
        let menu = NSMenu()
        let speakClip = NSMenuItem(title: "Озвучить буфер обмена", action: #selector(speakClipboard), keyEquivalent: "")
        speakClip.target = self
        menu.addItem(speakClip)
        let speakFile = NSMenuItem(title: "Озвучить файл…", action: #selector(speakFile), keyEquivalent: "o")
        speakFile.target = self
        menu.addItem(speakFile)
        menu.addItem(NSMenuItem.separator())
        let settings = NSMenuItem(title: "Настройки (API ключ)…", action: #selector(showSettings), keyEquivalent: ",")
        settings.target = self
        menu.addItem(settings)
        menu.addItem(NSMenuItem.separator())
        let quit = NSMenuItem(title: "Выход", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        statusItem?.menu = menu
    }

    private func showAPIKeyDialog(firstLaunch: Bool) {
        let alert = NSAlert()
        alert.messageText = firstLaunch ? "Введите OpenAI API ключ" : "OpenAI API ключ"
        alert.informativeText = "Ключ нужен для озвучки текста голосовой моделью (русский без акцента). Хранится в связке ключей macOS."
        alert.alertStyle = .informational
        let input = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 22))
        if let existing = KeychainHelper.load(key: KeychainHelper.account) {
            input.stringValue = existing
        }
        input.placeholderString = "sk-..."
        alert.accessoryView = input
        alert.addButton(withTitle: "Сохранить")
        alert.addButton(withTitle: "Отмена")
        DispatchQueue.main.async {
            alert.window.initialFirstResponder = input
            let response = alert.runModal()
            if response == .alertFirstButtonReturn, !input.stringValue.trimmingCharacters(in: .whitespaces).isEmpty {
                let key = input.stringValue.trimmingCharacters(in: .whitespaces)
                if key.hasPrefix("sk-") {
                    _ = KeychainHelper.save(key: KeychainHelper.account, value: key)
                    if !self.setupMenuBarIfNeeded() {
                        self.setupMenuBar()
                    }
                }
            } else if firstLaunch {
                NSApp.terminate(nil)
            }
        }
    }

    private func setupMenuBarIfNeeded() -> Bool {
        if statusItem != nil { return true }
        setupMenuBar()
        return false
    }

    @objc private func showSettings() {
        showAPIKeyDialog(firstLaunch: false)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    @objc private func speakClipboard() {
        guard let text = NSPasteboard.general.string(forType: .string)?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
            showAlert(message: "Буфер обмена пуст или не содержит текста.")
            return
        }
        startSpeaking(text: text)
    }

    @objc private func speakFile() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.plainText, .utf8PlainText, .text, .pdf]
        panel.message = "Выберите текстовый или PDF файл для озвучки"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let text: String
        if url.pathExtension.lowercased() == "pdf" {
            guard let data = try? Data(contentsOf: url),
                  let doc = PDFDocument(data: data) else {
                showAlert(message: "Не удалось прочитать PDF.")
                return
            }
            text = doc.string ?? ""
        } else {
            guard let content = try? String(contentsOf: url, encoding: .utf8) else {
                showAlert(message: "Не удалось прочитать файл.")
                return
            }
            text = content
        }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            showAlert(message: "Файл пуст.")
            return
        }
        startSpeaking(text: text)
    }

    private func showAlert(message: String) {
        DispatchQueue.main.async {
            let a = NSAlert()
            a.messageText = message
            a.alertStyle = .warning
            a.addButton(withTitle: "OK")
            a.runModal()
        }
    }

    private func startSpeaking(text: String) {
        guard !isSpeaking else { return }
        guard let apiKey = KeychainHelper.load(key: KeychainHelper.account), !apiKey.isEmpty else {
            showAPIKeyDialog(firstLaunch: false)
            return
        }
        isSpeaking = true
        stopRequested = false
        try? FileManager.default.removeItem(atPath: stopFlagPath)
        try? FileManager.default.removeItem(atPath: pauseFlagPath)
        let cleaned = OpenAITTS.stripMarkdown(text)
        let useOpenAI = OpenAITTS.detectRussian(cleaned)
        if useOpenAI {
            Task { await speakWithOpenAI(cleaned, apiKey: apiKey) }
        } else {
            Task { await speakWithSystem(cleaned) }
        }
    }

    private func speakWithOpenAI(_ text: String, apiKey: String) async {
        let chunks = OpenAITTS.chunkText(text)
        await MainActor.run {
            widgetController = SpeakWidgetController()
            widgetController?.onStop = { [weak self] in
                self?.stopRequested = true
            }
            widgetController?.show(stopFlag: stopFlagPath, pauseFlag: pauseFlagPath)
        }
        for (i, chunk) in chunks.enumerated() {
            if stopRequested { break }
            while FileManager.default.fileExists(atPath: pauseFlagPath), !stopRequested {
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
            if stopRequested { break }
            do {
                let data = try await OpenAITTS.generateSpeech(apiKey: apiKey, text: chunk)
                let tmpURL = FileManager.default.temporaryDirectory.appendingPathComponent("dex-speak-\(Date().timeIntervalSince1970)-\(i).mp3")
                try data.write(to: tmpURL)
                defer { try? FileManager.default.removeItem(at: tmpURL) }
                await playOneFile(tmpURL)
            } catch {
                await MainActor.run {
                    showAlert(message: "Ошибка TTS: \(error.localizedDescription)")
                }
                break
            }
        }
        await finishSpeaking()
    }

    private func speakWithSystem(_ text: String) async {
        await MainActor.run {
            widgetController = SpeakWidgetController()
            widgetController?.onStop = { [weak self] in self?.stopRequested = true }
            widgetController?.show(stopFlag: stopFlagPath, pauseFlag: pauseFlagPath)
        }
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            var continuation: CheckedContinuation<Void, Never>? = cont
            let resumeOnce: () -> Void = {
                continuation?.resume()
                continuation = nil
            }
            let delegate = SayDelegate(stopFlagPath: stopFlagPath, onDone: resumeOnce)
            let synth = NSSpeechSynthesizer()
            synth.delegate = delegate
            let voice = NSSpeechSynthesizer.availableVoices.first {
                (NSSpeechSynthesizer.attributes(forVoice: $0)[NSSpeechSynthesizer.VoiceAttributeKey.localeIdentifier] as? String) == "ru_RU"
            }
                ?? NSSpeechSynthesizer.defaultVoice
            synth.setVoice(voice)
            delegate.synth = synth
            var monitor: Timer?
            DispatchQueue.main.async {
                synth.startSpeaking(text)
                monitor = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { _ in
                    if FileManager.default.fileExists(atPath: stopFlagPath) {
                        try? FileManager.default.removeItem(atPath: stopFlagPath)
                        synth.stopSpeaking()
                        monitor?.invalidate()
                        resumeOnce()
                    }
                }
                RunLoop.main.add(monitor!, forMode: .common)
            }
        }
        await finishSpeaking()
    }

    private func playOneFile(_ url: URL) async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            let pm = PlaybackManager()
            pm.onFinished = {
                cont.resume()
            }
            DispatchQueue.main.async {
                self.playbackManager = pm
                pm.play(fileURL: url, pauseFlag: pauseFlagPath, stopFlag: stopFlagPath)
            }
        }
        await MainActor.run {
            playbackManager?.stop()
            playbackManager = nil
        }
    }

    private func finishSpeaking() async {
        await MainActor.run {
            widgetController?.hide()
            widgetController = nil
            isSpeaking = false
            stopRequested = false
            try? FileManager.default.removeItem(atPath: stopFlagPath)
            try? FileManager.default.removeItem(atPath: pauseFlagPath)
        }
    }
}

import PDFKit

private final class SayDelegate: NSObject, NSSpeechSynthesizerDelegate {
    weak var synth: NSSpeechSynthesizer?
    let stopFlagPath: String
    let onDone: () -> Void

    init(stopFlagPath: String, onDone: @escaping () -> Void) {
        self.stopFlagPath = stopFlagPath
        self.onDone = onDone
    }

    func speechSynthesizer(_ sender: NSSpeechSynthesizer, didFinishSpeaking finishedSpeaking: Bool) {
        onDone()
    }
}
