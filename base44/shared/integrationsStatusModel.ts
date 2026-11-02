// integrationsStatusModel — K-08 services/integrations status surface.
// Pure TS, ZERO imports. Safe to bundle into Deno functions
// (base44/functions/*), frontend modules and Node test harnesses.
//
// CANONICAL INVENTORY of every external service this app touches, discovered
// by auditing base44/functions/*, base44/shared/* and src/* (2026-11):
//
//   service                    how the app reaches it
//   -------------------------  --------------------------------------------
//   QuickBooks Online          quickbooksExport fn + GlobalSettings 'qbo'
//                              (realm_id + refresh_token_ref; the wire is
//                              BLOCKED-CREDENTIALS until an Intuit app exists)
//   Smartsheet                 smartsheetSyncAction fn + SMARTSHEET_API_TOKEN
//                              secret + GlobalSettings 'smartsheetSyncConfig'
//   CoreBridge ERP             RETIRED — corebridgeApiAction answers 410
//                              api_disabled for every action except offline
//                              CSV export / audit / backup verification
//   Google Drive               platform 'googledrive' connector
//                              (googleDriveOperations, backupToGoogleDrive,
//                              driveBrowseFolder) + optional GlobalSettings
//                              'driveConfig' jobs-root pin
//   Google Maps Platform       GOOGLE_MAPS_API_KEY — getGoogleMapsKey hands
//                              the browser key to Fleet/places/StreetView;
//                              placesAutocomplete, streetViewPreview,
//                              calculateTravelMiles reuse it server-side
//   Google Geocoding           GOOGLE_GEOCODING_API_KEY — findLocalityByAddress
//                              + resolvePermittingAddress geocode chain
//   OpenStreetMap Nominatim    keyless fallback inside that geocode chain
//   US Census Geocoder         keyless last-resort fallback in the same chain
//   CAGIS                      cagisSearch — keyless Cincinnati Area GIS
//   Permitting research proxy  permittingProxy — PERMITTING_API_KEY
//   Staff email delivery       sendStaffEmail — SMTP_* (Ionos) when all four
//                              secrets exist, else the Gmail connector;
//                              policy row GlobalSettings 'emailDelivery'
//   Gmail connector            platform 'gmail' connector — checkGmailConnection
//                              + sendGmail (GOOGLE_CLIENT_ID/SECRET secrets)
//   Customer portal            customerPortalAction — token-link portal; the
//                              pay-online path is NOT wired (Invoice.pay_url
//                              is a provider-ready placeholder only)
//   Bouncie                    BouncieConnection entity + BOUNCIE_* secrets —
//                              bouncieStatus, bouncieApi, bouncieWebhook
//   Base44 AI                  integrations.Core — InvokeLLM/TranscribeAudio/
//                              GenerateImage (SOP builder, permitting research
//                              + rule extraction, doc analysis, note translation)
//   Base44 workflows           scheduled runs + _WORKFLOWS_TOKEN capability
//                              (checkDeadlineReminders, processWorkflowTriggers)
//
// ABSENT per COREBRIDGE_MAP.md §services ("Presence ≠ connected — all
// observed NOT CONNECTED"): merchant provider (Fiserv/Nexio), Zapier key,
// Sign Pack, B2 Portal (email→auto-estimate), PlanProphet CRM. These are
// catalogued as 'unavailable' — presence-only per the map.
//
// STATUS SOURCES
//   'configured' — availability inferred from saved settings rows.
//   'credential' — gated by a secret/connector/token (probe or settings row).
//   'native'     — platform/built-in capability, no setup needed (includes
//                  keyless public endpoints used as fallbacks).
//   'absent'     — documented in the service map, not present in this app.
//
// STATUS VALUES
//   connected       verified working (live probe or required settings present)
//   partial         some configuration present but incomplete/degraded/unverified
//   not_configured  nothing set up
//   native          built-in, no setup required
//   unavailable     documented externally but absent here
//   unknown         cannot be determined from this surface — probe failed or
//                   no staff-visible signal (a server-side secret presence)

export type IntegrationCategory =
  | 'accounting'
  | 'sync'
  | 'documents'
  | 'maps'
  | 'permitting'
  | 'communications'
  | 'fleet'
  | 'automation'
  | 'ai';

export type IntegrationSource = 'configured' | 'credential' | 'native' | 'absent';

export type IntegrationStatus =
  | 'connected'
  | 'partial'
  | 'not_configured'
  | 'native'
  | 'unavailable'
  | 'unknown';

export type IntegrationResolverMode =
  | 'native'               // always 'native'
  | 'absent'               // always 'unavailable'
  | 'unverifiable'         // always 'unknown' — server-side credential, no staff-visible signal
  | 'settings'             // GlobalSettings row presence/shape only
  | 'probe'                // live function status body only
  | 'probe_else_settings'  // probe result wins; settings when the probe was not run
  | 'probe_and_settings';  // probe candidate gated by settings-row shape

