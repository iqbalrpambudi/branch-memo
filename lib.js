// Pure git logic, no vscode import so it can be tested with plain node.
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);

// execFile (no shell): branch names / descriptions can never be injected as commands.
const git = (cwd, ...args) => run('git', args, { cwd, timeout: 10000, maxBuffer: 16 << 20 });

const SEP = '\x1f';
const FMT = ['%(refname:short)', '%(HEAD)', '%(upstream:short)', '%(upstream:track,nobracket)',
  '%(committerdate:unix)', '%(authorname)', '%(subject)'].join('%1f');

function parseRefs(out) {
  return out.split('\n').filter(Boolean).map((line) => {
    const [name, head, upstream, track, ts, author, subject] = line.split(SEP);
    return {
      name, current: head === '*', upstream, gone: track === 'gone',
      ahead: +(/ahead (\d+)/.exec(track) || [])[1] || 0,
      behind: +(/behind (\d+)/.exec(track) || [])[1] || 0,
      ts: +ts * 1000, author, subject, desc: '',
    };
  });
}

// `git config -z --get-regexp` => "branch.<name>.description\n<value>\0..." (value may be multi-line)
function parseDescs(out) {
  const m = new Map();
  for (const rec of out.split('\0').filter(Boolean)) {
    const i = rec.indexOf('\n');
    m.set(rec.slice(7, i - 12), rec.slice(i + 1)); // strip "branch." and ".description"
  }
  return m;
}

// 2 git processes total, regardless of the number of branches.
async function loadRepo(cwd, sortBy) {
  const sort = sortBy === 'name' ? 'refname' : '-committerdate';
  const [refs, cfg] = await Promise.all([
    git(cwd, 'for-each-ref', `--sort=${sort}`, `--format=${FMT}`, 'refs/heads'),
    git(cwd, 'config', '-z', '--get-regexp', '^branch\\..*\\.description$').catch(() => ({ stdout: '' })),
  ]);
  const descs = parseDescs(cfg.stdout);
  return parseRefs(refs.stdout).map((b) => ({ ...b, desc: descs.get(b.name) || '' }));
}

function age(ts) {
  const s = (Date.now() - ts) / 1000;
  const d = s / 86400;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (d < 30) return `${Math.floor(d)}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

module.exports = { git, loadRepo, parseRefs, parseDescs, age };
