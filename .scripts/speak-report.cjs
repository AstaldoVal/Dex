#!/usr/bin/env node
/**
 * Speak report aloud using OpenAI TTS API (for Russian) or macOS built-in `say`.
 * Reads a markdown or text file, strips markdown for natural speech, then speaks.
 *
 * For Russian: uses OpenAI TTS API with "nova" voice (natural, no accent) if OPENAI_API_KEY is set.
 * Otherwise falls back to say -v Milena.
 *
 * Usage:
 *   node .scripts/speak-report.cjs <file>
 *   node .scripts/speak-report.cjs --stdin   (read from stdin)
 *
 * Options:
 *   --stdin       Read content from stdin instead of file
 *   --no-strip    Skip markdown stripping (speak raw content)
 *   --voice NAME  Force system voice (e.g. Milena); disables OpenAI TTS for Russian
 *   --say         Force macOS "say" even for Russian (skip OpenAI TTS)
 *   --openai-voice NAME  OpenAI voice: nova (default), alloy, echo, fable, onyx, shimmer
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const os = require('os');
const https = require('https');
const { logOpenAICall } = require('./lib/openai-usage-logger.cjs');

// PID file for process control
const PID_FILE = path.join(os.tmpdir(), 'dex-speak.pid');
const STOP_FLAG_FILE = path.join(os.tmpdir(), 'dex-speak-stop-flag');
const PAUSE_FLAG_FILE = path.join(os.tmpdir(), 'dex-speak-pause-flag');
let currentAudioProcess = null;
let isStopping = false;
let isPaused = false;
let notificationProcess = null;

const args = process.argv.slice(2);
const useStdin = args.includes('--stdin');
const noStrip = args.includes('--no-strip');
const forceSay = args.includes('--say');
const voiceIdx = args.indexOf('--voice');
const voice = voiceIdx >= 0 && args[voiceIdx + 1] ? args[voiceIdx + 1] : null;
const openaiVoiceIdx = args.indexOf('--openai-voice');
const openaiVoice = openaiVoiceIdx >= 0 && args[openaiVoiceIdx + 1] ? args[openaiVoiceIdx + 1] : 'nova';

// Extract file path: first non-flag argument that isn't a flag value
let filePath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--stdin' || args[i] === '--no-strip' || args[i] === '--voice') {
    if (args[i] === '--voice') i++; // Skip voice value
    continue;
  }
  if (!args[i].startsWith('--')) {
    filePath = args[i];
    break;
  }
}

function stripMarkdownForSpeech(text) {
  let out = text
    // Code blocks: remove entirely (not useful to hear)
    .replace(/```[\s\S]*?```/g, ' ')
    // Inline code
    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    // Headers: remove # prefix only
    .replace(/^#{1,6}\s+/gm, '')
    // Bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Links: keep link text only
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Bullets: drop marker so "say" doesn't read "dash" or "asterisk"
    .replace(/^\s*[-*]\s+/gm, ' ')
    .replace(/^\s*\d+\.\s+/gm, ' ')
    // Horizontal rules / excess newlines
    .replace(/^[-*_]{2,}\s*$/gm, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  // --- Strip technical content (paths, commands, CLI args) ---
  out = stripTechnicalContent(out);
  
  return out || text;
}

function stripTechnicalContent(text) {
  let out = text
    // CLI commands: entire lines starting with "node ", "npm ", "bash ", etc.
    .replace(/^\s*(node|npm|bash|python3?|sh|cd|mkdir|rm|cp|mv|git|pkill|pgrep)\s+.+$/gm, '')
    // "Параметры:" block — remove the whole line listing CLI params
    .replace(/^\s*Параметры\s*:.*$/gm, '')
    // "Повторная проверка" instruction blocks with shell commands
    .replace(/Повторная проверка позже:\s*\n([\s\S]*?)(?=\n\n|\n[А-ЯA-Z]|$)/g, 'Для повторной проверки есть готовые скрипты.')
    // URLs (including those with curly braces like {slug})
    .replace(/https?:\/\/[^\s)]+/g, '')
    // Full paths: /Users/..., /tmp/..., absolute and relative with 2+ segments
    .replace(/\/?(?:[\w.-]+\/){2,}[\w.*-]*/g, '')
    // Relative paths with leading dot: .scripts/..., ./something/...
    .replace(/\.[\w-]+\/[\w./-]*/g, '')
    // Standalone dir-like references: 06-Resources/, 00-Inbox/, etc.
    .replace(/\d{2}-[\w_]+\//g, '')
    // Bare filenames with tech extensions: something.json, something.cjs, etc.
    .replace(/[\w.-]+\.(json|cjs|js|ts|yaml|yml|md|sh|swift|txt|log|csv|html|xml)\b/gi, '')
    // CLI flags: --flag, --flag=value
    .replace(/\s--[\w-]+(=[\w./-]+)?/g, '')
    // Leftover short path fragments: /tmp/, /var/, etc.
    .replace(/\/\w+\/\s*\.?/g, ' ')
    // Clean up leftover artifacts
    .replace(/\(результат\s*\)/gi, '')      // "(результат )" after filename removal
    .replace(/\(\s*\)/g, '')                 // empty parens
    .replace(/«\s*»/g, '')                   // empty quotes
    .replace(/Результаты объединены в\s*\.?\s*$/gm, 'Результаты объединены.')
    .replace(/В\s+добавлен/g, 'Добавлен')   // "В  добавлен" after path removal
    // Trailing dots/spaces after removed content: "из JSON ." → "из JSON."
    .replace(/\s+\.\s*$/gm, '.')
    .replace(/\s+,/g, ',')
    // Sentences ending with dangling prepositions: "страницу " at end of line
    .replace(/\s+(страницу|в|из|на|для|к|от|по)\s*$/gm, '.')
    .replace(/^\s*\.?\s*$/gm, '')            // lines with just a dot or whitespace
    .replace(/^\s*[,:;]\s*$/gm, '')          // orphaned punctuation lines
    .replace(/[ \t]{2,}/g, ' ')              // collapse spaces (keep newlines)
    .replace(/\n{3,}/g, '\n\n')              // collapse blank lines
    .trim();
  
  return out;
}