// ---------------------------------------------------------------------------
// Spec types
// ---------------------------------------------------------------------------

// How a live function status body is interpreted. Paths are dotted
// ('connection.connected'); a path is "truthy" only for a non-empty value —
// false, '', 0, null, undefined, [] and {} are all falsy.
export interface IntegrationProbeSpec {
  /** Backend function name — the panel invokes it with `probe_payload`. */
  fn: string;
  /** Any truthy path → the service reports itself connected. */
  connected_any?: string[];
  /** Any truthy path → definitely not configured (wins over configured_any). */
  not_configured_any?: string[];
  /** ALL listed paths falsy (and nothing connected) → not_configured. */
  not_configured_unless?: string[];
  /** Truthy → a connected report is downgraded to 'partial' (degraded). */
  partial_any?: string[];
  /** Path present but falsy → a connected report downgrades to 'partial'
   *  (e.g. apiHealthy === false on a still-connected service). */
  partial_if_falsy?: string[];
  /** Truthy → at least 'partial' when nothing stronger matched. */
  configured_any?: string[];
  /** Path to a string[] of missing pieces — appended to the detail. */
  missing_list?: string;
  /** 'Label:path.to.field' entries appended to the detail as 'Label=value'. */
  detail?: string[];
  /** Regex source matched against a probe error/body — a hit means the error
   *  IS the not-configured signal (e.g. getGoogleMapsKey's 503 message). */
  not_configured_match?: string;
}

// How a saved GlobalSettings row is interpreted on its own.
export interface IntegrationSettingsSpec {
  /** GlobalSettings setting_key. */
  key: string;
  /** Older/alternate keys checked in order when `key` has no row. */
  alt_keys?: string[];
  /** Every dotted path must be truthy inside setting_value for 'connected'. */
  require_fields?: string[];
  /** Any-of dotted paths truthy inside setting_value for 'connected'. */
  require_any_fields?: string[];
  /** Explicit `false` (not merely missing) → 'partial' (configured but off). */
  disable_field?: string;
  /** Row absent. Default 'not_configured'. */
  on_absent?: IntegrationStatus;
  /** Row present and requirements met (or none declared). Default 'connected'. */
  on_present?: IntegrationStatus;
  /** Row present but required fields missing/disabled. Default 'partial'. */
  on_incomplete?: IntegrationStatus;
}

// Gate applied when a probe candidate is 'connected' in probe_and_settings
// mode — the settings row must also look right or the result is 'partial'.
export interface IntegrationGateSpec {
  /** Probe-connected but no settings row → 'partial'. */
  requires_row?: boolean;
  /** Probe-connected but any field falsy → 'partial'. */
  require_fields?: string[];
  /** Probe-connected but field === false → 'partial'. */
  disable_field?: string;
}

export interface IntegrationStatusResolver {
  mode: IntegrationResolverMode;
  probe?: IntegrationProbeSpec;
  settings?: IntegrationSettingsSpec;
  gate?: IntegrationGateSpec;
  /** Probe threw/was unreachable. 'unknown' (default) or 'fallback_settings'
   *  to answer from the settings row instead. */
  probe_error_status?: 'unknown' | 'fallback_settings';
  /** Optional per-status detail overrides. */
  details?: Partial<Record<IntegrationStatus, string>>;
}

export interface IntegrationCatalogEntry {
  /** Stable unique key. */
  key: string;
  label: string;
  category: IntegrationCategory;
  source: IntegrationSource;
  /** One-line "what it does here". */
  description: string;
  /** Where it is (or would be) configured — human pointer for the card. */
  settings_hint?: string;
  /** Extra payload merged into the probe invoke (e.g. {action:'status'}). */
  probe_payload?: Record<string, unknown>;
  resolver: IntegrationStatusResolver;
}

export interface IntegrationProbeInput {
  key: string;
  fn: string;
  payload: Record<string, unknown>;
}

export interface IntegrationStatusResult {
  key: string;
  status: IntegrationStatus;
  detail: string;
  /** What evidence produced the answer — powers the card's fine print. */
  evidence: {
    probe: 'ok' | 'error' | 'absent' | 'unused';
    settings_row: boolean;
    missing_fields: string[];
  };
}

// ---------------------------------------------------------------------------
// Category + status presentation metadata
// ---------------------------------------------------------------------------

export const INTEGRATION_CATEGORIES: readonly { id: IntegrationCategory; label: string }[] = [
  { id: 'accounting', label: 'Accounting & Payments' },
  { id: 'sync', label: 'Data Sync & Migration' },
  { id: 'documents', label: 'Documents & Files' },
  { id: 'maps', label: 'Maps & Location' },
  { id: 'permitting', label: 'Permitting Services' },
  { id: 'communications', label: 'Communications' },
  { id: 'fleet', label: 'Fleet' },
  { id: 'automation', label: 'Automation' },
  { id: 'ai', label: 'AI & Assist' },
];

