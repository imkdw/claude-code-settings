import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { firstLine, questionBody, truncate } from './notify.mjs';

const SCRIPT = new URL('./notify.mjs', import.meta.url).pathname;
const SESSION = 'sess-1';
const tmpRoot = mkdtempSync(join(tmpdir(), 'final-turn-notify-'));
let stateDir;
let fakeNotifier;

after(() => rmSync(tmpRoot, { recursive: true, force: true }));

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpRoot, 'state-'));
  fakeNotifier = join(tmpRoot, 'terminal-notifier');
  writeFileSync(fakeNotifier, '#!/bin/sh\n', { mode: 0o755 });
});

function env(extra = {}) {
  return {
    ...process.env,
    FINAL_TURN_NOTIFY_DRY_RUN: '1',
    FINAL_TURN_NOTIFY_STATE_DIR: stateDir,
    FINAL_TURN_NOTIFY_TERMINAL_NOTIFIER: fakeNotifier,
    FINAL_TURN_NOTIFY_LOG: '',
    ...extra,
  };
}

function parseRun(res) {
  const line = res.stderr.trim().split('\n').filter(Boolean).pop();
  return { status: res.status, stdout: res.stdout, sent: line ? JSON.parse(line) : null };
}

function run(payload, extraEnv) {
  const input = typeof payload === 'string' ? payload : JSON.stringify({ session_id: SESSION, cwd: '/work/my-repo', ...payload });
  return parseRun(spawnSync(process.execPath, [SCRIPT], { input, env: env(extraEnv), encoding: 'utf8' }));
}

function runAsync(payload) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], { env: env() });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (status) => resolve(parseRun({ status, stdout, stderr })));
    child.stdin.end(JSON.stringify({ session_id: SESSION, cwd: '/work/my-repo', ...payload }));
  });
}

const markers = () => {
  const dir = join(stateDir, SESSION);
  return existsSync(dir) ? readdirSync(dir).sort() : [];
};
const arg = (sent, flag) => sent.args[sent.args.indexOf(flag) + 1];