function getContent() {
  if (useStdin) {
    return fs.readFileSync(0, 'utf8');
  }
  if (!filePath) {
    console.error('Usage: node speak-report.cjs <file> | node speak-report.cjs --stdin');
    process.exit(1);
  }
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    console.error('File not found:', resolved);
    process.exit(1);
  }
  return fs.readFileSync(resolved, 'utf8');
}

function detectRussianText(text) {
  // Simple heuristic: if text contains Cyrillic characters, it's likely Russian
  return /[А-Яа-яЁё]/.test(text);
}

function savePid() {
  fs.writeFileSync(PID_FILE, process.pid.toString(), 'utf8');
}

function removePid() {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch (_) {}
}

function stopAudio() {
  if (currentAudioProcess) {
    try {
      currentAudioProcess.kill('SIGTERM');
      currentAudioProcess = null;
    } catch (_) {}
  }
  // Also kill any orphaned audio processes
  try {
    execSync('pkill -f "afplay.*dex-speak-openai" 2>/dev/null || true', { stdio: 'ignore' });
    execSync('pkill -f "DexAudioPlayer" 2>/dev/null || true', { stdio: 'ignore' });
  } catch (_) {}
}

function checkStopFlag() {
  try {
    if (fs.existsSync(STOP_FLAG_FILE)) {
      fs.unlinkSync(STOP_FLAG_FILE);
      return true;
    }
  } catch (_) {}
  return false;
}

function checkPauseFlag() {
  try {
    if (fs.existsSync(PAUSE_FLAG_FILE)) {
      return true;
    }
  } catch (_) {}
  return false;
}

// pauseAudioNow() removed: DexAudioPlayer handles pause/resume internally with position preservation

function showNotificationDialog() {
  // Don't show widget yet - wait for audio to start
  // Widget will be shown when first chunk starts playing
}

