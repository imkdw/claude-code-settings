#!/usr/bin/env node
// final-turn-notify: 메인 턴이 끝나고 기다리는 서브에이전트가 없을 때, 또는 입력이 필요할 때만 macOS 알림을 보낸다.
// 단일 진입점. stdin payload의 hook_event_name으로 분기한다. 모든 오류에서 fail-open (exit 0, stdout 비움).

import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const MARKER_TTL_MS = 3 * 60 * 60 * 1000;
const BODY_MAX = 120;
const ORCA_BUNDLE_ID = 'com.stablyai.orca';
const INPUT_NOTIFICATION_TYPES = new Set(['permission_prompt', 'elicitation_dialog', 'agent_needs_input']);
const RESET_SOURCES = new Set(['startup', 'clear', 'resume']);
const TERMINAL_NOTIFIER_CANDIDATES = ['/opt/homebrew/bin/terminal-notifier', '/usr/local/bin/terminal-notifier'];

const SOUND = { done: 'default', input: 'Glass', error: 'Basso' };

function stateRoot() {
  return process.env.FINAL_TURN_NOTIFY_STATE_DIR || join(homedir(), '.claude', 'state', 'final-turn-notify');
}

// 파일 이름으로 안전한 문자만 남긴다. 경로 조작(../)을 막는다.
function safeName(value) {
  const s = String(value ?? '').replace(/[^A-Za-z0-9._-]/g, '_');
  return s && s !== '.' && s !== '..' ? s : '';
}

function sessionDir(sessionId) {
  const name = safeName(sessionId);
  return name ? join(stateRoot(), name) : '';
}

function log(entry) {
  const file = process.env.FINAL_TURN_NOTIFY_LOG;
  if (!file) return;
  try {
    appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  } catch {}
}

// 살아 있는 마커 수를 센다. TTL이 지난 마커는 지운다.
function liveMarkerCount(dir, now = Date.now()) {
  if (!dir || !existsSync(dir)) return 0;
  let live = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    try {
      if (now - statSync(path).mtimeMs > MARKER_TTL_MS) rmSync(path, { force: true });
      else live += 1;
    } catch {}
  }
  return live;
}

// 마지막 사용 후 TTL이 지난 다른 세션 디렉터리를 정리한다. SessionEnd가 유실된 경우 대비.
function pruneStaleSessions(keep, now = Date.now()) {
  const root = stateRoot();
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    if (name === keep) continue;
    const path = join(root, name);
    try {
      if (now - statSync(path).mtimeMs > MARKER_TTL_MS && liveMarkerCount(path, now) === 0) {
        rmSync(path, { recursive: true, force: true });
      }
    } catch {}
  }
}

export function truncate(text, max = BODY_MAX) {
  const s = String(text ?? '');
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : s;
}

