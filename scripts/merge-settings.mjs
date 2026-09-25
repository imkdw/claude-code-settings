#!/usr/bin/env node
// settings.snippet.json의 hooks 블록을 전역 settings.json에 합치거나(기본) 빼낸다(--remove).
// 기존 항목은 건드리지 않고, 같은 matcher + command 조합이 이미 있으면 건너뛴다. 쓰기 전에 백업을 남긴다.
//
// 사용법: node scripts/merge-settings.mjs <snippet.json> [--remove] [--dry-run] [--check] [--settings <path>]
//   --check  쓰지 않고 검사만 한다. 빠진 항목이 있으면 exit 1

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const snippetPath = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--settings');
const settingsPath = option('--settings') || join(homedir(), '.claude', 'settings.json');
const remove = flag('--remove');
const check = flag('--check');
const dryRun = flag('--dry-run') || check;

if (!snippetPath) {
  console.error('usage: merge-settings.mjs <snippet.json> [--remove] [--dry-run] [--check] [--settings <path>]');
  process.exit(2);
}

const snippet = JSON.parse(readFileSync(snippetPath, 'utf8'));
const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
settings.hooks ??= {};

const key = (entry, hook) => `${entry.matcher ?? ''}\u0000${hook.command}`;
let changed = 0;

for (const [event, entries] of Object.entries(snippet.hooks ?? {})) {
  const current = settings.hooks[event] ?? [];
  const existing = new Set(current.flatMap((e) => (e.hooks ?? []).map((h) => key(e, h))));
  const wanted = new Set(entries.flatMap((e) => e.hooks.map((h) => key(e, h))));

  if (remove) {
    const kept = current
      .map((e) => ({ ...e, hooks: (e.hooks ?? []).filter((h) => !wanted.has(key(e, h))) }))
      .filter((e) => e.hooks.length > 0);
    const removed = current.reduce((n, e) => n + (e.hooks?.length ?? 0), 0) - kept.reduce((n, e) => n + e.hooks.length, 0);
    if (removed > 0) {
      changed += removed;
      console.log(`- ${event}: ${removed}개 제거`);
    }
    if (kept.length) settings.hooks[event] = kept;
    else delete settings.hooks[event];
    continue;
  }

  for (const entry of entries) {
    if (entry.hooks.every((h) => existing.has(key(entry, h)))) {
      console.log(`= ${event}${entry.matcher ? ` [${entry.matcher}]` : ''}: 이미 있음`);
      continue;
    }
    current.push(entry);
    changed += 1;
    console.log(`+ ${event}${entry.matcher ? ` [${entry.matcher}]` : ''}: 추가`);
  }
  settings.hooks[event] = current;
}

if (!changed) {
  console.log('변경 없음');
} else if (check) {
  console.log(`${changed}개 항목이 ${settingsPath}에 없음`);
  process.exitCode = 1;
} else if (dryRun) {
  console.log(`(dry-run) ${changed}개 변경 예정, 파일은 쓰지 않음`);
} else {
  if (existsSync(settingsPath)) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
    copyFileSync(settingsPath, `${settingsPath}.bak.${stamp}`);
    console.log(`백업: ${settingsPath}.bak.${stamp}`);
  }
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`${settingsPath}에 ${changed}개 반영`);
}
