# Smartsheet Sync Settings — published-app save persistence fix

Reviewed September 28, 2026 after the user reported that Smartsheet Sync settings would not stay checked and the page continuously showed "Unsaved changes" after clicking Save Settings.

## Confirmed causes

### 1. Wrong save authority in the published app

The settings UI loaded `GlobalSettings` directly from the browser and saved with the generic browser-side GlobalSettings persistence helper.

`GlobalSettings` has:
- public read access;
- native Base44-admin-only create/update/delete RLS.

The published app authenticates through the custom Sign Shop session. That meant the page could load the Smartsheet config but could not reliably persist edits through the direct browser write path.

### 2. False dirty state

The dirty check used direct `JSON.stringify` comparison on normalized objects.

Equivalent column-binding objects with different property insertion order could therefore compare as different and keep the "Unsaved changes" banner visible even when the saved values were semantically identical.

## Fixed

### Authenticated backend config persistence

Added admin-only `config_get` and `config_save` actions to the existing `smartsheetSyncAction` backend.

- Existing Sign Shop admin authentication is required before either action executes.
- Backend reads/writes `GlobalSettings` through service role.
- Native GlobalSettings RLS remains unchanged.
- Save uses optimistic concurrency:
  - exact loaded record ID;
  - exact `updated_date`;
  - semantic comparison of the loaded `setting_value`.
- Duplicate `smartsheetSyncConfig` records block saves.
- Saved config is re-read and semantically verified before success is returned.
- The browser receives only the config record fields needed for continued concurrency-safe editing.

The Smartsheet Sync settings page now loads and saves exclusively through these authenticated backend actions.

### Stable dirty comparison

Added a recursive stable config serializer so object key order does not affect dirty-state detection.

The "Unsaved changes" banner now reflects real value differences rather than JSON property order.

### Toggle behavior

Dataset switches remain directly editable. After a successful backend save, the verified saved record becomes the new UI baseline, so checked settings remain checked and the dirty banner clears.

## Verified

- New Smartsheet settings persistence regression: **15/15 PASS**.
- Sales Save & Sync safety: **21/21 PASS**.
- Order targeted Save & Sync: **PASS**.
- Order Save & Sync button: **PASS**.
- Shared Order sync review/safety: **PASS**.
- Focused ESLint: **PASS**.
- Smartsheet backend bundle: **PASS**.
- `git diff --check`: **PASS**.
- Full production build: **PASS**.

## Live configuration safety

Read-only verification after testing confirmed production settings were unchanged:
- Global sync enabled.
- Observation mode off.
- Sales mirror/pull/push remain off.
- Sales create Base44 from Smartsheet = on.
- Sales create Smartsheet from Base44 = on.
- Orders mirror/pull remain on.
- Orders push remains off.
- Order create directions remain off.

No live settings, WorkOrders, Orders, or Smartsheet rows were modified during testing.
