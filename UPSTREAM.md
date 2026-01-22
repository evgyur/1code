# Upstream Sync Guide

This repository tracks `21st-dev/1code` with additional Windows fixes.

## Remotes

```bash
git remote add upstream https://github.com/21st-dev/1code.git
```

## Sync upstream into main

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

## Release flow

Use the helper script:

```bash
npm run release:portable
```

This will:
1) Fetch upstream
2) Merge upstream/main into current main
3) Build + package portable
4) Tag and push the release

## Notes

- If you have local fixes, make sure they are committed before syncing.
- If conflicts appear, resolve them and continue with the merge before releasing.
