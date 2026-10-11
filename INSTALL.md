# INSTALL.md (for AI agents)

This file is for an AI coding agent (Claude Code, Codex, etc.) asked to install this repo. Run the steps in order. Every step is idempotent, so running it again is safe.

What this installs: shared Claude Code skills, agents, commands, global instructions (`CLAUDE.md`) and hooks from `github.com/imkdw/claude-code-settings` into `~/.claude`, as symlinks into a local clone.

## Rules

- Do not use `sudo`. If a step needs it, stop and ask the user.
- Do not edit `~/.claude/settings.json` by hand. `install.sh` merges only this repo's hook entries and writes a backup first (`settings.json.bak.<timestamp>`).
- If `install.sh` prints `건너뜀` (skipped) for a path, a real file or folder with that name already exists there. Do not delete it. Report it to the user.
- Reply to the user in Korean.

## Steps

### 1. Check the prerequisites

```bash
uname -s                     # Darwin expected. Hooks are macOS only (see "Non-macOS" below)
git --version
node --version               # v18 or newer
brew --version               # needed only to install terminal-notifier
```

- `node` missing: if `brew` exists, run `brew install node`. Otherwise stop and ask the user to install Node.
- `brew` missing: continue. The notification hook falls back to `osascript`, so clicking a notification will not bring Orca to the front. Tell the user this in the final report.
- `git` missing: stop and ask the user to run `xcode-select --install`.

### 2. Clone or update

```bash
if [ -d "$HOME/claude-code-settings/.git" ]; then
  git -C "$HOME/claude-code-settings" pull --ff-only
else
  git clone https://github.com/imkdw/claude-code-settings.git "$HOME/claude-code-settings"
fi
```

If `pull --ff-only` fails because of local changes, stop and show the user `git -C ~/claude-code-settings status`. Do not reset or stash.

The clone location is flexible. Symlinks point to wherever the clone lives, so do not move it after installing.

### 3. Install

```bash
cd "$HOME/claude-code-settings" && ./install.sh
```

### 4. Verify

```bash
cd "$HOME/claude-code-settings" && ./install.sh doctor
```

The last line must be `doctor: 모두 정상` and the exit code 0. If any line starts with `FAIL`, fix that item (re-run step 3, or install the missing tool) and run doctor again. If it still fails after one retry, stop and report the FAIL lines.

### 5. Report to the user

Tell the user, in Korean:

1. What was installed (the `링크:` and `+ ...: 추가` lines from step 3)
2. The doctor result
3. These manual steps, which an agent cannot do:
   - Start a new Claude Code session. Hooks load at session start.
   - In Orca settings, turn off the `Agent task complete` notification. Otherwise both Orca and this hook will notify.
   - On the first notification, macOS may ask to allow notifications for `terminal-notifier`. Click Allow.

## Non-macOS

On Linux or Windows, install only skills/agents/commands/instructions and skip hooks:

```bash
./install.sh skills && ./install.sh agents && ./install.sh commands && ./install.sh instructions
```

## Uninstall

```bash
cd "$HOME/claude-code-settings" && hooks/final-turn-notify/install.sh --uninstall
```

This removes only this repo's hook entries from `settings.json`. Skill/agent/command/instruction symlinks can be deleted with `find ~/.claude -maxdepth 2 -lname "$HOME/claude-code-settings/*" -delete`.
