#!/usr/bin/env bash
# 레포의 공용 설정을 전역 ~/.claude 에 연결한다. 여러 번 실행해도 안전하다.
#
#   ./install.sh                 전부 설치 (skills, agents, commands, hooks)
#   ./install.sh skills          스킬만
#   ./install.sh hooks <이름>    특정 훅만 (예: ./install.sh hooks final-turn-notify)
#   ./install.sh doctor          설치 상태 검사 (문제가 있으면 exit 1)
#
# 레이아웃 규칙
#   skills/<이름>/SKILL.md   -> ~/.claude/skills/<이름>       (디렉터리 심볼릭 링크)
#   agents/<이름>.md         -> ~/.claude/agents/<이름>.md    (파일 심볼릭 링크)
#   commands/<이름>.md       -> ~/.claude/commands/<이름>.md  (파일 심볼릭 링크)
#   hooks/<이름>/install.sh  각 훅이 자체 설치 스크립트를 가진다
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

link() {
  local src="$1" dest="$2"
  if [[ -e "$dest" && ! -L "$dest" ]]; then
    echo "건너뜀: $dest 가 이미 있고 심볼릭 링크가 아님" >&2
    return
  fi
  ln -sfn "$src" "$dest"
  echo "링크: $dest"
}

install_skills() {
  mkdir -p "$CLAUDE_DIR/skills"
  for dir in "$REPO_ROOT"/skills/*/; do
    [[ -f "$dir/SKILL.md" ]] || continue
    link "${dir%/}" "$CLAUDE_DIR/skills/$(basename "$dir")"
  done
}

install_files() {
  local kind="$1"
  mkdir -p "$CLAUDE_DIR/$kind"
  for file in "$REPO_ROOT/$kind"/*.md; do
    [[ -f "$file" ]] || continue
    link "$file" "$CLAUDE_DIR/$kind/$(basename "$file")"
  done
}

install_hooks() {
  local only="${1:-}"
  for script in "$REPO_ROOT"/hooks/*/install.sh; do
    [[ -f "$script" ]] || continue
    local name
    name="$(basename "$(dirname "$script")")"
    [[ -n "$only" && "$only" != "$name" ]] && continue
    echo "== hook: $name"
    bash "$script"
  done
}

doctor() {
  local fail=0 name dest
  echo "== skills/agents/commands"
  for dir in "$REPO_ROOT"/skills/*/; do
    [[ -f "$dir/SKILL.md" ]] || continue
    dest="$CLAUDE_DIR/skills/$(basename "$dir")"
    if [[ "$(readlink "$dest")" == "${dir%/}" ]]; then echo "  ok   $dest"; else echo "  FAIL 링크 없음: $dest" >&2; fail=1; fi
  done
  for kind in agents commands; do
    for file in "$REPO_ROOT/$kind"/*.md; do
      [[ -f "$file" ]] || continue
      dest="$CLAUDE_DIR/$kind/$(basename "$file")"
      if [[ "$(readlink "$dest")" == "$file" ]]; then echo "  ok   $dest"; else echo "  FAIL 링크 없음: $dest" >&2; fail=1; fi
    done
  done
  for script in "$REPO_ROOT"/hooks/*/install.sh; do
    [[ -f "$script" ]] || continue
    name="$(basename "$(dirname "$script")")"
    echo "== hook: $name"
    bash "$script" --check || fail=1
  done
  if [[ "$fail" == 0 ]]; then echo "doctor: 모두 정상"; else echo "doctor: 문제 있음" >&2; fi
  return "$fail"
}

case "${1:-all}" in
  skills) install_skills ;;
  agents) install_files agents ;;
  commands) install_files commands ;;
  hooks) install_hooks "${2:-}" ;;
  doctor) doctor ;;
  all)
    install_skills
    install_files agents
    install_files commands
    install_hooks
    ;;
  *) echo "usage: $0 [all|skills|agents|commands|hooks [이름]|doctor]" >&2; exit 2 ;;
esac
