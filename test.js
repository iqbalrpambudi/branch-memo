// node test.js  — parsers + a real repo round-trip (incl. quotes, multi-line, dotted branch names).
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { git, loadRepo, parseDescs, parseRefs, age } = require('./lib');

assert.deepStrictEqual([...parseDescs('branch.feat/a.b.description\nline1\nline2\0branch.x.description\nhi\0')],
  [['feat/a.b', 'line1\nline2'], ['x', 'hi']]);
assert.strictEqual(parseRefs('m\x1f*\x1fo/m\x1fahead 2, behind 1\x1f1700000000\x1fA\x1fsubj')[0].behind, 1);
assert.strictEqual(age(Date.now()), 'just now');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gbd-'));
  await git(dir, 'init', '-q', '-b', 'main');
  await git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
  await git(dir, 'branch', 'feat/a.b');
  await git(dir, 'config', 'branch.feat/a.b.description', 'say "hi"; $(rm -rf /)');
  const bs = await loadRepo(dir, 'recent');
  assert.strictEqual(bs.length, 2);
  assert.strictEqual(bs.find((b) => b.name === 'feat/a.b').desc, 'say "hi"; $(rm -rf /)');
  assert.ok(bs.find((b) => b.name === 'main').current);
  console.log('ok');
})();
