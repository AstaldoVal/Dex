#!/usr/bin/env node
/**
 * Export text to a single MP3 using OpenAI TTS (same as speak-report widget).
 * - Default voice: onyx. Override: --voice alloy|echo|fable|onyx|shimmer|nova|verse|sage|cedar|marin|...
 *   Verse + vibe: use --voice verse --vibe art-instructor --speed 0.7 (30% slower). Listen: openai-fm or platform.openai.com/docs/guides/text-to-speech.
 * - --speed 0.25..4 (default 1). 0.7 = 30% slower. Only with gpt-4o-mini-tts (used when vibe or voice verse).
 * - --vibe-file <path> or --vibe art-instructor: instructions for tone/pacing (gpt-4o-mini-tts). Max 1000 chars sent.
 * - Pauses: 0.6s after header and after paragraph before heading. Requires ffmpeg.
 * Usage: node tts-export-mp3.cjs <input.txt> [output.mp3]
 *   or:  node tts-export-mp3.cjs --voice verse --vibe art-instructor --speed 0.7 post.txt out.mp3
 * Requires: OPENAI_API_KEY in .env; ffmpeg for pauses/concat (brew install ffmpeg).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

const repoRoot = path.resolve(__dirname, '..');
try {
  require('dotenv').config({ path: path.join(repoRoot, '.env') });
} catch (_) {}

function getApiKey() {
  const key = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim();
  if (key && !key.includes('your-key')) return key;
  console.error('OPENAI_API_KEY not found. Set it in .env at repo root.');
  process.exit(1);
}

function stripForSpeech(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Split text into segments; after each header we insert a pause when building audio. */
function splitIntoHeaderBodySegments(text) {
  const blocks = text.split(/\n\n+/).filter(b => b.trim());
  const segments = [];
  const maxHeaderLen = 80;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isNumberedHeader = /^\d+\.\s+\S/.test(block);
    const isFirstShortLine = i === 0 && block.length <= maxHeaderLen && !block.includes('\n');
    if (isNumberedHeader || isFirstShortLine) {
      segments.push({ type: 'header', text: block.trim() });
      if (i + 1 < blocks.length) {
        segments.push({ type: 'body', text: blocks[i + 1].trim() });
        i++;
      }
    } else {
      segments.push({ type: 'body', text: block.trim() });
    }
  }
  return segments.filter(s => s.text.length > 0);
}

function createSilenceMp3(outPath, seconds = 0.6) {
  const { execSync } = require('child_process');
  const abs = path.resolve(outPath);
  try {
    execSync(
      `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=mono -t ${seconds} -acodec libmp3lame -q:a 9 "${abs}"`,
      { stdio: 'pipe' }
    );
    return true;
  } catch (_) {
    return false;
  }
}