describe('Stop 판정', () => {
  test('서브에이전트가 없으면 완료 알림을 보낸다', () => {
    const r = run({ hook_event_name: 'Stop', last_assistant_message: '## 작업 완료\n\n세부 내용' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    assert.equal(r.sent.tool, 'terminal-notifier');
    assert.equal(arg(r.sent, '-title'), 'Claude Code: my-repo');
    assert.equal(arg(r.sent, '-subtitle'), '완료');
    assert.equal(arg(r.sent, '-message'), '작업 완료');
    assert.equal(arg(r.sent, '-group'), 'claude-sess-1');
    assert.equal(arg(r.sent, '-activate'), 'com.stablyai.orca');
    assert.equal(arg(r.sent, '-sound'), 'default');
  });

  test('마커가 남아 있으면 알림을 보내지 않는다', () => {
    run({ hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' });
    assert.equal(run({ hook_event_name: 'Stop', last_assistant_message: 'x' }).sent, null);
    run({ hook_event_name: 'SubagentStop', agent_id: 'a1' });
    assert.equal(run({ hook_event_name: 'Stop', last_assistant_message: 'x' }).sent.notification.subtitle, '완료');
  });

  test('병렬 SubagentStart/Stop이 서로 덮어쓰지 않는다', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `agent-${i}`);
    await Promise.all(ids.map((id) => runAsync({ hook_event_name: 'SubagentStart', agent_id: id })));
    assert.deepEqual(markers(), [...ids].sort());
    await Promise.all(ids.slice(0, 11).map((id) => runAsync({ hook_event_name: 'SubagentStop', agent_id: id })));
    assert.deepEqual(markers(), ['agent-11']);
    assert.equal(run({ hook_event_name: 'Stop' }).sent, null);
  });

  test('TTL이 지난 마커는 무시하고 삭제한다', () => {
    run({ hook_event_name: 'SubagentStart', agent_id: 'stale' });
    const old = new Date(Date.now() - 4 * 60 * 60 * 1000);
    utimesSync(join(stateDir, SESSION, 'stale'), old, old);
    assert.equal(run({ hook_event_name: 'Stop' }).sent.notification.subtitle, '완료');
    assert.deepEqual(markers(), []);
  });

  test('다른 세션의 마커는 영향을 주지 않는다', () => {
    run({ hook_event_name: 'SubagentStart', agent_id: 'a1', session_id: 'other' });
    assert.ok(run({ hook_event_name: 'Stop' }).sent);
  });

  test('본문이 없으면 기본 문구를 쓴다', () => {
    assert.equal(run({ hook_event_name: 'Stop' }).sent.notification.message, '턴이 끝났습니다');
  });
});

describe('StopFailure', () => {
  test('서브에이전트가 남아 있어도 오류 알림을 보낸다', () => {
    run({ hook_event_name: 'SubagentStart', agent_id: 'a1' });
    const r = run({ hook_event_name: 'StopFailure', error: 'rate_limit_error: too many requests' });
    assert.equal(r.sent.notification.subtitle, '오류로 중단');
    assert.equal(r.sent.notification.message, 'rate_limit_error: too many requests');
    assert.equal(arg(r.sent, '-sound'), 'Basso');
  });
});

describe('입력 필요 알림', () => {
  test('서브에이전트 실행 중에도 AskUserQuestion 알림을 보낸다', () => {
    run({ hook_event_name: 'SubagentStart', agent_id: 'bg-1' });
    const r = run({
      hook_event_name: 'PreToolUse',
      tool_name: 'AskUserQuestion',
      tool_input: { questions: [{ question: '어떤 방식으로 할까요?' }, { question: '두 번째' }, { question: '세 번째' }] },
    });
    assert.equal(r.stdout, '');
    assert.equal(r.sent.notification.subtitle, '질문 대기');
    assert.equal(r.sent.notification.message, '어떤 방식으로 할까요? (외 2개)');
    assert.equal(arg(r.sent, '-sound'), 'Glass');
    assert.equal(arg(r.sent, '-group'), 'claude-sess-1');
  });

  test('질문 하나는 (외 N개)를 붙이지 않는다', () => {
    const r = run({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: '진행할까요?' }] } });
    assert.equal(r.sent.notification.message, '진행할까요?');
  });

  test('다른 도구의 PreToolUse는 무시한다', () => {
    assert.equal(run({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {} }).sent, null);
  });

  for (const type of ['permission_prompt', 'elicitation_dialog', 'agent_needs_input']) {
    test(`Notification ${type}은 입력 필요 알림을 보낸다`, () => {
      run({ hook_event_name: 'SubagentStart', agent_id: 'bg-1' });
      const r = run({ hook_event_name: 'Notification', notification_type: type, message: 'Claude needs your permission to use Bash' });
      assert.equal(r.sent.notification.subtitle, '입력 필요');
      assert.equal(r.sent.notification.message, 'Claude needs your permission to use Bash');
      assert.equal(arg(r.sent, '-sound'), 'Glass');
    });
  }

  test('idle_prompt는 무시한다', () => {
    assert.equal(run({ hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'waiting' }).sent, null);
  });
});

