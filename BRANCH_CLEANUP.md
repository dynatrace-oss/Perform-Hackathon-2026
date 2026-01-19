# Branch Cleanup Guide

## Current Branch Status

### Local Branches
- ✅ **main** - Keep (main branch)
- ✅ **gh-pages** - Keep (needed for GitHub Pages documentation)
- ✅ **fix-github-actions-workflows** - Keep (has active PR #3)
- ⚠️ **pr-hackathon-2026** - Keep until PR #1 is merged, then delete
- ❌ **dashboard-fixes** - **DELETE** (old branch, no longer needed)
- ❌ **pr-to-v2-otel** - **DELETE** (old branch, work moved to pr-hackathon-2026)
- ❌ **temp-main** - **DELETE** (temporary branch created during setup)

### Remote Branches in perform-hackathon-2026 (New Repo)
- ✅ **main** - Keep (main branch)
- ✅ **gh-pages** - Keep (needed for GitHub Pages)
- ✅ **fix-github-actions-workflows** - Keep (has active PR #3)
- ⚠️ **pr-hackathon-2026** - Keep until PR #1 is merged, then delete
- ❌ **pr-to-v2-otel** - **DELETE** (old branch, replaced by pr-hackathon-2026)
- ⚠️ **dependabot/pip/pymdown-extensions-10.16.1** - Delete after reviewing/merging PR (if any)

### Remote Branches in origin (henrikrexed/Vegas-App - Old Repo)
- ✅ **main** - Keep (main branch of old repo)
- ⚠️ **gh-pages** - Optional: Keep if you still use old repo for docs
- ❌ **dashboard-fixes** - **DELETE** (old branch)
- ❌ **pr-to-v2-otel** - **DELETE** (old branch)

### Remote Branches in upstream (lawrobar90/Vegas-App)
- ✅ **main** - Keep (upstream reference)
- ✅ **V2-Otel** - Keep (upstream reference)

## Recommended Deletions

### Safe to Delete Immediately

**Local branches:**
```bash
git branch -D dashboard-fixes
git branch -D pr-to-v2-otel
git branch -D temp-main
```

**Remote branches in perform-hackathon-2026:**
```bash
git push perform-hackathon-2026 --delete pr-to-v2-otel
```

**Remote branches in origin (old repo):**
```bash
git push origin --delete dashboard-fixes
git push origin --delete pr-to-v2-otel
```

### Delete After PRs are Merged

**After PR #1 is merged:**
```bash
# Local
git branch -D pr-hackathon-2026

# Remote
git push perform-hackathon-2026 --delete pr-hackathon-2026
```

**After PR #3 is merged:**
```bash
# Local
git branch -D fix-github-actions-workflows

# Remote
git push perform-hackathon-2026 --delete fix-github-actions-workflows
```

## Quick Cleanup Script

Here's a script to delete all the safe-to-delete branches:

```bash
#!/bin/bash
# Delete local branches
git branch -D dashboard-fixes pr-to-v2-otel temp-main 2>/dev/null || true

# Delete remote branches in new repo
git push perform-hackathon-2026 --delete pr-to-v2-otel 2>/dev/null || true

# Delete remote branches in old repo
git push origin --delete dashboard-fixes pr-to-v2-otel 2>/dev/null || true

echo "✅ Cleanup complete!"
```

## Summary

**Total branches that can be deleted now:**
- 3 local branches (dashboard-fixes, pr-to-v2-otel, temp-main)
- 1 remote branch in perform-hackathon-2026 (pr-to-v2-otel)
- 2 remote branches in origin (dashboard-fixes, pr-to-v2-otel)

**Branches to keep:**
- main (all remotes)
- gh-pages (all remotes)
- fix-github-actions-workflows (until PR #3 is merged)
- pr-hackathon-2026 (until PR #1 is merged)
- upstream branches (for reference)
