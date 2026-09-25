#!/usr/bin/env bash
# final-turn-notify 설치/제거
#   ./install.sh            심볼릭 링크 생성 + terminal-notifier 확인 + 전역 settings.json에 훅 등록
#   ./install.sh --check     설치 상태만 검사 (문제가 있으면 exit 1)
#   ./install.sh --uninstall 전역 settings.json에서 훅 제거 + 심볼릭 링크/상태 디렉터리 삭제
set -euo pipefail

NAME="final-turn-notify"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SRC_DIR/../.." && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
LINK="$CLAUDE_DIR/hooks/$NAME"
MERGE="$REPO_ROOT/scripts/merge-settings.mjs"

if [[ "${1:-}" == "--check" ]]; then
  fail=0
  ok() { echo "  ok   $1"; }
  ng() { echo "  FAIL $1" >&2; fail=1; }
  command -v node >/dev/null && ok "node" || ng "node 없음"
  [[ "$(readlink "$LINK")" == "$SRC_DIR" ]] && ok "링크 $LINK" || ng "링크 없음: $LINK"
  { command -v terminal-notifier >/dev/null || [[ -x /opt/homebrew/bin/terminal-notifier ]]; } \
    && ok "terminal-notifier" || ng "terminal-notifier 없음 (osascript로 대체됨)"
  node "$MERGE" "$SRC_DIR/settings.snippet.json" --check --settings "$CLAUDE_DIR/settings.json" >/dev/null \
    && ok "settings.json 훅 등록" || ng "settings.json에 훅 항목이 빠짐"
  echo '{"hook_event_name":"Stop","session_id":"doctor","cwd":"/tmp"}' \
    | FINAL_TURN_NOTIFY_DRY_RUN=1 node "$LINK/notify.mjs" 2>&1 | grep -q '"dryRun":true' \
    && ok "notify.mjs 실행" || ng "notify.mjs 실행 실패"
  exit "$fail"
fi

if [[ "${1:-}" == "--uninstall" ]]; then
  node "$MERGE" "$SRC_DIR/settings.snippet.json" --remove --settings "$CLAUDE_DIR/settings.json"
  [[ -L "$LINK" ]] && rm "$LINK" && echo "링크 삭제: $LINK"
  rm -rf "$CLAUDE_DIR/state/$NAME"
  echo "제거 완료. Orca에서 'Agent task complete' 알림을 다시 켜세요."
  exit 0
fi

command -v node >/dev/null || { echo "node가 필요합니다" >&2; exit 1; }

mkdir -p "$CLAUDE_DIR/hooks"
if [[ -e "$LINK" && ! -L "$LINK" ]]; then
  echo "$LINK 가 이미 있고 심볼릭 링크가 아닙니다. 직접 확인 후 다시 실행하세요." >&2
  exit 1
fi
ln -sfn "$SRC_DIR" "$LINK"
echo "링크: $LINK -> $SRC_DIR"

if ! command -v terminal-notifier >/dev/null; then
  if command -v brew >/dev/null; then
    echo "terminal-notifier 설치 중 (brew)"
    brew install terminal-notifier
  else
    echo "terminal-notifier가 없습니다. osascript 알림으로 대체됩니다 (클릭해도 Orca가 열리지 않음)." >&2
  fi
fi

node "$MERGE" "$SRC_DIR/settings.snippet.json" --settings "$CLAUDE_DIR/settings.json"
echo "설치 완료. 새 세션부터 적용됩니다."
