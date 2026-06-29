#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = process.env.VAULT_PATH || path.resolve(__dirname, '..', '..');
const BOARD_PATH =
  process.env.DEX_AGENT_HANDOFF_BOARD ||
  path.join(REPO_ROOT, 'System', 'Pomodoro', 'agent-handoff-board.json');

function readBoard() {
  if (!fs.existsSync(BOARD_PATH)) {
    return { active: [], max: 5 };
  }
  const data = JSON.parse(fs.readFileSync(BOARD_PATH, 'utf8'));
  if (!Array.isArray(data.active)) data.active = [];
  if (!data.max) data.max = 5;
  return data;
}

function writeBoard(data) {
  fs.mkdirSync(path.dirname(BOARD_PATH), { recursive: true });
  fs.writeFileSync(BOARD_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function parseLine(line) {
  const parts = String(line)
    .split('|')
    .map((s) => s.trim());
  if (parts.length < 4) {
    throw new Error('Нужно 4 части через |: Агент | поручил | жду | смотреть');
  }
  return {
    agent: parts[0],
    assigned: parts[1],
    waiting: parts[2],
    where: parts[3],
  };
}

function addEntry(fields) {
  const board = readBoard();
  const entry = {
    id: crypto.randomBytes(4).toString('hex'),
    agent: fields.agent || '—',
    assigned: fields.assigned || '—',
    waiting: fields.waiting || '—',
    where: fields.where || '—',
    ts: new Date().toISOString(),
  };
  board.active.unshift(entry);
  if (board.active.length > board.max) {
    board.active = board.active.slice(0, board.max);
  }
  writeBoard(board);
  return entry;
}

function markDone(id) {
  const board = readBoard();
  const before = board.active.length;
  board.active = board.active.filter((e) => e.id !== id);
  if (board.active.length === before) {
    throw new Error('id не найден: ' + id);
  }
  writeBoard(board);
  return board;
}

function formatLine(e) {
  return `${e.agent} | ${e.assigned} | ${e.waiting} | ${e.where}`;
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === 'list' || !cmd) {
    const board = readBoard();
    if (!board.active.length) {
      console.log('(пусто)');
      return;
    }
    for (const e of board.active) {
      console.log(`[${e.id}] ${formatLine(e)}  (${e.ts})`);
    }
    return;
  }

  if (cmd === 'add') {
    let fields = {};
    const lineIdx = args.indexOf('--line');
    if (lineIdx >= 0 && args[lineIdx + 1]) {
      fields = parseLine(args[lineIdx + 1]);
    } else {
      const pick = (flag) => {
        const i = args.indexOf(flag);
        return i >= 0 ? args[i + 1] : '';
      };
      fields = {
        agent: pick('--agent'),
        assigned: pick('--assigned'),
        waiting: pick('--waiting'),
        where: pick('--where'),
      };
      if (!fields.agent && !fields.assigned) {
        console.error(
          'Использование: agent-handoff.cjs add --line "A | B | C | D"\n' +
            '  или add --agent … --assigned … --waiting … --where …'
        );
        process.exit(1);
      }
    }
    const entry = addEntry(fields);
    console.log(formatLine(entry));
    console.log('id=' + entry.id);
    return;
  }

  if (cmd === 'done') {
    const id = args[1];
    if (!id) {
      console.error('Использование: agent-handoff.cjs done <id>');
      process.exit(1);
    }
    markDone(id);
    console.log('ok');
    return;
  }

  if (cmd === 'path') {
    console.log(BOARD_PATH);
    return;
  }

  console.error('Команды: list | add | done <id> | path');
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  BOARD_PATH,
  readBoard,
  writeBoard,
  addEntry,
  markDone,
  parseLine,
  formatLine,
};
