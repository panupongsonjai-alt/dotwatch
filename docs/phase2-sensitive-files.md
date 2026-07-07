# Phase 2 sensitive file scan

The scan separates issues into two types:

## FAIL

The file/content may contain a secret and is not safely ignored, or it is already tracked by Git.

Fix tracked local secret files with:

```powershell
git rm --cached -- "apps/dashboard/.env"
git rm --cached -- "apps/dashboard/.env.local"
git rm --cached -- "services/backend/.env"
```

Do not delete these files from your computer unless you no longer need them.

## WARN

The file is a local secret file, but it is ignored by Git. This is OK for development.

## Included helper

Run this to append safe ignore rules without overwriting your existing `.gitignore`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/fix-phase2-gitignore.ps1
```