function haveFfmpeg() {
  try {
    require('child_process').execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch (_) {
    return false;
  }
}

function chunkText(text, maxLength = 4000) {
  const chunks = [];
  let currentChunk = '';
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxLength) {
      currentChunk += sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
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

const VOICES_GPT4O_MINI = ['verse', 'cedar', 'marin', 'sage', 'ballad', 'ash', 'coral', 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

function generateChunkToFile(chunk, apiKey, voiceName, outPath, opts = {}) {
  const { model, speed, instructions } = opts;
  const useGpt4o = model === 'gpt-4o-mini-tts' || VOICES_GPT4O_MINI.includes(voiceName) || (instructions && instructions.trim());
  const body = {
    model: useGpt4o ? 'gpt-4o-mini-tts' : 'tts-1-hd',
    voice: voiceName,
    input: chunk
  };
  if (useGpt4o) {
    if (instructions && instructions.trim()) body.instructions = instructions.trim().slice(0, 1000);
    if (speed != null && speed !== 1) body.speed = Math.min(4, Math.max(0.25, Number(speed)));
  }
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
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
        let body = '';
        res.on('data', d => { body += d; });
        res.on('end', () => reject(new Error(`OpenAI ${res.statusCode}: ${body}`)));
        return;
      }
      const file = fs.createWriteStream(outPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        if (fs.statSync(outPath).size === 0) reject(new Error('Empty audio file'));
        else resolve();
      });
      file.on('error', reject);
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function concatMp3(chunkPaths, outPath) {
  const listPath = path.join(os.tmpdir(), `tts-concat-${Date.now()}.txt`);
  fs.writeFileSync(listPath, chunkPaths.map(p => `file '${path.resolve(p)}'`).join('\n'), 'utf8');
  const { execSync } = require('child_process');
  const outAbs = path.resolve(outPath);
  // Re-encode instead of -c copy so DTS is monotonic; otherwise players fail with "invalid dts"
  try {
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:a libmp3lame -b:a 160k -ar 24000 -ac 1 "${outAbs}"`,
      { stdio: 'inherit' }
    );
  } finally {
    try { fs.unlinkSync(listPath); } catch (_) {}
  }
}

function parseArg(args, name) {
  const i = args.indexOf(name);
  if (i < 0) return { value: null, rest: args };
  const v = args[i + 1];
  const rest = args.slice(0, i).concat(args.slice(i + 2));
  return { value: v, rest };
}

async function main() {
  let args = process.argv.slice(2);
  const stdinIdx = args.indexOf('--stdin');
  const useStdin = stdinIdx >= 0;
  if (useStdin) args.splice(stdinIdx, 1);

  let voice = 'onyx';
  let speed = 1;
  let instructions = '';

  const voiceOut = parseArg(args, '--voice');
  if (voiceOut.value) voice = voiceOut.value;
  args = voiceOut.rest;

  const speedOut = parseArg(args, '--speed');
  if (speedOut.value != null) speed = parseFloat(speedOut.value) || 1;
  args = speedOut.rest;

  const vibeFileOut = parseArg(args, '--vibe-file');
  if (vibeFileOut.value) {
    const p = path.isAbsolute(vibeFileOut.value) ? vibeFileOut.value : path.join(process.cwd(), vibeFileOut.value);
    if (fs.existsSync(p)) instructions = fs.readFileSync(p, 'utf8').trim();
  }
  args = vibeFileOut.rest;

  const vibeOut = parseArg(args, '--vibe');
  if (vibeOut.value === 'art-instructor') {
    const presetPath = path.join(repoRoot, '.scripts', 'tts-vibe-art-instructor.txt');
    if (fs.existsSync(presetPath)) instructions = fs.readFileSync(presetPath, 'utf8').trim();
  }
  args = vibeOut.rest;

  let content;
  if (useStdin) {
    content = fs.readFileSync(0, 'utf8');
  } else if (args.length === 0) {
    console.error('Usage: node tts-export-mp3.cjs <input.txt> [output.mp3]');
    console.error('   or: cat file.txt | node tts-export-mp3.cjs --stdin [output.mp3]');
    process.exit(1);
  } else {
    const inputPath = path.isAbsolute(args[0]) ? args[0] : path.join(process.cwd(), args[0]);
    if (!fs.existsSync(inputPath)) {
      console.error('File not found:', inputPath);
      process.exit(1);
    }
    content = fs.readFileSync(inputPath, 'utf8');
  }

  const outArg = useStdin ? args[0] : args[1];
  const defaultOut = path.join(repoRoot, '04-Projects', 'One_Percent_AI_Start_Here_audio.mp3');
  const outPath = outArg ? (path.isAbsolute(outArg) ? outArg : path.join(process.cwd(), outArg)) : defaultOut;

  content = content.replace(/\n{3,}/g, '\n\n').trim();
  const segments = splitIntoHeaderBodySegments(content);
  if (segments.length === 0) {
    console.error('No content after splitting.');
    process.exit(1);
  }

  const apiKey = getApiKey();
  const tmpDir = path.join(os.tmpdir(), `tts-export-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const allMp3Paths = [];
  const silencePath = path.join(tmpDir, 'silence.mp3');

  const usePauses = haveFfmpeg();
  if (usePauses) {
    if (!createSilenceMp3(silencePath, 0.6)) {
      console.log('Could not create silence file; continuing without pauses.');
    }
  } else {
    console.log('ffmpeg not found; skipping pauses after headers. Install ffmpeg for pause support.');
  }

  try {
    let partIndex = 0;
    for (let s = 0; s < segments.length; s++) {
      const seg = segments[s];
      const text = stripForSpeech(seg.text);
      if (!text) continue;
      // Headers (e.g. "1. What I'm committing to") must be spoken in full; chunkText would keep only "1." and drop the rest
      const chunks = seg.type === 'header' ? [text] : chunkText(text);
      const ttsOpts = { speed, instructions: instructions || undefined };
      for (let c = 0; c < chunks.length; c++) {
        const p = path.join(tmpDir, `part-${partIndex}.mp3`);
        await generateChunkToFile(chunks[c], apiKey, voice, p, ttsOpts);
        allMp3Paths.push(p);
        partIndex++;
      }
      // Pause after header (before next body)
      if (usePauses && seg.type === 'header' && s + 1 < segments.length && fs.existsSync(silencePath)) {
        allMp3Paths.push(silencePath);
      }
      // Pause after paragraph when next segment is a heading (paragraph end → pause → heading → pause → next paragraph)
      if (usePauses && seg.type === 'body' && s + 1 < segments.length && segments[s + 1].type === 'header' && fs.existsSync(silencePath)) {
        allMp3Paths.push(silencePath);
      }
    }

    if (allMp3Paths.length === 1) {
      fs.copyFileSync(allMp3Paths[0], outPath);
    } else {
      if (!haveFfmpeg()) {
        console.error('Multiple segments need ffmpeg to concatenate. Install: brew install ffmpeg');
        process.exit(1);
      }
      console.log('Concatenating with ffmpeg...');
      concatMp3(allMp3Paths, outPath);
    }

    console.log('Saved:', path.resolve(outPath));
  } finally {
    for (const p of allMp3Paths) {
      try { fs.unlinkSync(p); } catch (_) {}
    }
    try { fs.unlinkSync(silencePath); } catch (_) {}
    try { fs.rmdirSync(tmpDir); } catch (_) {}
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
