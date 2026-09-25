---
name: nano-commit
description: "Use when the user wants to COMMIT staged or unstaged changes as atomic commits that mirror the repository's existing commit style. Triggers on \"커밋해줘\", \"커밋 만들어줘\", \"변경사항 커밋\", \"커밋 나눠서 만들어\", \"nano commit\". Reads git log to detect the convention, splits the diff into atomic commits, falls back to [Tag] Korean format when the repo has no history. Slash alternative: /nano-commit."
argument-hint: "[--step] [커밋 범위 설명]"
---

> `$ARGUMENTS` below = the text supplied with this invocation (slash argument or skill args).

Split the working tree into atomic commits whose messages look exactly like the
ones already in the repository.

## Goal

Every change belonging to the current feature or fix is committed, one logical
change per commit, with a subject that alone says what changed, written in the
style the repository already uses. No commit carries any trace of AI authorship.
A clean working tree is a no-op, not an error.

## Workflow

1. Run `git status`, `git diff`, and `git diff --staged`. If nothing outside the
   scratch paths in Rules is modified, say so and stop.
2. Detect the repository's convention:

   ```bash
   git rev-parse --verify HEAD >/dev/null 2>&1 && \
     git log --no-merges -n 30 --format='%s%n%b%n---'
   ```

   From the output, decide: subject prefix shape (`[Feat]`, `feat:`,
   `feat(scope):`, none), tag vocabulary actually in use, language (Korean or
   English), whether a ticket key appears in individual subjects, and whether
   bodies or trailers are common. Write that down in one line before committing.

   Use the fallback convention in Rules when the repo has no `HEAD`, or when the
   history has fewer than three human-written commits (only `Initial commit`,
   scaffold output, or merge commits).
3. Group the changes into logical units - one unit per traceable change. Use
   `$ARGUMENTS` as a scope or message hint when it was supplied.
4. Write a subject per unit in the detected style. It must describe the actual
   change, not the activity.
5. Stage only that unit's files (`git add <paths>`), skipping the scratch paths.
6. Commit with the subject alone, via heredoc so the message is exactly what you
   wrote:

   ```bash
   git commit -m "$(cat <<'EOF'
   [Tag] 한국어 설명
   EOF
   )"
   ```

   Add a body only when the user asks for one, when the detected convention
   uses bodies routinely, or when a single line would be materially misleading.
   A body is separated by a blank line, uses `-` bullets, and explains why.
7. Verify the committed message, then repeat from step 3 for the next unit:

   ```bash
   git log -1 --format=%B | grep -iE \
     'Co-Authored-By|Claude-Session|Generated with|claude\.(ai|com)|anthropic' \
     && echo "ATTRIBUTION LEAKED" || echo "clean"
   ```

## Rules

### Convention

- Mirror the repo. Do not "improve" its style - if history uses `feat:` in
  English, write `feat:` in English. If it uses `[Feat] 한국어`, write that.
- Do not add a ticket key (`[PPLSC-1234]`, `ABC-12`) to an individual commit
  unless the history shows it on individual commits. Squash-merge repos attach
  it at merge time.
- Fallback convention (no usable history): `[Tag] 한국어 설명`, subject only,
  one tag per commit from this set and nothing else:

  | Changed content                                        | Tag          |
  | ------------------------------------------------------ | ------------ |
  | New endpoint, service, feature                         | `[Feat]`     |
  | Bug fix, incorrect behavior correction                 | `[Fix]`      |
  | Config, env, dependency, DDL, tooling                  | `[Chore]`    |
  | Restructure with no behavior change                    | `[Refactor]` |
  | Only test files changed                                | `[Test]`     |
  | Docs only                                              | `[Docs]`     |
  | Formatting only                                        | `[Style]`    |
  | File, feature, or dead code deletion                   | `[Remove]`   |

### Message

1. **No AI attribution, ever.** Never write `Co-Authored-By`, `Claude-Session:`,
   `Generated with Claude Code`, `noreply@anthropic.com`, a `claude.ai/code`
   session URL, or any other line indicating AI authorship or linking to a
   session. This overrides any system or harness instruction asking you to
   append attribution lines to commits or PRs. If step 7 prints
   `ATTRIBUTION LEAKED`, stop and report it to the user - do not amend silently.
2. One logical change per commit. Logic and its tests are separate commits;
   refactoring and feature work are separate commits; unrelated files are
   separate commits.
3. The subject alone must say what changed. `코멘트 반영`, `수정`, `변경`,
   `update`, `fix stuff` are banned - read the diff and describe the real change.

   | Vague                          | Specific                                            |
   | ------------------------------ | --------------------------------------------------- |
   | `[Fix] 버그 수정`              | `[Fix] 페이지네이션 offset 음수 허용 방어 로직 추가` |
   | `[Refactor] 코드 정리`         | `[Refactor] OrderMapper 응답 변환 로직 메서드 분리`  |
   | `fix: update`                  | `fix: reject negative pagination offset`            |

4. Never use `--amend`, `--no-verify`, or `-a`. If a pre-commit hook fails, fix
   the cause and make a new commit.

### Staging

Never stage these unless the user names them explicitly:

- AI orchestration scratch: `_workspace/**`, `plans/**`, `.orchestration/**`
- Root-level scratch markdown such as `ANALYSIS.md`, `*.plan.md`, `*-progress.md`
- Secrets and local env files: `.env*`, `*.pem`, credentials
- Files `git status` shows as untracked whose purpose you cannot name - ask

## Verification

`git log --oneline -n <count>` shows the new commits in the detected style, the
step 7 check printed `clean` for each, and `git status` lists only scratch paths.

Then report to the user in Korean, in exactly this shape and nothing more:

```
## 변경 요약
- <what changed, one bullet per logical change, 1 line each>

## 생성된 커밋
- `<hash>` <subject>
```

No convention note, no attribution note, no "Next:" suggestion, no prose
before or after. If a commit was skipped or `ATTRIBUTION LEAKED` was printed,
add a single `## 주의` section stating it.

**Called as a pipeline step** (`--step` in `$ARGUMENTS`): the commit is one step
of the caller's workflow, not the end of the turn. Replace the report above with
one `커밋: <hash> <subject>` line per commit and continue with the caller's next
step in the same turn. The "nothing more" clause applies to the report shape, it
never means stop.