// 첫 번째 비어 있지 않은 줄을 꺼내고 앞쪽 마크다운 기호를 뗀다.
export function firstLine(text) {
  const line = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !/^```/.test(l));
  if (!line) return '';
  return line.replace(/^(#{1,6}\s+|[-*+]\s+|>\s*|\d+\.\s+)/, '').replace(/\*\*/g, '').trim();
}

export function questionBody(toolInput) {
  const questions = Array.isArray(toolInput?.questions) ? toolInput.questions : [];
  const first = questions[0]?.question ?? toolInput?.question ?? '';
  const extra = questions.length > 1 ? ` (외 ${questions.length - 1}개)` : '';
  const base = truncate(String(first).replace(/\s+/g, ' ').trim() || '질문이 있습니다', BODY_MAX);
  return base + extra;
}

function errorBody(payload) {
  const e = payload.error ?? payload.error_details ?? payload.message ?? payload.reason;
  if (typeof e === 'string') return truncate(firstLine(e) || e);
  if (e && typeof e === 'object') return truncate(e.message || e.type || JSON.stringify(e));
  return 'API 오류로 턴이 끝났습니다';
}

// 이벤트를 처리하고 보낼 알림 또는 null을 돌려준다. 부수 효과는 상태 디렉터리에만 있다.
export function decide(payload, now = Date.now()) {
  const event = payload.hook_event_name;
  const dir = sessionDir(payload.session_id);

  switch (event) {
    case 'SessionStart': {
      if (!dir) return { decision: 'skip:no-session' };
      if (RESET_SOURCES.has(payload.source ?? 'startup')) {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
      }
      pruneStaleSessions(basename(dir), now);
      return { decision: 'session-reset' };
    }
    case 'SessionEnd': {
      if (dir) rmSync(dir, { recursive: true, force: true });
      return { decision: 'session-cleaned' };
    }
    case 'SubagentStart': {
      const id = safeName(payload.agent_id);
      if (!dir || !id) return { decision: 'skip:no-agent-id' };
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, id), '');
      return { decision: 'marker-added' };
    }
    case 'SubagentStop': {
      const id = safeName(payload.agent_id);
      if (!dir || !id) return { decision: 'skip:no-agent-id' };
      rmSync(join(dir, id), { force: true });
      return { decision: 'marker-removed' };
    }
    case 'Stop': {
      const live = liveMarkerCount(dir, now);
      if (live > 0) return { decision: `suppressed:${live}-subagents` };
      return {
        decision: 'notify',
        notification: {
          kind: 'done',
          subtitle: '완료',
          message: truncate(firstLine(payload.last_assistant_message)) || '턴이 끝났습니다',
        },
      };
    }
    case 'StopFailure':
      return {
        decision: 'notify',
        notification: { kind: 'error', subtitle: '오류로 중단', message: errorBody(payload) },
      };
    case 'Notification': {
      if (!INPUT_NOTIFICATION_TYPES.has(payload.notification_type)) {
        return { decision: `skip:type-${payload.notification_type ?? 'unknown'}` };
      }
      return {
        decision: 'notify',
        notification: {
          kind: 'input',
          subtitle: '입력 필요',
          message: truncate(firstLine(payload.message)) || '입력을 기다립니다',
        },
      };
    }
    case 'PreToolUse': {
      if (payload.tool_name !== 'AskUserQuestion') return { decision: 'skip:tool' };
      return {
        decision: 'notify',
        notification: { kind: 'input', subtitle: '질문 대기', message: questionBody(payload.tool_input) },
      };
    }
    default:
      return { decision: `skip:event-${event ?? 'unknown'}` };
  }
}

// terminal-notifier는 -와 [로 시작하는 메시지를 옵션이나 특수 구문으로 해석한다.
function escapeForNotifier(s) {
  return /^[-\[]/.test(s) ? '\\' + s : s;
}

function findTerminalNotifier() {
  const override = process.env.FINAL_TURN_NOTIFY_TERMINAL_NOTIFIER;
  if (override !== undefined) return override && existsSync(override) ? override : '';
  for (const dir of (process.env.PATH || '').split(':')) {
    if (dir && existsSync(join(dir, 'terminal-notifier'))) return join(dir, 'terminal-notifier');
  }
  return TERMINAL_NOTIFIER_CANDIDATES.find((p) => existsSync(p)) || '';
}

export function buildCommand(payload, notification) {
  const title = `Claude Code: ${basename(payload.cwd || process.cwd())}`;
  const sound = SOUND[notification.kind] || 'default';
  const group = `claude-${safeName(payload.session_id) || 'unknown'}`;
  const notifier = findTerminalNotifier();
  if (notifier) {
    return {
      tool: 'terminal-notifier',
      bin: notifier,
      args: [
        '-title', title,
        '-subtitle', notification.subtitle,
        '-message', escapeForNotifier(notification.message),
        '-group', group,
        '-activate', ORCA_BUNDLE_ID,
        '-sound', sound,
      ],
    };
  }
  return {
    tool: 'osascript',
    bin: '/usr/bin/osascript',
    args: [
      '-e', 'on run argv',
      '-e', 'display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv) sound name (item 4 of argv)',
      '-e', 'end run',
      notification.message, title, notification.subtitle, sound === 'default' ? 'Tink' : sound,
    ],
  };
}

function send(payload, notification) {
  const cmd = buildCommand(payload, notification);
  if (process.env.FINAL_TURN_NOTIFY_DRY_RUN === '1') {
    process.stderr.write(JSON.stringify({ dryRun: true, ...cmd, notification }) + '\n');
    return cmd.tool;
  }
  spawn(cmd.bin, cmd.args, { detached: true, stdio: 'ignore' }).unref();
  return cmd.tool;
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch (err) {
    log({ event: 'invalid-stdin', error: String(err) });
    return;
  }
  if (!payload || typeof payload !== 'object') return;

  const base = {
    event: payload.hook_event_name,
    keys: Object.keys(payload),
    session_id: payload.session_id,
    agent_id: payload.agent_id,
    agent_type: payload.agent_type,
    background_tasks: payload.background_tasks,
  };
  try {
    const { decision, notification } = decide(payload);
    const tool = notification ? send(payload, notification) : undefined;
    log({ ...base, decision, tool });
  } catch (err) {
    log({ ...base, decision: 'error', error: String(err?.stack || err) });
  }
}

// 테스트에서 import할 때는 실행하지 않는다.
if (process.argv[1]?.endsWith('/notify.mjs')) {
  try {
    main();
  } catch {}
  process.exitCode = 0;
}