function showWidgetWhenPlaying() {
  const scriptDir = __dirname || path.dirname(__filename || process.argv[1]);
  const widgetDir = path.join(scriptDir, 'speak-widget');
  const widgetPath = path.join(widgetDir, 'DexSpeakWidget');
  const cwd = process.cwd();

  try {
    // Prefer Swift floating widget (no pop-up)
    // Don't pass parentPid - widget now checks audio processes directly, not parent process
    if (fs.existsSync(widgetPath)) {
      notificationProcess = spawn(widgetPath, [PID_FILE, STOP_FLAG_FILE, PAUSE_FLAG_FILE, cwd, '-1'], {
        detached: true,
        stdio: 'ignore',
        cwd: cwd
      });
      notificationProcess.unref();
      return;
    }
    // Fallback: AppleScript (shows dialog)
    const scriptPath = path.join(scriptDir, 'speak-widget-minimal.applescript');
    const pidFileEscaped = PID_FILE.replace(/'/g, "'\\''");
    const stopFlagEscaped = STOP_FLAG_FILE.replace(/'/g, "'\\''");
    notificationProcess = spawn('osascript', [scriptPath, pidFileEscaped, stopFlagEscaped], {
      detached: true,
      stdio: 'ignore',
      cwd: cwd
    });
    notificationProcess.unref();
  } catch (err) {
    console.log('Could not show widget:', err.message);
  }
}

function hideNotification() {
  // Kill notification process if still running
  if (notificationProcess) {
    try {
      notificationProcess.kill('SIGTERM');
    } catch (_) {}
    notificationProcess = null;
  }
  // Remove stop and pause flags
  try {
    if (fs.existsSync(STOP_FLAG_FILE)) {
      fs.unlinkSync(STOP_FLAG_FILE);
    }
    if (fs.existsSync(PAUSE_FLAG_FILE)) {
      fs.unlinkSync(PAUSE_FLAG_FILE);
    }
  } catch (_) {}
}

// Handle interruption signals
process.on('SIGINT', () => {
  console.log('\n\nОстановка озвучивания...');
  isStopping = true;
  stopAudio();
  hideNotification();
  removePid();
  process.exit(0);
});

process.on('SIGTERM', () => {
  isStopping = true;
  stopAudio();
  hideNotification();
  removePid();
  process.exit(0);
});

function getOpenAIApiKey() {
  // Check environment variable first (most reliable)
  if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('your-key')) {
    return process.env.OPENAI_API_KEY.trim();
  }
  
  // Check .env file in project root
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    // Match OPENAI_API_KEY=value (handle quotes and comments)
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('OPENAI_API_KEY=')) {
        const value = trimmed.substring('OPENAI_API_KEY='.length).trim();
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '').trim();
        if (cleanValue && !cleanValue.includes('your-key') && cleanValue.startsWith('sk-')) {
          return cleanValue;
        }
      }
    }
  }
  return null;
}

