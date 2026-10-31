# CCS PERSONALIZED WORKSPACE MASTERPLAN

**Sub-masterplan of the CCS Signage Workflow application (Base44 app `68dfcc5e57bbbc35387da97c`).**
**Status:** Phase 0 complete — audited, designed, ready for Phase 1.
**Supersedes:** the sidebar-replacement recommendation in the UI/UX redesign plan. The existing draggable taskbar stays.

---

## 1. Mission

Give every employee a personal workspace: theme, readability, navigation order/visibility, pipeline table layout, dashboard, time-clock presentation, notifications, and workspace profiles — all per-user, persistent, and synced — without touching business data, permissions, or attendance integrity.

The system lives inside the existing **Time Clock page → Settings tab**.

## 2. Audited architecture (Phase 0 inventory)

### Taskbar / navigation — PROTECTED
- `src/Layout.jsx` (~1781 lines) renders both top taskbar and sidebar.
- Drag/drop engine: **`@hello-pangea/dnd`** — `DragDropContext onDragEnd={handleNavReorder}` at ~L1179 (sidebar droppable) and ~L1354 (top-bar droppable); `Draggable draggableId={side-|top-}${url}`.
- `handleNavReorder` (L266–273): reorders URL list → `saveNavOrder(email, urls)`.
- Order persistence: `src/components/layout/navPreferences.js` → `localStorage["ccsNavOrder:{email}"]` (per-user key). `applyNavOrder` merges saved order with items (unknown pages append at end). `loadCollapsedGroups`/`saveCollapsedGroups` → `localStorage["ccsNavGroupsCollapsed"]` (NOT user-keyed — fix under Phase 5).
- Shell modes: `navLayout` ("top"|"side"), `ccsShellCollapsed`, `ccsShellCompact` — all localStorage.
- **Gap vs masterplan:** order is localStorage-only — no cross-device sync, lost on browser change. Phase 5 migrates it into `UserWorkspacePreferences` while keeping localStorage as the write-through cache.

### Theme
- `localStorage.darkMode` + `.dark` class on `<html>`; `CcsMantineProvider` (added 2026-11) syncs Mantine color scheme to it. No accent-color system for the shell yet (`hexToRgbTuple` exists but is estimator-scoped). Dark/light/system is a P0 add: write `.dark`/`localStorage` as today + `prefers-color-scheme` listener for "system".

### Time Clock Settings page
- `src/pages/TimeClock.jsx` → `TabsTrigger value="settings"` (~L747) → `UserSettingsTab` (~L1062) → `TimeTrackerSettings.jsx` (852 lines, existing Section/Field settings UI with InfoDot hints).
- **This tab becomes the Settings Center** — existing time-clock controls keep their spot at the top; new categories slot in below as collapsible sections or sub-tabs.

### Auth
- `useAuth()` from `src/components/auth/EmailGate` → `currentUser.email`, `sessionToken`. All backend access goes through session-authenticated functions (`authenticateSignShopSession` + `base44.asServiceRole`).

### Per-user preference storage — PATTERN ALREADY PROVEN
| Entity | Pattern |
|---|---|
| `TimeClockEmployeePreference.jsonc` | `user_email` key, ~25 typed fields (enums/bounds), RLS `timeclock_backend_only`; access via `timeClockAction` |
| `timeClockAction` function | `time_tracker_prefs_get` / `time_tracker_prefs_update` actions: session auth → own-row-only 403, `request_id` idempotency, 409 on ambiguous duplicate rows |
| `FleetDashboardPreference.jsonc` | `user_email` + `widget_order`/`hidden_widgets`/`density`/`layout_version`/`creation_key`; RLS read-own-or-admin, server-only write; `fleetDashboardPreferenceAction` |
| `UserCalendarSettings.jsonc` | same `user_email` pattern; `manageUserCalendarSettings` function |

**Conclusion: do NOT invent a new storage model.** Add `UserWorkspacePreferences.jsonc` mirroring `FleetDashboardPreference` (read own row, server-only writes) + a `workspacePrefsAction` function mirroring the `time_tracker_prefs_*` actions (get/update, `request_id` idempotency, own-email enforcement, ambiguity 409, `creation_key` create).

### Rate-limit context (documented in AGENTS.md)
- Per-caller `entity_list` 140 req/60s + whole-app rolling entity-read cap. Mitigations already in place: `loadAllEntityRows`, `timeClockReadCache.js`, boardFeed projection/30s cache.
- Consequence for prefs: **one read on shell mount, cached in provider state + localStorage; debounced batched writes (≥800 ms) — never per-keystroke.** Pref writes must reuse `entityRateLimitRetry`.

