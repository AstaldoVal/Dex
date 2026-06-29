#!/usr/bin/env node
/**
 * Stop any running speak-report process
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const PID_FILE = path.join(os.tmpdir(), 'dex-speak.pid');
const STOP_FLAG_FILE = path.join(os.tmpdir(), 'dex-speak-stop-flag');

function stopSpeaking() {
  // Create stop flag first (for DexAudioPlayer to detect)
  try {
    fs.writeFileSync(STOP_FLAG_FILE, '', 'utf8');
  } catch (_) {}

  // Read PID from file
  let pid = null;
  try {
    if (fs.existsSync(PID_FILE)) {
      const pidContent = fs.readFileSync(PID_FILE, 'utf8').trim();
      pid = parseInt(pidContent, 10);
    }
  } catch (_) {}

  // Kill processes
  let killed = false;

  // Kill main process if PID file exists
  if (pid) {
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`Остановлен процесс ${pid}`);
      killed = true;
    } catch (err) {
      if (err.code !== 'ESRCH') {
        console.log(`Не удалось остановить процесс ${pid}: ${err.message}`);
      }
    }
  }

  // Kill any speak-report processes
  try {
    execSync('pkill -f "speak-report" 2>/dev/null || true', { stdio: 'ignore' });
    killed = true;
  } catch (_) {}

  // Kill any afplay processes playing our audio
  try {
    execSync('pkill -f "afplay.*dex-speak-openai" 2>/dev/null || true', { stdio: 'ignore' });
    killed = true;
  } catch (_) {}

  // Kill DexAudioPlayer processes
  try {
    execSync('pkill -f "DexAudioPlayer" 2>/dev/null || true', { stdio: 'ignore' });
    killed = true;
  } catch (_) {}

  // Kill say processes playing our audio
  try {
    execSync('pkill -f "say.*dex-speak" 2>/dev/null || true', { stdio: 'ignore' });
    killed = true;
  } catch (_) {}

  // Remove PID file
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch (_) {}

  if (killed) {
    console.log('Озвучивание остановлено.');
  } else {
    console.log('Процессы озвучивания не найдены.');
  }
}

stopSpeaking();
