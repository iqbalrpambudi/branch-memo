const vscode = require('vscode');
const { git, loadRepo, age } = require('./lib');

const fail = (e) => vscode.window.showErrorMessage((e.stderr || e.message || String(e)).trim());

class Provider {
  constructor() {
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
    this.repos = new Map(); // fsPath -> { branches, error }
    this.seq = 0;
    this.onLoaded = () => {};
  }

  folders() { return vscode.workspace.workspaceFolders || []; }

  async reload() {
    const id = ++this.seq;
    const entries = await Promise.all(this.folders().map(async (f) => {
      const p = f.uri.fsPath;
      try { return [p, { branches: await loadRepo(p, 'recent') }]; }
      catch (error) { return [p, { branches: [], error }]; }
    }));
    if (id !== this.seq) return; // a newer reload superseded this one
    this.repos = new Map(entries);
    this.emitter.fire();
    this.onLoaded();
  }

  current() {
    for (const [cwd, r] of this.repos) {
      const b = r.branches.find((x) => x.current);
      if (b) return { kind: 'branch', cwd, b };
    }
  }

  allFailed() { return this.repos.size > 0 && [...this.repos.values()].every((r) => r.error); }

  getChildren(el) {
    if (!el && this.folders().length > 1) return this.folders().map((folder) => ({ kind: 'repo', folder }));
    const folder = el ? el.folder : this.folders()[0];
    if (!folder) return [];
    const cwd = folder.uri.fsPath;
    return (this.repos.get(cwd) || { branches: [] }).branches.map((b) => ({ kind: 'branch', cwd, b }));
  }

  getTreeItem(n) {
    if (n.kind === 'repo') {
      const it = new vscode.TreeItem(n.folder.name, vscode.TreeItemCollapsibleState.Expanded);
      it.iconPath = new vscode.ThemeIcon('repo');
      return it;
    }
    const { b } = n;
    const it = new vscode.TreeItem(b.name);
    it.description = b.desc.split('\n')[0];
    if (b.current) it.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'));
    it.contextValue = b.current ? 'branch.current' : 'branch';
    it.command = { command: 'gitBranchDescription.edit', title: 'Edit description', arguments: [n] };
    const tip = new vscode.MarkdownString();
    tip.appendText(b.name + (b.current ? ' (current)' : '') + '\n');
    if (b.desc) tip.appendText('\n' + b.desc + '\n');
    tip.appendText(`\n${b.subject} — ${b.author}, ${age(b.ts)}`);
    it.tooltip = tip;
    return it;
  }
}

function activate(ctx) {
  const provider = new Provider();
  const view = vscode.window.createTreeView('gitBranchDescription.branches', { treeDataProvider: provider });
  provider.onLoaded = () => {
    view.message = provider.allFailed() ? 'No git repository found in this workspace.' : undefined;
  };

  // Debounced refresh, driven by file changes in .git instead of polling.
  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => provider.reload(), 300); };
  let watchers = [];
  const watch = () => {
    watchers.forEach((w) => w.dispose());
    // shortcut: assumes .git is a directory (not a worktree/submodule .git file); those still refresh after actions and on view open.
    watchers = provider.folders().map((f) => {
      const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(f, '.git/{HEAD,config,packed-refs,refs/**}'));
      w.onDidChange(schedule); w.onDidCreate(schedule); w.onDidDelete(schedule);
      return w;
    });
  };

  const reg = (id, fn) => ctx.subscriptions.push(vscode.commands.registerCommand('gitBranchDescription.' + id, async (n) => {
    try { await fn(n); } catch (e) { fail(e); }
  }));

  reg('edit', async (n) => {
    n = n && n.b ? n : provider.current();
    if (!n) return;
    const v = await vscode.window.showInputBox({ title: `Description for ${n.b.name}`, prompt: 'Leave empty to remove', value: n.b.desc.split('\n')[0] });
    if (v === undefined) return;
    const key = `branch.${n.b.name}.description`;
    if (v.trim()) await git(n.cwd, 'config', key, v.trim());
    else await git(n.cwd, 'config', '--unset', key).catch(() => {}); // exit 5 when already unset
    await provider.reload();
  });

  reg('switch', async (n) => {
    await git(n.cwd, 'switch', n.b.name);
    await provider.reload();
  });

  reg('delete', async (n) => {
    const ok = await vscode.window.showWarningMessage(`Delete branch "${n.b.name}"?`, { modal: true }, 'Delete');
    if (ok !== 'Delete') return;
    try { await git(n.cwd, 'branch', '-d', n.b.name); }
    catch (e) {
      if (!/not fully merged/.test(e.stderr || '')) throw e;
      const force = await vscode.window.showWarningMessage(`"${n.b.name}" is not fully merged. Force delete?`, { modal: true }, 'Force delete');
      if (force !== 'Force delete') return;
      await git(n.cwd, 'branch', '-D', n.b.name);
    }
    await provider.reload();
  });

  reg('copyName', (n) => vscode.env.clipboard.writeText(n.b.name));

  ctx.subscriptions.push(
    view, { dispose: () => { clearTimeout(timer); watchers.forEach((w) => w.dispose()); } },
    view.onDidChangeVisibility((e) => e.visible && schedule()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => { watch(); provider.reload(); }),
  );
  watch();
  provider.reload();
}

module.exports = { activate };
