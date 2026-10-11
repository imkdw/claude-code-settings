# claude-code-settings

여러 프로젝트에서 공용으로 쓰는 Claude Code 스킬/에이전트/커맨드/훅/전역 지침을 모아 두는 레포.
파일은 레포에 두고 `~/.claude` 에는 심볼릭 링크만 건다. 레포를 고치면 바로 전역에 반영된다.

## 설치

### 에이전트에게 맡기기

Claude Code 같은 에이전트에 아래 한 줄을 붙여 넣으면 클론부터 검증까지 알아서 진행한다.

```
https://raw.githubusercontent.com/imkdw/claude-code-settings/main/INSTALL.md 읽고 그대로 설치해줘
```

에이전트용 절차는 `INSTALL.md`에 있다. 설치 후 `./install.sh doctor`로 결과를 검증하고, 사람이 직접 해야 하는 일(새 세션 시작, Orca 알림 끄기)만 마지막에 알려 준다.

### 직접 설치

```bash
./install.sh                           # 전부
./install.sh skills                    # 스킬만
./install.sh instructions              # 전역 지침만
./install.sh hooks final-turn-notify   # 특정 훅만
```

여러 번 실행해도 안전하다. `~/.claude` 에 같은 이름의 실제 파일/폴더가 있으면 덮어쓰지 않고 건너뛴다.

### 설치 검증

```bash
./install.sh doctor
```

링크, node, terminal-notifier, settings.json 훅 등록, 훅 스크립트 실행을 검사한다. 문제가 있으면 `FAIL` 줄을 찍고 exit 1로 끝난다. 마지막 줄이 `doctor: 모두 정상`이면 설치가 끝난 것이다.

## 새 컴퓨터에서 복구하기

포맷하거나 새 맥을 받았을 때의 순서.

1. Homebrew 설치 (sudo가 필요해서 에이전트가 못 한다)
2. Claude Code 설치
3. Claude Code에 위의 "에이전트에게 맡기기" 한 줄을 붙여 넣는다. Node, terminal-notifier 설치, 클론, 설치, 검증까지 에이전트가 진행한다
4. 새 Claude Code 세션을 연다. 훅은 세션이 시작될 때 읽힌다
5. Orca 설정에서 `Agent task complete` 알림을 끈다. 켜 두면 Orca와 이 훅이 알림을 두 번 보낸다
6. 첫 알림이 올 때 macOS가 `terminal-notifier` 알림 권한을 물으면 허용한다

### 복구되지 않는 것

이 레포에 들어 있는 것만 복구된다. 아래는 따로 챙겨야 한다.

- `~/.claude/settings.json`의 나머지 설정: 플러그인, statusLine, 권한, rtk 훅, Orca 훅 등. 이 레포는 자기 훅 항목만 합쳐 넣는다
- Orca 앱 설정
- 레포에 커밋/푸시하지 않은 변경. 스킬이나 훅을 고쳤다면 바로 푸시해 둔다

## 구조

```
claude-code-settings/
  INSTALL.md                 에이전트용 설치 절차
  install.sh                 전역 설치 진입점 (doctor로 검증)
  skills/<이름>/SKILL.md     공용 스킬       -> ~/.claude/skills/<이름>
  agents/<이름>.md           공용 서브에이전트 -> ~/.claude/agents/<이름>.md
  commands/<이름>.md         공용 슬래시 커맨드 -> ~/.claude/commands/<이름>.md
  instructions/<이름>.md     전역 지침       -> ~/.claude/<이름>.md
  hooks/<이름>/              훅 하나당 폴더 하나
    install.sh               링크 + 의존성 확인 + settings.json 등록 (--check, --uninstall 지원)
    settings.snippet.json    전역 settings.json에 합칠 hooks 블록
    *.mjs, *.test.mjs        구현과 테스트 (node, 외부 의존성 없음)
  scripts/                   레포 공용 도구
    merge-settings.mjs       snippet을 settings.json에 합치기/빼기 (백업, 중복 방지)
```

### 새 항목 추가하기

- **스킬**: `skills/<이름>/SKILL.md` 를 만들고 `./install.sh skills`
- **에이전트/커맨드**: `agents/<이름>.md` 또는 `commands/<이름>.md` 를 만들고 `./install.sh agents` / `./install.sh commands`
- **전역 지침**: `instructions/CLAUDE.md` 를 고치면 바로 반영된다. `@파일명.md` 로 불러오는 파일을 추가했다면 같은 폴더에 두고 `./install.sh instructions`
- **훅**: `hooks/<이름>/` 에 구현, `settings.snippet.json`, `install.sh` 를 두고 `./install.sh hooks <이름>`. `install.sh` 는 `hooks/final-turn-notify/install.sh` 를 복사해서 시작하면 된다. `--check` 를 꼭 구현한다. `doctor` 가 모든 훅의 `install.sh --check` 를 호출해서 검증하기 때문이다.
- 새 항목이 설치 절차나 수동 작업을 바꾸면 `INSTALL.md` 도 같이 고친다. 에이전트는 그 파일만 보고 설치한다.

## 스킬 목록

| 스킬 | 설명 |
|---|---|
| `nano-commit` | 변경사항을 원자적 커밋으로 나누고 항상 `feat:`, `chore:` 형식으로 쓴다. 모노레포는 `feat(api):` 처럼 스코프를 붙인다. 트리거: "커밋해줘", `/nano-commit` |

## 전역 지침 목록

| 파일 | 설명 |
|---|---|
| `instructions/CLAUDE.md` | 모든 프로젝트에 적용되는 개인 규칙. 특수기호 금지, GitHub에 AI 서명 금지, Artifact 사용 금지 |
| `instructions/RTK.md` | `CLAUDE.md` 가 `@RTK.md` 로 불러오는 rtk 사용 안내. rtk 자체는 `brew install rtk` 로 따로 설치한다 |

## 훅 목록

### final-turn-notify

메인 에이전트의 턴이 끝났고 기다리는 서브에이전트가 없을 때, 또는 권한 요청/`AskUserQuestion` 으로 입력을 기다릴 때만 macOS 알림을 보낸다. 백그라운드 서브에이전트가 하나 끝날 때마다 오는 Orca `Agent task complete` 알림을 대체한다.

| 상황 | 부제목 | 소리 |
|---|---|---|
| 최종 턴 종료 | 완료 | default |
| 권한 요청, AskUserQuestion | 입력 필요 / 질문 대기 | Glass |
| API 오류로 종료 | 오류로 중단 | Basso |

- 테스트: `node --test hooks/*/*.test.mjs`
- 디버그: `FINAL_TURN_NOTIFY_LOG=/tmp/ftn.log` 를 환경에 두면 이벤트별 payload 키와 판정 결과를 기록한다
- 제거: `hooks/final-turn-notify/install.sh --uninstall` 후 Orca 알림 다시 켜기