## 3. Taskbar preservation contract (non-negotiable)

- Keep `@hello-pangea/dnd` + `handleNavReorder` + `navPreferences.js` semantics exactly.
- Personalization layers ON TOP of it: hidden buttons are filtered AFTER `applyNavOrder`; order array always stores the full URL list so un-hiding restores position.
- New prefs (density, labels, favorites, dividers) are render modifiers — the DnD engine never changes.
- Keyboard reorder = `Move left/right` menu item on each button calling the same `saveNavOrder` path — additive, no engine change.
- **Baseline (Phase 1 exit):** click navigates; drag reorders without firing click; order survives reload + mode switches + theme changes; reset restores default.

## 4. Data model — `UserWorkspacePreferences.jsonc`

```jsonc
{
  "name": "UserWorkspacePreferences",
  "properties": {
    "user_email": { "type": "string", "required": true },
    "schema_version": { "type": "number", "default": 1 },
    "preferences": { "type": "object" },
    "profiles":    { "type": "array", "items": { "type": "object" } },
    "creation_key": { "type": "string" },
    "last_request_id": { "type": "string" },
    "device_layouts": { "type": "object" }
  },
  "rls": {
    "read": "own row (data.user_email == user.email) or admin",
    "create/update/delete": "server only (workspace_prefs role)"
  }
}
```

`preferences` schema (validated in `workspacePrefsAction`, unknown keys stripped):

```
appearance:    { mode: light|dark|system, accent: enum, density: comfortable|compact,
                 font_scale: 0.9–1.25, table_font_scale, contrast: normal|high,
                 radius: sharp|default|round, animations: bool, preset: enum }
navigation:    { layout: top|side, order: [urls], hidden: [urls], favorites: [urls],
                 density, labels: full|short|icons, tooltips: bool, dividers: bool,
                 landing_page: url, groups_collapsed: {name:bool}, overflow: wrap|menu }
pipeline:      { density, columns: {visible,order,widths,pinned}, default_sort,
                 saved_views: [{id,name,config}], row_stripes: bool, gridlines: bool,
                 highlight_overdue: bool, scroll_persist: bool }
workflow:      { default_view, density, group_by, sort, show_completed,
                 group_expansion: {key:bool} }
dashboard:     { widget_order, hidden_widgets, density }
timeclock:     {}  // stays in TimeClockEmployeePreference — link, don't duplicate
notifications: { position, compact, sounds, quiet_mode, categories: {…}, toasts: {…} }
accessibility: { reduce_motion, focus_visible, larger_controls, high_contrast_text }
shortcuts:     { enabled: bool, bindings: {action: combo}, hints: bool }
mobile:        { density, landing_page, simplified_header }
privacy:       { mask_currency, discreet_mode, reduced_previews }
```

Precedence (highest→lowest): company/security rules → role permissions → saved user prefs → device-responsive adjustments → app defaults. `navPreferences.js` localStorage becomes the device cache of `navigation.*` — server wins on load, local writes go through on save.

## 5. Feature classification (catalog → P0–P3)

**P0 — foundation (Phase 1–4):**
Taskbar baseline tests; `UserWorkspacePreferences` + `workspacePrefsAction`; `WorkspacePreferencesProvider` + `useWorkspacePreferences`; Settings Center shell in Time Clock settings tab (search, sections, save status, category reset); light/dark/system; accent enum (reusing tracker accent colors); density comfortable/compact; font scale; reduced motion; nav order sync to server (localStorage stays as cache); landing page; reset order/category/all.

**P1 — high value (Phase 5–6):**
Nav hidden/favorites/labels/tooltips/dividers; keyboard reorder; collapsed-group memory (migrate `ccsNavGroupsCollapsed` → user-keyed); pipeline density/columns/saved views/sort; workflow grouping/sort/show-completed; dashboard widget order/hidden (fold `FleetDashboardPreference` readers into provider, entity stays); notification position/compact/toast categories (existing `EmailNotificationSettings` is rule-level — presentation prefs only); focus-mode presentation toggle.

**P2 — advanced (Phase 7–8):**
Named profiles (built-in presets + custom save/rename/switch/delete); custom shortcut bindings; mobile-specific overrides (`device_layouts`); privacy/discreet presets; recent-modules quick nav; per-module saved filters beyond pipeline.

