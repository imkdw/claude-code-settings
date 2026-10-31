import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT = new URL('./guard.mjs', import.meta.url).pathname;
const WORD = 'zebraword';
const home = realpathSync(mkdtempSync(join(tmpdir(), 'forbidden-word-guard-')));
const repo = join(home, 'work', 'app');
const other = join(home, 'work', 'other');
const plain = join(home, 'plain');

function git(dir, ...args) {
  spawnSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
}

mkdirSync(join(home, '.git-hooks'), { recursive: true });
writeFileSync(join(home, '.git-hooks', 'forbidden-words'), `# comment\n\n${WORD}\n`);
writeFileSync(join(home, '.git-hooks', 'forbidden-scope'), 'acme/app\n');
for (const [dir, url] of [
  [repo, 'git@github.com:acme/app.git'],
  [other, 'git@github.com:acme/other.git'],
]) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  git(dir, 'remote', 'add', 'origin', url);
}
mkdirSync(plain, { recursive: true });

after(() => rmSync(home, { recursive: true, force: true }));

function run(payload) {
  const res = spawnSync('node', [SCRIPT], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  });
  return { code: res.status, stderr: res.stderr };
}

const write = (file, content, cwd = repo) => run({ tool_name: 'Write', cwd, tool_input: { file_path: file, content } });
const bash = (command, cwd = repo) => run({ tool_name: 'Bash', cwd, tool_input: { command } });

describe('파일 쓰기', () => {
  test('내용에 금지 단어가 있으면 막는다 (대소문자 무시)', () => {
    assert.equal(write(join(repo, 'a.txt'), `x ${WORD.toUpperCase()} y`).code, 2);
  });

  test('정상 내용은 통과한다', () => {
    assert.equal(write(join(repo, 'a.txt'), 'see src/index.ts').code, 0);
  });

  test('경로는 저장소 기준 상대경로로만 검사한다', () => {
    const nested = join(home, 'work', WORD);
    mkdirSync(nested, { recursive: true });
    git(nested, 'init', '-q');
    git(nested, 'remote', 'add', 'origin', 'git@github.com:acme/app.git');
    assert.equal(write(join(nested, 'ok.txt'), 'ok', nested).code, 0);
    assert.equal(write(join(repo, `${WORD}.txt`), 'ok').code, 2);
  });

  test('Edit, MultiEdit, NotebookEdit 필드를 검사한다', () => {
    const file = join(repo, 'a.ts');
    assert.equal(run({ tool_name: 'Edit', cwd: repo, tool_input: { file_path: file, old_string: 'a', new_string: WORD } }).code, 2);
    assert.equal(
      run({
        tool_name: 'MultiEdit',
        cwd: repo,
        tool_input: { file_path: file, edits: [{ old_string: 'a', new_string: 'ok' }, { old_string: 'b', new_string: WORD }] },
      }).code,
      2,
    );
    assert.equal(
      run({ tool_name: 'NotebookEdit', cwd: repo, tool_input: { notebook_path: join(repo, 'n.ipynb'), new_source: WORD } }).code,
      2,
    );
  });

  test('범위 밖 저장소와 git 저장소가 아닌 곳은 통과한다', () => {
    assert.equal(write(join(other, 'a.txt'), WORD, other).code, 0);
    assert.equal(write(join(plain, 'a.txt'), WORD, plain).code, 0);
  });
});

describe('Bash', () => {
  test('외부로 나가는 명령 문자열을 검사한다', () => {
    assert.equal(bash(`git commit -m 'fix ${WORD}'`).code, 2);
    assert.equal(bash(`gh pr create --title t --body '${WORD}'`).code, 2);
    assert.equal(bash(`git -C ${repo} tag v-${WORD}`, plain).code, 2);
  });

  test('홈 경로와 그 인코딩 형태는 지운 뒤 검사한다', () => {
    const encoded = home.replace(/[/.]/g, '-');
    assert.equal(bash(`git commit -m ok && echo ${home} /tmp/x${encoded}y`).code, 0);
  });

  test('넘긴 파일 내용을 검사한다', () => {
    const body = join(plain, 'body.md');
    writeFileSync(body, `body ${WORD}`);
    assert.equal(bash(`gh pr create --title t --body-file ${body}`).code, 2);
    assert.equal(bash(`git commit -F ${body}`).code, 2);
    assert.equal(bash(`gh api repos/x/y/issues -F body=@${body}`).code, 2);
    writeFileSync(body, 'clean');
    assert.equal(bash(`gh pr create --title t --body-file ${body}`).code, 0);
  });

  test('외부로 나가지 않는 명령은 검사하지 않는다', () => {
    assert.equal(bash(`echo ${WORD} > a.txt`).code, 0);
  });

  test('범위 밖 저장소는 통과한다', () => {
    assert.equal(bash(`git commit -m '${WORD}'`, other).code, 0);
  });
});

test('입력이 깨져도 통과한다', () => {
  const res = run('not json');
  assert.equal(res.code, 0);
  assert.match(res.stderr, /통과/);
});
