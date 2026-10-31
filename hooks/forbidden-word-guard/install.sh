#!/usr/bin/env bash
# forbidden-word-guard 설치/제거
#   ./install.sh            심볼릭 링크 생성 + 전역 settings.json에 훅 등록
#   ./install.sh --check     설치 상태만 검사 (문제가 있으면 exit 1)
#   ./install.sh --uninstall 전역 settings.json에서 훅 제거 + 심볼릭 링크 삭제
#
# 단어 목록과 적용 범위는 레포에 두지 않는다. ~/.git-hooks/forbidden-words, ~/.git-hooks/forbidden-scope 를 읽는다.
set -euo pipefail

NAME="forbidden-word-guard"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SRC_DIR/../.." && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
LINK="$CLAUDE_DIR/hooks/$NAME"
MERGE="$REPO_ROOT/scripts/merge-settings.mjs"
WORDS="$HOME/.git-hooks/forbidden-words"
SCOPE="$HOME/.git-hooks/forbidden-scope"

warn_lists() {
  [[ -s "$WORDS" && -s "$SCOPE" ]] && return 0
  echo "  주의 ~/.git-hooks/forbidden-words 또는 forbidden-scope 가 없어 훅이 아무것도 검사하지 않습니다" >&2
}

if [[ "${1:-}" == "--check" ]]; then
  fail=0
  ok() { echo "  ok   $1"; }
  ng() { echo "  FAIL $1" >&2; fail=1; }
  command -v node >/dev/null && ok "node" || ng "node 없음"
  command -v git >/dev/null && ok "git" || ng "git 없음"
  [[ "$(readlink "$LINK")" == "$SRC_DIR" ]] && ok "링크 $LINK" || ng "링크 없음: $LINK"
  node "$MERGE" "$SRC_DIR/settings.snippet.json" --check --settings "$CLAUDE_DIR/settings.json" >/dev/null \
    && ok "settings.json 훅 등록" || ng "settings.json에 훅 항목이 빠짐"
  echo '{"tool_name":"Bash","cwd":"/tmp","tool_input":{"command":"echo hi"}}' \
    | node "$LINK/guard.mjs" >/dev/null 2>&1 \
    && ok "guard.mjs 실행" || ng "guard.mjs 실행 실패"
  warn_lists
  exit "$fail"
fi

if [[ "${1:-}" == "--uninstall" ]]; then
  node "$MERGE" "$SRC_DIR/settings.snippet.json" --remove --settings "$CLAUDE_DIR/settings.json"
  [[ -L "$LINK" ]] && rm "$LINK" && echo "링크 삭제: $LINK"
  echo "제거 완료."
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

node "$MERGE" "$SRC_DIR/settings.snippet.json" --settings "$CLAUDE_DIR/settings.json"
warn_lists
echo "설치 완료. 새 세션부터 적용됩니다."
