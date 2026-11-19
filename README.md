# Branch Memo

Give your git branches a short note, so you remember what each one is for.

Descriptions are stored in your local `git config` (`branch.<name>.description`). They are never pushed to a remote, and they work with any tool that reads that standard git key.

## Features

- **Add / edit description** – click a branch name in the **Git Branches** side panel. Leave the box empty to remove the note.
- **Switch branch** – the swap icon on a branch row, or right-click → *Switch Branch*.
- **Delete branch** – the trash icon. You are asked to confirm; if the branch is not fully merged you are asked again before a force delete.
- **Copy branch name** – the copy icon on a branch row.

The current branch is marked with a green dot. Branches are sorted by most recent commit. The list refreshes by itself after checkout, commit, fetch or any change to `.git`.

## Notes

- Works on local branches only (remote branches are not listed).
- Requires `git` on your `PATH`.
- Git worktrees and submodules (where `.git` is a file) do not auto-refresh from file changes; the list still refreshes after actions in this panel and when the panel is opened.

## License

MIT