**P3 — conditional (only if infra exists):**
Desktop notifications (needs real delivery + browser permission flow); email/push summaries (no delivery mechanism today — DO NOT ship fake toggles); widget resize grid (no widget framework exists); multi-window drag between nav groups.

**Non-features (documented, will not build):** anything that masks mandatory alerts, gates required fields, alters payroll/attendance math, exposes restricted modules, or fakes delivery mechanisms. `TimeClockEmployeePreference` fields are NOT duplicated — the settings center edits them through the existing `timeClockAction` path.

## 6. Settings Center layout (Time Clock → Settings tab)

- Left rail (desktop): search + category list — Time Clock (existing) · Appearance · Navigation & Taskbar · My Workflows · Pipeline · Dashboard · Notifications · Productivity · Accessibility · Privacy · Profiles · Advanced.
- Mobile: category select dropdown, single column.
- Shared controls: `SettingsSection`, `SettingRow`, `SwitchField`, `SegmentedField`, `SelectField`, `SliderField` — reuse `TimeTrackerSettings`'s Section/Field/InfoDot pattern, rebuilt on Mantine primitives per the redesign plan.
- Search: client-side index over setting metadata `{id, label, hint, keywords[], category}` — zero extra reads.
- Save status chip: saved · saving · pending-retry · offline-local. Optimistic UI + debounced batch write (`request_id` + `last_request_id`).
- Live preview: appearance settings apply immediately via provider context + CSS vars; "Revert" within session restores last synced state.

## 7. Phases & status

- [x] **P0 audit** — this document. Inventory, pattern selection, classification.
- [ ] **P1 taskbar baseline** — scripted click/drag/reload/mode regression checks against preview; lock behavior notes in §3.
- [ ] **P2 storage foundation** — entity jsonc, `workspacePrefsAction`, provider + hook, localStorage bridge. Exit: two users, isolated prefs, one read per session, debounced writes.
- [ ] **P3 Settings Center** — rail, search, controls, status, resets inside Time Clock settings tab.
- [ ] **P4 appearance/typography/a11y** — theme, accent, density, fonts, motion; live preview; whole-shell application.
- [ ] **P5 taskbar personalization** — server order sync, hidden/favorites/labels/tooltips, keyboard reorder, reset; DnD regression re-run.
- [ ] **P6 pipeline/workflow/dashboard** — density, columns, saved views, grouping; protect autosave/Save&Sync.
- [ ] **P7 time clock + productivity** — display prefs (via existing entity), focus presentation, shortcuts, notification presentation.
- [ ] **P8 profiles** — built-in presets + custom profiles, one-shot apply.
- [ ] **P9 QA** — isolation, persistence, DnD, pipeline, clock integrity, a11y, mobile, perf.

## 8. Testing

- Extend existing harness style (`scripts/*-browser-harness/`): `scripts/workspace-prefs-harness/` for pref isolation + persistence.
- Taskbar regression script: click each item; drag item → order changes + no nav; reload → order persists; switch top/side + compact → order persists; reset → defaults.
- Isolation: user A saves, user B unaffected (two session tokens); logout→login same browser → correct prefs.
- Rate-limit: count `entity_list` calls per pref load + per save — must be ≤1 each.
- Migration: `schema_version` bump keeps valid fields, drops unknown.

## 9. Risks & decisions

| Decision | Choice | Why |
|---|---|---|
| New entity vs reuse | New `UserWorkspacePreferences` + reuse `TimeClockEmployeePreference` | Time-clock prefs already have a hardened path; duplicating splits authority |
| Writer | New `workspacePrefsAction` fn, mirrors `time_tracker_prefs_*` | `timeClockAction` is ~3.7k lines; keep the blast radius small |
| Order sync | Server authoritative + localStorage write-through cache | Zero-load-flicker nav + cross-device |
| Nav prefs UI | Render modifiers only — never touch dnd engine | Non-negotiable preservation |
| Fake toggles | None — P3 list documents what needs infra first | Masterplan requirement |
| Sidebar | Optional `navigation.layout` value; taskbar stays default | Supersedes redesign sidebar recommendation |

**Open risks:** preview 429 storms slow live verification; concurrent builder edits on `Layout.jsx` (re-pull before every phase); `ccsNavGroupsCollapsed` isn't user-keyed today (one-way migration, keep key on same device).

## 10. Change log

- 2026-11-01 — Phase 0 audit complete; masterplan created. Inventory §2, decisions §9, classification §5.
