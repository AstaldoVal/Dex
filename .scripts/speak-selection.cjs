#!/usr/bin/env node
/**
 * Speak selected text from Cursor/VSCode editor
 * Reads selection from clipboard (user copies selection, then runs this)
 * Or can be called with text as argument
 */

const { spawn } = require('child_process');
const { execSync } = require('child_process');
const os = require('os');

const args = process.argv.slice(2);

function getSelectionFromClipboard() {
  if (os.platform() !== 'darwin') {
    console.error('speak-selection currently only works on macOS');
    process.exit(1);
  }
  
  try {
    // Get text from clipboard using pbpaste
    const text = execSync('pbpaste', { encoding: 'utf8' }).trim();
    if (!text) {
      console.error('Буфер обмена пуст. Выдели текст и скопируй его (Cmd+C), затем запусти команду снова.');
      process.exit(1);
    }
    return text;
  } catch (err) {
    console.error('Не удалось прочитать буфер обмена:', err.message);
    process.exit(1);
  }
}

function speakText(text) {
  if (!text || !text.trim()) {
    console.error('Нет текста для озвучки');
    process.exit(1);
  }

  // Use speak-report with stdin
  const speakProcess = spawn('npm', ['run', 'speak-report', '--', '--stdin'], {
    stdio: ['pipe', 'inherit', 'inherit'],
    cwd: require('path').join(__dirname, '..')
  });

  speakProcess.stdin.write(text, 'utf8');
  speakProcess.stdin.end();

  speakProcess.on('close', (code) => {
    process.exit(code || 0);
  });

  speakProcess.on('error', (err) => {
    console.error('Ошибка запуска озвучки:', err.message);
    process.exit(1);
  });
}

// Main
if (args.length > 0 && args[0] !== '--clipboard') {
  // Text provided as argument
  speakText(args.join(' '));
} else {
  // Read from clipboard
  const text = getSelectionFromClipboard();
  speakText(text);
}
