#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

const HOME = homedir();
const WORDS_FILE = join(HOME, '.git-hooks', 'forbidden-words');
const SCOPE_FILE = join(HOME, '.git-hooks', 'forbidden-scope');

function readList(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function expandHome(p) {
  if (p === '~') return HOME;
  if (p.startsWith('~/')) return join(HOME, p.slice(2));
  return p;
}

function nearestExistingDir(p) {
  let cur = p;
  while (cur && !existsSync(cur)) {
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
  if (!cur) return null;
  try {
    return statSync(cur).isDirectory() ? cur : dirname(cur);
  } catch {
    return null;
  }
}

function git(dir, args) {
  try {
    return execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
  } catch {
    return '';
  }
}

function repoInScope(dir, scopes) {
  if (!dir) return null;
  const origin = git(dir, ['remote', 'get-url', 'origin']);
  if (!origin) return null;
  if (!scopes.some((s) => origin.includes(s))) return null;
  return git(dir, ['rev-parse', '--show-toplevel']) || null;
}

function findWord(text, words) {
  if (typeof text !== 'string' || !text) return null;
  const lower = text.toLowerCase();
  return words.find((w) => lower.includes(w.toLowerCase())) ?? null;
}

function block(where, extra) {
  const lines = [
    `[금지 단어 차단] ${where} 에 금지 단어가 들어 있어 실행을 막았습니다.`,
    '절대경로 대신 저장소 기준 상대경로나 ~ 를 쓰세요.',
  ];
  if (extra) lines.push(extra);
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(2);
}

function stripHome(text) {
  const encodedHome = HOME.replace(/[/.]/g, '-');
  return text.split(HOME).join('').split(encodedHome).join('');
}

function checkWrite(input, words, scopes) {
  const filePath = input.file_path ?? input.notebook_path;
  if (typeof filePath !== 'string' || !filePath) return;
  const abs = resolve(expandHome(filePath));
  const top = repoInScope(nearestExistingDir(dirname(abs)), scopes);
  if (!top) return;

  const rel = relative(top, abs);
  if (findWord(rel, words)) block(`파일 경로(${rel})`);

  const fields = [
    ['content', input.content],
    ['new_string', input.new_string],
    ['new_source', input.new_source],
  ];
  if (Array.isArray(input.edits)) {
    input.edits.forEach((e, i) => fields.push([`edits[${i}].new_string`, e?.new_string]));
  }
  for (const [name, value] of fields) {
    if (findWord(value, words)) block(`${rel} 의 ${name}`);
  }
}

const OUTBOUND = [
  /(^|[\s;&|(`])git(\s+-C\s+\S+|\s+-c\s+\S+)*\s+(commit|tag)\b/,
  /(^|[\s;&|(`])gh\s+(pr|issue|release|api)\b/,
];

function commandDir(command, cwd) {
  const cd = command.match(/^\s*cd\s+("[^"]+"|'[^']+'|\S+)/);
  const gitC = command.match(/\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)/);
  const raw = (gitC ?? cd)?.[1]?.replace(/^["']|["']$/g, '');
  if (!raw) return cwd;
  const p = expandHome(raw);
  return isAbsolute(p) ? p : resolve(cwd, p);
}

function referencedFiles(command, baseDir) {
  const out = [];
  const re =
    /(?:^|\s)(?:-F|--file|--body-file|--notes-file|--input)(?:\s+|=)("[^"]+"|'[^']+'|\S+)|=@("[^"]+"|'[^']+'|[^\s'"]+)/g;
  let m;
  while ((m = re.exec(command))) {
    let v = (m[1] ?? m[2] ?? '').replace(/^["']|["']$/g, '');
    if (!v || v === '-') continue;
    const eq = v.indexOf('=@');
    if (eq >= 0) v = v.slice(eq + 2);
    else if (v.includes('=') && !v.startsWith('@')) continue;
    if (v.startsWith('@')) v = v.slice(1);
    const p = expandHome(v);
    out.push(isAbsolute(p) ? p : resolve(baseDir, p));
  }
  return out;
}

function checkBash(input, cwd, words, scopes) {
  const command = input.command;
  if (typeof command !== 'string' || !OUTBOUND.some((r) => r.test(command))) return;
  const dir = commandDir(command, cwd);
  if (!repoInScope(nearestExistingDir(dir), scopes)) return;

  if (findWord(stripHome(command), words)) block('외부로 나가는 명령(커밋/태그/gh) 문자열');

  for (const file of referencedFiles(command, dir)) {
    try {
      if (!existsSync(file) || !statSync(file).isFile()) continue;
      if (findWord(readFileSync(file, 'utf8'), words)) block(`명령에 넘긴 파일(${relative(HOME, file)})`);
    } catch {}
  }
}

try {
  const raw = readFileSync(0, 'utf8');
  const payload = JSON.parse(raw || '{}');
  const words = readList(WORDS_FILE);
  const scopes = readList(SCOPE_FILE);
  if (words.length && scopes.length) {
    const tool = payload.tool_name;
    const input = payload.tool_input ?? {};
    const cwd = payload.cwd || process.cwd();
    if (tool === 'Bash') checkBash(input, cwd, words, scopes);
    else if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) checkWrite(input, words, scopes);
  }
} catch (err) {
  process.stderr.write(`[forbidden-word-guard] 검사 중 오류가 나서 통과시킵니다: ${err?.message ?? err}\n`);
}
process.exit(0);