export const INTEGRATION_STATUSES: readonly IntegrationStatus[] = [
  'connected', 'partial', 'not_configured', 'native', 'unavailable', 'unknown',
];

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  connected: 'Connected',
  partial: 'Partial',
  not_configured: 'Not configured',
  native: 'Built in',
  unavailable: 'Not available',
  unknown: 'Unknown',
};

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const INTEGRATION_CATALOG: readonly IntegrationCatalogEntry[] = [
  // ── Accounting & Payments ────────────────────────────────────────────────
  {
    key: 'quickbooks_online',
    label: 'QuickBooks Online',
    category: 'accounting',
    source: 'credential',
    description:
      'QBO adapter surface (dry-run payloads, sync receipts). Live push/pull stays credential-gated until an Intuit app exists.',
    settings_hint: "GlobalSettings 'qbo' row (realm_id + refresh_token_ref) · quickbooksExport function",
    probe_payload: { action: 'status' },
    resolver: {
      mode: 'probe_else_settings',
      probe: {
        fn: 'quickbooksExport',
        connected_any: ['connection.connected'],
        // BLOCKED-CREDENTIALS means the Intuit side is not set up — that is
        // "not configured", not a degraded connection.
        not_configured_any: ['connection.blocked', 'connection.missing'],
        missing_list: 'connection.missing',
        detail: [
          'Company:connection.company_name',
          'Realm:connection.realm_id',
          'Env:connection.environment',
          'Last sync:last_sync_at',
        ],
        not_configured_match: 'not configured|credentials',
      },
      settings: {
        key: 'qbo',
        require_fields: ['realm_id', 'refresh_token_ref'],
        on_present: 'connected',
        on_incomplete: 'partial',
        on_absent: 'not_configured',
      },
      details: {
        connected: 'QBO credentials are stored and the adapter reports connected.',
        partial: 'A qbo settings row exists but the connection is incomplete.',
        not_configured: 'No Intuit credentials — pushes stay in dry-run mode.',
      },
    },
  },
  {
    key: 'merchant_provider',
    label: 'Merchant provider (Fiserv / Nexio)',
    category: 'accounting',
    source: 'absent',
    description: 'Card-present / pay-online merchant account from the CoreBridge service map.',
    settings_hint: 'Not wired — Invoice.pay_url is a provider-ready placeholder',
    resolver: {
      mode: 'absent',
      details: {
        unavailable:
          'CoreBridge map lists Fiserv/Nexio (one active) — observed NOT CONNECTED. No gateway is wired here; pay-online shows only when an invoice carries a pay_url.',
      },
    },
  },

  // ── Data Sync & Migration ────────────────────────────────────────────────
  {
    key: 'smartsheet',
    label: 'Smartsheet',
    category: 'sync',
    source: 'credential',
    description:
      'Orders + Sales mirror sync with push/pull batches, conflict review and scheduled runs.',
    settings_hint:
      "Admin → Integrations → Smartsheet Sync · SMARTSHEET_API_TOKEN secret · GlobalSettings 'smartsheetSyncConfig'",
    probe_payload: { action: 'status' },
    resolver: {
      mode: 'probe_and_settings',
      probe: {
        fn: 'smartsheetSyncAction',
        connected_any: ['configured'],
        not_configured_unless: ['configured'],
        detail: [
          'Orders run:status_orders.last_run_at',
          'Sales run:status_sales.last_run_at',
        ],
      },
      settings: {
        key: 'smartsheetSyncConfig',
        disable_field: 'global_enabled',
        on_absent: 'not_configured',
        on_present: 'partial',
        on_incomplete: 'partial',
      },
      gate: { requires_row: true, disable_field: 'global_enabled' },
      details: {
        connected: 'API token is set and a sync configuration is saved.',
        partial: 'Smartsheet is partly set up — check the saved sync config.',
        not_configured: 'No SMARTSHEET_API_TOKEN secret — sync cannot call the API.',
      },
    },
  },
  {
    key: 'corebridge_erp',
    label: 'CoreBridge ERP (legacy)',
    category: 'sync',
    source: 'absent',
    description: 'Former shop-management system — migration history only.',
    settings_hint: 'Admin → Integrations → CoreBridge Migration (read-only history)',
    resolver: {
      mode: 'absent',
      details: {
        unavailable:
          'External CoreBridge API access is retired — corebridgeApiAction answers 410 (api_disabled). Only offline CSV export, audit and backup-verification actions remain.',
      },
    },
  },

  // ── Documents & Files ────────────────────────────────────────────────────
  {
    key: 'google_drive',
    label: 'Google Drive',
    category: 'documents',
    source: 'credential',
    description:
      'Job folders, portal attachments and the admin backup all ride the platform Drive connector; a saved row can pin the jobs root.',
    settings_hint:
      "Platform 'googledrive' connector · optional GlobalSettings 'driveConfig' (jobs_root_folder_id pin)",
    resolver: {
      mode: 'settings',
      settings: {
        key: 'driveConfig',
        alt_keys: ['googleDriveConfig'],
        require_any_fields: ['jobs_root_folder_id', 'root_folder_id', 'drive_jobs_folder_id'],
        on_absent: 'unknown',
        on_present: 'partial',
        on_incomplete: 'partial',
      },
      details: {
        partial:
          'A jobs root folder is pinned in settings. The Drive connector token itself is platform-managed and cannot be verified from Admin.',
        unknown:
          "No driveConfig row — jobs file under the auto-created 'CCS Jobs' root. The platform connector's presence is not verifiable here.",
      },
    },
  },
  {
    key: 'sign_pack',
    label: 'Sign Pack',
    category: 'documents',
    source: 'absent',
    description: 'CoreBridge companion sign-package service from the service map.',
    resolver: {
      mode: 'absent',
      details: {
        unavailable: 'Listed in the CoreBridge service map — observed NOT CONNECTED. No Sign Pack endpoint exists in this app.',
      },
    },
  },

  // ── Maps & Location ──────────────────────────────────────────────────────
  {
    key: 'google_maps_platform',
    label: 'Google Maps Platform',
    category: 'maps',
    source: 'credential',
    description:
      'Browser Maps key for Fleet tracking, plus Places autocomplete, Street View previews and travel-miles routing.',
    settings_hint: 'Base44 app secret GOOGLE_MAPS_API_KEY · getGoogleMapsKey function',
    resolver: {
      mode: 'probe',
      probe: {
        fn: 'getGoogleMapsKey',
        connected_any: ['apiKey'],
        not_configured_match: 'not configured',
      },
      details: {
        connected: 'A Maps API key is stored and served to the app.',
        not_configured: 'GOOGLE_MAPS_API_KEY is not set — map, places and Street View calls return 503.',
      },
    },
  },
  {
    key: 'google_geocoding',
    label: 'Google Geocoding API',
    category: 'maps',
    source: 'credential',
    description:
      'Server-side key (GOOGLE_GEOCODING_API_KEY) at the front of the address-research geocode chain.',
    settings_hint: 'Base44 app secret GOOGLE_GEOCODING_API_KEY · findLocalityByAddress / resolvePermittingAddress',
    resolver: {
      mode: 'unverifiable',
      details: {
        unknown: 'A server-side secret powers address research; its presence is not verifiable from this panel.',
      },
    },
  },
  {
    key: 'nominatim_osm',
    label: 'OpenStreetMap Nominatim',
    category: 'maps',
    source: 'native',
    description: 'Keyless geocode fallback inside the address-research chain.',
    resolver: {
      mode: 'native',
      details: { native: 'Keyless public endpoint — used automatically, no setup required.' },
    },
  },
  {
    key: 'us_census_geocoder',
    label: 'US Census Geocoder',
    category: 'maps',
    source: 'native',
    description: 'Last-resort geocode fallback for US addresses in the research chain.',
    resolver: {
      mode: 'native',
      details: { native: 'Keyless public endpoint — used automatically, no setup required.' },
    },
  },
  {
    key: 'cagis',
    label: 'CAGIS property search',
    category: 'maps',
    source: 'native',
    description: 'Cincinnati Area GIS quick-search used by property lookups.',
    resolver: {
      mode: 'native',
      details: { native: 'Keyless public endpoint — used automatically, no setup required.' },
    },
  },

  // ── Permitting Services ──────────────────────────────────────────────────
  {
    key: 'permitting_research_api',
    label: 'Permitting research proxy',
    category: 'permitting',
    source: 'credential',
    description: 'External office-research service reached through the permittingProxy function.',
    settings_hint: 'Base44 app secret PERMITTING_API_KEY · permittingProxy function',
    resolver: {
      mode: 'unverifiable',
      details: {
        unknown: 'A server-side API key gates this service; its presence is not verifiable from this panel.',
      },
    },
  },

  // ── Communications ───────────────────────────────────────────────────────
  {
    key: 'email_delivery',
    label: 'Staff email delivery (SMTP / Gmail)',
    category: 'communications',
    source: 'configured',
    description:
      'Staff alerts, portal replies and vendor notify send through SMTP_* secrets (Ionos) when all are set, else the Gmail connector; the policy row is the master switch.',
    settings_hint: "GlobalSettings 'emailDelivery' · SMTP_* app secrets or Gmail connector",
    resolver: {
      mode: 'settings',
      settings: {
        key: 'emailDelivery',
        require_fields: ['enabled'],
        on_absent: 'not_configured',
        on_present: 'connected',
        on_incomplete: 'partial',
      },
      details: {
        connected: 'The emailDelivery policy is enabled — the SMTP → Gmail provider chain can send.',
        partial: 'An emailDelivery row exists but the master switch is off — outbound delivery stays disabled.',
        not_configured: 'No emailDelivery row — delivery fails closed (treated as disabled).',
      },
    },
  },
  {
    key: 'gmail_connector',
    label: 'Gmail connector',
    category: 'communications',
    source: 'credential',
    description: 'Workspace Gmail account used by sendGmail and as the email fallback provider.',
    settings_hint: 'Admin → Automations → Gmail connector card · platform gmail connection + GOOGLE_CLIENT_ID/SECRET',
    resolver: {
      mode: 'probe',
      probe: {
        fn: 'checkGmailConnection',
        connected_any: ['connected'],
        not_configured_unless: ['connected'],
        detail: ['Account:email'],
      },
      details: {
        connected: 'The Gmail connector is linked and the token verified.',
        not_configured: 'No Gmail connection — link it from the Automations tab.',
      },
    },
  },
  {
    key: 'customer_portal',
    label: 'Customer portal',
    category: 'communications',
    source: 'native',
    description:
      'Token-link portal (customerPortalAction): estimates, invoices, jobs, messages and file uploads.',
    settings_hint: 'CustomerPortalLink entity · customerPortalAction function',
    resolver: {
      mode: 'native',
      details: {
        native:
          'Built in — links are issued per customer. Pay-online is not wired: payment_notice posts a portal message only and Invoice.pay_url is a placeholder.',
      },
    },
  },
  {
    key: 'b2_portal',
    label: 'B2 Portal (email → auto-estimate)',
    category: 'communications',
    source: 'absent',
    description: 'Inbound B2 portal service from the CoreBridge service map.',
    resolver: {
      mode: 'absent',
      details: {
        unavailable: 'Listed in the CoreBridge service map — observed NOT CONNECTED. No inbound portal endpoint exists here.',
      },
    },
  },

  // ── Fleet ────────────────────────────────────────────────────────────────
  {
    key: 'bouncie',
    label: 'Bouncie GPS',
    category: 'fleet',
    source: 'credential',
    description: 'Vehicle GPS tracking, alerts and webhook events for the fleet module.',
    settings_hint: 'Admin → System → Fleet Settings · BouncieConnection entity + BOUNCIE_* secrets',
    resolver: {
      mode: 'probe',
      probe: {
        fn: 'bouncieStatus',
        connected_any: ['connected'],
        not_configured_unless: ['connected'],
        partial_any: ['needsReconnect'],
        partial_if_falsy: ['apiHealthy'],
        detail: [
          'Account:connectedEmail',
          'API healthy:apiHealthy',
          'Webhook:webhookActive',
          'Last sync:lastSyncAt',
        ],
      },
      details: {
        connected: 'Bouncie is linked and the stored token verified against the API.',
        partial: 'Bouncie is linked but degraded — check reconnect/webhook state in Fleet Settings.',
        not_configured: 'No Bouncie account linked.',
      },
    },
  },

  // ── Automation ───────────────────────────────────────────────────────────
  {
    key: 'zapier',
    label: 'Zapier',
    category: 'automation',
    source: 'absent',
    description: 'Zapier key listed on the CoreBridge service map.',
    resolver: {
      mode: 'absent',
      details: {
        unavailable: 'Observed on the CoreBridge map — NOT CONNECTED. No Zapier key, webhook or zap endpoint exists in this app.',
      },
    },
  },
  {
    key: 'planprophet',
    label: 'PlanProphet CRM',
    category: 'automation',
    source: 'absent',
    description: 'Print-industry CRM listed on the CoreBridge service map.',
    resolver: {
      mode: 'absent',
      details: {
        unavailable: 'Listed in the CoreBridge service map — observed NOT CONNECTED. No PlanProphet integration exists here.',
      },
    },
  },
  {
    key: 'workflow_engine',
    label: 'Base44 scheduled workflows',
    category: 'automation',
    source: 'native',
    description:
      'Platform-scheduled runs (deadline reminders, permit follow-ups, sync runs) plus the internal trigger engine.',
    settings_hint: 'Admin → Automations · the automations_paused GlobalSettings kill switch',
    resolver: {
      mode: 'native',
      details: { native: 'Platform capability — schedules and the trigger engine run inside Base44.' },
    },
  },

  // ── AI & Assist ──────────────────────────────────────────────────────────
  {
    key: 'base44_ai',
    label: 'Base44 AI (InvokeLLM · TranscribeAudio · GenerateImage)',
    category: 'ai',
    source: 'native',
    description:
      'Platform AI used by the SOP builder, permitting research and rule extraction, document analysis and Smartsheet note translation.',
    settings_hint: 'integrations.Core — no keys required',
    resolver: {
      mode: 'native',
      details: { native: 'Platform AI integrations are always available — no keys or setup required.' },
    },
  },
];

