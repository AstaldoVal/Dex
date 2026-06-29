import Foundation

struct OpenAITTS {
    static let maxChunkLength = 4000
    static let voice = "nova"

    static func chunkText(_ text: String) -> [String] {
        var chunks: [String] = []
        var current = ""
        let sentences = text.components(separatedBy: CharacterSet(charactersIn: ".!?"))
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        for sentence in sentences {
            let withPunct = sentence + "."
            if (current + withPunct).count <= maxChunkLength {
                current += (current.isEmpty ? "" : " ") + withPunct
            } else {
                if !current.isEmpty { chunks.append(current) }
                if withPunct.count > maxChunkLength {
                    let words = withPunct.split(separator: " ")
                    var wordChunk = ""
                    for word in words {
                        if (wordChunk + " " + word).count <= maxChunkLength {
                            wordChunk += (wordChunk.isEmpty ? "" : " ") + word
                        } else {
                            if !wordChunk.isEmpty { chunks.append(wordChunk) }
                            wordChunk = String(word)
                        }
                    }
                    current = wordChunk
                } else {
                    current = withPunct
                }
            }
        }
        if !current.isEmpty { chunks.append(current) }
        return chunks
    }

    static func stripMarkdown(_ text: String) -> String {
        var out = text
        if let r = try? NSRegularExpression(pattern: "```[\\s\\S]*?```") {
            let range = NSRange(out.startIndex..., in: out)
            out = r.stringByReplacingMatches(in: out, range: range, withTemplate: " ")
        }
        if let r = try? NSRegularExpression(pattern: "`[^`]+`") {
            let range = NSRange(out.startIndex..., in: out)
            out = r.stringByReplacingMatches(in: out, range: range, withTemplate: " ")
        }
        if let r = try? NSRegularExpression(pattern: "^#{1,6}\\s+", options: .anchorsMatchLines) {
            let range = NSRange(out.startIndex..., in: out)
            out = r.stringByReplacingMatches(in: out, range: range, withTemplate: "")
        }
        if let r = try? NSRegularExpression(pattern: "\\*\\*([^*]+)\\*\\*") {
            let range = NSRange(out.startIndex..., in: out)
            out = r.stringByReplacingMatches(in: out, range: range, withTemplate: "$1")
        }
        if let r = try? NSRegularExpression(pattern: "\\*([^*]+)\\*") {
            let range = NSRange(out.startIndex..., in: out)
            out = r.stringByReplacingMatches(in: out, range: range, withTemplate: "$1")
        }
        if let r = try? NSRegularExpression(pattern: "\\[([^\\]]+)\\]\\([^)]+\\)") {
            let range = NSRange(out.startIndex..., in: out)
            out = r.stringByReplacingMatches(in: out, range: range, withTemplate: "$1")
        }
        if let r = try? NSRegularExpression(pattern: "^\\s*[-*]\\s+", options: .anchorsMatchLines) {
            let range = NSRange(out.startIndex..., in: out)
            out = r.stringByReplacingMatches(in: out, range: range, withTemplate: " ")
        }
        if let r = try? NSRegularExpression(pattern: "\n{3,}") {
            let range = NSRange(out.startIndex..., in: out)
            out = r.stringByReplacingMatches(in: out, range: range, withTemplate: "\n\n")
        }
        return out.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func detectRussian(_ text: String) -> Bool {
        let set = CharacterSet(charactersIn: "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя")
        return text.unicodeScalars.contains { set.contains($0) }
    }

    static func generateSpeech(apiKey: String, text: String) async throws -> Data {
        let url = URL(string: "https://api.openai.com/v1/audio/speech")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "model": "tts-1-hd",
            "voice": voice,
            "input": text
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse, http.statusCode == 200 else {
            let msg = String(data: data, encoding: .utf8) ?? ""
            throw NSError(domain: "OpenAITTS", code: (res as? HTTPURLResponse)?.statusCode ?? -1, userInfo: [NSLocalizedDescriptionKey: msg])
        }
        return data
    }
}
