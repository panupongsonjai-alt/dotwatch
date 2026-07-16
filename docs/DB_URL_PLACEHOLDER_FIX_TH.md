# Database URL Documentation Placeholder Fix

Replaces credential-shaped examples in two tracked documents with `Read-Host` prompts.

Files:
- `docs/LOCAL_RENDER_PARITY_RUNBOOK.md`
- `docs/PHASE9_POST_RELEASE_MAINTENANCE.md`

After extraction:

```powershell
npm run scan:secrets
```
