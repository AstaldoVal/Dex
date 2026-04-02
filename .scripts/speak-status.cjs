#!/usr/bin/env node
/**
 * Check status of speak-report process and audio playback
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PID_FILE = path.join(os.tmpdir(), 'dex-speak.pid');
const STOP_FLAG_FILE = path.join(os.tmpdir(), 'dex-speak-stop-flag');
const PAUSE_FLAG_FILE = path.join(os.tmpdir(), 'dex-speak-pause-flag');

function checkStatus() {
  console.log('=== Статус озвучки ===\n');
  
  // Check PID file
  let pid = null;
  if (fs.existsSync(PID_FILE)) {
    try {
      const pidContent = fs.readFileSync(PID_FILE, 'utf8').trim();
      pid = parseInt(pidContent, 10);
      console.log(`📄 PID файл: ${pid}`);
      
      // Check if process exists
      try {
        process.kill(pid, 0);
        console.log(`✅ Процесс speak-report запущен (PID: ${pid})`);
      } catch (err) {
        if (err.code === 'ESRCH') {
          console.log(`❌ Процесс speak-report не найден (PID: ${pid})`);
        }
      }
    } catch (err) {
      console.log(`⚠️  Не удалось прочитать PID файл: ${err.message}`);
    }
  } else {
    console.log('📄 PID файл не найден');
  }
  
  // Check audio processes
  console.log('\n=== Процессы воспроизведения ===');
  try {
    const dexPlayer = execSync('pgrep -f "DexAudioPlayer" 2>/dev/null || true', { encoding: 'utf8' }).trim();
    if (dexPlayer) {
      console.log(`✅ DexAudioPlayer запущен (PID: ${dexPlayer})`);
    } else {
      console.log('❌ DexAudioPlayer не запущен');
    }
  } catch (_) {
    console.log('❌ DexAudioPlayer не запущен');
  }
  
  try {
    const afplay = execSync('pgrep -f "afplay.*dex-speak-openai" 2>/dev/null || true', { encoding: 'utf8' }).trim();
    if (afplay) {
      console.log(`✅ afplay запущен (PID: ${afplay})`);
    } else {
      console.log('❌ afplay не запущен');
    }
  } catch (_) {
    console.log('❌ afplay не запущен');
  }
  
  // Check flags
  console.log('\n=== Флаги ===');
  if (fs.existsSync(STOP_FLAG_FILE)) {
    console.log('🛑 Флаг остановки установлен');
  } else {
    console.log('✅ Флаг остановки не установлен');
  }
  
  if (fs.existsSync(PAUSE_FLAG_FILE)) {
    console.log('⏸️  Флаг паузы установлен');
  } else {
    console.log('✅ Флаг паузы не установлен');
  }
  
  // Check widget
  console.log('\n=== Виджет ===');
  try {
    const widget = execSync('pgrep -f "DexSpeakWidget" 2>/dev/null || true', { encoding: 'utf8' }).trim();
    if (widget) {
      console.log(`✅ Виджет запущен (PID: ${widget})`);
    } else {
      console.log('❌ Виджет не запущен');
    }
  } catch (_) {
    console.log('❌ Виджет не запущен');
  }
  
  console.log('\n=== Команды ===');
  console.log('Остановить: npm run speak-stop');
  console.log('Проверить статус: npm run speak-status');
}

checkStatus();