describe('세션 수명', () => {
  test('SessionStart startup은 세션 디렉터리를 초기화한다', () => {
    run({ hook_event_name: 'SubagentStart', agent_id: 'a1' });
    run({ hook_event_name: 'SessionStart', source: 'startup' });
    assert.deepEqual(markers(), []);
  });

  test('SessionStart compact는 마커를 유지한다', () => {
    run({ hook_event_name: 'SubagentStart', agent_id: 'a1' });
    run({ hook_event_name: 'SessionStart', source: 'compact' });
    assert.deepEqual(markers(), ['a1']);
  });

  test('SessionStart는 오래된 다른 세션 디렉터리를 정리한다', () => {
    const staleDir = join(stateDir, 'old-session');
    mkdirSync(staleDir);
    const old = new Date(Date.now() - 4 * 60 * 60 * 1000);
    utimesSync(staleDir, old, old);
    run({ hook_event_name: 'SessionStart', source: 'startup' });
    assert.equal(existsSync(staleDir), false);
  });

  test('SessionEnd는 세션 디렉터리를 삭제한다', () => {
    run({ hook_event_name: 'SubagentStart', agent_id: 'a1' });
    run({ hook_event_name: 'SessionEnd', reason: 'exit' });
    assert.equal(existsSync(join(stateDir, SESSION)), false);
  });

  test('경로 조작 문자가 든 id는 상태 디렉터리 밖으로 나가지 않는다', () => {
    run({ hook_event_name: 'SubagentStart', agent_id: '../../escape', session_id: '../x' });
    assert.equal(existsSync(join(stateDir, '..', 'escape')), false);
    assert.ok(readdirSync(stateDir).every((n) => !n.includes('/')));
  });
});

describe('fail-open', () => {
  test('잘못된 stdin에도 exit 0, stdout 비움', () => {
    const r = run('not json {');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    assert.equal(r.sent, null);
  });

  test('빈 stdin에도 exit 0', () => {
    assert.equal(run('').status, 0);
  });

  test('SubagentStop은 stdout에 아무것도 쓰지 않는다', () => {
    assert.equal(run({ hook_event_name: 'SubagentStop', agent_id: 'a1' }).stdout, '');
  });

  test('상태 디렉터리를 만들 수 없어도 exit 0', () => {
    const r = run({ hook_event_name: 'SubagentStart', agent_id: 'a1' }, { FINAL_TURN_NOTIFY_STATE_DIR: '/dev/null/nope' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  test('terminal-notifier가 없으면 osascript로 대체한다', () => {
    const r = run({ hook_event_name: 'Stop', last_assistant_message: '끝' }, { FINAL_TURN_NOTIFY_TERMINAL_NOTIFIER: '/nonexistent/terminal-notifier' });
    assert.equal(r.sent.tool, 'osascript');
    assert.deepEqual(r.sent.args.slice(-4), ['끝', 'Claude Code: my-repo', '완료', 'Tink']);
  });
});

describe('디버그 로그', () => {
  test('payload 키와 판정 결과를 기록한다', () => {
    const logFile = join(tmpRoot, 'debug.log');
    run({ hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' }, { FINAL_TURN_NOTIFY_LOG: logFile });
    const entry = JSON.parse(readFileSync(logFile, 'utf8').trim().split('\n').pop());
    assert.equal(entry.event, 'SubagentStart');
    assert.equal(entry.decision, 'marker-added');
    assert.equal(entry.agent_type, 'Explore');
    assert.ok(entry.keys.includes('agent_id'));
  });
});

describe('포맷 함수', () => {
  test('truncate는 120자에서 자르고 말줄임표를 붙인다', () => {
    const out = truncate('가'.repeat(200));
    assert.equal(Array.from(out).length, 120);
    assert.ok(out.endsWith('…'));
  });

  test('firstLine은 코드 펜스와 마크다운 기호를 건너뛴다', () => {
    assert.equal(firstLine('\n```bash\n'), '');
    assert.equal(firstLine('- **로그인** 수정 완료'), '로그인 수정 완료');
  });

  test('questionBody는 질문이 없으면 기본 문구를 쓴다', () => {
    assert.equal(questionBody({}), '질문이 있습니다');
  });

  test('[ 로 시작하는 메시지는 terminal-notifier용으로 이스케이프한다', () => {
    const r = run({ hook_event_name: 'Stop', last_assistant_message: '[링크](x) 참고' });
    assert.equal(arg(r.sent, '-message'), '\\[링크](x) 참고');
  });
});