// ---------------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

// Non-empty = truthy for this model. false, '', 0, null, undefined, [] and {}
// are all falsy — a present-but-empty field must never read as configured.
const truthy = (v: unknown): boolean => {
  if (v === undefined || v === null || v === false) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v) && v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return Boolean(v);
};

const dotGet = (obj: unknown, path: string): unknown => {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const part of String(path).split('.')) {
    if (!isObj(cur) && !Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
};

const pathTruthy = (obj: unknown, path: string | undefined): boolean =>
  !!path && truthy(dotGet(obj, path));

const pathPresent = (obj: unknown, path: string | undefined): boolean => {
  if (!path) return false;
  return dotGet(obj, path) !== undefined;
};

export const catalogEntry = (key: unknown): IntegrationCatalogEntry | undefined =>
  INTEGRATION_CATALOG.find((e) => e.key === String(key ?? '').trim());

// `settings` accepts several shapes without forcing callers into one:
//   { 'emailDelivery': {setting_key, setting_value} }   — entity rows
//   { 'emailDelivery': {enabled: true, ...} }           — bare values
//   Map<key, row|value>                                  — Map form
export function settingRowFor(settings: unknown, key: string): unknown {
  if (!key) return undefined;
  if (settings instanceof Map) return settings.get(key);
  if (!isObj(settings)) return undefined;
  return settings[key];
}

// A row may be the entity record ({setting_key, setting_value}) or the bare
// value; pull the value level the require-fields spec reads against.
export function settingValueFor(row: unknown): unknown {
  if (!isObj(row)) return row;
  if (Object.prototype.hasOwnProperty.call(row, 'setting_value')) return row.setting_value;
  return row;
}

export function settingsRowValue(settings: unknown, spec: IntegrationSettingsSpec | undefined): { row: unknown; value: unknown } {
  if (!spec?.key) return { row: undefined, value: undefined };
  let row = settingRowFor(settings, spec.key);
  if (row === undefined || row === null) {
    for (const alt of spec.alt_keys || []) {
      row = settingRowFor(settings, alt);
      if (row !== undefined && row !== null) break;
    }
  }
  return { row, value: settingValueFor(row) };
}

// Function-status inputs also accept a few shapes — the raw invoke body, an
// Error, a {__error|error} marker, a {status,data} transport envelope, or a
// {state:'error'|'ok', body} wrapper.
export function normalizeProbeResult(v: unknown): { state: 'ok' | 'error' | 'absent'; body: unknown; error: string } {
  if (v === undefined || v === null) return { state: 'absent', body: undefined, error: '' };
  if (v instanceof Error) return { state: 'error', body: undefined, error: String(v.message || v) };
  if (typeof v === 'string') return { state: 'error', body: undefined, error: v };
  if (isObj(v)) {
    if ((v as any).state === 'error' || (v as any).ok === false || (v as any).__error !== undefined || (v as any).probe_error !== undefined) {
      const err = String((v as any).__error ?? (v as any).probe_error ?? (v as any).error ?? 'status probe failed');
      return { state: 'error', body: (v as any).body, error: err };
    }
    // Transport envelope {status:number, data:body} — unwrap once.
    if (typeof (v as any).status === 'number' && Object.prototype.hasOwnProperty.call(v, 'data')) {
      return { state: 'ok', body: (v as any).data, error: '' };
    }
    return { state: 'ok', body: v, error: '' };
  }
  return { state: 'error', body: undefined, error: 'status probe failed' };
}

const probeErrorText = (probe: { body: unknown; error: string }): string => {
  let bodyText = '';
  try { bodyText = JSON.stringify(probe.body ?? '') || ''; } catch { bodyText = ''; }
  return `${probe.error} ${bodyText}`.slice(0, 4000);
};

const matchesNotConfigured = (spec: IntegrationProbeSpec | undefined, text: string): boolean => {
  if (!spec?.not_configured_match) return false;
  try {
    return new RegExp(spec.not_configured_match, 'i').test(text);
  } catch {
    return false;
  }
};

const missingListFor = (body: unknown, path: string | undefined): string[] => {
  const v = path ? dotGet(body, path) : undefined;
  return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
};

// Evaluate one probe spec against a normalizeProbeResult 'ok' body.
function evalProbeBody(spec: IntegrationProbeSpec, body: unknown): IntegrationStatus {
  // Some functions answer {error:'... is not configured'} with a 2xx/flattened
  // envelope — the match regex must see the body, not just thrown errors.
  if (matchesNotConfigured(spec, probeErrorText({ body, error: '' }))) return 'not_configured';
  const anyTruthy = (paths?: string[]) => (paths || []).some((p) => pathTruthy(body, p));
  if (anyTruthy(spec.connected_any)) {
    if (anyTruthy(spec.partial_any)) return 'partial';
    if ((spec.partial_if_falsy || []).some((p) => pathPresent(body, p) && !pathTruthy(body, p))) return 'partial';
    return 'connected';
  }
  if (anyTruthy(spec.not_configured_any)) return 'not_configured';
  if (spec.not_configured_unless?.length && spec.not_configured_unless.every((p) => !pathTruthy(body, p))) {
    return 'not_configured';
  }
  if (anyTruthy(spec.partial_any)) return 'partial';
  if (anyTruthy(spec.configured_any)) return 'partial';
  return 'unknown';
}

interface SettingsEval { status: IntegrationStatus; missing: string[] }

// Evaluate one settings spec against a settings map.
function evalSettings(spec: IntegrationSettingsSpec, settings: unknown): SettingsEval {
  const { row, value } = settingsRowValue(settings, spec);
  if (row === undefined || row === null) {
    return { status: spec.on_absent || 'not_configured', missing: [] };
  }
  if (spec.disable_field && dotGet(value, spec.disable_field) === false) {
    return { status: spec.on_incomplete || 'partial', missing: [spec.disable_field] };
  }
  const missing: string[] = [];
  for (const f of spec.require_fields || []) {
    if (!pathTruthy(value, f)) missing.push(f);
  }
  if (spec.require_any_fields?.length) {
    if (!spec.require_any_fields.some((f) => pathTruthy(value, f))) {
      missing.push(spec.require_any_fields.join('|'));
    }
  }
  if (missing.length) return { status: spec.on_incomplete || 'partial', missing };
  return { status: spec.on_present || 'connected', missing: [] };
}

function evalGate(gate: IntegrationGateSpec | undefined, settingsSpec: IntegrationSettingsSpec | undefined, settings: unknown): SettingsEval {
  if (!settingsSpec?.key) return { status: 'connected', missing: [] };
  const { row, value } = settingsRowValue(settings, settingsSpec);
  if (row === undefined || row === null) {
    return { status: gate?.requires_row ? 'partial' : 'connected', missing: gate?.requires_row ? ['settings_row'] : [] };
  }
  if (gate?.disable_field && dotGet(value, gate.disable_field) === false) {
    return { status: 'partial', missing: [gate.disable_field] };
  }
  const missing = (gate?.require_fields || []).filter((f) => !pathTruthy(value, f));
  if (missing.length) return { status: 'partial', missing };
  return { status: 'connected', missing: [] };
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

const DEFAULT_DETAIL: Record<IntegrationStatus, string> = {
  connected: 'Connected.',
  partial: 'Partially configured.',
  not_configured: 'Not configured.',
  native: 'Built in — no setup required.',
  unavailable: 'Not available in this app.',
  unknown: 'Status cannot be determined from Admin.',
};

export function resolveIntegrationStatus(args: {
  key: string;
  settings?: unknown;
  function_statuses?: Record<string, unknown>;
}): IntegrationStatusResult {
  const key = String(args?.key ?? '').trim();
  const entry = catalogEntry(key);
  const settings = args?.settings;
  const functionStatuses = args?.function_statuses || {};
  if (!entry) {
    return {
      key,
      status: 'unknown',
      detail: 'No catalog entry exists for this service.',
      evidence: { probe: 'unused', settings_row: false, missing_fields: [] },
    };
  }
  const r = entry.resolver;
  const detailFor = (status: IntegrationStatus): string =>
    r.details?.[status] || DEFAULT_DETAIL[status];
  const result = (status: IntegrationStatus, ev: IntegrationStatusResult['evidence'], extraDetail = ''): IntegrationStatusResult => ({
    key,
    status,
    detail: [detailFor(status), extraDetail].filter(Boolean).join(' '),
    evidence: ev,
  });

  if (r.mode === 'native') {
    return result('native', { probe: 'unused', settings_row: false, missing_fields: [] });
  }
  if (r.mode === 'absent') {
    return result('unavailable', { probe: 'unused', settings_row: false, missing_fields: [] });
  }
  if (r.mode === 'unverifiable') {
    return result('unknown', { probe: 'unused', settings_row: false, missing_fields: [] });
  }

  const probeSpec = r.probe;
  const probeResult = probeSpec ? normalizeProbeResult(functionStatuses[probeSpec.fn]) : { state: 'absent' as const, body: undefined, error: '' };

  const probeDetailExtras = (body: unknown): string => {
    const bits: string[] = [];
    for (const d of probeSpec?.detail || []) {
      const idx = d.indexOf(':');
      const label = idx >= 0 ? d.slice(0, idx) : d;
      const path = idx >= 0 ? d.slice(idx + 1) : '';
      const v = dotGet(body, path);
      if (v === undefined || v === null || v === '' ) continue;
      bits.push(`${label}: ${typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)}`);
    }
    const missing = missingListFor(body, probeSpec?.missing_list);
    if (missing.length) bits.push(`Missing: ${missing.join(', ')}`);
    return bits.length ? `(${bits.join(' · ')})` : '';
  };

  const probeErrorOutcome = (): IntegrationStatusResult | null => {
    if (matchesNotConfigured(probeSpec, probeErrorText(probeResult))) {
      return result('not_configured', { probe: 'error', settings_row: false, missing_fields: [] });
    }
    if (r.probe_error_status === 'fallback_settings' && r.settings) {
      const s = evalSettings(r.settings, settings);
      return result(s.status, { probe: 'error', settings_row: settingsRowValue(settings, r.settings).row != null, missing_fields: s.missing }, '(status probe unreachable — answered from saved settings)');
    }
    return result('unknown', { probe: 'error', settings_row: false, missing_fields: [] }, '(status probe failed)');
  };

  const settingsOutcome = (): IntegrationStatusResult => {
    if (!r.settings?.key) {
      return result('unknown', { probe: probeSpec ? probeResult.state : 'unused', settings_row: false, missing_fields: [] }, '(no settings signal declared)');
    }
    const s = evalSettings(r.settings, settings);
    const row = settingsRowValue(settings, r.settings!).row;
    const missing = s.missing.length ? `Missing: ${s.missing.join(', ')}` : '';
    return result(s.status, { probe: probeSpec ? probeResult.state : 'unused', settings_row: row != null, missing_fields: s.missing }, missing);
  };

  switch (r.mode) {
    case 'settings': {
      return settingsOutcome();
    }
    case 'probe': {
      if (probeResult.state === 'error') return probeErrorOutcome()!;
      if (probeResult.state === 'absent') {
        return result('unknown', { probe: 'absent', settings_row: false, missing_fields: [] }, '(status probe not run)');
      }
      return result(evalProbeBody(probeSpec!, probeResult.body), { probe: 'ok', settings_row: false, missing_fields: [] }, probeDetailExtras(probeResult.body));
    }
    case 'probe_else_settings': {
      if (probeResult.state === 'error') return probeErrorOutcome()!;
      if (probeResult.state === 'absent') return settingsOutcome();
      return result(evalProbeBody(probeSpec!, probeResult.body), { probe: 'ok', settings_row: false, missing_fields: [] }, probeDetailExtras(probeResult.body));
    }
    case 'probe_and_settings': {
      if (probeResult.state === 'error') return probeErrorOutcome()!;
      if (probeResult.state === 'absent') return settingsOutcome();
      const candidate = evalProbeBody(probeSpec!, probeResult.body);
      if (candidate === 'connected') {
        const gate = evalGate(r.gate, r.settings, settings);
        if (gate.status !== 'connected') {
          const row = settingsRowValue(settings, r.settings!).row;
          const missing = gate.missing.length ? `Missing: ${gate.missing.join(', ')}` : '';
          return result('partial', { probe: 'ok', settings_row: row != null, missing_fields: gate.missing }, missing);
        }
        const row = settingsRowValue(settings, r.settings!).row;
        return result('connected', { probe: 'ok', settings_row: row != null, missing_fields: [] }, probeDetailExtras(probeResult.body));
      }
      return result(candidate, { probe: 'ok', settings_row: false, missing_fields: [] }, probeDetailExtras(probeResult.body));
    }
    default:
      return result('unknown', { probe: 'unused', settings_row: false, missing_fields: [] });
  }
}

// ---------------------------------------------------------------------------
// Collections the panel consumes
// ---------------------------------------------------------------------------

export function resolveAllIntegrations(args: {
  settings?: unknown;
  function_statuses?: Record<string, unknown>;
}): (IntegrationStatusResult & { entry: IntegrationCatalogEntry })[] {
  return INTEGRATION_CATALOG.map((entry) => ({
    entry,
    ...resolveIntegrationStatus({ key: entry.key, settings: args?.settings, function_statuses: args?.function_statuses }),
  }));
}

export function groupIntegrationsByCategory(
  resolved: (IntegrationStatusResult & { entry: IntegrationCatalogEntry })[],
): { category: { id: IntegrationCategory; label: string }; items: (IntegrationStatusResult & { entry: IntegrationCatalogEntry })[] }[] {
  const rows = Array.isArray(resolved) ? resolved : [];
  return INTEGRATION_CATEGORIES
    .map((category) => ({ category, items: rows.filter((r) => r.entry.category === category.id) }))
    .filter((g) => g.items.length > 0);
}

export function countIntegrationsByStatus(
  resolved: (IntegrationStatusResult & { entry: IntegrationCatalogEntry })[],
): Record<IntegrationStatus, number> {
  const counts = Object.fromEntries(INTEGRATION_STATUSES.map((s) => [s, 0])) as Record<IntegrationStatus, number>;
  for (const r of Array.isArray(resolved) ? resolved : []) {
    if (r && counts[r.status] !== undefined) counts[r.status] += 1;
  }
  return counts;
}

// GlobalSettings keys the panel should read — derived, so the catalog is the
// single source of truth.
export const INTEGRATION_SETTINGS_KEYS: readonly string[] = [
  ...new Set(
    INTEGRATION_CATALOG.flatMap((e) =>
      e.resolver.settings ? [e.resolver.settings.key, ...(e.resolver.settings.alt_keys || [])] : [],
    ),
  ),
];

// Function probes the panel runs — derived, deduped by function name.
export const INTEGRATION_PROBES: readonly IntegrationProbeInput[] = (() => {
  const seen = new Set<string>();
  const out: IntegrationProbeInput[] = [];
  for (const e of INTEGRATION_CATALOG) {
    const fn = e.resolver.probe?.fn;
    if (!fn || seen.has(fn)) continue;
    seen.add(fn);
    out.push({ key: e.key, fn, payload: { ...(e.probe_payload || {}) } });
  }
  return out;
})();