function chunkText(text, maxLength = 4000) {
  // OpenAI TTS limit is 4096 chars, use 4000 to be safe
  const chunks = [];
  let currentChunk = '';
  
  // Split by sentences first (better for TTS)
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxLength) {
      currentChunk += sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      // If single sentence is too long, split by words
      if (sentence.length > maxLength) {
        const words = sentence.split(/\s+/);
        let wordChunk = '';
        for (const word of words) {
          if ((wordChunk + ' ' + word).length <= maxLength) {
            wordChunk += (wordChunk ? ' ' : '') + word;
          } else {
            if (wordChunk) chunks.push(wordChunk.trim());
            wordChunk = word;
          }
        }
        currentChunk = wordChunk;
      } else {
        currentChunk = sentence;
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks.filter(c => c.length > 0);
}

function generateAndPlayChunk(chunk, index, total, apiKey, voiceName, requestId = null) {
  try {
    logOpenAICall({
      operation: 'tts',
      model: 'tts-1-hd',
      input_chars: chunk.length,
      request_id: requestId || undefined,
      iteration: index + 1
    });
  } catch (_) {}
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'tts-1-hd', // Higher quality
      voice: voiceName,
      input: chunk
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/audio/speech',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errorBody = '';
        res.on('data', (d) => { errorBody += d; });
        res.on('end', () => {
          reject(new Error(`OpenAI API error ${res.statusCode}: ${errorBody}`));
        });
        return;
      }

      const audioPath = path.join(os.tmpdir(), `dex-speak-openai-${Date.now()}-${index}.mp3`);
      const fileStream = fs.createWriteStream(audioPath);

      res.pipe(fileStream);

      fileStream.on('finish', async () => {
        // Verify file exists and has content
        if (!fs.existsSync(audioPath)) {
          reject(new Error(`Audio file not created: ${audioPath}`));
          return;
        }
        const stats = fs.statSync(audioPath);
        if (stats.size === 0) {
          reject(new Error(`Audio file is empty: ${audioPath}`));
          return;
        }

        // Immediately play this chunk using spawn for better control
        console.log(`Playing chunk ${index + 1}/${total}...`);
        const absolutePath = path.resolve(audioPath);
        
        // Stop previous audio if still playing
        stopAudio();
        
        if (isStopping) {
          try { fs.unlinkSync(audioPath); } catch (_) {}
          reject(new Error('Process interrupted'));
          return;
        }
        
        // Widget already shown in main() - just small delay to ensure widget is ready
        if (index === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Use DexAudioPlayer (Swift) for pause/resume with position preservation, or fallback to afplay
        const scriptDir = __dirname || path.dirname(__filename || process.argv[1]);
        const widgetDir = path.join(scriptDir, 'speak-widget');
        const playerPath = path.join(widgetDir, 'DexAudioPlayer');
        
        if (fs.existsSync(playerPath)) {
          // Use Swift player: it handles pause/resume internally, preserves position
          // Run detached so it continues even if Node.js process terminates (e.g. timeout)
          currentAudioProcess = spawn(playerPath, [absolutePath, PAUSE_FLAG_FILE, STOP_FLAG_FILE], {
            stdio: 'ignore',
            detached: true
          });
          currentAudioProcess.unref(); // Allow Node.js to exit without waiting
          
          // Update widget with audio player PID if widget supports it
          // For now, widget checks processes directly, so no need to pass PID
        } else {
          // Fallback to afplay (no pause support, but works)
          currentAudioProcess = spawn('afplay', [absolutePath], {
            stdio: 'inherit',
            detached: false
          });
        }
        
        currentAudioProcess.on('close', (code) => {
          currentAudioProcess = null;
          isPaused = false;
          try { fs.unlinkSync(audioPath); } catch (_) {}
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Audio player exited with code ${code}`));
          }
        });
        
        currentAudioProcess.on('error', (err) => {
          currentAudioProcess = null;
          isPaused = false;
          try { fs.unlinkSync(audioPath); } catch (_) {}
          reject(new Error(`Failed to play audio: ${err.message}`));
        });
      });

      fileStream.on('error', (err) => {
        try { fs.unlinkSync(audioPath); } catch (_) {}
        reject(err);
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function speakWithOpenAI(text, voiceName = 'nova', requestId = null) {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not found in .env or environment');
  }

  const chunks = chunkText(text);
  const ttsRequestId = requestId || 'speak_report';
  console.log(`Processing ${chunks.length} chunks sequentially (generate → play → next)...`);
  console.log(`Нажми Ctrl+C для остановки или используйте кнопку в виджете`);

  // Widget will be shown when audio actually starts playing (in generateAndPlayChunk)

  // Process and play chunks one by one
  for (let i = 0; i < chunks.length; i++) {
    // Check stop flag from notification dialog
    if (checkStopFlag() || isStopping) {
      throw new Error('Process interrupted by user');
    }
    
    // Wait if paused
    while (checkPauseFlag() && !checkStopFlag() && !isStopping) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    if (checkStopFlag() || isStopping) {
      throw new Error('Process interrupted by user');
    }
    
    try {
      console.log(`Generating chunk ${i + 1}/${chunks.length}...`);
      await generateAndPlayChunk(chunks[i], i, chunks.length, apiKey, voiceName, ttsRequestId);
      if (checkStopFlag() || isStopping) {
        throw new Error('Process interrupted by user');
      }
    } catch (error) {
      if (isStopping || checkStopFlag()) {
        throw new Error('Process interrupted by user');
      }
      throw new Error(`Error processing chunk ${i + 1}: ${error.message}`);
    }
  }
}

async function main() {
  if (os.platform() !== 'darwin') {
    console.error('speak-report uses macOS "say" command. On other systems install a TTS tool and adapt this script.');
    process.exit(1);
  }

  // Save PID for process control
  savePid();

  let content = getContent();
  const originalContent = content;
  if (!noStrip) {
    content = stripMarkdownForSpeech(content);
  }
  if (!content.trim()) {
    console.error('No content to speak.');
    removePid();
    process.exit(1);
  }

  const isRussian = detectRussianText(originalContent);
  const openaiKey = getOpenAIApiKey();
  const hasOpenAIKey = !!openaiKey;
  const useOpenAI = isRussian && !forceSay && !voice && hasOpenAIKey;

  console.log(`Speaking ${content.length} characters...`);
  if (isRussian && !forceSay && !voice) {
    if (hasOpenAIKey) {
      console.log(`OpenAI API key found, will use OpenAI TTS`);
    } else {
      console.log(`OpenAI API key not found, using macOS say`);
    }
  }

  // Show widget before starting any TTS (for both OpenAI and say)
  if (!notificationProcess) {
    showWidgetWhenPlaying();
  }

  try {
    if (useOpenAI) {
      console.log(`Using OpenAI TTS with voice: ${openaiVoice} (natural Russian, no accent)`);
      try {
        await speakWithOpenAI(content, openaiVoice, filePath || 'stdin');
        console.log('Done speaking.');
      } catch (error) {
        if (isStopping) {
          console.log('Остановлено пользователем.');
          return;
        }
        console.error(`OpenAI TTS error: ${error.message}`);
        console.log('Falling back to macOS say...');
        // Fallback to say - widget already shown, use spawn for process control
        const tmpFile = path.join(os.tmpdir(), `dex-speak-${Date.now()}.txt`);
        fs.writeFileSync(tmpFile, content, 'utf8');
        try {
          currentAudioProcess = spawn('say', ['-f', tmpFile, '-v', 'Milena'], {
            stdio: 'inherit',
            detached: false
          });
          
          // Monitor pause/stop flags
          let lastPauseFlag = false;
          const pauseCheckInterval = setInterval(() => {
            if (checkStopFlag() || isStopping) {
              clearInterval(pauseCheckInterval);
              if (currentAudioProcess) currentAudioProcess.kill('SIGTERM');
              return;
            }
            const nowPaused = checkPauseFlag();
            if (nowPaused && !lastPauseFlag && currentAudioProcess) {
              try { process.kill(currentAudioProcess.pid, 'SIGSTOP'); isPaused = true; } catch (_) {}
            } else if (!nowPaused && lastPauseFlag && currentAudioProcess && isPaused) {
              try { process.kill(currentAudioProcess.pid, 'SIGCONT'); isPaused = false; } catch (_) {}
            }
            lastPauseFlag = nowPaused;
          }, 250);
          
          await new Promise((resolve, reject) => {
            currentAudioProcess.on('close', (code) => {
              clearInterval(pauseCheckInterval);
              currentAudioProcess = null;
              isPaused = false;
              try { fs.unlinkSync(tmpFile); } catch (_) {}
              if (code === 0 || code === null) resolve();
              else reject(new Error(`say exited with code ${code}`));
            });
            currentAudioProcess.on('error', (err) => {
              clearInterval(pauseCheckInterval);
              currentAudioProcess = null;
              isPaused = false;
              try { fs.unlinkSync(tmpFile); } catch (_) {}
              reject(err);
            });
          });
          
          console.log('Done speaking.');
        } catch (fallbackError) {
          if (isStopping) {
            console.log('Остановлено пользователем.');
            return;
          }
          throw fallbackError;
        }
      }
    } else {
    // Use macOS say with spawn for process control (pause/stop support)
    let finalVoice = voice;
    if (!finalVoice && isRussian) {
      finalVoice = 'Milena';
    }

    const tmpFile = path.join(os.tmpdir(), `dex-speak-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, content, 'utf8');
    
    if (finalVoice) console.log(`Using voice: ${finalVoice}`);

    try {
      const sayArgs = ['-f', tmpFile];
      if (finalVoice) sayArgs.push('-v', finalVoice);
      console.log(`Running: say ${sayArgs.join(' ')}`);
      
      // Use spawn instead of execSync for process control
      currentAudioProcess = spawn('say', sayArgs, {
        stdio: 'inherit',
        detached: false
      });
      
      // Monitor pause/stop flags
      let lastPauseFlag = false;
      const pauseCheckInterval = setInterval(() => {
        if (checkStopFlag() || isStopping) {
          clearInterval(pauseCheckInterval);
          if (currentAudioProcess) {
            currentAudioProcess.kill('SIGTERM');
          }
          return;
        }
        
        const nowPaused = checkPauseFlag();
        if (nowPaused && !lastPauseFlag && currentAudioProcess) {
          // Pause: send SIGSTOP
          try {
            process.kill(currentAudioProcess.pid, 'SIGSTOP');
            isPaused = true;
          } catch (_) {}
        } else if (!nowPaused && lastPauseFlag && currentAudioProcess && isPaused) {
          // Resume: send SIGCONT
          try {
            process.kill(currentAudioProcess.pid, 'SIGCONT');
            isPaused = false;
          } catch (_) {}
        }
        lastPauseFlag = nowPaused;
      }, 250);
      
      await new Promise((resolve, reject) => {
        currentAudioProcess.on('close', (code) => {
          clearInterval(pauseCheckInterval);
          currentAudioProcess = null;
          isPaused = false;
          try { fs.unlinkSync(tmpFile); } catch (_) {}
          if (code === 0 || code === null) {
            resolve();
          } else {
            reject(new Error(`say exited with code ${code}`));
          }
        });
        
        currentAudioProcess.on('error', (err) => {
          clearInterval(pauseCheckInterval);
          currentAudioProcess = null;
          isPaused = false;
          try { fs.unlinkSync(tmpFile); } catch (_) {}
          reject(err);
        });
      });
      
      console.log('Done speaking.');
    } catch (error) {
      if (isStopping) {
        console.log('Остановлено пользователем.');
        return;
      }
      console.error('Error running say:', error.message);
      process.exit(1);
    }
    }
  } finally {
    stopAudio();
    hideNotification();
    removePid();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  stopAudio();
  hideNotification();
  removePid();
  process.exit(1);
});
