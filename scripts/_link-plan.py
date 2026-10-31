path = 'INTEGRATION_PROGRESS.md'
src = open(path).read()
if 'CCS_PERSONALIZED_WORKSPACE_MASTERPLAN' in src:
    print('already linked'); raise SystemExit
entry = ("\n## Sub-plans\n"
 "- `docs/plans/CCS_PERSONALIZED_WORKSPACE_MASTERPLAN.md` — Personalized Workspace Settings System "
 "(per-user prefs, settings center in Time Clock settings tab, taskbar preservation contract). "
 "Phase 0 audit DONE; P0–P3 classification + entity/function pattern chosen. "
 "Supersedes the earlier sidebar-replacement idea — draggable taskbar is protected.\n")
open(path, 'a').write(entry)
print('linked')
